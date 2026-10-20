/**
 * Sync-operation enqueue writer — the ONE implementation of the
 * `insert into sync_operations` statement.
 *
 * Why this exists (schema.ts, sync_operations section): a write to
 * `sync_operations` MUST happen within the same transaction as the
 * entity write it corresponds to. Otherwise a crash between the entity
 * write and the sync-op enqueue would leave the local database ahead
 * of the cloud with no way to detect it.
 *
 * The write-side repository adapters therefore call
 * `enqueueSyncOpWithin(tx, …)` with the SAME `TransactionContext` their
 * entity statements run on, making the entity row + its sync operation
 * atomic by construction. `SqliteSyncRepository.enqueue()` (the
 * standalone, non-transactional path used by tests and manual
 * re-queues) delegates to the same function with the raw connection.
 */

import type { SyncOperation } from '@domain/repositories/sync.repository';
import { nowDateTime } from '@domain/value-objects';

import type { DatabaseConnection, TransactionContext } from './database-connection';
import { newRowId } from './row-mappers';

/** Any execution context that can run statements (connection or tx). */
export type SqlExecutionContext = DatabaseConnection | TransactionContext;

/**
 * Insert one pending sync operation through the given execution context
 * and return the materialised operation (id, status, retryCount,
 * createdAt filled in).
 */
export async function enqueueSyncOpWithin(
  db: SqlExecutionContext,
  operation: Omit<SyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt'>,
): Promise<SyncOperation> {
  const id = newRowId();
  const createdAt = nowDateTime();
  await db.run(
    `insert into sync_operations (
      id, entity_type, entity_id, operation, payload, idempotency_key,
      base_version, local_version, status, retry_count, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [
      id,
      operation.entityType,
      operation.entityId,
      operation.operation,
      JSON.stringify(operation.payload),
      operation.idempotencyKey,
      operation.baseVersion,
      operation.localVersion,
      createdAt as string,
    ],
  );
  return {
    ...operation,
    id,
    status: 'pending',
    retryCount: 0,
    createdAt,
  };
}

/**
 * Build the deterministic idempotency key used by the repository
 * adapters: server dedupes retries of the same entity change.
 */
export function syncIdempotencyKey(
  entityType: SyncOperation['entityType'],
  entityId: string,
  operation: SyncOperation['operation'],
  localVersion: number,
): string {
  return `${entityType}:${entityId}:${operation}:${localVersion}`;
}
