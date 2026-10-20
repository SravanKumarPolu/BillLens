# BillLens — Offline-First Sync Design

> Status: **Phase 1 · Prompt 8 complete.**

This document explains how BillLens stays functional offline and
synchronises with the cloud when connectivity returns.

## 1. Principles

1. **SQLite is the local source of truth.** All reads go through SQLite;
   the UI never blocks on the network.
2. **Write locally first, sync later.** Every mutation writes to SQLite
   and enqueues a sync operation within a single transaction. The UI
   updates immediately.
3. **Client-generated UUIDs.** Records created offline use UUIDs
   generated on-device. The cloud accepts these without re-issuing IDs.
4. **Idempotency keys.** Every sync operation carries an idempotency
   key. The server uses it to dedupe retries — re-uploading the same
   operation has no additional effect.
5. **Optimistic concurrency.** Every entity has a `version` field.
   Updates include the client's current version; the server rejects
   if its stored version is higher (someone else updated first).
6. **Soft deletion.** Financial records are never hard-deleted. A
   `deleted_at` timestamp marks them as inactive.
7. **Financial conflicts require user review.** The system NEVER
   silently overwrites a financial record on conflict. The user is
   shown both versions and asked to choose.

## 2. Local write flow

Every supported mutation follows this flow:

```
Validate domain input
      ↓
Start local transaction
      ↓
Save local entity changes
      ↓
Save audit record
      ↓
Add pending sync operation
      ↓
Commit transaction
      ↓
Update application state (Zustand)
```

The UI does NOT wait for Supabase before showing the locally committed
result. The sync operation is queued in `sync_operations` and will be
processed by the sync worker when online.

### Transaction atomicity

The entity write, audit log entry, and sync operation enqueue MUST
happen within a single SQLite transaction. If any one fails, all
roll back. This prevents:

- An expense with no splits (split write failed after expense write).
- A sync operation with no corresponding entity (entity write failed
  but sync op persisted).
- An audit log entry referencing a non-existent entity.

The `UnitOfWork` abstraction (`src/domain/repositories/unit-of-work.ts`)
provides this contract; the SQLite implementation
(`src/infrastructure/sqlite/transaction-wrapper.ts`) wraps it in
`BEGIN`/`COMMIT`/`ROLLBACK`.

## 3. Pending operation structure

Each row in `sync_operations` represents a single change to upload:

| Field | Type | Notes |
|-------|------|-------|
| `id` | TEXT (UUID) | Client-generated |
| `entity_type` | TEXT | `group`, `expense`, `settlement`, etc. |
| `entity_id` | TEXT | The entity's UUID |
| `operation` | TEXT | `create`, `update`, `delete` |
| `payload` | TEXT (JSON) | Serialised entity snapshot to upload |
| `idempotency_key` | TEXT | Server dedupes on this key |
| `base_version` | INTEGER | Client's version when queueing (0 for creates) |
| `local_version` | INTEGER | New version the client is writing |
| `status` | TEXT | `pending`, `syncing`, `failed`, `conflict`, `completed` |
| `retry_count` | INTEGER | Number of failed upload attempts |
| `last_error_code` | TEXT? | Stable error code from last attempt |
| `last_error_message` | TEXT? | Human-readable error from last attempt |
| `created_at` | TEXT (ISO) | When the op was enqueued |
| `last_attempted_at` | TEXT? | When the sync worker last tried |
| `next_retry_at` | TEXT? | When to retry (exponential backoff with jitter) |

### Status transitions

```
                  ┌──────────────────────────────┐
                  │                              │
                  ▼                              │
  pending ──→ syncing ──→ completed (removed)    │
                │                                │
                ├──→ failed ──→ pending (retry)  │
                │           └→ conflict (user review)
                │                                │
                └────────────────────────────────┘
                  (resetForRetry)
```

- `pending` → `syncing`: sync worker picks up the op.
- `syncing` → `completed`: server accepted; op is removed from queue.
- `syncing` → `failed`: server returned a retryable error; op stays in queue with `next_retry_at` set.
- `syncing` → `conflict`: server returned a conflict; op requires user review.
- `failed` → `pending`: user manually retries OR the scheduled retry fires.

## 4. Retry rules

The sync worker uses exponential backoff with jitter:

| Retry # | Base delay | Jitter range |
|---------|-----------|--------------|
| 1 | 1s | ± 500ms |
| 2 | 2s | ± 1s |
| 3 | 4s | ± 2s |
| 4 | 8s | ± 4s |
| 5 | 16s | ± 8s |
| 6 | 32s | ± 16s |
| 7 | 64s | ± 32s |
| 8 | 128s | ± 64s |
| max | 300s (5 min) | — |

