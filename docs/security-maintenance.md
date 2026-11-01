# Security Maintenance

This document describes the security maintenance framework for BillLens.
It covers dependency audits, vulnerability scans, secret rotation, RLS
verification, storage review, and penetration test tracking.

The implementation lives in `src/domain/security/` and
`src/application/security/`.

---

## 1. Overview

Security maintenance is a recurring engineering task. It is run:

  - **Weekly** — dependency audit + vulnerability scan + RLS coverage
    verification.
  - **Monthly** — penetration test finding review + storage review.
  - **Quarterly** — secret rotation review.
  - **Per release** — full maintenance check before each app store
    release.

The use case `RunSecurityMaintenanceUseCase` orchestrates all six
checks and produces a single report with an overall status of
`healthy`, `attention_required`, or `urgent_action`.

---

## 2. Dependency audit

File: `src/domain/security/dependency-audit.ts`

Each npm dependency is classified along three orthogonal axes:

  1. **Vulnerability severity** — low / medium / high / critical.
     Derived from the advisory's CVSS v3 score:
       - `< 4.0`  → low
       - `< 7.0`  → medium
       - `< 9.0`  → high
       - `>= 9.0` → critical

  2. **Outdated-ness** — current / patch / minor / major. Derived by
     semver-comparing the installed version against the latest
     published version.

  3. **Abandonment risk** — a package is abandoned when EITHER it has
     not been published in 2+ years (730 days) OR it has fewer than 1
     distinct maintainers.

The audit ALSO flags Expo native-module risks:

  - Pure-JS packages (no native code) → `none`.
  - Native packages without a declared `compatibleExpoSdk` → `high`
    (we cannot verify compatibility).
  - Native packages whose SDK major differs from the running SDK by
    2+ → `high`.
  - Native packages whose SDK major differs by 1 → `medium`.
  - Native packages whose SDK major matches → `low`.

The aggregate `auditDependencies()` function returns a summary with
`urgentCount`, `reviewCount`, `safeCount`, `abandonedCount`, and the
list of packages with Expo native-module risks.

### Risk classification

A dependency's `riskLevel` is `urgent` when:
  - it has any critical advisory, OR
  - its risk score ≥ 100.

The risk score combines:
  - Sum of severity weights (low=1, medium=5, high=25, critical=100).
  - Doubled when the package is abandoned (no patch path).
  - + 10 for major version drift, + 5 for minor, + 1 for patch.
  - + 50 for high Expo native-module risk, + 20 for medium, + 5 for
    low.

`review` is `25 <= riskScore < 100`. `safe` is `riskScore < 25`.

---

## 3. Vulnerability scans

File: `src/domain/security/vulnerability-scan.ts`

A `VulnerabilityScanResult` carries:

  - `scanDate` (ISO date-time)
  - `totalVulnerabilities` (must equal `critical + high + medium + low`)
  - per-severity counts
  - `expoNativeModuleRisks` — list of package names flagged as Expo
    native-module risks
  - `recommendations` — free-form remediation guidance

`classifyScanResult()` returns `pass`, `warn`, or `fail`:

  - **fail** — any critical vulnerability, OR > 5 high vulnerabilities,
    OR an Expo native-module risk flagged with a blocking keyword
    (`breaks builds`, `incompatible`, `native module`,
    `will not compile`).
  - **warn** — any high vulnerability, OR > 10 medium vulnerabilities,
    OR any Expo native-module risk (non-blocking).
  - **pass** — no critical / high vulnerabilities and few medium / low.

`countsAreConsistent()` validates that the per-severity counts add up
to the total — used as a sanity check on the scan payload.

---

## 4. Secret rotation

File: `src/domain/security/secret-rotation.ts`

**CRITICAL**: secret rotation records store HASHES ONLY. Raw secret
values are NEVER persisted — only a SHA-256 hash of the secret at the
time of rotation. The hash lets us answer "is this the same secret we
recorded last time?" without ever revealing the secret itself.

