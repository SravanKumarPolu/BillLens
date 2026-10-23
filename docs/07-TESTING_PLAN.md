> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# Testing strategy and release gates

## Evidence levels
- **Static:** file/route inspection only; no runtime guarantee.
- **Unit:** Jest domain/component tests with mocked native APIs.
- **SQLite integration:** real SQLite engine, reopen, rollback and migration tests; does not simulate mobile native modules.
- **Emulator:** Expo development build and native APIs.
- **Physical device:** installed build, camera/gallery/notifications/storage/upgrade/background behaviour.
- **Production-like:** signed build, relay integration, two independent phones and interrupted network.

## Required suites
Financial: all split types, multiple payers, integer remainder allocation, per-currency zero sum, partial settlements, reversals, concurrent edits and idempotent retries. SQLite: clean boot, migration replay, quoted/comment semicolons, foreign keys, crash mid-transaction, upgrade from older schema, restore and retention guards. Capture: camera/gallery permission denied, URI expiry, copy/read, ML Kit native availability, blurry receipt, duplicate, ₹100 receipt total and human review. Sync: offline queue/restart, duplicate delivery, out-of-order ciphertext, tampered signature, removed member, TTL expiry, conflict review, device loss/recovery. UX: accessibility, large text, back navigation, forms, screen reader and contrast. Security: secrets redaction, RLS only if cloud used, group permissions, encrypted payload confidentiality.

## Android regression ledger
| Issue | Regression test / required evidence |
|---|---|
| Migration splitter near `tracks` | SQL semicolon inside line/block comments and quotes; real SQLite migration test |
| Camera `undefined is not a function` | Real device capture + persist + reopen |
| Gallery deprecated `MediaTypeOptions` | Use supported picker API; no warning on target Expo version |
| Image could not be read | content URI, cache URI, permissions, restart, valid local file |
| Manual expense failed | Create/edit/save/retry/reopen; one transaction and correct balances |
| Hermes `Intl.RelativeTimeFormat` | Feature absent → safe fallback; activity screen renders |
| Missing `ExpoTopicSubscriptionModule` | Expo Go boot without eager native notification import |
| Reminder `undefined is not a function` | Schedule/cancel in development build; Expo Go graceful fallback |
| Expo Go remote push limitation | No remote push registration; no unsupported-module startup crash |

## Commands and truthful reporting
`npm run typecheck`; `npm run lint`; `npm test -- --runInBand`; `npm run db:verify`; `npm run secret-scan`; `npx expo-doctor`; `npx expo export -p android`. Run only with dependencies installed and record exit codes. This documentation audit did **not** run a native Android build or physical-device tests; those remain open release gates.
