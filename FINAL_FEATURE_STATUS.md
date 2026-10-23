# Final feature status — BillLens v2.26.0 (2026-10-23)

Statuses use the five agreed categories. Evidence column references the
automated suite executed 2026-10-23 in this environment (Node 24.21.0,
224 suites / 4,960 tests, 0 skipped) unless explicitly marked otherwise.
**No physical-device or deployed-backend test was executed in this pass.**

## IMPLEMENTED_AND_TESTED (automated evidence, executed in this environment)

| Feature | Evidence |
|---|---|
| Guest onboarding + local identity | onboarding screen tests; identity repository tests |
| SQLite boot + 13-migration registry (14 blocks / 42 tables) | `sqlite-migrations-execution.test.ts` (real SQLite); `npm run db:verify` |
| Create / edit / archive / restore / safe-delete group; owner protection; two-layer write guards | `group-management.test.ts` (real SQLite), `create-group.integration.test.ts`; v2.26.0: settings rename/archive now persist |
| Add / rename / remove members (soft delete, history preserved) | group-management + member integration tests |
| Manual expense create + edit (version guard, prefill) | `create-expense-manually-integration.test.ts`, `update-expense.test.ts`, `manual-expense-screen.test.tsx` |
| Equal / exact / percentage / shares splits (integer minor units, largest-remainder) | strategy + split-engine tests, `expense-split-types.test.ts` |
| Item-level expenses (itemized create, item editor, item split strategy) | `itemised-expense.test.ts`, `item-split-strategy.test.ts` |
| Multiple payers (contributions must total; edit prefill) | form + use-case tests |
| Multi-currency balances, zero-sum invariant, debt simplification | `balance-engine.test.ts` (+ multi-currency), suggestions tests |
| Settlements: create (idempotent two-step), partial, receiver confirmation, dispute, state machine, history persistence | settlement lifecycle + confirmation/dispute + write-repository tests |
| Offline durable queue, idempotency, retry/backoff, boot recovery, stuck-row recovery | `sqlite-sync-repository.test.ts`, coordinator tests, `local-first-flow.test.ts` (real SQLite) |
| Conflict detection + keep-mine/use-cloud review (Supabase path) | `conflict-resolution`, `sqlite-remote-change-applier`, port tests |
| Encrypted envelopes, keys, invite tokens, keybox (crypto core) | 25+ `sync-crypto` tests |
| Two-device encrypted sync over the reference relay (Node, two real SQLite files) | `two-device-sync.test.ts` — **executes since v2.26.0** (was skipped/failing without the sqlite3 CLI) |
| 365-day retention assessment, guards, manual deletion, bounded temp-file cleanup | `retention-policy`, `retention.usecases`, `retention-cleanup-store` tests |
| Guarded local erase / account deletion (14-day window / guest immediate wipe) | `local-data-wipe`, `account-deletion` tests |
| Encrypted backup + restore incl. receipt images (PBKDF2-210k + XChaCha20) | `backup-restore.test.ts`, `backup-attachments.test.ts` (FK-correct since v2.26.0) |
| Export: JSON / CSV / PDF / XLSX (lazy, escaped) | `export-local-data`, financial-report tests |
| Expense search (text, group, date, pagination) | `expense-search.test.ts` (real SQLite) |
| Recurring expenses (daily→yearly, catch-up, idempotent materialization) | `recurring-expenses.test.ts`, `schedule` tests |
| Draft pipeline: process → review → confirm (atomic, receipt + items persisted) | `receipt-persistence.test.ts` + **v2.26.0 container test** (image resolved from CaptureSource, receipt row persisted, durable discard, groupless picker) |
| Draft recovery on restart (never auto-confirms) | `draft-recovery` coverage in local-first-flow tests |
| Web export + per-route metadata + robots policy | `expo export -p web` executed 2026-10-23 |

## IMPLEMENTED_BUT_UNVERIFIED (code inspected; needs hardware or live backend)

| Feature | What is missing |
|---|---|
| Camera capture flow (permissions, capture, cancel, open-settings) | Development-build device run |
| Gallery import flow (picker, content-URI copy, open-settings) | Device run |
| On-device ML Kit OCR (lazy, bounded retry, empty-output rejection; mock refused in production) | Native recognition on hardware — **the single biggest unverified claim** |
| Local daily reminder notifications (Expo Go guarded, opt-in) | Development-build notification delivery |
| PDF/XLSX share sheets | Device share interaction |
| Backup file pick + restore on device | Physical restore path |
| Upgrade/migration on an existing device install | Real upgrade test |

## PARTIALLY_IMPLEMENTED

| Feature | What exists | What is missing |
|---|---|---|
| Settlement reversal | `ReverseSettlementUseCase` + tests, wired in composition root | No UI entry point (no settlement-detail screen) |
| Settlement detail/history views | Activity timeline (expenses + settlements), balances-screen pending cards, `ListSettlementsUseCase` | No dedicated settlement list/detail screens; `SettlementConfirmationScreen` exists but is unrouted |
| Group invitations (local) | Full invitations module + `JoinGroupUseCase`, tested | Not wired into composition root/screens; join screen is a placeholder |
| Per-settlement reminders | Use cases + scheduling rules, tested | Not in composition root or any screen |
| Guest → account upgrade | Identity domain + use cases | Needs provisioned cloud project to verify |
| Dependency audit automation | Classification engine + tests | No automated `npm audit` runner wired to CI |

## MISSING

| Feature | Note |
|---|---|
| FX conversion | Deliberate (no rate source; PRD forbids invented rates) |
| Remote push notifications | Deferred (no provider); PRD P2 |
| Expense categories/statistics views | Beyond the stored category field; not release-scoped |
| Localisation (non-English locales) | English-only UI; not release-scoped |
| Virtualised long lists (activity is capped instead) | Performance follow-up |
| Manual-expense-form autosave | Itemized form has autosave; manual form does not |

## BLOCKED (external dependency required)

| Feature | Blocker |
|---|---|
| Automatic encrypted multi-device sync in production | No deployed relay (hosting approval/credentials); engine + reference relay fully built and Node-tested; PRD scopes remote sharing as P2 |
| Live Supabase cloud verification | No provisioned project (steps documented in `docs/deployment.md` §3) |
| Live remote OCR (Vision provider) | No provider credential + deployed edge function |
| Physical-device E2E (Maestro) | No emulator/device in this environment (65 flows authored) |
| Independent security review | Not commissioned |
| Signed store builds / beta rollout | Requires EAS credentials + legal sign-off |

**Release-readiness verdict: see `FINAL_RELEASE_CHECKLIST.md`.**
