# Migration Report — BillLens v2.0.0 Release Candidate

> Phase 8, Prompt 80. Database migration and upgrade-path evidence.

## Schema versions

| Migration | File | Content | Validation |
|---|---|---|---|
| 0001 initial | `supabase/migrations/202607291200_initial_schema.sql` | Core tables + RLS policies + grants | ✅ `npm run db:validate` |
| 0002 settlement state machine | `supabase/migrations/202610101500_phase6_track1_settlement_state_machine.sql` | Additive columns (status, confirmation, dispute, evidence hash, operation id) + 3 new tables + indexes | ✅ `npm run db:validate` — 48 statements, structurally valid |
| SQLite local schema | `src/infrastructure/sqlite/schema.ts` | Local-first tables + sync metadata | ✅ covered by infrastructure suites |

## Migration tests (executed)

| Suite | Result | What it proves |
|---|---|---|
| `src/infrastructure/__tests__/phase6-track1-migration.test.ts` | ✅ pass | Upgrade path adds settlement state-machine columns/tables; existing rows keep working; balance contract (`completed` contributes) holds after upgrade |
| `src/infrastructure/__tests__/transaction-rollback.test.ts` | ✅ pass | Failed multi-statement transactions roll back cleanly — no partial writes |
| `src/infrastructure/__tests__/sqlite-sync-repository.test.ts` | ✅ pass | Sync queue schema + operations behave under migration constraints |

## Supabase execution status

Structural validation passes locally (`npm run db:validate`,
`scripts/validate-sql.js`). Full execution
(`supabase db reset` + policy probes) requires the Supabase CLI and a
staging project with credentials — scheduled before closed beta and
tracked as RISK-SEC-02 in `known-limitations.md`. The migration is
**additive** (no destructive column drops), so the upgrade path is
reversible at the database level: rolling back the app remains
compatible with the migrated schema.

## Upgrade-path test plan (device)

1. Install the previous production candidate (or v2.0.0 pre-remediation
   build).
2. Seed: guest identity, one authenticated session, pending sync queue,
   incomplete OCR draft, local-only image, one disputed settlement.
3. Upgrade over the top → verify all local data intact, queue resumes,
   draft resumes, disputes intact.
4. Repeat with "interrupt mid-migration" (kill process) → relaunch must
   recover or roll back safely (transactional migration guarantee from
   the rollback test).