Six secret types are tracked:

  | Secret type         | Default interval |
  |---------------------|------------------|
  | `service_role`      | 90 days          |
  | `anon_key`          | 180 days         |
  | `oauth_secret`      | 365 days         |
  | `ocr_api_key`       | 90 days          |
  | `notification_cert` | 365 days         |
  | `signing_key`       | 730 days         |

`isRotationDue()` consults the last-rotated timestamp + the interval.
The optional `graceDays` parameter flags secrets that are about to
become due within the grace window.

`computeRotationSchedule()` returns upcoming rotations sorted by
`dueAt` ascending. Secrets with no record yet are flagged as overdue.

The domain exposes a `SecretHasher` type that the application layer
injects. Production deployments MUST inject a real SHA-256 hasher
backed by the platform's secure crypto (Web Crypto `crypto.subtle`
or `node:crypto`). The `STUB_SECRET_HASHER` export is for test
doubles only — it uses a non-cryptographic FNV-1a hash and MUST NOT
be used in production.

---

## 5. RLS verification

File: `src/domain/security/rls-verification.ts`

**CRITICAL**: every table that holds user data MUST have Row-Level
Security (RLS) enabled in the Supabase / PostgreSQL backend. RLS
prevents a user from reading or writing another user's rows even when
their JWT grants table-level access.

The canonical `TABLES_REQUIRING_RLS` list enumerates all 28 tables:

  - 19 Phase 1-5 tables (profiles, groups, expenses, receipts,
    settlements, drafts, etc.)
  - 9 Phase 9 tables (analytics_events, analytics_consent, feedback,
    experiment_assignments, experiment_outcomes, monitoring_metrics,
    support_tickets, knowledge_articles, ocr_correction_stats).

`generateRlsChecks()` produces one `RlsCheck` per required table with
a human-readable reason explaining why RLS is required.

`verifyRlsCoverage()` compares the list of tables with RLS enabled
against the required list and returns the covered + missing sets. A
non-empty `missing` array is a CI failure.

`phase9TablesCovered()` and `missingPhase9Tables()` provide
focused checks for Phase 9 tables specifically — used by the
migration verifier to give a focused error message when a Phase 9
table is missing RLS.

### RLS policy requirements

Each table must have at least 4 policies (one per SQL operation):
  - SELECT — restricts which rows a user can read.
  - INSERT — restricts which rows a user can create.
  - UPDATE — restricts which rows a user can modify.
  - DELETE — restricts which rows a user can remove.

The `minimumPolicyCount` field of `RlsCheck` defaults to 4.

---

## 6. Storage review

File: `src/domain/security/storage-review.ts`

BillLens uses five storage tiers:

  | Tier              | Ceiling       | Encrypted | Cleared on logout | TTL   |
  |-------------------|---------------|-----------|--------------------|-------|
  | sqlite            | restricted    | yes       | yes                | —     |
  | securestore       | top_secret    | yes       | yes                | —     |
  | filesystem_temp   | restricted    | no        | yes                | 24h   |
  | cloud_supabase    | restricted    | yes       | no                 | —     |
  | cloud_ocr         | confidential  | yes       | no                 | 24h   |

Data sensitivity classifications (low → high):
  1. `public` — marketing copy, app version strings.
  2. `internal` — group names, expense titles (after redaction).
  3. `confidential` — receipt images, OCR text (transient in cloud_ocr).
  4. `restricted` — payment evidence, UPI IDs, settlement details.
  5. `top_secret` — device secret, OAuth tokens, signing keys.

`top_secret` data is ONLY allowed in SecureStore — never in SQLite,
never in temp files, never in cloud. The SQLite DB stores the device
secret HASH, not the secret.

