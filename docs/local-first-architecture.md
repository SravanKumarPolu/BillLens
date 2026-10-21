# BillLens — Local-first architecture, sync design & data retention

**Status:** current as of 2.8.0 (21 October 2026)
**Scope:** how the app works with no network, what the cloud is used for,
how multi-device sync actually behaves, and what deletion guarantees exist.

---

## 1. Guarantees

BillLens is local-first. With no network and no Supabase project:

| Capability | Works offline? | Where the data lives |
|---|---|---|
| Guest onboarding | Yes | SecureStore + SQLite |
| Create group / add members | Yes | SQLite |
| Record expense (manual, itemised, any split) | Yes | SQLite |
| Compute balances / settlement suggestions | Yes | SQLite (computed on read) |
| Record settlement | Yes | SQLite |
| Receipt capture → draft → review | Yes (mock OCR) | SQLite + local image files |
| Export JSON / CSV | Yes | SQLite → file |
| Retention review / local removal | Yes | SQLite |
| Cross-device sync | **No** | Supabase relay (optional) |
| Remote OCR | No | Supabase Edge Function (optional) |
| Cloud account / multi-user identity | No | Supabase Auth (optional) |

The app never waits for the cloud to boot. `ServicesGate` calls
`initAppServices()` (SQLite open → migrations → draft recovery), and only
then attempts `startSyncCoordinator()`, which returns immediately when
Supabase is not configured (`src/store/services-registry.ts`,
`src/presentation/components/ServicesGate.tsx`). Session restore is
best-effort and failure is non-blocking.

## 2. Boot sequence (no cloud in the critical path)

```
app/_layout.tsx
  └─ ServicesGate
       ├─ initAppServices()
       │    ├─ ExpoSqliteDatabase.open()
       │    ├─ runMigrations()            ← real migrations, see §7
       │    ├─ recoverInterruptedDrafts() ← local only
       │    └─ createCompositionRoot()    ← repos + use cases
       ├─ startSyncCoordinator()          ← no-op when unconfigured
       └─ authService.restoreSession()    ← best-effort, never blocking
```

Screens read services through `useAppServicesReady()` and render honest
"initialising" states; nothing calls Supabase to decide whether a group,
expense or balance can be created.

## 3. Cloud dependency matrix

| Component | Required for core use? | Notes |
|---|---|---|
| `SupabaseRemoteSyncPort` (upload) | No | Wired only when `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` exist. |
| `SupabaseIncrementalDownloadPort` (download) | No | Cursor-based pull, same condition. |
| `SupabaseAuthenticationProvider` | No | Without it the app runs the guest provider. |
| Remote OCR Edge Function | No | Without it OCR resolves to mock (dev) or "unavailable" (prod). |
| RLS policies / Postgres migrations | No | Only meaningful when cloud is enabled. |

The local schema (`src/infrastructure/sqlite/schema.ts`) is plain SQLite.
It is **not** generated from the Postgres migrations; sharing `check`
constraints between them is a known failure mode (see §7).

## 4. Local data model

SQLite is the source of truth on device: `groups`, `group_members`,
`expenses`, `expense_payers`, `expense_splits`, `settlements`,
`settlement_state_history`, `expense_drafts`, `receipts`, `sync_operations`,
`sync_conflicts`, `sync_cursors`, `audit_logs`, `schema_version`, and
supporting tables (33 total).

Every mutation writes the entity **and** its sync-queue operation in one
transaction (`sync-op-writer.ts`). That is why an offline expense is never
lost: the row and the intent to publish it commit atomically.

## 5. Multi-device sync — what is real, what is not

### Implemented (Supabase relay)

- **Device identity:** durable local guest identity + device secret hash
  (`guest_identities`), upgradeable to a Supabase user.
- **Membership:** `group_members` with roles; RLS scopes rows to the
  signed-in user.
- **Change events:** `sync_operations` rows (entity, operation, payload,
  base/local version, idempotency key).
- **Offline queue:** FIFO with retry/backoff, stuck-operation recovery,
  dependency ordering.
- **Acknowledgements:** an operation is removed only after the server
  accepts it (`markCompleted`); failures stay visible.
- **Duplicate prevention:** client-generated ids + idempotency keys +
  version guards (upserts, not blind inserts).
- **Conflict detection:** optimistic versions; download-side conflicts
  keep **both** payloads and require a user decision — financial fields
  are never auto-merged.
- **Deletion propagation:** soft deletes are tombstones, never absences;
  the download side applies them explicitly.
- **Multi-device reconciliation:** cursor-based pull with a late-commit
  overlap window; balances converge because every device applies the same
  operations to the same model.

### Not implemented (and not claimed)

- **Direct phone-to-phone delivery.** No peer discovery, no NAT traversal,
  no background socket. Two devices only converge through the relay.
