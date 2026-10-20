# BillLens v2.6.0 — Release Checklist

**Release line:** 2.6.0 (release candidate — bidirectional sync)
**Design direction:** Modern SaaS + Minimalism + Bento UI (unchanged)
**Baseline:** v2.5.0, extended with the incremental download engine,
explicit conflict resolution, and four release-blocking defect fixes.

---

## 1. Automated gate (machine-verifiable, run from a clean install)

| # | Command | Expected | v2.6.0 result |
|---|---|---|---|
| 1 | `npm ci` | exit 0, reproducible | ✅ PASS (1,175 packages, 14 s) |
| 2 | `npx tsc --noEmit` | 0 errors | ✅ PASS |
| 3 | `npm run lint` | 0 errors/warnings | ✅ PASS |
| 4 | `npm test -- --runInBand` | all green | ✅ 183/183 suites, 4,671/4,671 tests |
| 5 | `npx expo-doctor` | all checks pass | see §8 (execution record) |
| 6 | `npx expo install --check` | up to date | see §8 (execution record) |
| 7 | `npm run secret-scan` | CLEAN | ✅ PASS |
| 8 | `npm run db:validate` | all SQL valid | ✅ PASS (5/5 migrations + seed) |
| 9 | `npm audit` | advisories triaged | ✅ 58 prod-tree advisories: 0 direct, 0 critical, 100% transitive build/toolchain (jest/expo internals) — unchanged profile from v2.5.0 |

## 2. Version & store metadata

- [x] `package.json` version = 2.6.0
- [x] `app.config.ts` version = 2.6.0
- [x] `ios.buildNumber` floor = "2.6.0"; `android.versionCode` floor = 20600 (EAS autoIncrement manages increments)
- [x] Bundle identifiers per environment (`com.billlens.dev|staging|app`) — unchanged
- [x] CHANGELOG entry with the four release-blocking fixes

## 3. Bidirectional sync readiness (the v2.6.0 headline)

- [x] Local migration 0007 (`sync_cursors` + `sync_conflicts` CHECK alignment) — replay-safe checkpoints, schema accepts every category the engine writes
- [x] Download feed: keyset pagination, tombstones, RLS via user JWT, NOT_CONFIGURED handling
- [x] Download coordinator: parent-first, per-page cursor persistence, cursor hold on deferred/failed rows, corrupt-cursor reset, 5-minute overlap
- [x] Remote change applier: no-echo writes, deferral (never drops financial rows), aggregate guard, tombstone mapping, settlement normalization
- [x] Conflict records carry BOTH payloads; resolution (keep mine / use cloud) is explicit and deterministic
- [x] Server migrations: `202610110900_group_members_soft_delete.sql` (unblocks `db push`), `202610111100_bidirectional_sync_server.sql` (commit-order `updated_at` + keyset indexes)
- [x] Upload payload completeness (group/member/settlement/expense-children) — 23502-class failures impossible
- [x] Two-device integration suite proves convergence + identical balances

## 4. Backend deployment (deployer-owned; not executed here)

- [ ] `supabase db push` from a CLEAN project → must now succeed past the RLS migration (v2.5.0 blocker removed)
- [ ] Run §3.0 probes in `docs/deployment.md` (clock_timestamp trigger, pull indexes, deleted_at column)
- [ ] Run §3.1 RLS probes; §3.2 purge cron; §3.3 TWO-account live sync protocol (10 steps)
- [ ] `supabase functions deploy ocr-receipt` + §4.1 live-receipt check
- [ ] Record results in this checklist before any store submission

## 5. Build & device verification (deployer-owned; not executed here)

- [ ] Android internal-testing APK: `eas build --profile internal --platform android`
- [ ] iOS TestFlight build: `eas build --profile production --platform ios` (requires Apple credentials)
- [ ] Maestro flows: `e2e/maestro/` (65 flows; phase7 covers sync/conflict/recovery device paths)
- [ ] Manual §3.3 protocol on two physical devices

## 6. Security review (v2.6.0 delta)

- [x] No service-role keys anywhere; secret-scan CLEAN
- [x] Downloads authorized by RLS with the user's JWT (no privileged reads)
- [x] All new SQL parameterized; table names from code constants only
- [x] No PII/receipt payloads logged in the sync engine (grep-verified)
- [x] Idempotency preserved end-to-end (version guards + idempotency keys + row-id dedupe)
- [x] Conflict records hold financial payloads locally only (device-keychain-adjacent SQLite; documented retention)

## 7. Known limitations carried into 2.6.0 (honest)

1. Live Supabase verification (auth/RLS/sync probes) — BLOCKED on a provisioned project (§4 above)
2. Live OCR verification — BLOCKED on a Vision credential + deployed function
3. Device E2E / Maestro — BLOCKED on simulator/emulator host
4. Timestamp-watermark polling residual risk (documented in `docs/consistency-model.md` §9; "Full re-sync" is the operator recovery)
5. Dependency advisories resolve only with an SDK 55 upgrade (device-verification-gated, unchanged decision)
6. Receipt images stay device-local by design (download scope excludes them)

## 8. Execution record (2026-10-12, this environment)

| Command | Result |
|---|---|
| `npm ci` | ✅ exit 0 |
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm test -- --runInBand` | ✅ 183/183 suites, 4,671/4,671 tests |
| `npm run db:validate` | ✅ 5/5 migrations + seed structurally valid |
| `npm run secret-scan` | ✅ CLEAN |
| `npm audit` / `npm audit --prod` | ✅ triaged: 0 direct, 0 critical |
| `npx expo-doctor` | ✅ 18/18 checks passed |
| `npx expo install --check` | ✅ dependencies up to date |
| Maestro / physical devices | ⛔ NOT EXECUTED — no simulator/emulator/device in this environment |
