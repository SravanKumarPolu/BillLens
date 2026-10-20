import { beforeEach, describe, expect, it } from '@jest/globals';

import type { SyncCursorRecord, SyncCursorRepository } from '@domain/repositories/sync-cursor.repository';
import type {
  IncrementalDownloadPort,
  RemoteChange,
  RemoteEntityType,
} from '@domain/services/sync/incremental-download';
import { DOWNLOAD_ENTITY_ORDER } from '@domain/services/sync/incremental-download';
import { asDateTime } from '@domain/value-objects';

import {
  DownloadCoordinator,
  isValidCursor,
  lowerCursorForOverlap,
} from '../download-coordinator';
import type { RemoteConflictResolutionOutcome } from '../remote-change-applier.port';
import type { RemoteApplyOutcome, RemoteChangeApplier } from '../remote-change-applier.port';

/**
 * DownloadCoordinator — the pull orchestrator (v2.6.0).
 *
 * Under test with in-memory fakes:
 *   - collection ORDER (parent-first),
 *   - pagination loop + per-page cursor persistence (restart safety),
 *   - HOLD semantics (deferred/failed rows never advance the cursor),
 *   - corrupt-cursor recovery (full re-download),
 *   - auth/network failures stop the remaining collections.
 */

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeCursorStore implements SyncCursorRepository {
  private readonly cursors = new Map<string, string>();
  async get(entityType: string): Promise<string | null> {
    return this.cursors.get(entityType) ?? null;
  }
  async save(entityType: string, cursorValue: string): Promise<void> {
    this.cursors.set(entityType, cursorValue);
  }
  async reset(entityType: string): Promise<void> {
    this.cursors.delete(entityType);
  }
  async resetAll(): Promise<void> {
    this.cursors.clear();
  }
  async listAll(): Promise<readonly SyncCursorRecord[]> {
    return Array.from(this.cursors.entries()).map(([entityType, cursorValue]) => ({
      entityType: entityType as SyncCursorRecord['entityType'],
      cursorValue,
      updatedAt: '2026-10-12T00:00:00.000Z',
    }));
  }
}

class FakeApplier implements RemoteChangeApplier {
  private readonly outcomes = new Map<string, RemoteApplyOutcome>();
  readonly appliedFor: { entityType: RemoteEntityType; entityId: string }[] = [];
  setOutcome(entityId: string, outcome: RemoteApplyOutcome): void {
    this.outcomes.set(entityId, outcome);
  }
  async apply(change: RemoteChange): Promise<RemoteApplyOutcome> {
    this.appliedFor.push({ entityType: change.entityType, entityId: change.entityId });
    return this.outcomes.get(change.entityId) ?? { action: 'applied', entityId: change.entityId };
  }
  async keepLocalVersion(): Promise<RemoteConflictResolutionOutcome> {
    return { action: 'keep_local', status: 'resolved' };
  }
  async applyCloudVersion(): Promise<RemoteConflictResolutionOutcome> {
    return { action: 'keep_cloud', status: 'resolved' };
  }
}

interface Page {
  readonly changes: readonly RemoteChange[];
  readonly hasMore?: boolean;
}

/** Deterministic feed: serves the queued pages per entity type. */
class FakeFeed implements IncrementalDownloadPort {
  private readonly pages = new Map<RemoteEntityType, Page[]>();
  readonly queries: { entityType: RemoteEntityType; cursor: string | null; limit: number }[] = [];
  readonly failOn: Partial<Record<RemoteEntityType, Error>> = {};
  setPages(entityType: RemoteEntityType, pages: readonly Page[]): void {
    this.pages.set(entityType, [...pages]);
  }
  async downloadChanges(
    entityType: RemoteEntityType,
    cursor: string | null,
    limit: number,
  ): Promise<{ changes: readonly RemoteChange[]; nextCursor: string | null; hasMore: boolean }> {
    const failure = this.failOn[entityType];
    if (failure) throw failure;
    this.queries.push({ entityType, cursor, limit });
    const queue = this.pages.get(entityType) ?? [];
    const page = queue.shift();
    if (page === undefined) {
      return { changes: [], nextCursor: cursor, hasMore: false };
    }
    const changes = page.changes;
    const hasMore = page.hasMore ?? false;
    const last = changes[changes.length - 1];
    const nextCursor = last !== undefined ? `${String(last.occurredAt)}|${last.entityId}` : cursor;
    return { changes, nextCursor, hasMore };
  }
}

