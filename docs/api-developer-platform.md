# API and Developer Platform

> Phase 10 Prompt 94 — public REST/GraphQL API, OAuth, webhooks, API keys, versioning, analytics, developer portal.

## 1. Goals

BillLens exposes a **public integration platform** so third-party developers, accounting tools, and internal teams can:

- Read groups, expenses, settlements, and balances.
- Create expenses and settlements programmatically (subject to scope approval).
- Subscribe to webhook events.
- Export the caller's data (GDPR/CCPA).
- Build embedded dashboards and analytics.

The platform is **security-first**: every credential is stored as a hash, every endpoint requires explicit scopes, every response includes deprecation headers when relevant, and every analytics record is privacy-safe.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Developer / SDK                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + Bearer token / API key
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API Gateway                               │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Rate    │  │  Version  │  │  AuthN   │  │  Scope        │  │
│  │  Limiter │  │  Status   │  │  (OAuth  │  │  Enforcement  │  │
│  │          │  │  (299/410)│  │   / Key) │  │               │  │
│  └──────────┘  └───────────┘  └──────────┘  └───────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────────┐
        ▼                  ▼                      ▼
  ┌───────────┐     ┌──────────────┐       ┌─────────────┐
  │ REST API  │     │  GraphQL     │       │  Webhook    │
  │ Handlers  │     │  Resolvers   │       │  Dispatcher │
  └───────────┘     └──────────────┘       └─────────────┘