`reviewStorageTier()` returns `allowed`, `review_required`, or
`denied`:
  - **denied** — data sensitivity rank > tier ceiling rank.
  - **review_required** — data sensitivity rank == tier ceiling rank
    AND the ceiling is `restricted` or higher (we want a human in the
    loop before storing the most-sensitive data at the tier's ceiling).
  - **allowed** — otherwise.

`tiersClearedOnLogout()` returns the list of tiers that MUST be
cleared on user logout (sqlite, securestore, filesystem_temp).

---

## 7. Penetration test framework

File: `src/domain/security/penetration-test-framework.ts`

Models the lifecycle of penetration tests and their findings.

### Test types

  1. `authenticated` — tester has valid user credentials.
  2. `unauthenticated` — tester has no credentials.
  3. `internal` — tester is on the internal network.
  4. `external` — tester is on the external network.

### Finding severity

  - `info`, `low`, `medium`, `high`, `critical`.

Weights: `info=0`, `low=1`, `medium=5`, `high=25`, `critical=50`.

### Finding lifecycle

```
open → in_progress → resolved    (terminal)
                   → accepted_risk → open   (re-open path)
```

Resolved findings are terminal. Accepted-risk findings can be re-opened
if the risk materialises.

### Risk score

`computeRiskScore()` returns a 0..100 score combining:
  - Sum of severity weights for UNRESOLVED findings (open /
    in_progress / accepted_risk). Resolved findings do NOT contribute.
  - A count multiplier: every 10 unresolved findings adds +5 (capped
    at +20).

`accepted_risk` findings count toward the score — accepting a risk does
not eliminate it from the risk surface. The dashboard should always
reflect the TRUE risk posture.

`riskScoreBand()` maps the score to a band:
  - `0..19` → low
  - `20..49` → medium
  - `50..79` → high
  - `80..100` → critical

---

## 8. Run security maintenance use case

File: `src/application/security/run-security-maintenance.usecase.ts`

`RunSecurityMaintenanceUseCase` orchestrates all six checks and
produces a `SecurityMaintenanceReport`:

  - `dependencyAudit` — full audit summary.
  - `scanVerdict` — pass / warn / fail.
  - `rotationSchedule` — upcoming rotations sorted by due date.
  - `rotationsDue` — subset of the schedule that is currently due.
  - `rlsCoverage` — covered + missing tables.
  - `storageReviews` — per-data-sensitivity storage review results.
  - `penetrationRiskScore` + `penetrationRiskBand`.
  - `overallStatus` — `healthy`, `attention_required`, `urgent_action`.
  - `recommendations` — actionable list of next steps.

The use case persists results via `SecurityMaintenanceRepository`. It
NEVER persists raw secrets — secret rotation records are already
hashed at the domain layer before the use case touches them.

### Overall status rules

  - **urgent_action** — any urgent dependency, OR scan verdict is
    `fail`, OR any RLS coverage missing, OR penetration risk score ≥ 80.
  - **attention_required** — any review-level dependency, OR scan
    verdict is `warn`, OR any rotation due, OR penetration risk score
    ≥ 20.
  - **healthy** — none of the above.

---

## 9. Migration verification

The migration verifier (`scripts/validate-sql.js`) SHOULD be extended
to call `verifyRlsCoverage()` against the live database schema. The
canonical list of required tables is `TABLES_REQUIRING_RLS` from
`src/domain/security/rls-verification.ts`.

When a Phase 9 table is missing RLS, the verifier reports it via
`missingPhase9Tables()` for a focused error message.

---

## 10. Privacy guarantees

  - Raw secret values are NEVER persisted — only SHA-256 hashes.
  - The `STUB_SECRET_HASHER` is a test double, NOT for production.
  - RLS verification covers every table that holds user data,
    including all 9 Phase 9 tables.
  - Storage review enforces the sensitivity ceiling per tier —
    `top_secret` data is ONLY allowed in SecureStore.
  - Penetration test findings never carry PII (titles, descriptions,
    and remediation guidance are operator-authored).

---

## 11. References

  - `docs/security-model.md` — overall security architecture.
  - `docs/privacy-and-trust.md` — privacy commitments.
  - `docs/database-schema.md` — full table list.
  - `supabase/migrations/202607291200_initial_schema.sql` — initial
    schema with RLS policies.
  - `src/domain/security/` — implementation.
  - `src/application/security/` — use case + repository port.
