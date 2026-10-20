import { describe, expect, it } from '@jest/globals';

import type { SyncOperation } from '../../../repositories/sync.repository';
import {
  compactPendingOperationsForEntity,
  compactAllPending,
  groupByEntity,
} from '../operation-compaction';

function makeOp(
  id: string,
  entityType: string,
  entityId: string,
  operation: string,
  createdAt: string,
  payload: Record<string, unknown> = {},
  status: SyncOperation['status'] = 'pending',
): SyncOperation {
  return {
    id,
    entityType: entityType as never,
    entityId,
    operation: operation as never,
    payload,
    idempotencyKey: `key-${id}`,
    baseVersion: 0,
    localVersion: 1,
    status,
    retryCount: 0,
    createdAt: createdAt as never,
  };
}

describe('Operation compaction', () => {
  // ── compactPendingOperationsForEntity ──────────────────

  describe('compactPendingOperationsForEntity', () => {
    it('returns no changes for a single operation', () => {
      const ops = [makeOp('op-1', 'expense', 'e-1', 'create', '2026-10-10T10:00:00.000Z')];
      const result = compactPendingOperationsForEntity(ops);
      expect(result.removedCount).toBe(0);
      expect(result.updatedOperation).toBeNull();
    });

    it('compacts create + update + update into one create with latest payload', () => {
      const ops = [
        makeOp('op-1', 'expense', 'e-1', 'create', '2026-10-10T10:00:00.000Z', { title: 'A' }),
        makeOp('op-2', 'expense', 'e-1', 'update', '2026-10-10T11:00:00.000Z', { title: 'B' }),
        makeOp('op-3', 'expense', 'e-1', 'update', '2026-10-10T12:00:00.000Z', { title: 'C' }),
      ];
      const result = compactPendingOperationsForEntity(ops);
      expect(result.removedCount).toBe(2);
      expect(result.removedOperationIds).toEqual(['op-2', 'op-3']);
      expect(result.updatedOperation).not.toBeNull();
      expect(result.updatedOperation!.id).toBe('op-1');
      expect(result.updatedOperation!.payload).toEqual({ title: 'C' }); // latest payload
    });

    it('cancels both create + delete', () => {
      const ops = [
        makeOp('op-1', 'expense', 'e-1', 'create', '2026-10-10T10:00:00.000Z'),
        makeOp('op-2', 'expense', 'e-1', 'delete', '2026-10-10T11:00:00.000Z'),
      ];
      const result = compactPendingOperationsForEntity(ops);
      expect(result.removedCount).toBe(2);
      expect(result.removedOperationIds).toEqual(['op-1', 'op-2']);
      expect(result.updatedOperation).toBeNull();
    });

    it('compacts update + update into one update with latest payload', () => {
      const ops = [
        makeOp('op-1', 'expense', 'e-1', 'update', '2026-10-10T10:00:00.000Z', { title: 'A' }),
        makeOp('op-2', 'expense', 'e-1', 'update', '2026-10-10T11:00:00.000Z', { title: 'B' }),
      ];
      const result = compactPendingOperationsForEntity(ops);
      expect(result.removedCount).toBe(1);
      expect(result.updatedOperation!.payload).toEqual({ title: 'B' });
    });

    it('does NOT compact mixed entities', () => {
      const ops = [
        makeOp('op-1', 'expense', 'e-1', 'create', '2026-10-10T10:00:00.000Z'),
        makeOp('op-2', 'expense', 'e-2', 'update', '2026-10-10T11:00:00.000Z'),
      ];
      const result = compactPendingOperationsForEntity(ops);
      expect(result.removedCount).toBe(0);
    });

    it('does NOT compact unrelated operation sequences (e.g. delete + create)', () => {
      const ops = [
        makeOp('op-1', 'expense', 'e-1', 'delete', '2026-10-10T10:00:00.000Z'),
        makeOp('op-2', 'expense', 'e-1', 'create', '2026-10-10T11:00:00.000Z'),
      ];
      const result = compactPendingOperationsForEntity(ops);
      expect(result.removedCount).toBe(0);
    });
  });

  // ── groupByEntity ───────────────────────────────────────

  describe('groupByEntity', () => {
    it('groups operations by (entityType, entityId)', () => {
      const ops = [
        makeOp('op-1', 'expense', 'e-1', 'create', '2026-10-10T10:00:00.000Z'),
        makeOp('op-2', 'expense', 'e-2', 'create', '2026-10-10T11:00:00.000Z'),
        makeOp('op-3', 'expense', 'e-1', 'update', '2026-10-10T12:00:00.000Z'),
      ];
      const groups = groupByEntity(ops);
      expect(groups.size).toBe(2);
      const e1 = groups.get('expense:e-1');
      expect(e1).toBeDefined();
      expect(e1!).toHaveLength(2);
      expect(e1![0]!.id).toBe('op-1'); // sorted by createdAt
    });

    it('excludes non-pending operations', () => {
      const ops = [
        makeOp('op-1', 'expense', 'e-1', 'create', '2026-10-10T10:00:00.000Z', {}, 'completed'),
        makeOp('op-2', 'expense', 'e-1', 'update', '2026-10-10T11:00:00.000Z', {}, 'pending'),
      ];
      const groups = groupByEntity(ops);
      expect(groups.size).toBe(1);
      expect(groups.get('expense:e-1')!).toHaveLength(1); // only the pending one
    });
  });

  // ── compactAllPending ────────────────────────────────────

  describe('compactAllPending', () => {
    it('compacts across multiple entities', () => {
      const ops = [
        makeOp('op-1', 'expense', 'e-1', 'create', '2026-10-10T10:00:00.000Z', { a: 1 }),
        makeOp('op-2', 'expense', 'e-1', 'update', '2026-10-10T11:00:00.000Z', { a: 2 }),
        makeOp('op-3', 'expense', 'e-2', 'create', '2026-10-10T10:00:00.000Z', { b: 1 }),
        makeOp('op-4', 'expense', 'e-2', 'delete', '2026-10-10T11:00:00.000Z'),
      ];
      const result = compactAllPending(ops);
      // e-1: create + update → compacted (1 removed)
      // e-2: create + delete → cancelled (2 removed)
      expect(result.totalRemoved).toBe(3);
      expect(result.operationIdsToRemove).toContain('op-2');
      expect(result.operationIdsToRemove).toContain('op-3');
      expect(result.operationIdsToRemove).toContain('op-4');
      expect(result.operationsToUpdate).toHaveLength(1);
      expect(result.operationsToUpdate[0]!.id).toBe('op-1');
    });
  });
});
