# BillLens v2.5.0 — Release Checklist

**Release line:** 2.5.0 (release candidate)
**Design direction:** Modern SaaS + Minimalism + Bento UI (unchanged)
**Baseline:** v2.4.0, verified and hardened by the v2.5.0 release-candidate pass.

---

## 1. Automated gate (machine-verifiable, run from a clean install)

| # | Command | Expected | v2.5.0 result |
|---|---|---|---|
| 1 | `npm ci` | exit 0, reproducible | ✅ PASS |
| 2 | `npx tsc --noEmit` | 0 errors | ✅ PASS |
| 3 | `npm run lint` | 0 errors/warnings | ✅ PASS |
| 4 | `npm test -- --runInBand` | all green | ✅ 178/178 suites, 4,608/4,608 tests |
| 5 | `npx expo-doctor` | all checks pass | ✅ 18/18 |
| 6 | `npx expo install --check` | up to date | ✅ PASS |
| 7 | `npm run secret-scan` | CLEAN | ✅ PASS |
| 8 | `npm run db:validate` | all SQL valid | ✅ PASS |
| 9 | `npm audit` | advisories triaged | ✅ 62 advisories, 100% transitive build/toolchain (Expo/metro/jest internals); 0 direct; 0 shipped-runtime affected |

---

## 2. Version & store metadata

- [x] `package.json` version = 2.5.0
- [x] `app.config.ts` version = 2.5.0 (was stale at 2.2.0 in v2.4.0)
- [x] `ios.buildNumber` floor = "2.5.0"; `android.versionCode` floor = 20500 (EAS autoIncrement manages increments)
- [x] Bundle identifiers per environment (`com.billlens.dev|staging|app`)
- [x] Icons / adaptive icon / splash present (`assets/`)
- [x] Camera + photo permission strings human-readable and accurate
- [x] Android permissions modernized (CAMERA only explicit; media permission injected per target SDK by the expo-image-picker plugin)
- [x] `eas.json` profiles: development / internal (APK) / staging / production (AAB+IPA, autoIncrement); submit section contains ONLY placeholders (no credentials committed)
- [x] Privacy disclosures — offline-first posture documented (`docs/privacy-and-trust.md`, `docs/payment-data-privacy.md`)

## 3. Anti-regression guards shipped in 2.5.0

- [x] Production builds cannot select mock OCR (`allowMock=false` → explicit unavailable state; server-side stub also refused unless `OCR_ALLOW_STUB=true`)
- [x] Composition-root capture-processor default fails loudly (`UnavailableCaptureProcessor`) — no silent mock path exists
- [x] Sync queue drains `pending` + due `failed` ops (parity-tested)
- [x] Local schema accepts every status the code writes (migration 0006)
- [x] Aggregate sync payloads upload (expense incl. payers/splits; settlement)
- [x] Duplicate-create retries resolve idempotently (server-accepted = success)
- [x] Auth-expired uploads retry with a refreshed token (never dead-end as conflicts)
- [x] Sync UI shows REAL pending vs needs-review counts (never "all synced" when conflicted)
- [x] Financial: debtor explanations, group-currency invariant, atomic reversal pair, receiver-only confirmation, currency-aware formatters (JPY/KWD correct)
- [x] Migration chain is runnable on a FRESH Supabase project (`gm.user_id` fix + REVOKE signature fix) — verified structurally; live push pending project provisioning

## 4. External gates (BLOCKED — require the owner's resources)

- [ ] Supabase project provisioned; migrations pushed; RLS verified with the SQL probes in `docs/deployment.md` §3.1
- [ ] `ocr-receipt` Edge Function deployed with a real provider credential; live OCR verified with a real receipt
- [ ] pg_cron account-purge schedule enabled
- [ ] EAS builds produced (`eas build`) and installed on real devices
- [ ] Device checklist executed (`docs/deployment.md` §6)
- [ ] Maestro E2E (`e2e/maestro/`) executed on a simulator/emulator host
- [ ] Store accounts ready; submit placeholders filled; **submission itself requires explicit owner authorization**

## 5. Known limitations (documented, accepted for the RC)

- Push-only cloud sync: the incremental-download adapter port exists but has no
  remote implementation; devices converge on next full sync, not in real time.
- Multi-payer OCR drafts keep the first detected payer (review screen allows
  correction); full multi-payer extraction is roadmap.
- Sync-conflict review UI renders the operation list (retry / requeue); a rich
  side-by-side diff editor is future work.
- `compactPendingOperations` is a no-op stub (the pure compaction module +
  tests exist; wiring deferred) — harmless while the queue drains correctly.
- Remaining dependency advisories live in the Expo SDK 54 toolchain; the SDK 55
  migration is deliberately deferred until it can be device-verified.

## 6. Rollback

`docs/release/rollback-plan.md` remains applicable: EAS channels pin build
runtimes; the local SQLite schema is forward-only, so a v2.5.0 → v2.4.0
rollback requires a store-channel republish of the previous build — local
databases created by migration 0006 are readable by v2.4.0 code only until the
first v2.5.0 build ships, after which rollback is republish-only.
