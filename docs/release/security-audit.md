# Security Audit — BillLens v2.0.0 Release Candidate

> Evidence-based audit executed 2026-10-10 (Phase 8, Prompts 71 + 80).
> Every claim below points at a command, file, or test.

## Gate results

| Check | Result | Evidence |
|---|---|---|
| Secret scan | ✅ CLEAN | `npm run secret-scan` — no service-role keys (JWT-shape `role:service_role`), PEM private keys, OAuth client secrets, Google/Apple provider secrets, Stripe live keys, AWS keys, bearer tokens, generic API keys, or password patterns |
| Service-role key in mobile bundle | ✅ Absent | Only `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` are read client-side (`src/config/env.ts`); no `service`/`admin`/`private` env names exist (`.env.example` documents the prohibition) |
| Dependency audit | ⚠️ See below | `npm audit --omit=dev`: 74 findings (2 critical, 6 high, rest moderate/low) — **0 in direct runtime dependencies** |
| Security test suites | ✅ 6 suites pass | `src/domain/security/__tests__/` — dependency-audit, rls-verification, vulnerability-scan, secret-rotation, storage-review + penetration-test framework |
| Threat model | ✅ Exists | `docs/security-model.md`, `docs/production-monitoring.md` + security-domain modules covering the Prompt 71 threat classes |

## Dependency audit — honest reading

`npm audit --omit=dev` reports 74 findings. Verification of the
dependency graph shows they originate in the **build toolchain**, not
in shipped runtime code:

| Package (root cause) | Severity | Actual exposure | Disposition |
|---|---|---|---|
| `shell-quote` (via @expo/cli dev-server) | critical | Build-time CLI only; not bundled into Hermes output | No non-breaking fix; resolved by next Expo SDK upgrade. Not shippable into app |
| `tar` (via `xcode` ← @expo/cli toolchain) | critical | Build-time macOS plist tooling only | Same as above |
| `@xmldom/xmldom` (via @expo/plist) | high | Build-time plist parsing only | Same |
| `@remix-run/node` (via @expo/cli) | critical→moderate set | Dev-server only | Same |
| braces / fast-uri / fast-xml-parser / image-size / compression etc. | high/moderate | CLI/image-tooling transitives | Same |

**Why we did not "fix" with `--force`:** `npm audit fix --force`
would downgrade Expo SDK 51 → 44 — a breaking downgrade that Prompt 71
explicitly forbids ("Do not blindly apply breaking automated
upgrades"). `npm audit fix` (non-breaking) **was applied** during this
remediation: production-tree findings dropped 80 → 74; all 4,144 tests
still pass (`docs/release/test-summary.md`).

**Shipped-bundle reality:** the Hermes bundle (`npx expo export`,
verified) contains only the app code + runtime deps (react,
react-native, expo modules, supabase-js, zod, zustand, reanimated,
screens, safe-area-context, async-storage, react-query,
react-hook-form) — none of which appear in the audit findings.

**Tracked risk:** RISK-SEC-01 "Expo CLI toolchain advisories —
mitigated by build-host isolation + SDK upgrade plan" in
`known-limitations.md`.

## Authentication checks (Prompt 71) — verified by code + tests

| Requirement | Status | Where |
|---|---|---|
| Sessions in secure platform storage; refresh tokens never in plain SQLite | ✅ | `src/infrastructure/security/session-storage.ts`, `secure-storage.ts`; ports in `@domain/ports` |
| Expired/revoked sessions handled safely | ✅ | `AuthService.restoreSession` outcomes incl. `reauthentication_required`; audit events |
| Email OTP rate limiting | ✅ | rate-limiter domain module + OTP use cases |
| OTP values never logged | ✅ | logging rules + redactor tests (`metrics-redactor.test.ts`) |
| Provider subject IDs (not email) for Google/Apple identity | ✅ | `authentication-provider.port.ts` — "MUST NOT substitute the email for the subject"; member-linking tests |
| Account merging does not rely solely on email | ✅ | `linked-auth-identity` + member-linking use cases keyed by `(provider, providerSubject)` |
| Social sign-in cancellation handled | ✅ | sign-in use cases + `social-auth-cancel` flow |
| Account deletion implemented in-app | ✅ (new) | `RequestAccountDeletionUseCase`, `/settings/delete-account`, 14-day recovery window, sessions revoked at request time; 14 tests |

## Authorisation / RLS (Prompt 71)

- RLS verification module + tests assert per-table policy presence for
  profiles, identities, device installations, groups, members, invites,
  expenses (payers/shares/line items), attachments, drafts, settlements
  (+ disputes, reminders), notifications, audit, sync metadata,
  conflicts (`src/domain/security/rls-verification.ts`).
- **Execution gap:** policy *execution* against a live database
  (`supabase db reset` + multi-user probes) requires a Supabase
  environment and is scheduled before closed beta — tracked as
  RISK-SEC-02.
- Backend enforcement exists in the Supabase schema/migrations
  (policies + grants); UI hiding is never the only control.

## Invite & file security

- Invite tokens: hashed storage, server-side expiry checks (injected
  `now` in `ValidateInviteUseCase`/`JoinGroupUseCase` — fix recorded in
  `docs/IMPLEMENTATION_PROGRESS.md`), revocation immediate, entropy via
  `expo-crypto`, no group detail leaked on invalid tokens, QR encodes
  the token only (`generate-qr-code-url.usecase.ts`).
- Files: non-guessable storage paths, signed URLs, membership checks,
  MIME + size validation, malicious filenames neutralised, local-only
  files never upload (`privacy-aware-sync-rules.ts` +
  `local-only-attachment-never-uploads` e2e flow).

## Logging redaction

- 3 redactors (metrics, feedback, analytics) strip 14+ sensitive key
  classes; amounts bucketed; tokens/OTPs/invite tokens/financial
  content never logged — enforced by tests (`metrics-redactor.test.ts`,
  `analytics-redactor.test.ts`, notification-architecture tests).

## Launch-blocking verdicts

| Prompt 80 critical check | Verdict |
|---|---|
| No service-role key in mobile bundle | ✅ PASS |
| No private server secret in client config | ✅ PASS |
| No production credentials in repository | ✅ PASS (secret-scan clean) |
| No sensitive logs | ✅ PASS |
| RLS enforced | ⚠️ PASS (static) / pending live execution (RISK-SEC-02) |
| File access protected | ✅ PASS |
| Invite tokens secure | ✅ PASS |
| Sessions revocable | ✅ PASS (incl. account-deletion revocation) |
| Deep links validated | ✅ PASS (invitation deep-link handler + route guards) |
| Backups exclude secrets | ✅ PASS (`data-export` / backup tests) |
| Analytics redacted | ✅ PASS |
| Crash reports redacted | ✅ PASS |
| Dependency audit reviewed | ✅ PASS (documented above) |
| Secret scan clean | ✅ PASS |
