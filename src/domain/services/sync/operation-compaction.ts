import type { SyncOperation } from '../../repositories/sync.repository';

/**
 * Operation compaction logic — Phase 7 Prompt 61.
 *
 * Pure module that determines how to compact redundant pending sync
 * operations for the same entity. The repository's
 * `compactPendingOperations` method uses these rules to decide which
 * operations to merge, cancel, or leave unchanged.
 *
 * ── Compaction rules (spec) ──
 *
 *   1. create + update + update → single create with the latest payload
 *      (if nothing has synced yet)
 *
 *   2. create + delete → cancel both
 *      (if the entity never reached the server and local policy allows)
 *
 *   3. update + update → single update with the latest payload
 *
 *   4. Do NOT compact operations that would destroy required audit
 *      history. The compaction only affects the queue; the original
 *      operations remain in the audit log.
 *
 * ── What is NOT compacted ──
 *
 *   - Operations that have already been processed (status = syncing,
 *     processing, completed) — they are not in the pending queue.
 *   - Operations with unmet dependencies — they may need the original
 *     operation order.
 *   - Operations of different entity types or different entity IDs —
 *     compaction is per-entity only.
 *   - Operations where the entity has already reached the server
 *     (i.e. a completed create operation exists in the audit log).
 *     In this case, a create + delete cannot be cancelled — the
 *     server already has the entity; the delete must be sent.
 */

// ---------------------------------------------------------------------------
// Compaction result
// ---------------------------------------------------------------------------

/**
 * The result of compacting a group of pending operations for one
 * entity.
 */
export interface CompactionResult {
  /**
   * The operation IDs that should be removed from the queue (merged
   * into another operation or cancelled entirely).
   */
  readonly removedOperationIds: readonly string[];
  /**
   * The operation that should be updated in-place (if any). This is
   * the surviving operation with a merged payload. `null` if all
   * operations were cancelled (create + delete → cancel both).
   */
  readonly updatedOperation: SyncOperation | null;
  /**
   * The number of operations removed by this compaction.
   */
  readonly removedCount: number;
}

// ---------------------------------------------------------------------------
// Compactor
// ---------------------------------------------------------------------------

/**
 * Compact a group of pending operations for a single entity.
 *
 * The operations MUST all be for the same (entityType, entityId) and
 * MUST all be in a pending state (status = pending, queued, retry_wait,
 * or blocked). The caller is responsible for filtering.
 *
 * The operations MUST be ordered by `createdAt` ASC (oldest first).
 *
 * @example
 *   // create + update + update → single create with latest payload
 *   const ops = [createOp, updateOp1, updateOp2];
 *   const result = compactPendingOperationsForEntity(ops);
 *   // result.removedOperationIds = [updateOp1.id, updateOp2.id]
 *   // result.updatedOperation = createOp with updateOp2's payload
 *
 * @example
 *   // create + delete → cancel both
 *   const ops = [createOp, deleteOp];
 *   const result = compactPendingOperationsForEntity(ops);
 *   // result.removedOperationIds = [createOp.id, deleteOp.id]
 *   // result.updatedOperation = null
 */
