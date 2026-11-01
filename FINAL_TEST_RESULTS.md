# Final test results — BillLens v2.26.0 (2026-10-23)

## Environment

| Item | Value |
|---|---|
| Machine | Linux sandbox (no display, no emulator, no physical device) |
| Node | v24.21.0 (`node:sqlite` available) |
| npm | 11.19.0 |
| Java | OpenJDK 21 (present; **no Android SDK**, so no Gradle build) |
| sqlite3 CLI | **not installed** (no root); tests use Node's built-in `node:sqlite` |
| Network | available for package installation only; **no Supabase project, no deployed relay, no OCR provider credentials** |

## Executed checks (all commands run 2026-10-23 on the final working tree)

| # | Check | Exact command | Result |
|---|-------|---------------|--------|
| 1 | Clean install | `npm ci` | ✅ 700 packages, reproducible from lockfile |
| 2 | TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| 3 | ESLint | `npm run lint` | ✅ 0 errors, 0 warnings |
| 4 | Jest (full) | `npx jest --silent` | ✅ **224 suites / 4,960 tests passed, 0 failed, 0 skipped** (~55 s) |
| 5 | SQL structure validation | `npm run db:validate` | ✅ 6 files (5 migrations + seed) structurally valid, 0 warnings |
| 6 | SQLite schema execution | `npm run db:verify` | ✅ 14 blocks, **42 tables created in a real SQLite engine** (`node:sqlite`) |
| 7 | Secret scan | `npm run secret-scan` | ✅ CLEAN (9 pattern families incl. service-role keys, PEM, Stripe/AWS/OAuth) |
| 8 | Expo doctor | `npx expo-doctor` | ✅ **21/21 checks passed** |
| 9 | Web export | `npx expo export -p web` | ✅ 5.8 MB static export, all routes emitted, metadata verified in the 2026-10-20 pass and re-exported here |

### Test-suite composition (224 suites / 4,960 tests)

- **222 suites** carried over from v2.25.0 — of which **17 real-SQLite
  integration suites (58 tests) previously skipped or failed without the
  `sqlite3` CLI now execute and pass** on `node:sqlite` (includes
  `two-device-sync`, `sqlite-migrations-execution`, `group-management`,
  `backup-restore`, `backup-attachments`, `receipt-persistence`,
  `expense-search`, `recurring-expenses`, `retention-cleanup-store`,
  `local-first-flow`, `encrypted-sync-persistence`,
  `migration-upgrade-0008`, `file-cleanup-queue`, `local-data-wipe`,
  `group-invitations`, `itemised-expense`, `sqlite-cli-database` usage).
- **2 new suites** (10 tests) from this pass: the discard use case (5)
  and the draft-review container regressions (2) plus extended
  assertions in existing suites (method picker, pending-confirmation
  version threading, changed-behaviour updates).

### Security-relevant suites executed

`sync-crypto` (envelopes, group keys, device identity, invitations),
`relay-reference` (signature verification, one-time join, replay),
`secret-scan` script, metrics/feedback redaction, backup crypto
(PBKDF2-210k + XChaCha20-Poly1305 tamper-fail), account deletion
windows, guarded erase, RLS verification helpers, dependency-audit
classification engine.

## NOT executed (with the exact reason)

| Check | Reason |
|---|---|
| Android/iOS device or emulator tests (camera, gallery, ML Kit OCR, notifications, SQLite on device, permissions, share sheets) | **No emulator/device/Android SDK in this environment.** These remain DEVICE-UNTESTED — see `docs/DEVICE_CAMERA_OCR_CHECKLIST.md` for the authored 14-point protocol. |
| Maestro E2E (`e2e/maestro/**`, 65 flows) | Requires a device/simulator + Maestro CLI. |
| Live Supabase probes (`docs/deployment.md` §3.0–3.3) | No provisioned project/credentials. |
| Live remote OCR (`docs/deployment.md` §4.1) | No Vision provider credential, no deployed edge function. |
| Relay deployment / cross-device encrypted sync beyond the Node two-device test | No hosting approval; intentionally BLOCKED (PRD P2). |
| Signed Android/iOS builds (EAS) | No EAS credentials / store accounts. |
| `npm audit` | Executed in prior passes (triaged: 0 direct, 0 critical, remainder transitive build-toolchain — see v2.6.0 status); registry reachability from this sandbox was not used as fresh evidence. |

## Honest summary

Everything runnable without hardware, store credentials or a live
backend is green, with zero skipped tests. The claims that **cannot** be
made from this run: on-device OCR quality, camera/notification hardware
behaviour, live cloud sync, cross-device delivery, and store-release
readiness. Those are tracked with exact remaining actions in
`KNOWN_LIMITATIONS.md` and `FINAL_RELEASE_CHECKLIST.md`.
