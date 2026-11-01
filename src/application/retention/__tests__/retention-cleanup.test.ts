import { describe, expect, it, jest } from '@jest/globals';

import {
  RetentionCleanupUseCase,
  type RetentionCleanupStore,
} from '../retention-cleanup.usecase';

describe('RetentionCleanupUseCase', () => {
  it('uses the correct cutoff and delegates bounded candidates', async () => {
    const enqueue = jest.fn(async () => 1);
    const find = jest.fn(async () => ['file:///tmp/a.jpg']);
    const store: RetentionCleanupStore = { findOrphanFiles: find, enqueueCleanup: enqueue };

    const result = await new RetentionCleanupUseCase(store).execute({
      now: new Date('2026-10-22T00:00:00.000Z'),
      retentionDays: 365,
      limit: 10,
    });

    expect(result).toEqual({ candidates: 1, queued: 1 });
    expect(find).toHaveBeenCalledWith('2025-10-22T00:00:00.000Z', 10);
    expect(enqueue).toHaveBeenCalledWith(['file:///tmp/a.jpg'], '2026-10-22T00:00:00.000Z');
  });

  it('does nothing when no orphans exist', async () => {
    const enqueue = jest.fn(async () => 0);
    const store: RetentionCleanupStore = {
      findOrphanFiles: async () => [],
      enqueueCleanup: enqueue,
    };
    const result = await new RetentionCleanupUseCase(store).execute({
      now: new Date(),
      retentionDays: 365,
    });
    expect(result).toEqual({ candidates: 0, queued: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('caps a run at 50 files', async () => {
    const candidates = Array.from({ length: 100 }, (_, index) => `file:///tmp/${index}.jpg`);
    let requestedLimit = 0;
    const store: RetentionCleanupStore = {
      findOrphanFiles: async (_cutoff, limit) => {
        requestedLimit = limit;
        return candidates.slice(0, limit);
      },
      enqueueCleanup: async (uris) => uris.length,
    };
    const result = await new RetentionCleanupUseCase(store).execute({
      now: new Date(),
      retentionDays: 365,
      limit: 100,
    });
    expect(requestedLimit).toBe(50);
    expect(result).toEqual({ candidates: 50, queued: 50 });
  });
});
