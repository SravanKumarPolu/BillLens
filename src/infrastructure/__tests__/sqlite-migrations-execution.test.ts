/**
 * Boot-path test: `runMigrations` against a real SQLite engine.
 *
 * Why this exists:
 *   - `InMemoryDatabase` never parses SQL, so invalid statements pass unit
 *     tests.
 *   - Running whole migration blocks through the `sqlite3` CLI does not
 *     exercise `runMigrations`' statement splitter.
 *
 * This invokes the real `runMigrations` through a CLI-backed connection,
 * reproducing the device boot path closely enough to catch both classes of
 * failure we have hit: PostgreSQL syntax in SQLite (`char_length`) and a bad
 * statement split (a `;` inside a comment, which surfaced as
 * `near "tracks": syntax error` on first launch).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { runMigrations } from '@infrastructure/sqlite/schema';

import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;

describeWithSqlite('runMigrations on real SQLite', () => {
  it('applies every statement without a syntax error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'billlens-migrations-'));
    const databasePath = join(dir, 'test.db');
    const db = new SqliteCliDatabase(databasePath);

    try {
      await runMigrations(db);

      const tables = (
        await db.all<{ name: string }>(
          "select name from sqlite_master where type = 'table' order by name",
        )
      ).map((row) => row.name);

      expect(tables).toEqual(
        expect.arrayContaining([
          'schema_version',
          'groups',
          'group_members',
          'expenses',
          'expense_splits',
          'settlements',
          'sync_operations',
          'sync_cursors',
        ]),
      );
      expect(tables.length).toBeGreaterThanOrEqual(30);

      // All migrations are recorded, with no re-run on a second boot.
      const version = await db.get<{ version: number }>(
        'select max(version) as version from schema_version',
      );
      expect(version?.version).toBe(13);

      await runMigrations(db);
      const rows = await db.all<{ count: number }>('select count(*) as count from schema_version');
      expect(rows[0]?.count).toBe(13);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