After 8 retries, the operation is marked as permanently failed — the
user must manually retry from the "Sync Errors" screen.

### Retryable vs non-retryable errors

- **Retryable**: network errors (`NETWORK_*`), 5xx server errors, 429 rate limit, timeouts.
- **Non-retryable**: 4xx client errors (except 429), validation errors, permission errors.

Non-retryable errors transition directly to `conflict` (user review)
rather than `failed` (auto-retry).

## 5. Conflict categories

When a sync operation conflicts with the cloud state, the conflict is
categorized for the UI:

| Category | Meaning | Auto-resolution |
|----------|---------|-----------------|
| `version_conflict` | Local version ≠ cloud version (someone else updated first) | Merge if different fields; user review if same field |
| `deleted_remotely` | Entity was deleted on another device | Preserve locally until user confirms |
| `deleted_locally` | Entity was deleted locally but updated remotely | User review |
| `membership_conflict` | Member removed from group remotely | User review |
| `financial_record_conflict` | Expense/split/settlement changed remotely | NEVER auto-resolve — user review required |
| `duplicate_creation` | Same idempotency key already processed | Server returns original result; no user action |
| `permission_conflict` | User no longer has access | User review |

### Conflict resolution policy

For different-field conflicts: **merge** — take the local version of
changed fields, take the cloud version of unchanged fields.

For same-field conflicts: **latest valid version wins** — the version
with the higher `updated_at` timestamp wins, unless either side is
soft-deleted (deletion wins).

For financial conflicts: **always user review** — the UI shows both
versions side-by-side and the user picks.

For remote deletions: **preserve locally until confirmed** — the
entity stays in the local DB with `deleted_at` set, but is NOT
hard-deleted until the user acknowledges.

## 6. Crash recovery

If the app crashes mid-sync, the `sync_operations` table may have
rows stuck in `syncing` status. On app launch, the sync worker:

1. Finds all rows with `status = 'syncing'`.
2. For each, queries the cloud with the idempotency key to see if the
   operation was applied.
3. If applied: marks as `completed` and removes from queue.
4. If not applied: resets to `pending` for re-upload.

This guarantees that an operation is never lost and never applied
twice.

## 7. Local database schema

The local SQLite schema mirrors the cloud PostgreSQL schema (see
`docs/database-schema.md`) with these simplifications:

| Cloud | SQLite |
|-------|--------|
| UUID | TEXT (UUID string) |
| TIMESTAMPTZ | TEXT (ISO 8601 UTC) |
| JSONB | TEXT (serialized JSON) |
| ENUM | TEXT + CHECK constraint |
| GENERATED column | Computed in TypeScript |

The local schema has ONE additional table that does NOT exist in the
cloud: `sync_operations` (the offline sync queue).

Schema migrations are managed by `src/infrastructure/sqlite/schema.ts`:

- `runMigrations(db)` — applies all pending migrations in version order.
- `getSchemaVersion(db)` — returns the highest applied migration version.
- Migrations are forward-only — no down-migration. To reverse, write a
  new migration.

## 8. What's implemented in Phase 1

- ✅ `DatabaseConnection` interface (`exec`, `run`, `all`, `get`, `transaction`).
- ✅ Local SQLite schema (all 14 cloud tables + `sync_operations`).
- ✅ Migration runner with `schema_version` tracking.
- ✅ Transaction wrapper with rollback semantics.
- ✅ `SqliteSyncRepository` — full implementation of `SyncRepository`
  interface: enqueue, nextPending, listPending, listReadyForRetry,
  listFailed, markSyncing, markCompleted, markFailed, markConflict,
  resetForRetry, countPending, findById.
- ✅ Exponential backoff with jitter (`computeNextRetryAt`).
- ✅ Retryable vs non-retryable error classification (`isRetryableError`).
- ✅ In-memory database for unit tests (no expo-sqlite required).
- ✅ 28 unit tests covering all sync repository methods + transaction
  rollback + atomic entity-write-with-sync-op pattern.

## 9. What's deferred to Phase 2

- ❌ The actual sync worker loop (polls `nextPending`, uploads to
  Supabase, handles responses).
- ❌ Supabase Edge Functions for server-side conflict detection and
  idempotency-key deduplication.
