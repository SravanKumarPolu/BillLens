# BillLens Consistency Model (v2.6.0)

> Status: AUTHORITATIVE for v2.6.0. This document defines how BillLens
> keeps financial data correct across devices, what the tradeoffs are,
> and which edge cases remain. Every rule here is enforced in code and
> covered by named tests (referenced inline).

## 1. The one-sentence model

BillLens is **offline-first with single-writer optimistic concurrency**:
every financial mutation is authored on one device under a local
transaction, uploaded with a version guard, and reconciled on download
through explicit conflict detection — **the cloud copy is authoritative
for anything the device has not locally edited, and a local edit always
wins its own version line until a human decides otherwise**.

## 2. Authoritative state for financial records

| Concern | Authority | Rationale |
|---|---|---|
| A record the device never edited | The cloud row, verbatim | Devices are caches; convergence means matching the server (`sqlite-remote-change-applier.ts` writes remote rows column-exact) |
| A record with a pending local edit | The local edit, until uploaded | The user's intent exists locally and is durable (queue survives restart); suppressing a remote overwrite is the `continue_upload` reconciliation branch |
| A record where local edit and remote change RACED | Explicit user decision | Financial fields are never auto-merged (`conflict-resolution.ts`: FINANCIAL_FIELDS); the conflict record holds BOTH versions |
| Balances | Always derived | Balances are computed from expenses + settlements at read time (`balance-engine.ts`); they are never stored as state, so no balance can drift from its inputs |

## 3. Versioning and optimistic concurrency control (OCC)

- Every synced row carries an integer `version` that increases with
  each mutation. Versions are **client-authored** on create and
  **guarded** on update: the upload writes
  `… where id = ? and version = baseVersion`. A stale writer gets
  `PGRST116` → a conflict record, never a silent overwrite.
- Version 0 is reserved for "no cloud version yet" (creates).
- Reversal pairs (a reversed settlement + its reversal record) commit
  in ONE local transaction and upload as dependent ops.

## 4. The upload path (device → cloud)

1. Every entity mutation and its sync operation commit **atomically**
   in one SQLite transaction (`sync-op-writer.ts`) — a crash can never
   leave a row mutated with no queued upload.
2. Operations are uploaded FIFO with bounded exponential backoff;
   idempotency keys (`entityType:entityId:operation:localVersion`) and
   row-id deduplication make retries safe:
   a create retried after a lost response is resolved as SUCCESS when
   the row with our id already exists on the server.
3. Auth expiry (`401`/`PGRST301`) is RETRIABLE (token refresh +
   retry) — never dead-ends as a user-review conflict.
4. Delete operations are soft deletes that carry the version guard.

## 5. The download path (cloud → device, v2.6.0)

1. **Cursor checkpoints** — each entity collection (groups, members,
   invites, expenses, payers, splits, settlements) downloads
   independently with a persisted `(updated_at, id)` watermark
   (`sync_cursors` table, migration 0007). A collection's failure never
   blocks the others.
2. **Keyset pagination** — pages are fetched
   `order by (updated_at, id)` continuing from the exact last-applied
   tuple; no offsets, no boundary losses.
3. **Server-ordered time** — a `BEFORE INSERT OR UPDATE` trigger sets
   `updated_at = clock_timestamp()` (commit order, immune to client
   clock skew) on every synced table (migration 202610111100).
4. **Late-commit overlap** — each pull re-reads 5 minutes before its
   cursor (`OVERLAP_WINDOW_MS`) so a row committed by a long-running
   transaction after a cursor advanced past its trigger time is still
   caught. Re-read rows are free (version-guarded skip).
5. **Tombstones** — soft-deleted cloud rows arrive as `delete` changes
   carrying the full row; deletions are never communicated by absence.
6. **Reconciliation** (`reconcileChange`, pure + tested):
   - no local record → apply;
   - same version → skip (replay-safe);
   - remote newer, local clean → apply;
   - local pending, remote at base → skip (upload wins);
   - local pending, remote moved → CONFLICT (user review);
   - remote delete + local pending edit → HIGH-PRIORITY conflict.
