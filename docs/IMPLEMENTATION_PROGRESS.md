# Implementation progress

Status values: **Verified** (tests in this repo), **Device-untested**
(implemented, only Node), **External** (needs infrastructure/approval),
**Deferred**.

| Step | Status | Evidence / gap |
|---|---|---|
| 1. SQLite startup fix | Verified | `splitSqlStatements`; `sqlite-migrations-execution.test.ts`; `db:verify` (13 blocks, 41 tables) |
| 2. Offline storage | Verified | `local-first-flow.test.ts` on a real SQLite file |
| 3. Local repositories | Verified | 41 tables; group/member/expense/split/settlement/audit/draft paths exercised |
| 4. No mandatory cloud | Verified | SQLite boots first; Supabase optional; coordinator no-ops when unconfigured |
| 5. Durable event processing | Verified | Migration 0008 + `SqliteEncryptedSyncStore`; duplicate/restart/failure tests |
| 6. Encryption / key management | Verified (primitives) | Ed25519/X25519, XChaCha20-Poly1305, wrapping, epochs; 25+ tests |
| 7. Invitations, removal, recovery | Verified (relay) | Invite hash + one-time join + keybox + revoke/rotate + re-wrap; 6 integration tests |
| 8. Minimal relay | Device-untested / External | Reference server tested in Node; not deployed |
| 9. Automatic sync | Deferred | Supabase coordinator exists; encrypted path not wired to app lifecycle/UI |
| 10. Financial conflicts | Partial | Detection + `sync_event_conflicts` persistence + status resolution; no review UI/apply |
| 11. Retention and deletion | Verified | 365-day policy (6/24 configurable), guards, audit; local copy removal; expense voiding + UI |
| 12. End-to-end tests | Partial | Two-device Node + separate SQLite files (14 scenarios partially); physical devices unverified |
| 13. Final security audit | Deferred | No independent review |

## New in 2.10.0

- Migration 0008 and durable event store.
- Persistent `EncryptedSyncEngine` (apply/ack markers, restart safety).
- Financial conflict detection (`assertExpenseEventApplicable`) and conflict records.
- Relay invitations, one-time join, keybox, member removal.
- `GroupAccessService` (invite/accept/deliver/receive/revoke/recover).
- `VoidExpenseUseCase` + expense-detail action.
