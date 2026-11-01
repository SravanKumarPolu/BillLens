> **BillLens v2.26.0 | Repository-grounded documentation audit | 2026-10-23**
> Source snapshot: working tree after the v2.26.0 repair pass. Unlike the
> 2026-10-23 source-only audit, **the full automated gate chain was
> re-executed in this environment** (Node 24.21: `npm ci`, `tsc --noEmit`,
> `eslint .`, Jest 224 suites / 4,960 tests — 0 skipped, `db:validate`,
> `db:verify` on a real SQLite engine, `secret-scan`, `expo-doctor` 21/21,
> `expo export -p web`). **No native device tests were executed** —
> hardware-dependent statuses below remain DEVICE-UNTESTED.

# Requirements traceability matrix

Evidence statuses: **VERIFIED_IN_TESTS** (automated suite executed for this
release), **IMPLEMENTED_UNVERIFIED** (code inspected, no hardware/live
evidence), **PARTIAL**, **BLOCKED** (external dependency), **DEFERRED**.

| ID | Requirement | PRD | Implementation | Evidence (executed 2026-10-23 unless noted) | Status | Remaining blocker |
|---|---|---|---|---|---|---|
| CORE-01 | Guest onboarding and local identity | `01-PRD.md` | `app/onboarding/*`, guest identity store | onboarding screen tests; identity repositories tests | **VERIFIED_IN_TESTS** (Node) | Android guest onboarding smoke test pending |
| CORE-02 | Local SQLite boot and migrations | `01-PRD.md` | `src/infrastructure/sqlite/schema.ts` | `sqlite-migrations-execution.test.ts` (real SQLite, node:sqlite engine); `db:verify` 14 blocks / 42 tables | **VERIFIED_IN_TESTS** (real SQLite) | Upgrade/rollback on a real device pending |
| CORE-03 | Groups and member management | `01-PRD.md` | `app/groups/**`, group use cases | `group-management.test.ts` (real SQLite), `create-group.integration.test.ts`; settings rename/archive now persist (v2.26.0) | **VERIFIED_IN_TESTS** (Node + real SQLite) | Android user journeys unverified; "leave group" intentionally not a local action (identity-dependent) |
| FIN-01 | Manual expense create/edit | `01-PRD.md` | `app/expenses/new.tsx`, edit route | `create-expense-manually-integration.test.ts`, `update-expense.test.ts`, `manual-expense-screen.test.tsx`; creation errors surfaced (v2.26.0) | **VERIFIED_IN_TESTS** | On-device smoke tests pending |
| FIN-02 | Equal/exact/percentage/shares splits | `01-PRD.md` | `src/domain/services/splits/**` | strategy + engine + form tests (integer minor units, largest-remainder); itemized entry now currency-aware (v2.26.0) | **VERIFIED_IN_TESTS** | On-device smoke tests pending |
| FIN-03 | Multiple payers and balances | `01-PRD.md` | `src/application/expenses/**`, balance engine | `balance-engine.test.ts` (+multi-currency), multi-payer form tests, property tests | **VERIFIED_IN_TESTS** | Payer signs verified in Node only |
| FIN-04 | Settlement and reversal | `01-PRD.md` | `app/settlements/**`, state machine | settlement lifecycle, confirmation/dispute, partial-settlement tests; method picker now matches the local schema CHECK (v2.26.0); pending-confirmation cards use the persisted version (v2.26.0) | **VERIFIED_IN_TESTS** | Receiver-confirmation device flow pending; **reversal has no UI entry point** (use case + tests exist) |
| CAP-01 | Camera and gallery capture | `01-PRD.md` | `app/capture/camera.tsx`, `gallery.tsx` | camera/gallery screen tests (permissions, tri-state, cancel, errors); sourceType round-trip + open-settings actions (v2.26.0) | **IMPLEMENTED_UNVERIFIED** (device) | Camera/gallery on a development build |
| CAP-02 | Local OCR (ML Kit) | `01-PRD.md` | `mlkit-ocr-capture-processor.ts` (wired, lazy) | `mlkit-ocr-processor.test.ts` (retry/cancel/empty-output); mock refused in production (selector test) | **IMPLEMENTED_UNVERIFIED** (device) | Native ML Kit recognition on hardware |
| CAP-03 | Draft review and manual correction | `01-PRD.md` | `app/drafts/**` | `draft-review` vm+screen tests + **container test over real use cases** (v2.26.0): receipt image resolved from CaptureSource, Receipt row persisted on confirm, durable discard, groupless-draft picker | **VERIFIED_IN_TESTS** (Node) | End-to-end image→expense on a device pending |
| SYNC-01 | Encrypted envelope crypto | `01-PRD.md` | `src/domain/sync-crypto/**` | 25+ crypto tests (XChaCha20-Poly1305, Ed25519/X25519, wrapping, freshness) | **VERIFIED_IN_TESTS** | Independent security assessment missing |
| SYNC-02 | Automatic encrypted multi-device sharing | `01-PRD.md` (P2 scope) | engine + relay reference + durable store | `two-device-sync.test.ts` **now executes in this environment** (2 real SQLite files + relay in Node); **no production wiring, no deployed relay** | **BLOCKED** | Relay hosting approval/credentials; app-lifecycle wiring; cross-device test on hardware |
| SYNC-03 | Invitation and key recovery UI | `01-PRD.md` (P2 scope) | `JoinGroupUseCase` + invitations module (tested, unwired); `app/groups/join.tsx` is a shape-validation placeholder | join/invite use-case tests | **PARTIAL / BLOCKED** | No deployed relay; screen wiring intentionally deferred (PRD P2) |
| SYNC-04 | Conflict resolution review UI | `01-PRD.md` | `app/settings/sync.tsx` (Supabase path) | `conflict-resolution` domain tests, remote-change-applier tests, keep-mine/use-cloud UI | **VERIFIED_IN_TESTS** (Node, Supabase path) | Live multi-user probes need a provisioned project |
| NOT-01 | Local settlement reminders | `01-PRD.md` | `expo-local-notification-port.ts` (Expo Go guarded), opt-in daily reminder | reminder use-case tests; runtime adapter tests | **IMPLEMENTED_UNVERIFIED** (device) | Development-build notification test |
| NOT-02 | Remote push notifications | `01-PRD.md` | `remote-push-registration.ts` (off by default) | — | **DEFERRED** | No production push provider |
| DATA-01 | 365-day retention eligibility and manual deletion | `01-PRD.md` | `retention-policy.ts`, retention use cases, `app/settings/data.tsx` | retention policy + cleanup + wipe tests (UTC/leap boundaries, guards); **no automatic financial deletion by design** | **VERIFIED_IN_TESTS** | Device run of the cleanup scheduler pending |
| DATA-02 | Backup and exports | `01-PRD.md` | `app/settings/backup.tsx`, data screen exports | `backup-restore.test.ts`, `backup-attachments.test.ts` (attachments now FK-correct, v2.26.0), `export-local-data.test.ts`, financial-report tests | **VERIFIED_IN_TESTS** (Node) | Restore/share on a physical device pending |
| REL-01 | Production release verification | `01-PRD.md` | `docs/release/**` | gate chain green (see header); device, signing, legal and beta gates open | **PARTIAL** | Signed builds, physical devices, legal sign-off, closed beta |

## Evidence note

Every automated status above was re-established by executing the suite in
this environment on 2026-10-23 — not inherited from earlier reports. The
real-SQLite integration layer (previously skipped without the `sqlite3`
CLI) now runs on Node's built-in `node:sqlite` engine, which also enforces
foreign keys and real transactions like the production driver. Physical
device, deployed-relay and legal gates remain open and are tracked in
`FINAL_RELEASE_CHECKLIST.md` and `KNOWN_LIMITATIONS.md`.
