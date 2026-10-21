# Implementation progress

| Step | Status | Evidence |
|---|---|---|
| 1. Fix SQLite startup error | Done | `splitSqlStatements`, `sqlite-migrations-execution.test.ts`, `npm run db:verify` |
| 2. Verify offline storage | Done | `local-first-flow.test.ts` (real SQLite, reopen, balances) |
| 3. Complete local repositories | Audited; no missing core table found | 33 tables; local flow covers groups/members/expenses/splits/settlements |
| 4. Remove mandatory cloud dependencies | Already satisfied; verified | `services-registry.ts`, `ServicesGate.tsx`; Supabase optional |
| 5. Durable event queue | Existing sync queue reused; encrypted queue not wired | `sync_operations` + `EncryptedSyncEngine` |
| 6. Encryption and key management | Core done | `src/domain/sync-crypto/*`, 25 tests |
| 7. Membership and invitations | Relay membership + removal; invite token crypto; no UI | relay tests, invitation tests |
| 8. Minimal relay | Reference implemented and tested; not deployed | `src/infrastructure/relay-reference/*` |
| 9. Automatic sync | Existing Supabase coordinator; encrypted triggers not wired | `SyncCoordinator` |
| 10. Conflict resolution | Supabase path only for encrypted events? **No** | documented gap |
| 11. Retention and deletion | Done | `domain/retention`, Data & storage, tests |
| 12. End-to-end tests | Two-device Node test done; physical devices not | `two-device-sync.test.ts` |
| 13. Final security audit | Not independent | see KEY_MANAGEMENT limits |

## Not started / blocked

- Relay deployment (requires provider approval and credentials).
- App UI for encrypted sync, invitations and delivery states.
- Persistent processed-event table and conflict rules for encrypted events.
- Physical two-device verification.
