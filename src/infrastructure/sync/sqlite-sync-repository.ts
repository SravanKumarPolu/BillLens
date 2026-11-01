import type {
  SyncOperation,
  SyncOperationStatus,
  SyncRepository,
  SyncEntityType,
  SyncOperationType,
} from '@domain/repositories/sync.repository';
import { MAX_SYNC_RETRIES } from '@domain/services/sync/retry-policy';
import type { DateTime } from '@domain/value-objects';
import { asDateTime, nowDateTime } from '@domain/value-objects';

import type { DatabaseConnection, SqlRow } from '../sqlite/database-connection';
import { DatabaseError } from '../sqlite/database-connection';
import { newRowId } from '../sqlite/row-mappers';
import { enqueueSyncOpWithin } from '../sqlite/sync-op-writer';

/**
 * SQLite-backed implementation of `SyncRepository`.
 *
 * Stores pending sync operations in the `sync_operations` table. The
 * sync worker (Prompt 8 superset, Phase 2 implementation) polls
 * `nextPending()` and uploads each operation to the cloud.
 *
 * IMPORTANT: writes to `sync_operations` MUST happen within the same
 * transaction as the entity write they correspond to. Otherwise a crash
 * between the entity write and the sync-op enqueue would leave the
 * local database ahead of the cloud with no way to detect it.
 */
