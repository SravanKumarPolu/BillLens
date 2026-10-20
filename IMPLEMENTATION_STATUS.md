# BillLens — Implementation Status

> **Date**: 2026-10-12
> **Version**: 2.6.0 (bidirectional cloud sync + explicit financial-conflict resolution + four release-blocking deployment fixes, on top of the v2.5.0 release-candidate pass)
> **Status**: All ten verification phases executed; 4,671 tests passing across 183 suites. The v2.5.0 headline limitation (PUSH-ONLY SYNC) is RESOLVED. Honest blockers unchanged: live OCR, live cloud verification and device E2E require externally provisioned resources.

## Verification Results (2026-10-12, v2.6.0 release-candidate gate)

| Check | Command | Result |
|-------|---------|--------|
| Clean install | `npm ci` | ✅ reproducible from lockfile |
| TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| ESLint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Jest suites | `npm test -- --runInBand` | ✅ 183 passed / 183 total |
| Jest tests | (same) | ✅ 4,671 passed / 4,671 total (+63 vs v2.5.0, +3 suites) |
| SQL validation | `npm run db:validate` | ✅ 5/5 migrations + seed valid |
| Secret scan | `npm run secret-scan` | ✅ CLEAN |
| Dependency audit | `npm audit` (+ `--prod`) | ✅ triaged: 58 prod-tree advisories, 0 direct, 0 critical, 100% transitive build/toolchain |
| Bidirectional sync | two-device integration suite | ✅ convergence + identical balances + tombstones + conflicts + restart recovery + idempotent retries + revoked visibility |
| Live Supabase probes | `docs/deployment.md` §3.0–3.3 | ⛔ BLOCKED on provisioned project (exact steps documented) |
| Live OCR | `docs/deployment.md` §4.1 | ⛔ BLOCKED on Vision credential + deployed function |
| Maestro device E2E | `maestro test e2e/maestro/...` | ⛔ NOT EXECUTED — no simulator/emulator/device in this environment |

## v2.6.0 Release-Candidate Pass (2026-10-12)

| Area | Status | Highlights |
|-------|--------|------------|
| 1 — Bidirectional sync | ✅ COMPLETE (code+tests) / ⛔ live verification BLOCKED on project | Per-collection cursors (migration 0007), keyset pagination, tombstones, 5-min late-commit overlap, parent-first deferral (never drops financial rows), no-echo applier, push→pull coordinator, manual full re-sync |
| 2 — Multi-user collaboration | ✅ isolated-env COMPLETE / ⛔ live two-account protocol BLOCKED | Two-device integration suite proves identical balances end-to-end; invite/revoke suites green; RLS authorization via user JWT; §3.3 ten-step live protocol documented |
| 3 — Financial conflict resolution | ✅ COMPLETE | Both-versions conflict records (replay-idempotent); Keep-mine re-bases onto cloud version; Use-cloud cancels stale ops; financial fields never auto-merged; `docs/consistency-model.md` documents the model + tradeoffs |
| 4 — Supabase production integration | ✅ COMPLETE (code+SQL) / ⛔ live verification BLOCKED | **Fixed fresh-deploy blocker** (`group_members.deleted_at` missing — new migration 202610110900); **fixed 23502 upload failures** (payload completeness ×4 builders); commit-order `updated_at` trigger + pull indexes (202610111100); probes §3.0 |
| 5 — OCR & receipts | ✅ verified unchanged / ⛔ live BLOCKED | Production mock guard + unavailable state preserved; 51 capture/OCR tests green; receipts deliberately excluded from download scope (privacy) |
| 6 — Offline reliability | ✅ COMPLETE | Queue/cursors/conflicts all durable in SQLite; boot recovery; honest states (pending/syncing/synced/failed/conflict — never "synced" without server ack) |
| 7 — UI/UX | ✅ COMPLETE (necessary only) | Sync status: conflict review cards (Keep mine / Use cloud), download-error surfacing, Full re-sync; Bento identity untouched |
| 8 — Security/perf/deps | ✅ COMPLETE | 0 direct/0 critical advisories; no PII logging in engine; parameterized SQL; bounded download pages |
| 9 — Verification gate | ✅ COMPLETE | Table above |
| 10 — Release preparation | ✅ COMPLETE | v2.6.0 versions/buildNumber/versionCode; `docs/release/release-checklist-v2.6.0.md`; CHANGELOG; deployment guide + consistency model docs |

