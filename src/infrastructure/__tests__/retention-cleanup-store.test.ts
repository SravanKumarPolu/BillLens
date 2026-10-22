/**
 * Orphan temp-file detection: referenced files are never candidates.
 * Filesystem APIs are mocked; SQLite is real.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, jest } from '@jest/globals';

const mockReadDirectory = jest.fn(async (dir: string) => {
  if (dir.includes('billlens-images')) return ['ref.jpg', 'orphan.jpg', 'new.jpg'];
  return [];
});
const mockGetInfo = jest.fn(async (uri: string) => ({
  exists: true,
  isDirectory: false,
  modificationTime: uri.endsWith('new.jpg') ? 1_790_000_000 : 1_700_000_000,
}));

jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///doc/' } },
}));
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  readDirectoryAsync: (...args: [string]) => mockReadDirectory(...args),
  getInfoAsync: (...args: [string]) => mockGetInfo(...args),
}));

import { ExpoRetentionCleanupStore } from '@infrastructure/retention/expo-retention-cleanup-store';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const dir = mkdtempSync(join(tmpdir(), 'billlens-orphan-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('ExpoRetentionCleanupStore', () => {
  it('returns only old files that no receipt or capture source references', async () => {
    const db = new SqliteCliDatabase(join(dir, 'orphan.db'));
    await runMigrations(db);
    await db.run(
      `insert into groups (id, name, currency_code, created_by, created_at, updated_at, version,
                           client_created_at, client_updated_at)
       values ('g1', 'G', 'INR', 'u', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1,
               '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    );
    await db.run(
      `insert into receipts (
         id, group_id, source, storage_mode, uploaded_by, created_at, updated_at,
         image_uri, client_created_at, client_updated_at, version
       ) values ('r1', 'g1', 'paper', 'local_only', 'u', '2026-01-01T00:00:00Z',
                 '2026-01-01T00:00:00Z', 'file:///cache/billlens-images/ref.jpg',
                 '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)`,
    );

    const store = new ExpoRetentionCleanupStore(db);
    const cutoff = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const files = await store.findOrphanFiles(cutoff, 50);
    expect(files).toEqual(['file:///cache/billlens-images/orphan.jpg']);
  });
});