7. **Parent-first ordering + deferral** — collections pull in FK order
   (groups → members → invites → expenses → payers/splits →
   settlements); a child whose parent is missing is DEFERRED (the
   cursor holds before it and retries next pull). **A financial record
   is never dropped because its parent lost a race.**
8. **No echo** — downloaded rows are written by a dedicated path
   (`SqliteRemoteChangeApplier`) that never enqueues upload ops.

## 6. Deterministic money

- All amounts are integer minor units; no float ever touches money.
- 0- and 3-decimal currencies use their canonical minor units; rounding
  is deterministic (largest-remainder for splits — `money-and-rounding.md`).
- Balance math is per-currency with a zero-sum invariant
  (`validateBalanceInvariantsUseCase`).

## 7. Conflict lifecycle

1. Detected (upload guard or download reconciliation) → conflict record
   with local + cloud payloads, versions, and category.
2. Surfaced in Settings → Sync status ("Review conflicts") with both
   options: **Keep mine** / **Use cloud**. Nothing is auto-merged.
3. `Keep mine` re-bases the local edit onto the cloud version
   (row version := cloud+1, op base := cloud) and requeues — the next
   upload wins the guard deterministically.
4. `Use cloud` writes the cloud payload verbatim and cancels the stale
   local ops (they can never re-upload).
5. One unresolved conflict per entity (replay-idempotent); a resolved
   conflict never blocks a NEW divergence.

## 8. Offline, restart and failure semantics

- Queue, conflicts, and cursors are all SQLite — everything survives a
  force-quit. `recoverStuckSyncing` resets `syncing` rows at boot.
- A record is shown as "synced" ONLY after the server acknowledged the
  upload (`markCompleted` runs on success). The UI never conflates
  "queued" with "synced".
- Locally computed balances render from local data; when the device is
  offline or sync is incomplete, the sync status screen says so rather
  than implying cloud confirmation.
- A corrupt/unparseable cursor is discarded → full re-download of that
  collection (safe: apply is version-guarded).

## 9. Known tradeoffs (deliberate, documented)

| Tradeoff | Consequence | Mitigation |
|---|---|---|
| Timestamp watermark polling (no changelog table) | A transaction that stays open LONGER than the 5-minute overlap window AND commits after a pull can be missed until the next full re-sync | Practically impossible for PostgREST/Edge-Function OLTP writes; "Full re-sync" in the UI is always available; changelog tables are the documented future upgrade |
| Client-authored version numbers on create | Two devices creating the SAME row id concurrently → one create fails; resolved as duplicate-creation conflict | Row ids are client-generated UUIDs — collisions are cryptographically improbable |
| Single-writer conflicts need a human | A raced expense edit blocks on user review instead of silently merging | This is the point: financial correctness over convenience (`FINANCIAL_FIELDS` never merge) |
| Download scope excludes receipts | Receipt images stay on the capturing device | Privacy-first design (documented in `incremental-download.ts`); expense rows carry the financial truth |
| Pull after push in one run | A remote change racing the local upload may first surface as an upload conflict, then be reconciled | Both paths produce the same conflict record; the review UI is identical |

## 10. Test map

| Rule | Test |
|---|---|
| Two-device convergence + identical balances | `bidirectional-sync-integration.test.ts` (Scenario 1–2) |
| Tombstone propagation | same file (Scenario 3), applier suite |
| Concurrent edit → one conflict, no duplicates | same file (Scenario 4) |
| Offline restart recovery | same file (Scenario 5) |
| Idempotent retries (no duplicate writes) | same file (Scenario 6) |
| Revoked membership visibility | same file (Scenario 7) |
| Reconciliation decision table | `sqlite-remote-change-applier.test.ts` |
| Cursor/pagination mechanics | `download-coordinator.test.ts`, `supabase-incremental-download-port.test.ts` |
| Financial fields never auto-merge | `conflict-resolution.test.ts` (domain suite) |
| Currency precision & rounding | `money-and-rounding` property suites (P1–P8) |