## Prior Verification Results (2026-10-12, v2.5.0 release-candidate gate)

| Check | Command | Result |
|-------|---------|--------|
| Clean install | `npm ci` | ✅ reproducible from lockfile |
| TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| ESLint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Jest suites | `npm test -- --runInBand` | ✅ 178 passed / 178 total |
| Jest tests | (same) | ✅ 4,608 passed / 4,608 total (+27 vs v2.4.0) |
| Expo doctor | `npx expo-doctor` | ✅ 18/18 checks passed |
| Expo SDK alignment | `npx expo install --check` | ✅ dependencies up to date (SDK 54) |
| SQL validation | `npm run db:validate` | ✅ all migrations valid (incl. fixed 202610101500 / 202610111000) |
| Secret scan | `npm run secret-scan` | ✅ CLEAN |
| Dependency audit | `npm audit` (+ `--prod`) | ✅ triaged: 62 advisories, 100% transitive build/toolchain; 0 direct; 0 shipped-runtime affected |
| Maestro device E2E | `maestro test e2e/maestro/...` | ⛔ NOT EXECUTED — no simulator/emulator/Maestro CLI in this environment; manual steps in `e2e/README.md` |

## v2.5.0 Release-Candidate Pass (2026-10-12)

| Area | Status | Highlights |
|-------|--------|------------|
| 1 — Production OCR guard | ✅ COMPLETE | Mock refused in production (selector + fail-loud default processor + `OCR_UNAVAILABLE` UI state + DEMO banner); Edge Function: in-function JWT check, stub opt-in only, early size rejection |
| 2 — Supabase & security | ✅ COMPLETE (code+SQL) / ⛔ live verification BLOCKED on project | Fixed fresh-deploy-blocking migration defects (`gm.profile_id`→`user_id`, REVOKE signature); invite-gated self-join; self-update `WITH CHECK` pin; owner-only group updates; storage bucket + policies; `billlens_purge_expired_accounts()` RPC + cron snippet |
| 3 — Financial integrity | ✅ COMPLETE | Debtor explanation crash fixed; group-currency invariant on both write paths; atomic reversal pair; receiver-only confirmation; multi-payer draft confirm; currency-aware formatters |
| 4 — Offline reliability | ✅ COMPLETE | Queue-drain critical fix + parity tests; migration 0006 (schema accepts all statuses + updated_at); aggregate payload flattening; idempotent create retries; auth-expiry refresh + retriable classification; boot recovery; retry timer; rich conflict records; deny-all mappings removed; REAL sync-status surfacing (`/settings/sync`) |
| 5 — UI/UX | ✅ COMPLETE (necessary improvements only) | `Screen.avoidKeyboard` on all form screens; unavailable/demo/needs-review honest states; visual identity untouched |
| 6 — Dependencies & perf | ✅ COMPLETE (triage) | `npm audit fix` applied; all remaining advisories transitive toolchain (0 direct/0 runtime); log-leak check clean; bounded lists verified |
| 7 — Verification gate | ✅ COMPLETE | Table above |
| 8 — Release preparation | ✅ COMPLETE | version/buildNumber/versionCode, permission modernization, `docs/deployment.md`, `docs/release/release-checklist-v2.5.0.md` |
| 9 — Competitive UX | ✅ COMPLETE (assessment) | See `docs/release/competitive-ux-assessment-v2.5.0.md`; no scope-creep features added |

## Prior Verification Results (2026-10-11, official Phase-8 gate — after v2.4.0)

| Check | Command | Result |
|-------|---------|--------|
| Clean install | `npm ci` | ✅ reproducible from lockfile |
| TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| ESLint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Jest suites | `npm test -- --runInBand` | ✅ 177 passed / 177 total |
| Jest tests | (same) | ✅ 4,581 passed / 4,581 total |
| Expo doctor | `npx expo-doctor` | ✅ 18/18 checks passed |
| Expo SDK alignment | `npx expo install --check` | ✅ dependencies up to date (SDK 54) |
| SQL validation | `npm run db:validate` | ✅ all migrations valid |
| Secret scan | `npm run secret-scan` | ✅ CLEAN |
| Maestro device E2E | `maestro test e2e/maestro/...` | ⛔ BLOCKED — no simulator/emulator/Maestro CLI in this environment; manual steps in `e2e/README.md` |

## Eight-Phase Task Status (v2.4.0)