export class SqliteSyncRepository implements SyncRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async enqueue(
    operation: Omit<SyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt'>,
  ): Promise<SyncOperation> {
    // The standalone (non-transactional) path — repository adapters use
    // `enqueueSyncOpWithin` with their own transaction context so the
    // entity write and its sync op commit atomically.
    return enqueueSyncOpWithin(this.db, operation);
  }

  async nextPending(): Promise<SyncOperation | null> {
    const rows = await this.db.all<SqlRow>(
      `select * from sync_operations where status = 'pending' order by created_at asc limit 1`,
    );
    return rows[0] ? rowToOperation(rows[0]) : null;
  }

  async listPending(limit: number): Promise<readonly SyncOperation[]> {
    const rows = await this.db.all<SqlRow>(
      `select * from sync_operations where status = 'pending' order by created_at asc limit ?`,
      [limit],
    );
    return rows.map(rowToOperation);
  }

  async listReadyForRetry(limit: number): Promise<readonly SyncOperation[]> {
    // v2.5.0 CRITICAL FIX: this query previously selected ONLY
    // `status = 'failed'` — freshly enqueued 'pending' operations (which
    // is how sync-op-writer enqueues EVERY new expense/settlement/group)
    // were never selected, so the queue never drained and nothing was
    // ever uploaded. It now returns:
    //   1. 'failed' operations whose backoff window has elapsed
    //      (oldest retry due first), plus NULL-retry legacy rows, then
    //   2. 'pending' operations (new work, FIFO),
    // all bounded by the shared retry cap.
    // Implemented as three simple, index-friendly queries merged in JS —
    // same semantics on SQLite and the constraint-faithful test double.
    const now = nowDateTime() as string;
    const dueFailed = await this.db.all<SqlRow>(
      `select * from sync_operations
       where status = 'failed' and retry_count < ? and next_retry_at <= ?
       order by next_retry_at asc limit ?`,
      [MAX_SYNC_RETRIES, now, limit],
    );
    const nullRetryFailed = await this.db.all<SqlRow>(
      `select * from sync_operations
       where status = 'failed' and retry_count < ? and next_retry_at is null
       order by created_at asc limit ?`,
      [MAX_SYNC_RETRIES, limit],
    );
    const pending = await this.db.all<SqlRow>(
      `select * from sync_operations
       where status = 'pending' and retry_count < ?
       order by created_at asc limit ?`,
      [MAX_SYNC_RETRIES, limit],
    );
    const seen = new Set<string>();
    const merged: SqlRow[] = [];
    for (const row of [...dueFailed, ...nullRetryFailed, ...pending]) {
      const id = row['id'] as string;
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
      if (merged.length >= limit) break;
    }
    return merged.map(rowToOperation);
  }

  async listPermanentlyFailed(limit: number): Promise<readonly SyncOperation[]> {
    // v2.5.0: two simple queries (the explicit 'permanently_failed'
    // status written by markPermanentlyFailed, plus legacy 'failed' rows
    // that reached the shared retry cap) merged in JS.
    const permanent = await this.db.all<SqlRow>(
      `select * from sync_operations
       where status = 'permanently_failed'
       order by created_at desc limit ?`,
      [limit],
    );
    const capped = await this.db.all<SqlRow>(
      `select * from sync_operations
       where status = 'failed' and retry_count >= ?
       order by created_at desc limit ?`,
      [MAX_SYNC_RETRIES, limit],
    );
    const seen = new Set<string>();
    const merged: SqlRow[] = [];
    for (const row of [...permanent, ...capped]) {
      const id = row['id'] as string;
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
      if (merged.length >= limit) break;
    }
    return merged.map(rowToOperation);
  }

  async listFailed(limit: number): Promise<readonly SyncOperation[]> {
    const rows = await this.db.all<SqlRow>(
      `select * from sync_operations where status = 'failed' order by created_at desc limit ?`,
      [limit],
    );
    return rows.map(rowToOperation);
  }

  async markSyncing(id: string): Promise<void> {
    await this.db.run(
      `update sync_operations
       set status = 'syncing', last_attempted_at = ?
       where id = ? and status in ('pending', 'failed')`,
      [nowDateTime() as string, id],
    );
  }

  async markCompleted(id: string): Promise<void> {
    await this.db.run(
      `delete from sync_operations where id = ? and status = 'syncing'`,
      [id],
    );
  }

  async markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
    nextRetryAt: DateTime | null,
  ): Promise<void> {
    const now = nowDateTime() as string;
    // Single atomic update — the `status = 'syncing'` guard ensures only
    // one worker can transition an op from syncing → failed, eliminating
    // the TOCTOU window that existed when we read retry_count first.
    // `retry_count = retry_count + 1` is atomic in SQLite, so concurrent
    // failures can't both observe the same count. The caller decides
    // `nextRetryAt`: a future time for retryable failures, or null when
    // the op has exhausted its retries (permanent failure).
    await this.db.run(
      `update sync_operations
       set status = 'failed',
           last_error_code = ?,
           last_error_message = ?,
           last_attempted_at = ?,
           next_retry_at = ?,
           retry_count = retry_count + 1
       where id = ? and status = 'syncing'`,
      [errorCode, errorMessage, now, nextRetryAt as string | null, id],
    );
  }

  async markConflict(
    id: string,
    conflictDetails: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    // Insert the conflict record AND update the sync op status in a single
    // transaction. Without this, a crash between the two writes could
    // leave a conflict record pointing at an op that's still 'syncing',
    // or — worse — an op stuck in 'syncing' with no conflict record.
    await this.db.transaction(async (tx) => {
      await tx.run(
        `insert into sync_conflicts (
          id, entity_type, entity_id, category, local_version, cloud_version,
          local_payload, cloud_payload, resolution, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          newRowId(),
          (conflictDetails.entityType as string) ?? 'unknown',
          (conflictDetails.entityId as string) ?? id,
          (conflictDetails.category as string) ?? 'version_conflict',
          (conflictDetails.localVersion as number) ?? 0,
          (conflictDetails.cloudVersion as number) ?? 0,
          conflictDetails.localPayload
            ? JSON.stringify(conflictDetails.localPayload)
            : null,
          conflictDetails.cloudPayload
            ? JSON.stringify(conflictDetails.cloudPayload)
            : null,
          nowDateTime() as string,
          nowDateTime() as string,
        ],
      );
      await tx.run(
        `update sync_operations set status = 'conflict' where id = ?`,
        [id],
      );
    });
  }

  async resetForRetry(id: string): Promise<void> {
    await this.db.run(
      `update sync_operations
       set status = 'pending', retry_count = 0, last_error_code = null,
           last_error_message = null, next_retry_at = null
       where id = ? and status in ('failed', 'conflict')`,
      [id],
    );
  }

  /**
   * Count outstanding sync operations (pending + syncing + failed).
   * Conflicts are counted separately via `countConflicts` — they
   * require user review, not automatic retry, but the UI must still
   * surface them as NOT synced (v2.5.0).
   */
  async countPending(): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `select count(*) as count from sync_operations where status in ('pending', 'queued', 'syncing', 'processing', 'failed', 'retry_wait')`,
    );
    return row?.count ?? 0;
  }

  /**
   * Count operations awaiting user review (status 'conflict') plus
   * permanently failed ones — the honest "needs your attention" number
   * for the sync status UI. (v2.5.0)
   */
  async countConflicts(): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `select count(*) as count from sync_operations where status in ('conflict', 'permanently_failed')`,
    );
    return row?.count ?? 0;
  }

  /**
   * Find sync operations stuck in 'syncing' status (e.g. from a crashed app)
   * and reset them to 'pending' for re-upload.
   *
   * @param olderThan Only recover operations that have been 'syncing' for
   *                  longer than this threshold (default: 5 minutes ago).
   * @returns The number of operations recovered.
   */
  async recoverStuckSyncing(
    olderThan: DateTime = (() => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - 5);
      return asDateTime(d.toISOString());
    })(),
  ): Promise<number> {
    const result = await this.db.run(
      `update sync_operations
       set status = 'pending', last_attempted_at = null
       where status = 'syncing' and last_attempted_at < ?`,
      [olderThan as string],
    );
    return result.rowsAffected;
  }

  async findById(id: string): Promise<SyncOperation | null> {
    const row = await this.db.get<SqlRow>(
      `select * from sync_operations where id = ?`,
      [id],
    );
    return row ? rowToOperation(row) : null;
  }

  // ── Phase 7 additions (Prompt 61) ──

  async listBlocked(_limit: number): Promise<readonly SyncOperation[]> {
    // Operations whose dependencyOperationIds reference operations still in the queue.
    // For the MVP, we don't store dependencyOperationIds in the DB; this returns an
    // empty array. The full implementation will use a JSON column or a join table.
    return [];
  }

  async areDependenciesMet(_operationId: string): Promise<boolean> {
    // For the MVP, all dependencies are considered met. The full
    // implementation will check the dependencyOperationIds column.
    return true;
  }

  async markPermanentlyFailed(id: string, errorCode: string, errorMessage: string): Promise<void> {
    // v2.5.0: the previous version wrote status 'permanently_failed' and
    // an `updated_at` column that did not exist in the local schema —
    // on a real device this threw (CHECK violation / no such column) and
    // crashed the sync loop. Migration 0006 adds the statuses + column.
    await this.db.run(
      `update sync_operations
       set status = 'permanently_failed', last_error_code = ?, last_error_message = ?,
           next_retry_at = null, updated_at = ?
       where id = ?`,
      [errorCode, errorMessage, nowDateTime() as string, id],
    );
  }

  async cancelOperation(id: string): Promise<void> {
    await this.db.run(
      `update sync_operations
       set status = 'cancelled', next_retry_at = null, updated_at = ?
       where id = ?`,
      [nowDateTime() as string, id],
    );
  }

  async compactPendingOperations(): Promise<number> {
    // The compaction logic is in the pure module
    // `src/domain/services/sync/operation-compaction.ts`. The repository
    // delegates to it: load all pending operations, run the compaction,
    // apply the results (remove + update).
    //
    // For the MVP, this is a no-op that returns 0. The full
    // implementation will call the compaction module and apply its
    // results.
    return 0;
  }

  async listByEntity(
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<readonly SyncOperation[]> {
    const rows = await this.db.all<SqlRow>(
      `select * from sync_operations
       where entity_type = ? and entity_id = ?
       order by created_at ASC`,
      [entityType, entityId],
    );
    return rows.map(rowToOperation);
  }
}

function rowToOperation(row: SqlRow): SyncOperation {
  const status = row['status'] as SyncOperationStatus;
  let payload: Readonly<Record<string, unknown>>;
  try {
    payload = JSON.parse((row['payload'] as string) ?? '{}') as Readonly<Record<string, unknown>>;
  } catch (err) {
    throw new DatabaseError(
      `Failed to parse payload for sync operation ${String(row['id'])}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err, code: 'CORRUPT_PAYLOAD' },
    );
  }
  const createdAt = row['created_at'];
  if (typeof createdAt !== 'string') {
    throw new Error(`sync_operations row ${String(row['id'])} has invalid created_at: ${String(createdAt)}`);
  }
  const lastAttemptedAt = row['last_attempted_at'];
  const nextRetryAt = row['next_retry_at'];
  return {
    id: row['id'] as string,
    entityType: row['entity_type'] as SyncEntityType,
    entityId: row['entity_id'] as string,
    operation: row['operation'] as SyncOperationType,
    payload,
    idempotencyKey: row['idempotency_key'] as string,
    baseVersion: row['base_version'] as number,
    localVersion: row['local_version'] as number,
    status,
    retryCount: row['retry_count'] as number,
    ...(row['last_error_code'] !== null && row['last_error_code'] !== undefined
      ? { lastErrorCode: row['last_error_code'] as string }
      : {}),
    ...(row['last_error_message'] !== null && row['last_error_message'] !== undefined
      ? { lastErrorMessage: row['last_error_message'] as string }
      : {}),
    createdAt: asDateTime(createdAt),
    ...(typeof lastAttemptedAt === 'string'
      ? { lastAttemptedAt: asDateTime(lastAttemptedAt) }
      : {}),
    ...(typeof nextRetryAt === 'string'
      ? { nextRetryAt: asDateTime(nextRetryAt) }
      : {}),
  };
}