- **Guaranteed background delivery.** iOS/Android may suspend the app;
  sync runs when the app is foregrounded (or when the OS grants a
  background opportunity, which is not guaranteed).
- **End-to-end encryption of sync payloads.** Transport is TLS and access
  is RLS-scoped, but the server can read row contents. E2EE would require
  client-side key management and a relay that cannot interpret payloads —
  a separate project.
- **Server-less operation.** Without Supabase there is no remote sync at
  all; devices are independent copies.

### Options if a relay is revisited

| Option | Cost | Background reliability | Privacy | Verdict |
|---|---|---|---|---|
| Supabase relay (current) | Free tier, then paid | Good while app runs | Server-readable rows, RLS | Keep; already implemented |
| Self-hosted relay | Server + ops time | Same as above | Full control | Only with a concrete deployment need |
| WebRTC data channels | STUN/TURN costs | Poor on mobile (no background) | E2EE possible | Not for financial sync |
| LAN discovery (mDNS) | Zero | Only same network, app open | Strong | Nice demo, not a product |
| Encrypted file export/import | Zero | Manual | Strong | Already possible via JSON export |

Adding any new server or paid service requires explicit approval and a
documented trade-off; nothing in this repository assumes one.

## 6. Deletion and retention

Four distinct operations, deliberately separated:

| Action | Scope | Where | Guards |
|---|---|---|---|
| **Leave group** | Hides the group; keeps local rows | Group settings | None (non-destructive) |
| **Remove local copy** | Hard-deletes this device's rows (cascade) | Data & storage | No cloud sync; no outstanding balance; no pending confirmation; audit entry written |
| **Delete account** | Server-side deletion request + local wipe after recovery window | Settings → Delete account | 14-day recovery, explicit confirmation |
| **Cloud tombstone** | Shared record deletion, propagated by sync | Owner action + queue | Version guard, RLS |

**Retention.** Default **365 days** of inactivity; configurable to 6 or 24
months in Data & storage. A group is only *offered* for cleanup:

1. after the configured quiet period, measured from the latest local
   financial activity;
2. with **zero** outstanding balances;
3. with **zero** settlements awaiting confirmation;
4. with **zero** unsynced local changes (cloud mode), because a queued
   change may be the only copy.

Nothing is deleted automatically at any period. Protected rows explain why
they are protected. Every successful local removal appends
`group_local_copy` to the audit log with the group name (no amounts).

**Export before deletion.** Data & storage exports:
- JSON — versioned full backup (groups, members, expenses, settlements);
- CSV — expenses for spreadsheets, generated by the existing
  `exportToFormat` implementation.

Receipt images, OCR raw text and tokens are never included. Export works
offline and is the recommended step before removing a local copy.

## 7. Why the SQLite bugs happened, and what now prevents them

1. **PostgreSQL `char_length()` in SQLite checks.** Copied from a Postgres
   migration; the in-memory test double never parses SQL, so tests passed
   while devices would fail on first launch. Guarded by
   `sqlite-schema-portability.test.ts` and `npm run db:verify` (real
   `sqlite3` execution).
2. **`;` inside a schema comment split a statement in half.** `runMigrations`
   split on every semicolon; the fragment `tracks guest …` became a
   statement (`near "tracks": syntax error`). Replaced with a
   comment/string-aware splitter (`sql-statements.ts`) and guarded by
   `sqlite-migrations-execution.test.ts`, which runs the real
   `runMigrations` against a real database.

Both guards fail with the original device error when the old behaviour is
restored.

## 8. Test evidence

| Test | What it proves |
|---|---|
| `sqlite-migrations-execution.test.ts` | Real `runMigrations`, 33 tables, version 7, second boot is a no-op |
| `local-first-flow.test.ts` | Group + 4 members + ₹1,200 expense offline → balances; close/reopen → identical data and balances |
| `export-local-data.test.ts` | Versioned JSON + accounting CSV; no tokens/images |
| `retention-policy.test.ts` | Protected vs too-recent vs eligible, boundary and custom periods |
| `retention.usecases.test.ts` | Assessment from real repositories; deletion refuses outstanding/cloud groups; audit entry; no sync delete queued |
| `data-storage.test.tsx` | UI never offers removal for protected or cloud-linked groups |

## 9. Open decisions

1. **Auto-expiry:** not implemented by design. If wanted, it needs a
   user-facing countdown, a grace period, and the same guards (never
   automatic while balances exist).
2. **Cloud-linked local removal:** currently refused. A proper "remove my
   copy but stay in the group" needs a per-device membership/tombstone
   model so a pull does not resurrect it.
3. **E2EE sync:** would change the relay contract; needs a key-management
   design before implementation.
4. **Retention for receipts/images:** receipt files follow
   `storageMode` (`delete_after_extraction` / local / cloud), not the group
   retention period.