| Phase | Scope | Status | Notes |
|-------|-------|--------|-------|
| 1 — Real OCR pipeline | Secure backend adapter, retries/timeouts/cancel, duplicate prevention, offline deferral | ✅ COMPLETE (code+tests) / ⛔ LIVE OCR BLOCKED on provider credential | Mock provider default + fully tested; Edge Function deployable; config documented in `.env.example` + `supabase/functions/ocr-receipt/README.md` |
| 2 — Identity & cloud | Supabase auth, sessions, RLS, repositories, account deletion, sync, offline persistence | ✅ COMPLETE (code+tests) / ⛔ LIVE CLOUD BLOCKED on provisioned Supabase project | Adapters unit-tested with mocks; durable guest identity + deletion work offline end-to-end |
| 3 — Financial precision | Integer minor units, 0/3-dec currencies, four split ways, deterministic rounding, overpayment + duplicate prevention | ✅ COMPLETE | Overpayment guard added at the only recording entry point (explicit confirm-anyway; domain rules unchanged); P1–P8 property proofs |
| 4 — Dashboard reliability | Empty catches fixed, zero vs unavailable, stale-response guard, retry, refresh after writes | ✅ COMPLETE | Degraded flags + unavailable card + epoch guard; group dashboard hook hardened too |
| 5 — Expo upgrade | Verify + upgrade to supported stable | ✅ COMPLETE (verified) | expo@54.0.37 / RN 0.81.5 / React 19.1.0; expo-doctor 18/18; modern File/Paths APIs |
| 6 — UI/UX & accessibility | Amount readability, font scaling, reduced motion, keyboard, themes | ✅ COMPLETE (necessary only) | Money 1.5x cap, body uncapped; reduced-motion honored; no new design deps |
| 7 — Security & offline | Auth/authz, group access control, RLS, storage, privacy, idempotency, races, recovery, logs | ✅ COMPLETE | One verified vulnerability fixed (settlement group-membership check); everything else audited clean |
| 8 — E2E verification | Full gate + functional checklist + Maestro | ✅ COMPLETE (runnable) / ⛔ Maestro BLOCKED on environment | 8/8 runnable commands green; every functional flow covered by ≥1 dedicated suite |

## Prior Verification Results (2026-10-11, full gate chain — after v2.3.0)

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| ESLint | ✅ 0 errors, 0 warnings |
| Jest test suites | ✅ 167 passed / 167 total |
| Jest tests | ✅ 4,413 passed / 4,413 total |
| SQL validation (`db:validate`) | ✅ all migrations valid |
| Secret scan (`npm run secret-scan`) | ✅ CLEAN |
| Dependency audit | ⚠️ 74 build-toolchain findings (0 in shipped runtime deps) |
| Expo export (Android Hermes) | ✅ success — 3.98 MB bundle (see release/performance-report) |

## Phase Completion

| Phase | Prompts | Status | Tests | Delta |
|-------|---------|--------|-------|-------|
| 1 — Foundation & Architecture | 1–10 | ✅ Complete | ~850 | — |
| 2 — UI/UX | 11–20 | ✅ Complete | ~450 | — |
| 3 — Authentication & Identity | 21–30 | ✅ Complete | ~400 | — |
| 4 — Expense Management | 31–40 | ✅ Complete | ~600 | — |
| 5 — OCR & Capture Intelligence | 41–50 | ✅ Complete | ~400 | — |
| 6 — Settlements & Balances | 51–60 | ✅ Complete (remediated + write-side landed v2.1.0) | ~600 | +86 |
| 7 — Offline Sync & Reliability | 61–70 | ✅ Complete (remediated) | ~192 | — |
| **8 — Security, Testing & Launch** | **71–80** | ✅ **Complete (packaging remediated 2026-10-10)** | **~590** | — |
| 9 — Post-Launch Operations | 81–90 | ✅ Complete (+ dashboard UI v2.1.0; + feedback UI & local store v2.2.0) | ~1,226 | +21 |
| 10 — Scalability & Platform | 91–100 | ✅ Complete | ~30 | — |
| **Total** | **1–100** | ✅ **Implemented** | **4,291** | **+107** |

## What Changed in v2.2.0 — Feedback UI Surface + Local Feedback Store (2026-10-11)

The next increment after v2.1.0, again **additively** — no existing
behaviour was rewritten:

1. **`FeedbackScreen`** at `/settings/feedback` (Settings → "Send
   feedback"): the manual submission path (general / feature request /
   bug report) through `SubmitFeedbackUseCase`. The privacy notice is
   shown BEFORE submission (informed consent to automatic redaction);
   live character counter (0 / 4000); contact opt-in stores only the
   boolean, never an address; the confirmation card says honestly that
   nothing leaves the device today. NPS and the App Store review prompt
   stay eligibility-gated (90/180-day cooldowns) and are deliberately
   NOT on this form.
2. **`SqliteFeedbackRepository`** — `FeedbackRepository` +
   `ReviewPromptLedger` over local migration **v4** (`feedback_records`
   + `review_prompt_ledger`): defensive double-redaction (the same
   contract as the metric adapter — an unsafe caller cannot leak PII
   into the table), idempotent `save` by id (first write wins), exact
   id-prefix NPS user linkage (`substr(id, 1, ?) = ?` — never LIKE, no
   wildcard semantics), corrupted-JSON degradation on reads.
3. **Composition root** gains the `feedback` bucket (submitFeedback +
   submitNpsSurvey + promptAppStoreReview over the shared adapter).
4. **Test-double fidelity fix** — the in-memory SQL engine silently
   IGNORED unrecognized WHERE clauses (fail-open): during this
   increment a prefix query for one user returned ANOTHER user's row in
   tests. The double now supports `substr(col, 1, ?) = ?` and THROWS on
   unrecognized clauses (fail-loud). The full suite passing unchanged
   after the change proves no existing query relied on fail-open.
5. **`APP_METADATA.version` was stale** (0.1.0 vs the real 2.x
   releases) — synced; feedback records now carry the true app version.
6. **21 new tests** + the phase9 `send-feedback.yaml` Maestro structural
   flow.

## What Changed in v2.1.0 — Settlements Write-Side + Manual Expense Form + Polished Group Home (2026-10-11)

The next increment after the v2.0.3 write-side repository adapters,
again **additively** — no existing behaviour was rewritten:

1. **`SqliteSettlementRepository`** — the full `SettlementRepository`
   contract as a production SQLite adapter: `save` / `softDelete` /
   `saveReversal` with atomic sync-op co-writes, `listByFilter`,
   `listPendingConfirmation`, `listDisputed`, `findByOperationId`,
   `findByPaymentReferenceHash`, `appendStateHistory`,
   `listStateHistory`. Soft-delete replays are idempotent under sync
   replay.
2. **`SqliteAuditRepository`** — the append-only audit trail. Local
   migration **v3** (`write_side_support`) adds the `audit_logs.group_id`
   column the cloud schema always had, so `listByGroup` filters in SQL,
   plus the `monitoring_metrics` local cache table (Prompt 81).
3. **`SqliteMetricRepository`** — the `MetricRepository` port over the
   local redacted metric cache, with defensive `redactMetricPayload`
   re-application and idempotent `record` by `(metric, recordedAt)`.
4. **Composition root** gains the `settlements` bucket (13 lifecycle use
   cases wired to the adapters), the `expenses` bucket
   (`createExpenseManually` + `listRecentExpenses`), the `groups` bucket
   (`listGroupMembers`), and the `monitoring` bucket (`recordMetric` +
   `getMetricsDashboard`).
5. **Manual expense form** — `/expenses/new` is a REAL screen now:
   `CreateExpenseManuallyUseCase` (domain equal-split engine, multi-payer
   support, aggregate validation, atomic persist + audit, idempotent
   retries via client expense ids) behind a full form (title, amount with
   strict string-arithmetic parsing, currency, date, payer, participants,
   note, live split preview). 27 integration tests over the real adapters.
6. **Polished group home** — `GroupHomeScreen` now renders real members,
   recent expenses (payer names, dates, participant counts), and balance-
   engine suggested transfers; an honest "Outstanding balances in this
   group" card replaces the misleading "All settled up" when transfers
   exist.
7. **Prompt 81 dashboard UI** — `MetricsDashboardScreen` at
   `/settings/metrics` (+ Settings → Diagnostics → App health entry),
   closing the "no presentation-layer dashboard component" debt from the
   Phase 9 audit. Renders values + labels only; an explicit no-samples
   card states honestly that runtime telemetry feeds are not wired yet.