```

All gateway logic (rate limiting, version status, scope enforcement) is implemented as pure domain functions in `src/domain/api-platform/`. The gateway itself is a thin infrastructure layer that consults these functions.

## 3. Authentication

Two credential types are supported:

### 3.1 OAuth 2.0 (for user-context integrations)

Used by third-party apps that act on behalf of a BillLens user (e.g. an IFTTT integration that auto-creates expenses from email receipts).

**Flow**: Authorization Code (`authorization_code`) → Access Token (1h TTL) → Refresh Token (30d TTL).

| Parameter                | Value                                    |
|--------------------------|------------------------------------------|
| Authorization endpoint   | `GET /v1/oauth/authorize`                |
| Token endpoint           | `POST /v1/oauth/token`                   |
| Grant types              | `authorization_code`, `refresh_token`, `client_credentials` |
| Access token TTL         | 1 hour                                   |
| Refresh token TTL        | 30 days                                  |
| Authorization code TTL   | 10 minutes                               |
| Redirect URI matching    | EXACT (no substring, no query/fragment)  |

**Critical rule**: tokens and codes are persisted as **SHA-256 hashes only**. The plaintext is returned to the client exactly once at issuance time. See `oauth-model.ts`.

### 3.2 API Keys (for server-to-server integrations)

Used by long-lived server-side integrations (e.g. an accounting sync service).

| Property                | Value                                                    |
|-------------------------|----------------------------------------------------------|
| Format                  | `bl_live_<64 hex>` or `bl_test_<64 hex>` (72 chars total)|
| Entropy                 | 256 bits                                                 |
| Storage                 | SHA-256 hash + visible 8-char prefix                     |
| Expiry                  | Optional (`expiresAt`); keys with no expiry never expire |

The plaintext key is returned to the developer exactly once. BillLens persists only the hash and the visible prefix (so the developer-portal UI can show `bl_live_ab12…` without revealing the key).

## 4. Scopes

Scopes are exact-match. There is no hierarchy (having `write:groups` does NOT grant `read:groups`).

| Scope                | Description                                                  |
|----------------------|--------------------------------------------------------------|
| `read:groups`        | List and fetch groups the caller is a member of              |
| `write:groups`       | Create, update, delete groups                                |
| `read:expenses`      | List and fetch expenses                                      |
| `write:expenses`     | Create, update, delete expenses                              |
| `read:settlements`   | List settlements                                             |
| `write:settlements`  | Create, confirm, reverse settlements                         |
| `read:balances`      | Fetch group balances                                         |
| `export:data`         | Export the caller's data (GDPR/CCPA)                        |
| `webhooks:manage`    | Create, list, delete webhook subscriptions                  |

BillLens **refuses** ungranted scopes at token-request time rather than silently downgrading them. Silent downgrade is a known foot-gun (the client thinks it has `write:expenses`; the API call fails later with 403).

## 5. Endpoints

See `API_ENDPOINTS` in `api-model.ts` for the canonical registry. Highlights:

| Method | Path                                  | Scopes                  | Tier          |
|--------|---------------------------------------|-------------------------|---------------|
| GET    | `/v1/groups`                          | `read:groups`           | authenticated |
| POST   | `/v1/groups`                          | `write:groups`          | authenticated |
| GET    | `/v1/groups/{groupId}/expenses`       | `read:expenses`         | authenticated |
| POST   | `/v1/groups/{groupId}/expenses`       | `write:expenses`        | authenticated |
| POST   | `/v1/settlements/{id}/confirm`        | `write:settlements`     | authenticated |
| GET    | `/v1/groups/{groupId}/balances`       | `read:balances`         | authenticated |
| GET    | `/v1/me/export`                       | `export:data`           | premium       |
| GET    | `/v1/webhooks`                        | `webhooks:manage`       | authenticated |
| GET    | `/v2/groups/{groupId}/expenses`       | `read:expenses`         | authenticated |
| GET    | `/v2/groups/{groupId}/balances`       | `read:balances`         | authenticated |

## 6. Rate Limiting

Rate-limit tiers (from `scalability/rate-limiter.ts`):

| Tier          | per-minute | per-hour | per-day   | burst |
|---------------|-----------|----------|-----------|-------|
| anonymous     | 30        | 500      | 2,000     | 10    |
| authenticated | 120       | 5,000    | 25,000    | 30    |
| premium       | 300       | 15,000   | 100,000   | 60    |
| enterprise    | 1,200     | 60,000   | 500,000   | 200   |
| internal      | unlimited | unlimited | unlimited | 1,000 |

**Critical financial operations** (`settlement_create`, `settlement_confirm`, `settlement_cancel`, `expense_create_offline_flush`, `sync_conflict_resolve`) are **EXEMPT** from rate limiting. Blocking a settlement because the user hit a quota could leave a balance inconsistent.

## 7. Webhooks

### 7.1 Events

| Event                    | Emitted when…                                          |
|--------------------------|--------------------------------------------------------|
| `expense.created`        | An expense is created in a group the subscriber is in  |
| `expense.updated`        | An expense is updated                                  |
| `expense.deleted`        | An expense is deleted                                  |
| `settlement.created`     | A settlement is created                                |
| `settlement.confirmed`   | A settlement is confirmed                              |
| `settlement.reversed`    | A settlement is reversed                               |
| `group.member_added`     | A member is added to the group                         |
| `group.member_removed`   | A member is removed                                    |
| `balance.updated`        | A balance changes                                      |

### 7.2 Delivery

- Payload: JSON.
- Signing: HMAC-SHA256 over the raw payload, sent in `X-BillLens-Signature` header (prefixed with `sha256=`).
- Subscriber MUST verify the signature before processing.

### 7.3 Retry policy

Exponential backoff in minutes: **1, 5, 30, 120, 360** (5 attempts total).

- 2xx → `delivered`, no retry.
- 4xx → `failed`, NO retry (the request itself is bad).
- 5xx → retry on the next backoff slot.
- Timeout / network error → retry on the next backoff slot.
- After 5 attempts → `permanently_failed`, subscription auto-paused.

### 7.4 Secret storage

Webhook signing secrets are stored as **SHA-256 hashes only**. The plaintext secret is returned to the subscriber exactly once at subscription creation time. See `webhook-model.ts`.

## 8. Versioning

BillLens follows a strict deprecation lifecycle:

| Status       | Behaviour                                                             |
|--------------|----------------------------------------------------------------------|
| `active`     | Fully supported, no special headers                                  |
| `deprecated` | `200 OK` + `Deprecation: true` + `Sunset: <date>` headers            |
| `sunset`     | `299 Too Many Requests` (warning) + `Deprecation/Sunset/Link`       |
| `retired`    | `410 Gone` + `Link` to upgrade guide. Requests NOT processed        |

Current lifecycle:

| Version | Released   | Deprecated | Sunset     | Retired    |
|---------|-----------|------------|------------|------------|
| v1      | 2026-01-01| 2026-07-01 | 2026-12-01 | 2027-01-01 |
| v2      | 2026-07-01| —          | —          | —          |

## 9. Analytics (privacy-safe)

The API records usage metrics for the developer portal's status page and for capacity planning. **Every metric MUST be privacy-safe**:

| Field             | Type     | Allowed? |
|-------------------|----------|----------|
| `clientId`        | string   | ✓ (public OAuth client id, NOT user id) |
| `endpoint`        | string   | ✓        |
| `method`          | enum     | ✓        |
| `version`         | enum     | ✓        |
| `responseStatus`  | number   | ✓        |
| `responseTimeMs`  | number   | ✓        |
| `timestamp`       | ISO-8601 | ✓        |
| request body      | —        | ✗        |
| user id / email   | —        | ✗        |
| expense amounts   | —        | ✗        |
| merchant names    | —        | ✗        |
| tokens / auth     | —        | ✗        |

The recording use case calls `validateMetricIsPrivacySafe()` before persisting and refuses any metric containing a forbidden key (15 keys are blocked: `body`, `requestBody`, `payload`, `userId`, `userEmail`, `userPhone`, `amountMinor`, `amountMajor`, `merchantName`, `groupName`, `memberName`, `note`, `upiId`, `paymentReference`, `ocrText`, `filePath`, `token`, `auth`).

Logs are retained for at most **30 days**. Longer retention requires explicit legal sign-off.

## 10. Developer Portal

The developer portal (Phase 2 presentation layer) provides:

- OAuth client registration UI.
- API key generation UI (shows plaintext once, with copy-to-clipboard).
- Webhook subscription management.
- Interactive API docs (OpenAPI 3.1 spec auto-generated from `API_ENDPOINTS`).
- Live request console.
- Usage dashboard (per-client request counts, error rates, p95 latency).
- Migration guide for deprecated versions.

## 11. SDKs

Official SDKs ship for:

| Language     | Package                | Status    |
|--------------|------------------------|-----------|
| TypeScript   | `@billlens/sdk-ts`     | Stable    |
| Python       | `billlens-sdk-python`  | Stable    |
| Go           | `billlens-sdk-go`      | Beta      |
| Swift        | `BillLensSDK`          | Beta      |
| Kotlin       | `com.billlens.sdk`     | Beta      |

All SDKs:

- Implement automatic token refresh.
- Implement automatic retry on 5xx + 429 with exponential backoff.
- Verify webhook signatures in their `verifyWebhookSignature()` helper.
- NEVER log tokens, API keys, or webhook secrets.

## 12. Security checklist

- [x] OAuth tokens, refresh tokens, auth codes, API keys, webhook secrets — all stored as **SHA-256 hashes only**.
- [x] Redirect URIs validated as **exact match** against pre-registered list.
- [x] Scopes enforced at the gateway, not at the controller.
- [x] Rate limiting exempts critical financial operations.
- [x] Deprecation/sunset headers attached to every response from a deprecated version.
- [x] Retired versions return `410 Gone`.
- [x] Webhook payloads signed with HMAC-SHA256.
- [x] Analytics metrics validated to NOT contain PII, request bodies, or expense amounts.
- [x] Analytics logs retained ≤ 30 days.
- [x] API key format enforces 256 bits of entropy.

## 13. Files

| File                                                            | Responsibility                                            |
|-----------------------------------------------------------------|-----------------------------------------------------------|
| `src/domain/api-platform/api-model.ts`                          | Endpoint + scope registry, scope/path helpers             |
| `src/domain/api-platform/oauth-model.ts`                        | OAuth clients, tokens, codes, scope narrowing             |
| `src/domain/api-platform/webhook-model.ts`                      | Subscriptions, deliveries, retry, HMAC signing            |
| `src/domain/api-platform/api-key-model.ts`                      | API key generation, format validation, expiry             |
| `src/domain/api-platform/api-versioning.ts`                     | Version lifecycle, deprecation headers, usability         |
| `src/domain/api-platform/api-analytics.ts`                      | Privacy-safe usage metrics + summary aggregator           |
| `src/domain/api-platform/index.ts`                              | Barrel                                                    |
| `src/domain/api-platform/__tests__/oauth-model.test.ts`         | OAuth tests                                               |
| `src/domain/api-platform/__tests__/webhook-model.test.ts`       | Webhook tests                                             |
| `src/domain/api-platform/__tests__/api-key-model.test.ts`       | API key tests                                             |
| `src/domain/api-platform/__tests__/api-versioning.test.ts`      | Versioning tests                                          |
| `src/domain/api-platform/__tests__/api-analytics.test.ts`       | Analytics + privacy-safety tests                          |

## 14. Future work

- GraphQL schema stitching for nested resource graphs (e.g. `group.expenses.payer.settlements`).
- Per-client usage quotas (beyond the global rate-limit tiers).
- Signed webhook payloads with `X-BillLens-Timestamp` for replay-attack protection.
- OAuth 2.1 (PKCE mandatory, implicit grant removed).
- SDK auto-generation from the OpenAPI spec.