// ---------------------------------------------------------------------------
// Change builders
// ---------------------------------------------------------------------------

let changeCounter = 0;
function change(entityType: RemoteEntityType, updatedAt: string): RemoteChange {
  changeCounter += 1;
  const id = `${entityType}-${changeCounter}`;
  return {
    entityType,
    entityId: id,
    changeType: 'create',
    version: 1,
    payload: { id },
    occurredAt: asDateTime(updatedAt),
  };
}

describe('DownloadCoordinator', () => {
  let feed: FakeFeed;
  let applier: FakeApplier;
  let cursors: FakeCursorStore;
  let coordinator: DownloadCoordinator;

  beforeEach(() => {
    feed = new FakeFeed();
    applier = new FakeApplier();
    cursors = new FakeCursorStore();
    coordinator = new DownloadCoordinator(feed, applier, cursors, {
      pageLimit: 2,
      maxPagesPerCollection: 10,
    });
  });

  it('downloads every collection in parent-first order', async () => {
    const result = await coordinator.downloadAll();
    expect(result.error).toBeNull();
    const order = feed.queries.map((q) => q.entityType);
    // Each collection queried at least once, in the canonical order.
    const uniqueOrder = [...new Set(order)];
    expect(uniqueOrder).toEqual([...DOWNLOAD_ENTITY_ORDER]);
  });

  it('persists the cursor only AFTER the page was applied (restart safety)', async () => {
    const c = change('group', '2026-10-02T10:00:00.000Z');
    feed.setPages('group', [{ changes: [c], hasMore: false }]);
    await coordinator.downloadAll();
    expect(await cursors.get('group')).toBe(`${String(c.occurredAt)}|${c.entityId}`);
  });

  it('pages through large collections, saving intermediate checkpoints', async () => {
    const c1 = change('expense', '2026-10-02T10:00:00.000Z');
    const c2 = change('expense', '2026-10-02T11:00:00.000Z');
    const c3 = change('expense', '2026-10-02T12:00:00.000Z');
    feed.setPages('expense', [
      { changes: [c1, c2], hasMore: true },
      { changes: [c3], hasMore: false },
    ]);
    const result = await coordinator.downloadAll();
    expect(result.downloadedCount).toBeGreaterThanOrEqual(3);
    expect(result.appliedCount).toBeGreaterThanOrEqual(3);
    expect(await cursors.get('expense')).toBe(`${String(c3.occurredAt)}|${c3.entityId}`);
    // The second page continued from the first page's checkpoint.
    const expenseQueries = feed.queries.filter((q) => q.entityType === 'expense');
    expect(expenseQueries.length).toBeGreaterThanOrEqual(2);
    expect(expenseQueries[1]?.cursor).toBe(`${String(c2.occurredAt)}|${c2.entityId}`);
  });

  it('HOLDS the cursor before a DEFERRED row (missing parent retried next pull)', async () => {
    const c1 = change('expense', '2026-10-02T10:00:00.000Z');
    const c2 = change('expense', '2026-10-02T11:00:00.000Z'); // deferred
    applier.setOutcome(c2.entityId, {
      action: 'deferred',
      entityId: c2.entityId,
      reason: 'parent_missing',
      parentEntityType: 'group',
      parentEntityId: 'g-missing',
    });
    feed.setPages('expense', [{ changes: [c1, c2], hasMore: false }]);
    const result = await coordinator.downloadAll();
    expect(result.deferredCount).toBe(1);
    // Cursor saved at the position BEFORE the deferred row.
    expect(await cursors.get('expense')).toBe(`${String(c1.occurredAt)}|${c1.entityId}`);
    expect(result.error?.errorCode).toBe('PARENT_MISSING');
  });

  it('HOLDS the cursor before a FAILED row and surfaces the error', async () => {
    const c1 = change('settlement', '2026-10-02T10:00:00.000Z');
    applier.setOutcome(c1.entityId, {
      action: 'failed',
      entityId: c1.entityId,
      errorCode: 'SERVER_ERROR',
      errorMessage: 'constraint boom',
    });
    feed.setPages('settlement', [{ changes: [c1], hasMore: false }]);
    const result = await coordinator.downloadAll();
    expect(result.failedCount).toBe(1);
    // c1 is the FIRST change of the page — hold at the query cursor.
    expect(await cursors.get('settlement')).toBeNull(); // nothing was checkpointed
    expect(result.error?.errorCode).toBe('SERVER_ERROR');
  });

  it('discards a CORRUPT cursor and re-downloads the collection (cursor reset)', async () => {
    await cursors.save('group', 'garbage-cursor');
    const c1 = change('group', '2026-10-02T10:00:00.000Z');
    feed.setPages('group', [{ changes: [c1], hasMore: false }]);
    const result = await coordinator.downloadAll();
    expect(result.cursorResets).toBe(1);
    expect(await cursors.get('group')).toBe(`${String(c1.occurredAt)}|${c1.entityId}`);
  });

  it('stops the run on a NETWORK failure and reports it', async () => {
    feed.failOn['group_member'] = new Error('Failed to fetch');
    const result = await coordinator.downloadAll();
    expect(result.error?.errorCode).toBe('NETWORK_UNAVAILABLE');
    // Collections AFTER the failure were not queried.
    const queried = feed.queries.map((q) => q.entityType);
    expect(queried).not.toContain('expense');
  });

  it('counts conflicts and continues applying later rows', async () => {
    const c1 = change('expense', '2026-10-02T10:00:00.000Z');
    const c2 = change('expense', '2026-10-02T11:00:00.000Z');
    applier.setOutcome(c1.entityId, {
      action: 'conflicted',
      entityId: c1.entityId,
      category: 'financial_record_conflict',
    });
    feed.setPages('expense', [{ changes: [c1, c2], hasMore: false }]);
    const result = await coordinator.downloadAll();
    expect(result.conflictCount).toBe(1);
    expect(result.appliedCount).toBe(1);
    // The conflict did NOT hold the cursor — later rows still applied.
    expect(await cursors.get('expense')).toBe(`${String(c2.occurredAt)}|${c2.entityId}`);
  });

  it('bounds work per run (maxPagesPerCollection) and resumes next run', async () => {
    const strict = new DownloadCoordinator(feed, applier, cursors, {
      pageLimit: 2,
      maxPagesPerCollection: 1,
    });
    const c1 = change('group', '2026-10-02T10:00:00.000Z');
    const c2 = change('group', '2026-10-02T11:00:00.000Z');
    feed.setPages('group', [
      { changes: [c1, c2], hasMore: true },
      { changes: [], hasMore: false },
    ]);
    const result = await strict.downloadAll();
    // Only ONE page consumed this run; checkpoint persisted.
    expect(await cursors.get('group')).toBe(`${String(c2.occurredAt)}|${c2.entityId}`);
    expect(result.downloadedCount).toBe(2);
  });
});

describe('cursor helpers', () => {
  it('isValidCursor accepts `<iso>|<id>` and rejects garbage', () => {
    expect(isValidCursor('2026-10-02T10:00:00.000Z|abc')).toBe(true);
    expect(isValidCursor('2026-10-02T10:00:00.000Z|')).toBe(false);
    expect(isValidCursor('|abc')).toBe(false);
    expect(isValidCursor('garbage')).toBe(false);
    expect(isValidCursor('not-a-date|abc')).toBe(false);
  });

  it('lowerCursorForOverlap lowers the timestamp, keeps the id bucket', () => {
    const lowered = lowerCursorForOverlap('2026-10-02T10:00:00.000Z|abc');
    expect(lowered).not.toBeNull();
    const [ts, id] = (lowered as string).split('|');
    expect(id).toBe('abc');
    expect(Date.parse(ts as string)).toBe(Date.parse('2026-10-02T09:55:00.000Z'));
  });

  it('lowerCursorForOverlap returns null for garbage (full re-download path)', () => {
    expect(lowerCursorForOverlap('garbage')).toBeNull();
  });
});