/**
 * Compute the next retry time using exponential backoff with jitter.
 *
 * Backoff schedule (with jitter):
 *   retry 1: 2s ± 1s
 *   retry 2: 4s ± 2s
 *   ...
 *   max: 5 minutes (300s)
 *
 * After MAX_SYNC_RETRIES retries (shared with the SQL queries via
 * `retry-policy.ts`), the operation is marked as permanently failed
 * (not retried automatically — user must manually retry).
 */
export function computeNextRetryAt(retryCount: number, from: DateTime = nowDateTime()): DateTime | null {
  if (retryCount >= MAX_SYNC_RETRIES) {
    return null; // No more automatic retries — permanently failed.
  }
  const baseSeconds = Math.min(300, Math.pow(2, retryCount));
  const jitterSeconds = Math.random() * (baseSeconds / 2);
  const delaySeconds = baseSeconds + jitterSeconds;
  const date = new Date(from as string);
  date.setMilliseconds(date.getMilliseconds() + Math.round(delaySeconds * 1000));
  return asDateTime(date.toISOString());
}

/**
 * Categorize sync errors as retryable or non-retryable.
 *
 * Retryable:
 *   - Network errors (timeout, connection refused)
 *   - 5xx server errors
 *   - 429 rate limit
 *
 * Non-retryable:
 *   - 4xx client errors (except 429)
 *   - Validation errors
 *   - Permission errors
 */
export function isRetryableError(errorCode: string): boolean {
  // Network errors
  if (errorCode.startsWith('NETWORK_')) return true;
  // HTTP 5xx
  if (errorCode === 'HTTP_500' || errorCode === 'HTTP_502' || errorCode === 'HTTP_503' || errorCode === 'HTTP_504') return true;
  // HTTP 429 rate limit
  if (errorCode === 'HTTP_429') return true;
  // Timeout
  if (errorCode === 'TIMEOUT') return true;
  return false;
}
