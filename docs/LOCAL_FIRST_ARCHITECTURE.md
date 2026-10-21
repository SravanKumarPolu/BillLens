# Local-first architecture

See also: `docs/local-first-architecture.md` (detailed audit),
`docs/SQLITE_MIGRATIONS.md`, `docs/ENCRYPTED_SYNC_PROTOCOL.md`,
`docs/RELAY_DEPLOYMENT.md`, `docs/KEY_MANAGEMENT.md`,
`docs/DATA_RETENTION.md`.

## Guarantees

SQLite on the device is the primary database. Guests can create groups, add
members, record expenses and settlements, compute balances, export and clean up
without an account or network. Supabase is optional and never blocks boot:
`initAppServices()` opens and migrates SQLite first; `startSyncCoordinator()`
returns immediately when cloud config is absent.

## Status matrix

| Area | Status |
|---|---|
| SQLite migrations | Fixed and guarded (real-engine tests) |
| Offline group/expense/settlement/balances | Implemented; verified on real SQLite |
| Export JSON/CSV | Implemented (Settings → Data & storage) |
| Retention + local deletion | Implemented and guarded |
| Encrypted envelope + device keys | Implemented, unit-tested |
| Encrypted sync engine (pull/verify/apply/ack) | Implemented, tested on two SQLite files |
| Durable processed events / acks / cursors / epochs | Implemented (migration 0008), restart-tested |
| Financial conflict records | Implemented (detect + persist + resolve status); no resolution UI |
| Secure invitations / keybox / revocation / recovery | Implemented and relay-tested; no screens |
| Reference relay | Implemented, Node tests only; **not deployed** |
| App wiring for encrypted sync | **Not implemented**; Supabase path remains |
| Expense voiding | Implemented (use case + detail screen) |
| Conflict resolution UI | **Not implemented** |
| Physical two-device test | **Unverified** (Node simulation only) |

## Boundaries

- Domain crypto has no I/O and no platform imports.
- The relay reference is infrastructure-only and never imported by the app.
- Cloud adapters stay behind existing interfaces; removing Supabase is not
  required for local operation.
