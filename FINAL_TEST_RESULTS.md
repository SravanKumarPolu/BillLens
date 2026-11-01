# Final test results — BillLens v2.26.1 (2026-10-24)

## Environment

| Item | Value |
|---|---|
| Machine | macOS 26.7.1 (Darwin, Apple silicon), local workstation |
| Node | v24.20.0 (`node:sqlite` 3.53.4 available) |
| npm | 11.19.0 |
| Android device / emulator | **none attached** (no `adb` device, no AVD) |
| iOS simulator / device | **none used** |
| Android SDK / JDK | present on the machine, **no Gradle build run in this pass** |
| Network | available for `npm ci` only; **no Supabase project, no deployed relay, no OCR provider** |

## Authoritative run: extracted `BillLens-Final.zip` (2026-10-24)

The archive was extracted into `/tmp/bl-final-v2`, installed from the lockfile
and validated there. This is the release gate for the delivered bytes.

| # | Check | Exact command | Result |
|---|-------|---------------|--------|
| 1 | Archive integrity | `unzip -t BillLens-Final.zip` | ✅ no errors, 1,386 entries (1,155 files) |
| 2 | Clean install | `npm ci` | ✅ reproducible from `package-lock.json` |
| 3 | TypeScript | `npm run typecheck` | ✅ 0 errors |
| 4 | ESLint | `npm run lint` | ✅ 0 errors, 0 warnings |
| 5 | Jest (full) | `npx jest --silent` | ✅ **224 suites / 4,960 tests, 0 failed, 0 skipped** (138 s, cold cache) |
| 6 | SQL structure | `npm run db:validate` | ✅ all files structurally valid, 0 warnings |
| 7 | SQLite schema execution | `npm run db:verify` | ✅ 14 blocks, **42 tables created in a real SQLite engine** |
| 8 | Secret scan | `npm run secret-scan` | ✅ CLEAN |
| 9 | Expo health | `npx expo-doctor` | ✅ **21/21 checks passed** |
| 10 | Web export | `npx expo export -p web` | ✅ static export succeeds, all routes emitted |

## Source-tree run (2026-10-24)

Executed before packaging on the same content:

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npx jest --silent` | ✅ 224 suites / 4,960 tests (72 s) |
| `npx expo-doctor` | ⚠️ 20/21 — only the "native folders present" check fails **because this workstation keeps an untracked 3.2 GB `android/` prebuild folder**. That folder is generated output, is not part of the deliverable, and is absent from `BillLens-Final/`; the extracted archive scores 21/21. |

## Reliability note (test flake found and addressed)

- The first full run immediately after a cold `npm ci` on the pre-final archive
  reported **1 failed test out of 4,960**. The failing suite name was lost to
  truncated output; three consecutive full reruns then passed 224/224.
- Cause: Jest's 5 s default per-test timeout is tight for the real-SQLite and
  PBKDF2/XChaCha20 suites on a cold filesystem (the same run took 118–138 s
  versus 72 s warm).
- Fix: `jest.config.js` now sets `testTimeout: 15_000` with an explanatory
  comment. The final archive's cold run passed all 4,960 tests.
- This was test infrastructure, not product behaviour; no application code
  changed for it.

## Not executed (and why)

| Check | Reason |
|---|---|
| Android/iOS device or emulator (camera, gallery, ML Kit OCR, notifications, SQLite on device, permissions, share sheets) | No device/emulator attached; **remains DEVICE-UNTESTED** |
| Maestro E2E (`e2e/maestro/**`) | Requires device/simulator + Maestro CLI |
| Gradle `assembleDebug` / EAS signed builds | No signed-build credentials used in this pass; a debug APK build was recorded on 2026-10-22 in `docs/NATIVE_BUILD_VERIFICATION.md`, but this pass did not rebuild native binaries |
| Live Supabase probes | No provisioned project/credentials |
| Live remote OCR | No Vision credential / deployed edge function |
| Relay deployment and cross-device sync on hardware | No hosting approval; PRD P2, intentionally BLOCKED |
| `npm audit` | Not re-run; prior triage (0 direct, 0 critical, remainder transitive build toolchain) stands unchanged, no dependency was added in this pass |

## Honest summary

Everything runnable without hardware, store credentials or a live backend is
green on the delivered archive: install, typecheck, lint, 4,960 tests, SQLite
schema, secret scan, Expo health and web export. The claims that **cannot** be
made from this run remain: on-device OCR quality, camera/notification hardware
behaviour, live cloud sync, cross-device delivery, and store-release readiness.
Those are tracked with exact remaining actions in `KNOWN_LIMITATIONS.md` and
`FINAL_RELEASE_CHECKLIST.md`.
