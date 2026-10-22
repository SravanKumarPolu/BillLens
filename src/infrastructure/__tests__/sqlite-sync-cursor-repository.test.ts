import { beforeEach, describe, expect, it } from '@jest/globals';

import { runMigrations, getSchemaVersion } from '../sqlite/schema';
import { SqliteSyncCursorRepository } from '../sync/sqlite-sync-cursor-repository';

import { InMemoryDatabase } from './in-memory-database';

describe('SqliteSyncCursorRepository (v2.6.0 — bidirectional sync)', () => {
  let db: InMemoryDatabase;
  let repo: SqliteSyncCursorRepository;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    repo = new SqliteSyncCursorRepository(db);
  });

  it('migration 0007 applied — schema version is 7', async () => {
    expect(await getSchemaVersion(db)).toBe(12);
  });

  it('get returns null before any save (first sync = full download)', async () => {
    expect(await repo.get('expense')).toBeNull();
  });

  it('save persists a cursor and get returns it', async () => {
    await repo.save('expense', '2026-10-12T09:15:30.123Z|abc-123');
    expect(await repo.get('expense')).toBe('2026-10-12T09:15:30.123Z|abc-123');
  });

  it('save overwrites the previous checkpoint (cursor advance)', async () => {
    await repo.save('expense', '2026-10-12T09:15:30.123Z|abc-123');
    await repo.save('expense', '2026-10-12T10:00:00.000Z|def-456');
    expect(await repo.get('expense')).toBe('2026-10-12T10:00:00.000Z|def-456');
  });

  it('cursors are per entity collection — advancing one leaves the others', async () => {
    await repo.save('group', '2026-10-12T09:00:00.000Z|g-1');
    await repo.save('expense', '2026-10-12T09:15:30.123Z|e-1');
    await repo.save('expense', '2026-10-12T10:00:00.000Z|e-2');
    expect(await repo.get('group')).toBe('2026-10-12T09:00:00.000Z|g-1');
    expect(await repo.get('expense')).toBe('2026-10-12T10:00:00.000Z|e-2');
  });

  it('reset clears one collection; resetAll clears everything', async () => {
    await repo.save('group', '2026-10-12T09:00:00.000Z|g-1');
    await repo.save('settlement', '2026-10-12T09:00:00.000Z|s-1');

    await repo.reset('group');
    expect(await repo.get('group')).toBeNull();
    expect(await repo.get('settlement')).toBe('2026-10-12T09:00:00.000Z|s-1');

    await repo.resetAll();
    expect(await repo.get('settlement')).toBeNull();
    expect(await repo.listAll()).toHaveLength(0);
  });

  it('listAll reports every stored checkpoint (diagnostics)', async () => {
    await repo.save('group', '2026-10-12T09:00:00.000Z|g-1');
    await repo.save('settlement', '2026-10-12T09:00:00.000Z|s-1');
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
    const types = all.map((r) => r.entityType).sort();
    expect(types).toEqual(['group', 'settlement']);
    for (const record of all) {
      expect(record.updatedAt.length).toBeGreaterThan(0);
    }
  });

  it('save survives a replay with the same value (idempotent checkpoint)', async () => {
    await repo.save('expense', '2026-10-12T09:15:30.123Z|abc-123');
    await repo.save('expense', '2026-10-12T09:15:30.123Z|abc-123');
    expect(await repo.get('expense')).toBe('2026-10-12T09:15:30.123Z|abc-123');
    expect(await repo.listAll()).toHaveLength(1);
  });
});