- ❌ Real-time sync via Supabase Realtime (cloud → local push).
- ❌ The "Sync Errors" UI screen for user-review conflicts.
- ❌ Crash recovery on app launch (detect stuck `syncing` rows).
- ❌ Network status observer (pauses sync worker when offline).

## 10. Local commands to verify

```bash
# Run the local unit tests (no Supabase required)
cd /home/z/my-project/billlens
npm install --legacy-peer-deps
npm test -- --testPathPattern=infrastructure

# Run the full test suite
npm test

# Verify the local SQLite schema can be applied (requires a real
# SQLite instance — this workspace doesn't have one, but the
# InMemoryDatabase test verifies the schema parses correctly)
npm test -- --testPathPattern=sqlite-sync-repository
```

## 11. Privacy-aware sync and draft recovery

Prompt 8 adds two cross-cutting concerns on top of the base sync
engine: privacy-aware filtering of what may be uploaded, and
recovery of interrupted draft workflows on app launch.

### 11.1 Privacy-aware sync rules

Every receipt carries a `ReceiptPrivacyPreference` (see
`src/domain/entities/receipt.ts`) with a `storageMode` of one of:

| `storageMode` | Image upload | Raw OCR text | Structured data |
|---------------|--------------|--------------|-----------------|
| `local_only` | Never | Per `retainRawText` | Always (syncs as structured fields only) |
| `cloud_private` | Yes (private bucket) | Per `retainRawText` | Always |
| `shared_with_group` | Yes (group-visible) | Per `retainRawText` | Always |
| `delete_after_extraction` | Never — image is deleted after OCR | Per `retainRawText` (typically false) | Always |

The pure helpers `requiresCloudUpload`, `shouldDeleteImageAfterExtraction`,
and `shouldRetainRawText` (in
`src/domain/entities/receipt-privacy-preference.ts`) decide per-receipt.

The sync engine wraps these in
`src/infrastructure/sync/privacy-aware-sync-rules.ts`:

- `canUploadReceiptImage(pref)` — gates whether the receipt's image
  bytes are enqueued for upload.
- `canUploadRawText(pref)` — gates whether the `extraction_results.raw_text`
  column is included in the sync payload. When false, the infrastructure
  layer MUST strip `rawText` from the payload before enqueuing.
- `shouldDeleteImagePostExtraction(pref)` — drives the local file-system
  cleanup after extraction completes (deletes the source image, but the
  structured `extraction_results` row is retained).
- `checkSyncEligibility(entityType, entityId, privacyPref)` — produces a
  `SyncEligibilityCheck` record the sync worker consults before uploading.
  When `privacyPref` is `null` (e.g. non-receipt entities), upload is
  allowed.

**Rule: local_only receipts are NEVER uploaded.** Only their structured
fields (merchant, total, line items) sync. The image URI in the synced
payload points to the local file path on the originating device; other
devices see the structured data but cannot fetch the image.

**Rule: delete_after_extraction receipts.** The image is uploaded to OCR,
extraction runs, then the image is deleted locally AND from the cloud
(once the structured data is persisted). Only the structured
`extraction_results` row remains in the sync payload. This mode is the
default for users who want the convenience of OCR but do not want their
receipt images retained.

### 11.2 Draft recovery on app launch

If the app crashes or is force-quit while OCR or extraction is running,
the `capture_sources` and `expense_drafts` tables may have rows stuck
in `processing` status. The sync engine treats these as in-flight and
will not re-process them automatically.

`recoverInterruptedDrafts(db)` (in
`src/infrastructure/sync/draft-recovery.ts`) runs on app launch and:

1. Resets `capture_sources.processing_status` from `'processing'` to
   `'pending'` (so the capture pipeline can retry OCR).
2. Resets `expense_drafts.status` from `'processing'` to
   `'needs_review'` (so the user can review partial extraction results
   and confirm or discard).

The recovery is idempotent — running it twice has no additional effect.
The returned `DraftRecoveryResult` is logged for observability but does
not block app startup.

### 11.3 Duplicate scan prevention

Before initiating a new capture, the capture pipeline calls
`checkDuplicateScan(db, imageHash)`. This queries
`capture_sources` for an existing row with the same `image_hash` that
is not soft-deleted. If found, the existing capture source is reused
rather than re-running OCR — saving bandwidth, OCR cost, and preventing
duplicate `expense_drafts` from being created.

The `image_hash` is the SHA-256 of the raw image bytes, computed before
any compression or resizing. This guarantees the same source image
always produces the same hash regardless of capture path (camera,
gallery, share extension).
