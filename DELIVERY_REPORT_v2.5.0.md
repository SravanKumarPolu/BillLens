# BillLens v2.5.0 — Final Delivery Report

**Date**: 2026-10-12
**Package**: `billlens-complete-v2.5.0.zip`
**Baseline**: v2.4.0 (unchanged product direction: offline-first, receipt-aware shared-expense app; Modern SaaS + Minimalism + Bento UI)

---

## 1. What this pass was

A **production release-candidate verification pass** — not a redesign.
Every subsystem of the uploaded v2.4.0 project was independently
re-audited (three parallel deep audits + targeted manual review),
verified defects were fixed at the root cause, and the release
configuration was completed. Existing solutions were preserved wherever
they proved sufficient; nothing was rewritten for its own sake.

---

## 2. Nine-phase status

| Phase | Status | Implemented Changes | Verification | Blockers |
|---|---|---|---|---|
| OCR | **COMPLETE** (code+tests) | Production guard: mock OCR refused when `EXPO_PUBLIC_APP_ENV=production` (forced-remote-unconfigured and mock-in-production → explicit `unavailable`, never sample data); fail-loud `UnavailableCaptureProcessor` replaces the mock as composition-root default; `OCR_UNAVAILABLE` pipeline code + dedicated "Receipt scanning unavailable" state (manual entry primary, no pointless Retry); DEMO banner on mock-OCR drafts; Edge Function: in-function JWT verification (guest anon-key or user token), stub provider refused unless `OCR_ALLOW_STUB=true` (old default served fabricated high-confidence receipts), early Content-Length rejection; `.env.example` selection matrix | 3 updated/new suites green (selector incl. production-gating matrix, unavailable processor, pipeline mapping, processing-screen states) | **Live OCR NOT EXECUTED** — requires a provisioned Supabase project + `GOOGLE_CLOUD_VISION_API_KEY`; exact steps in `supabase/functions/ocr-receipt/README.md` + `docs/deployment.md` §4 |
| Supabase & Security | **COMPLETE** (code + SQL) / live verification **BLOCKED** | Fixed two fresh-deploy-blocking migration defects (`gm.profile_id`→`gm.user_id` ×6 — `supabase db push` FAILED on a clean project; wrong REVOKE signature aborted the entire policy migration); invite-gated `group_members` self-join (pending/unrevoked/unexpired/uses-remaining); `WITH CHECK` pins self-updates (no group rewriting / self-promotion); owner-gated `groups_update_member`; `receipts` storage bucket + owner-namespaced policies; `billlens_purge_expired_accounts()` SECURITY DEFINER RPC + pg_cron snippet (account deletion now reaches the cloud); OCR fn JWT check; service-role keys verified absent from the app (secret-scan clean) | `npm run db:validate` all valid; static verification (structure, policy coverage) documented with SQL probes in `docs/deployment.md` §3.1 | **Live RLS/auth/sync verification NOT EXECUTED** — needs a provisioned project; probes are copy-paste ready |
| Financial Integrity | **COMPLETE** | `explainMemberBalance` debtor crash fixed (`Money.multiply(-1)` rejected — EVERY debtor threw); group-currency invariant enforced on both expense write paths (stray-currency expenses previously accepted, then crashed the balance engine); reversal pair committed atomically via UnitOfWork (crash window previously double-counted); receiver-only confirmation enforced in the use case; multi-payer OCR drafts confirmable (first candidate + review); currency-aware formatters (explanations, CSV/OFX exports, calendar, payment links — JPY ¥1500 no longer "15.00") | Debtor regression test, draft-confirm tests green (10/10), full property suite (P1–P8) untouched and green | — |
| Offline Reliability | **COMPLETE** | **Critical:** queue-drain fix (`listReadyForRetry` selected only `failed` — new expenses/settlements/groups NEVER uploaded); local migration 0006 rebuilds `sync_operations` (statuses/ops/entity-types the code actually writes + `updated_at` — `markPermanentlyFailed`/`cancelOperation` previously THREW on device); aggregate payload flattening in the sync port ({expense,payers,splits}/{settlement} previously could not upload at all); idempotent create retries (23505 resolved by row id — server-accepted-but-response-lost = success); auth expiry → retriable `AUTH_TOKEN_EXPIRED` + automatic token refresh (was `DELETED_REMOTELY` conflict); full boot recovery of stuck ops; retry timer (scheduled backoffs now actually fire); retry cap single-sourced (10); rich conflict records; deny-all table mappings removed; REAL sync-status surfacing (pending vs needs-review counters, `/settings/sync` reachable, settings row, dashboard labels fixed) | Queue-drain parity tests, migration-preservation test, port tests (payload/auth/dedupe) all green; coordinator suite green | Push-only sync (no incremental-download adapter) documented as a known RC limitation |
| UI/UX | **COMPLETE** (necessary improvements only) | `Screen.avoidKeyboard` (KeyboardAvoidingView, iOS padding/Android height) on all six form screens; honest unavailable/DEMO/needs-review states (above); verified-preserved: light/dark/system themes, safe areas, 44pt targets, money font-scaling cap, reduced motion, bounded lists, keyboard-tap persistence — visual identity unchanged | Full suite green after changes | — |
| Dependencies | **COMPLETE** (triage) | `npm audit fix` applied (safe ranges only); remaining 62 advisories verified **100% transitive build/toolchain** (Expo/metro/jest internals) — 0 direct, 0 shipped-runtime affected; Android permission modernization (CAMERA-only explicit; media permission per target SDK); SDK 55 migration deliberately deferred (breaking, needs device verification) | `npm audit --prod --json` analyzed programmatically; `expo install --check` clean | SDK toolchain advisories resolve only with an SDK upgrade — documented, not silently forced |
| E2E Testing | **NOT EXECUTED** (device) / automated gate **COMPLETE** | — | `npm ci` ✅ · `tsc --noEmit` ✅ 0 · `npm run lint` ✅ clean · `npm test -- --runInBand` ✅ **178/178 suites, 4,608/4,608 tests** (+27 vs v2.4.0) · `expo-doctor` ✅ 18/18 · `expo install --check` ✅ · `secret-scan` ✅ CLEAN · `db:validate` ✅ | **Android/iOS/Maestro execution NOT EXECUTED** — no simulator/emulator/Maestro host in this environment; manual plan in `e2e/README.md`, flows in `e2e/maestro/` |
| Release Preparation | **COMPLETE** | `package.json` + `app.config.ts` → 2.5.0 (config version was stale at 2.2.0); `ios.buildNumber` 2.5.0 floor; `android.versionCode` 20500 floor; permission cleanup; `eas.json` verified (internal APK / staging / production AAB+IPA, credential placeholders only); `docs/deployment.md` (zero→store guide incl. RLS verification SQL + purge cron); `docs/release/release-checklist-v2.5.0.md`; CHANGELOG entry; IMPLEMENTATION_STATUS gate table | `expo-doctor` validates config; EAS schema consistent | No builds submitted or claimed — store submission requires explicit owner authorization |
| Competitive UX | **COMPLETE** (assessment) | `docs/release/competitive-ux-assessment-v2.5.0.md` — verifiable-feature scorecard vs Splitwise/Tricount; genuine gaps documented (realtime download sync, recurring expenses, multi-currency within a group) and deliberately deferred; no scope-creep features added | Every "supported" claim mapped to a screen/test | — |