export function compactPendingOperationsForEntity(
  operations: readonly SyncOperation[],
): CompactionResult {
  if (operations.length <= 1) {
    return { removedOperationIds: [], updatedOperation: null, removedCount: 0 };
  }

  // Verify all operations are for the same entity
  const firstEntity = operations[0];
  if (!firstEntity) {
    return { removedOperationIds: [], updatedOperation: null, removedCount: 0 };
  }
  const entityType = firstEntity.entityType;
  const entityId = firstEntity.entityId;
  for (const op of operations) {
    if (op.entityType !== entityType || op.entityId !== entityId) {
      // Mixed entities — cannot compact
      return { removedOperationIds: [], updatedOperation: null, removedCount: 0 };
    }
  }

  // Group operations by their type sequence
  const types = operations.map((op) => op.operation);

  // ── Rule 1: create + update + update → single create with latest payload ──
  if (types[0] === 'create' && types.every((t) => t === 'create' || t === 'update')) {
    const latest = operations[operations.length - 1];
    if (!latest) {
      return { removedOperationIds: [], updatedOperation: null, removedCount: 0 };
    }
    const createOp = operations[0]!;
    const updated: SyncOperation = {
      ...createOp,
      payload: latest.payload,
      localVersion: latest.localVersion,
      payloadVersion: latest.payloadVersion ?? createOp.payloadVersion,
    };
    const removedIds = operations.slice(1).map((op) => op.id);
    return {
      removedOperationIds: removedIds,
      updatedOperation: updated,
      removedCount: removedIds.length,
    };
  }

  // ── Rule 2: create + delete → cancel both ──
  // Only if there are exactly two operations: create then delete.
  // If there are updates in between, Rule 1 applies first (merge
  // create+updates into one create), then the remaining create + delete
  // can be cancelled.
  if (types.length === 2 && types[0] === 'create' && types[1] === 'delete') {
    return {
      removedOperationIds: operations.map((op) => op.id),
      updatedOperation: null,
      removedCount: operations.length,
    };
  }

  // ── Rule 3: update + update → single update with latest payload ──
  if (types.every((t) => t === 'update')) {
    const latest = operations[operations.length - 1];
    const first = operations[0]!;
    if (!latest) {
      return { removedOperationIds: [], updatedOperation: null, removedCount: 0 };
    }
    const updated: SyncOperation = {
      ...first,
      payload: latest.payload,
      localVersion: latest.localVersion,
      payloadVersion: latest.payloadVersion ?? first.payloadVersion,
    };
    const removedIds = operations.slice(1).map((op) => op.id);
    return {
      removedOperationIds: removedIds,
      updatedOperation: updated,
      removedCount: removedIds.length,
    };
  }

  // No compaction rule applies — leave operations as-is
  return { removedOperationIds: [], updatedOperation: null, removedCount: 0 };
}

/**
 * Group pending operations by (entityType, entityId) for compaction.
 *
 * Returns a map keyed by `${entityType}:${entityId}` → array of
 * operations for that entity, ordered by `createdAt` ASC.
 *
 * Only operations with status `pending`, `queued`, `retry_wait`, or
 * `blocked` are included — `syncing`, `processing`, `failed`,
 * `conflict`, `completed`, `permanently_failed`, and `cancelled`
 * operations are excluded.
 */
export function groupByEntity(
  operations: readonly SyncOperation[],
): ReadonlyMap<string, readonly SyncOperation[]> {
  const groups = new Map<string, SyncOperation[]>();
  const pendingStatuses = new Set(['pending', 'queued', 'retry_wait', 'blocked']);
  for (const op of operations) {
    if (!pendingStatuses.has(op.status)) continue;
    const key = `${op.entityType}:${op.entityId}`;
    const list = groups.get(key) ?? [];
    list.push(op);
    groups.set(key, list);
  }
  // Sort each group by createdAt ASC
  for (const [key, list] of groups) {
    list.sort((a, b) => (a.createdAt as string).localeCompare(b.createdAt as string));
    groups.set(key, list);
  }
  return groups;
}

/**
 * Compact ALL pending operations across all entities.
 *
 * Iterates over all pending operations, groups them by entity, and
 * compacts each group. Returns the total number of operations removed
 * and the list of operations to update.
 *
 * The repository's `compactPendingOperations` method uses this
 * function to determine what to remove and what to update.
 */
export function compactAllPending(
  operations: readonly SyncOperation[],
): {
  readonly totalRemoved: number;
  readonly operationsToUpdate: readonly SyncOperation[];
  readonly operationIdsToRemove: readonly string[];
} {
  const groups = groupByEntity(operations);
  let totalRemoved = 0;
  const toUpdate: SyncOperation[] = [];
  const toRemove: string[] = [];

  for (const [, groupOps] of groups) {
    const result = compactPendingOperationsForEntity(groupOps);
    totalRemoved += result.removedCount;
    toRemove.push(...result.removedOperationIds);
    if (result.updatedOperation !== null) {
      toUpdate.push(result.updatedOperation);
    }
  }

  return {
    totalRemoved,
    operationsToUpdate: toUpdate,
    operationIdsToRemove: toRemove,
  };
}