8. **CRITICAL financial-correctness fix** — the balance engine
   (`calculateGroupBalances` step 3) previously counted EVERY non-deleted
   settlement regardless of lifecycle status: pending-confirmation,
   disputed, and draft settlements moved balances, and reversals
   double-counted against their own reversal records. The engine now:
   excludes draft / requested / pending_confirmation / failed / cancelled
   / disputed settlements; counts a `reversed` original TOGETHER with its
   `completed` reversal record (the pair nets to zero — the documented
   "as if the settlement never happened" semantics; excluding the
   original would INVERT the payment). The `contributesToCompletedBalance`
   contract was previously dead code — defined, tested, never wired into
   the engine. 5 new regression tests prove the semantics; docs
   (`settlement-reversals.md`, `settlement-lifecycle.md`, the state-machine
   comments) were corrected to be mathematically coherent.
9. **86 new tests** across: settlement adapter (18), balance-engine
   lifecycle-status regression (5), metric repository (5), manual-expense
   integration (27), expense-form view model (15), new-expense screen (11),
   polished group home (6), metrics dashboard (5), migration v3 (3), plus
   schema-version assertion updates.

## What Changed in v2.0.3 — Write-Side Repository Adapters (2026-10-10)

The next increment after the v2.0.2 composition root: the four core
entity repositories now exist as production SQLite adapters and are
exposed through the composition root's new `repositories` bucket.
Everything landed **additively** — the existing 4,163-test behaviour,
the read-side balance query port, and the sync coordinator are
untouched:

1. **`sqlite-group-repository.ts` / `sqlite-group-member-repository.ts`
   / `sqlite-expense-repository.ts` / `sqlite-expense-draft-repository.ts`
   — production adapters for the domain contracts that previously had
   no implementation. `ExpenseRepository.save()` persists the expense
   AND its payers AND its splits in ONE transaction (full-replacement
   semantics for the dependent rows). Soft deletes are idempotent under
   sync replay. Drafts stay local-only by design (no `SyncEntityType`
   for capture artifacts yet).
2. **Every mutation co-enqueues its offline-sync operation inside the
   same transaction** (`sync-op-writer.ts`), closing the entity-write →
   sync-queue atomicity gap the schema warns about. The enqueue SQL now
   has a single implementation; `SqliteSyncRepository.enqueue()`
   delegates to it.
3. **`composition-root.ts`** gains the `repositories` bucket (groups,
   members, expenses, drafts) wired to the same `DatabaseConnection`.
4. **Shared mappers + pagination** (`row-mappers.ts`): row→entity
   mappers for all four aggregates and the numeric-offset cursor
   convention already used by the application-layer in-memory
   repositories. The in-memory test double gained three additive SQL
   features (`in (?, …)` placeholder lists, `limit ? offset ?`, `> ?`)
   so adapters are exercised at the SQL layer in tests.
5. **21 new tests**, including the write→read coherence proof: a group,
   its members, and an expense saved through the repositories are
   immediately visible to the Phase 6 balance engine (Alice +500 / Bob
   −500) with all four sync ops atomically enqueued.

The full financial write→read loop is now coherent end-to-end. What
remains for screens to write through: application-layer use cases
(create-group / create-expense) over these repositories plus a durable
local identity (guest/user repositories) — the remaining adapter work
(settlements write-side, identity, audit, deletion) is unchanged.

## What Changed in v2.0.2 — Composition Root Wiring (2026-10-10)

Known Limitation #1 (RISK-WIRE-01) was the only remaining *code-level*
limitation after the Phase 8 remediation. Closed **additively** — no
existing behaviour was rewritten:

1. **`src/infrastructure/composition-root.ts`** — the single wiring
   point prescribed by `docs/architecture-boundaries.md` §7. Builds the
   balances (7 use cases), explanations (6 use cases), sync
   (`SyncCoordinator`), capture, and session buckets strictly from
   implementations that already existed. Pure factory — unit-testable
   with in-memory adapters.
2. **`src/infrastructure/sqlite/expo-sqlite-database.ts`** — the
   previously missing production SQLite driver (the schema, migration
   registry, balance query port, and sync repository all existed but
   nothing could open the database on device).
3. **`src/infrastructure/security/expo-secure-store.ts`** — production
   keychain/keystore adapter.
4. **`src/store/services-registry.ts`** + **`ServicesGate`** — the
   boundary-respecting bridge: presentation may not import
   `@infrastructure/*`, so the store layer publishes the graph built at
   app start (`app/_layout.tsx` → `ServicesGate` → `initAppServices()`
   → open DB → migrate → compose → arm sync).