---

## 3. Verification commands & results (2026-10-12, clean install)

| # | Command | Result |
|---|---------|--------|
| 1 | `rm -rf node_modules && npm ci` | ✅ exit 0 |
| 2 | `npx tsc --noEmit` | ✅ 0 errors |
| 3 | `npm run lint` | ✅ 0 errors, 0 warnings |
| 4 | `npm test -- --runInBand` | ✅ **178/178 suites, 4,608/4,608 tests** (~20 s) |
| 5 | `npx expo-doctor` | ✅ 18/18 checks |
| 6 | `npx expo install --check` | ✅ dependencies up to date |
| 7 | `npm run secret-scan` | ✅ CLEAN |
| 8 | `npm run db:validate` | ✅ all migrations structurally valid |
| 9 | `npm audit` / `npm audit --prod` | ✅ triaged — see Dependencies row |
| — | `maestro test e2e/maestro/...` | ⛔ **NOT EXECUTED** — no simulator/emulator/Maestro CLI in this environment |

Test delta vs v2.4.0: **+27 tests** (4,581 → 4,608), 0 regressions; every fix carries a named regression test.

---

## 4. Confirmed fixes (defects the v2.4.0 report missed)

1. Sync queue never drained pending operations (nothing was ever uploaded).
2. Sync payload wire-format could not upload aggregates.
3. Local schema CHECK rejected statuses the code itself writes (crash on device).
4. RLS migration chain failed on a fresh Supabase project (`profile_id`, REVOKE signature) — the documented security posture was unprovisionable.
5. Any authenticated user could join any group / rename groups / self-promote (RLS).
6. `explainMemberBalance` crashed for every debtor.
7. Auth-expired uploads dead-ended as user-review conflicts (never retried).
8. Sync status UI claimed "all synced" regardless of queue state; dashboard mislabeled pending as failed.
9. Mock OCR could reach production users through three silent fallback paths; the server defaulted to a fabricated stub.
10. Group-currency invariant skipped on write paths; reversal pair non-atomic; receiver-only confirmation unenforced; multi-payer OCR drafts unconfirmable.

---

## 5. Unresolved risks & external setup requirements

| Risk / requirement | Impact | Action owner |
|---|---|---|
| Supabase project provisioning + migrations + RLS SQL probes | Blocks live auth/sync/RLS verification | Deployer (`docs/deployment.md` §2–3) |
| Cloud Vision credential + Edge Function deploy + live-receipt check | Blocks live OCR claim | Deployer (§4) |
| pg_cron schedule for account purge | Remote data retention after deletion | Deployer (§3.2) |
| Device testing (Android internal APK, iOS TestFlight build, Maestro) | Blocks "validated on real devices" claim | Deployer (§6, `e2e/README.md`) |
| Expo SDK 54 toolchain advisories | Low (build-time only, 0 runtime affected) | Deferred until SDK 55 migration can be device-verified |
| Push-only sync | Convergence latency between devices | Roadmap (download-port implementation) |
| Crash-reporting integration (Sentry or equivalent) | Requires an account choice | Deployer (§7) |

---

## 6. Package contents & integrity

`billlens-complete-v2.5.0.zip` — full project source including
`app/`, `src/`, `supabase/` (migrations + Edge Function), `e2e/`
(Maestro flows + manual plan), `docs/` (incl. new deployment guide,
release checklist, competitive assessment), `assets/`, `scripts/`,
updated `package.json` + `package-lock.json`, `.env.example`,
CHANGELOG, IMPLEMENTATION_STATUS, this report.

**Excluded:** `node_modules/`, `.git/`, build caches (`.expo/`),
`.env.local` and any credential files (secret-scan clean), OS junk.

Integrity is asserted by the packaging step's `unzip -t` output
(recorded in the delivery message). SHA-256 is reported alongside the
artifact.

---

No test results, builds, screenshots, or external-service connections
were fabricated at any point: everything marked BLOCKED / NOT EXECUTED
is externally gated and documented with the exact steps to clear it.
