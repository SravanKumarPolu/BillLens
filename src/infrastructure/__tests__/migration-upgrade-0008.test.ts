/**
 * Upgrade path: an existing v7 database must apply migration 0008.
 *
 * Fresh-database tests do not prove this — a device upgrading from the
 * previous release has version 7 rows and all older tables present.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import {
  MIGRATIONS,
  SCHEMA_VERSION_TABLE_SQL,
  getSchemaVersion,
  runMigrations,
} from '@infrastructure/sqlite/schema';
import { splitSqlStatements } from '@infrastructure/sqlite/sql-statements';

import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;

describeWithSqlite('migration 0008 upgrade', () => {
  let dir: string;
  let db: SqliteCliDatabase;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'billlens-upgrade-'));
    db = new SqliteCliDatabase(join(dir, 'v7.db'));

    // Build a v7 database exactly as the previous release would have.
    await db.exec(SCHEMA_VERSION_TABLE_SQL);
    for (const migration of MIGRATIONS.filter((m) => m.version <= 7)) {
      for (const statement of splitSqlStatements(migration.sql)) {
        await db.exec(`${statement};`);
      }
      await db.run('insert into schema_version (version, name) values (?, ?)', [
        migration.version,
        migration.name,
      ]);
    }
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('goes from version 7 to 12 and creates the encrypted-sync + recurring tables', async () => {
    expect(await getSchemaVersion(db)).toBe(7);

    await runMigrations(db);

    expect(await getSchemaVersion(db)).toBe(12);
    const tables = await db.all<{ name: string }>(
      "select name from sqlite_master where type = 'table' order by name",
    );
    const names = tables.map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'sync_processed_events',
        'sync_event_conflicts',
        'sync_device_memberships',
        'sync_key_epochs',
        'sync_event_cursors',
        'recurring_expenses',
        'recurring_occurrences',
      ]),
    );

    // The upgraded database accepts a manual expense write.
    await db.exec(`
      insert into groups (id, name, currency_code, created_by, created_at, updated_at, version,
                          client_created_at, client_updated_at)
      values ('g_upgrade', 'Upgrade group', 'INR', 'local-user', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z', 1,
              '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z');
      insert into group_members (id, group_id, display_name, role, joined_at, created_at, updated_at, version,
                                 client_created_at, client_updated_at)
      values ('m_up', 'g_upgrade', 'Owner', 'owner', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z',
              '2026-10-21T00:00:00.000Z', 1, '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z');
    `);
    const member = await db.get<{ id: string }>(
      "select id from group_members where group_id = 'g_upgrade'",
    );
    expect(member?.id).toBe('m_up');
  });
});