5. **`HomeDashboardScreen`** — recent-groups cards now render live
   store data (newest-first, archived excluded, capped at 3) instead of
   the Phase 2 hardcoded empty arrays. Balances remain an honest zero
   state until the write-side repository adapters land.
6. **16 new tests** execute the wiring end-to-end (balance math,
   settlement suggestions, invariants, session round-trip, registry
   lifecycle) — the executable proof that the graph behaves identically
   to the production wiring.

## What Changed in the Phase 8 Remediation (2026-10-10)

The status previously claimed Phase 8 complete, but an evidence-based
audit against Prompts 71–80 found nine real gaps. All closed
**additively** — no Phase 1–7 behaviour was rewritten:

1. **`assets/` was empty** — `app.config.ts` referenced icon/splash/
   favicon files that did not exist, so `expo export` and EAS builds
   failed. Regenerated all four (brand: indigo #4F46E5 → violet
   #7C3AED, receipt + lens motif).
2. **`npm run secret-scan` existed on disk but was not wired** — the
   precommit chain and CI could silently skip it. Now wired into
   `precommit` and both workflows.
3. **`eas.json` missing** — created with development / internal /
   preview / staging / production profiles per Prompt 76.
4. **CI/CD missing** — created `.github/workflows/ci.yml` (lint →
   typecheck → tests → migration test → secret scan → audit → export
   smoke) and `.github/workflows/release.yml` (gates → manual
   production approval → EAS Android/iOS → tagged GitHub release).
5. **`e2e/maestro/phase8/` missing** — authored all 23 Prompt 80
   release flows (13 new + 10 canonical aliases into phase6/7).
6. **Account deletion (Apple 5.1.1(v) / Play policy) absent** —
   implemented end-to-end: `AccountDeletionRequest` domain entity,
   `AccountDeletionRepository` + `LocalDataWiper` ports,
   `RequestAccountDeletionUseCase` (guest = immediate local wipe;
   account = 14-day recovery window + session revocation),
   `CancelAccountDeletionUseCase`, `GetAccountDeletionStatusUseCase`,
   `DeleteAccountScreen` (consequence explanation + two-step
   confirmation), `/settings/delete-account` route, Settings entry
   point, and 14 tests.
7. **Store metadata missing** — `store/`: App Store listing, Play
   listing + Data Safety, reviewer notes, privacy-disclosure ↔ code map,
   screenshot plan.
8. **Legal drafts missing** — `docs/legal/`: privacy policy, terms,
   acceptable use, retention, account-deletion, security overview,
   OSS licences (all marked DRAFT for legal review).
9. **`docs/release/` missing** — all 12 Prompt 80 reports authored
   from executed evidence, including `launch-decision.md` =
   `NOT READY FOR RELEASE` (device/beta/legal execution gates open,
   honestly recorded in `known-limitations.md`).

Also: non-breaking `npm audit fix` applied (80 → 74 production-tree
findings; all in build toolchain — 0 in shipped runtime deps), and 3
pre-existing lint warnings fixed in two Phase 6 use-case files.

## Known Limitations

Tracked with risk ids in `docs/release/known-limitations.md`. Headline:

1. The write-side persistence core is **landed** (v2.0.3: groups,
   members, expenses, drafts — atomic with sync-op co-writes; v2.1.0:
   settlements with the full state machine + audit trail), and the
   application-layer use cases + screen write-through have **started**
   (manual expense form creates real expenses; the group home reads real
   data). What remains are the adapters for identity (guest/user) and
   account deletion (both need the provisioned Supabase project), the
   create-group use case over the repositories, and the settlement
   screens' write-through
2. Runtime telemetry feeds (crash reporter, sync outcome aggregation,
   OCR accuracy) are not yet wired to `RecordMetricUseCase` — the
   dashboard therefore shows an honest no-samples state on fresh installs
3. Maestro flows (65) defined but not executed on physical devices
4. RLS policies statically asserted; live multi-user probes pending
5. Property-based invariants use in-house generators (no fast-check)
6. Remote OCR provider not integrated (mock processor; privacy
   pipeline implemented and tested)
7. Legal drafts unsigned; URLs unpublished
8. Dependency-audit residue: 74 build-toolchain findings — resolved by
   the planned Expo SDK upgrade (breaking `--force` forbidden by rule)

## Launch decision

`NOT READY FOR RELEASE` — see `docs/release/launch-decision.md` for
the nine conditions that flip it to `READY FOR STAGED RELEASE`.
