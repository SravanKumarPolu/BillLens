# Final release checklist — BillLens v2.26.0 (2026-10-23)

## Verdict

**NOT READY FOR PUBLIC STORE RELEASE. READY FOR OFFLINE CLOSED TESTING
on development builds**, subject to the device gates below. The offline
core (groups, expenses, splits, balances, settlements, receipts, search,
recurring, export, backup, retention) is fully implemented and covered
by 224 automated suites / 4,960 passing tests executed in this
environment. Remote encrypted sync remains intentionally BLOCKED (PRD
P2) and is honestly surfaced in-app.

## Automated gates — ALL PASSED (2026-10-23)

- [x] `npm ci` — reproducible from lockfile
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npm run lint` — 0 errors, 0 warnings
- [x] `npx jest --silent` — 224 suites / 4,960 tests, 0 skipped
- [x] `npm run db:validate` — all SQL files valid
- [x] `npm run db:verify` — schema executes in a real SQLite engine (14 blocks / 42 tables)
- [x] `npm run secret-scan` — CLEAN
- [x] `npx expo-doctor` — 21/21 checks
- [x] `npx expo export -p web` — static export succeeds

## Device gates — ALL OPEN (block closed testing)

- [ ] Android development build installs and cold-boots offline
      (`npx expo prebuild` first — the repo is CNG, no native folders)
- [ ] 14-point camera/OCR device protocol
      (`docs/DEVICE_CAMERA_OCR_CHECKLIST.md`) — ML Kit recognition,
      camera capture, gallery import, permission-denied → settings
- [ ] Notification delivery on a development build (opt-in daily
      reminder; Expo Go must keep working)
- [ ] SQLite persistence across restart/upgrade; draft recovery
- [ ] PDF/XLSX/CSV/JSON export share sheets; backup restore round-trip
- [ ] Maestro smoke subset on a simulator/device

## Beta/release gates — ALL OPEN

- [ ] EAS project + credentials; signed Android AAB + iOS builds
- [ ] Closed-testing track rollout (checklist:
      `docs/CLOSED_TESTING_CHECKLIST.md`)
- [ ] Legal sign-off of `docs/legal/*` drafts; published policy URLs
- [ ] Store listings + Data Safety forms match actual behaviour
      (`store/`)
- [ ] Dependency audit re-triaged for the release tag (prior passes: 0
      direct / 0 critical, remainder transitive build-toolchain)
- [ ] Independent security review commissioned (KL-18)
- [ ] Decision on encrypted-sync rollout (deploy relay per
      `docs/RELAY_DEPLOYMENT.md` — free-tier feasible — then wire UI and
      run the cross-device protocol) — optional for offline release

## Rollback plan

`docs/release/rollback-plan.md` (store rollback + data-safety notes).
Backups created in-app are the user-level rollback mechanism.

## Sign-off record

| Role | Status |
|---|---|
| Engineering (automated gates) | ✅ passed 2026-10-23, environment noted in `FINAL_TEST_RESULTS.md` |
| QA (device matrix) | ⛔ not executed — no hardware in this environment |
| Security review | ⛔ internal only (KL-18) |
| Legal | ⛔ drafts unsigned (KL-19) |
| Release manager | ⛔ not signed — see verdict above |
