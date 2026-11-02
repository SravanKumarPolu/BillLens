import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  hasSqliteCli,
  SqliteCliDatabase,
  usesCliFallback,
} from '@infrastructure/__tests__/sqlite-cli-database';
import { ExpoLocalDataWiper } from '@infrastructure/security/expo-local-data-wiper';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '@infrastructure/sqlite/schema';

jest.mock('expo-file-system', () => ({
  Directory: class {
    readonly exists = false;
    delete(): void {}
  },
  Paths: { document: 'document' },
}));

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const itWithTransactions = usesCliFallback ? it.skip : it;

let directory: string;
let db: SqliteCliDatabase;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'billlens-account-wipe-'));
  db = new SqliteCliDatabase(join(directory, 'account-wipe.db'));
  await runMigrations(db);
  await db.run(
    `insert into groups (
       id, name, currency_code, created_by, created_at, updated_at,
       client_created_at, client_updated_at
     ) values ('group-1', 'Test group', 'INR', 'user-1', 'now', 'now', 'now', 'now')`,
  );
  await db.run(
    `insert into group_members (
       id, group_id, user_id, display_name, role, joined_at, created_at,
       updated_at, client_created_at, client_updated_at
     ) values ('member-1', 'group-1', 'user-1', 'Owner', 'owner', 'now', 'now',
       'now', 'now', 'now')`,
  );
});

afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

describeWithSqlite('ExpoLocalDataWiper', () => {
  it('clears rows while preserving the schema and migration state', async () => {
    const wiper = new ExpoLocalDataWiper(db, {
      deleteSecureValue: async () => {},
      clearPersistedStore: async () => {},
    });

    await expect(wiper.wipeAllLocalData()).resolves.toEqual({
      wipedStores: expect.arrayContaining(['secure-store', 'persisted-stores']),
    });

    const tables = await db.all<{ name: string }>(
      `select name from sqlite_master
       where type = 'table' and name not like 'sqlite_%' and name <> 'schema_version'`,
    );
    for (const table of tables) {
      const quotedName = table.name.replace(/"/g, '""');
      expect(
        await db.get<{ count: number }>(`select count(*) as count from "${quotedName}"`),
      ).toEqual({
        count: 0,
      });
    }
    expect(await db.get<{ count: number }>('select count(*) as count from groups')).toEqual({
      count: 0,
    });
    expect(await db.get<{ count: number }>('select count(*) as count from group_members')).toEqual({
      count: 0,
    });
    expect(
      await db.get<{ version: number }>('select max(version) as version from schema_version'),
    ).toEqual({ version: CURRENT_SCHEMA_VERSION });
    expect(await db.get<{ foreign_keys: number }>('pragma foreign_keys')).toEqual({
      foreign_keys: 1,
    });

    await expect(runMigrations(db)).resolves.toBeUndefined();
    expect(await db.get<{ count: number }>('select count(*) as count from groups')).toEqual({
      count: 0,
    });
  });

  itWithTransactions(
    'rolls back a failed row wipe and restores foreign-key enforcement',
    async () => {
      await db.exec(`
      create trigger reject_group_wipe
      before delete on groups
      begin
        select raise(abort, 'test wipe rejection');
      end;
    `);
      const wiper = new ExpoLocalDataWiper(db, {
        deleteSecureValue: async () => {},
        clearPersistedStore: async () => {},
      });

      await expect(wiper.wipeAllLocalData()).rejects.toThrow('Database wipe failed');
      expect(await db.get<{ count: number }>('select count(*) as count from groups')).toEqual({
        count: 1,
      });
      expect(await db.get<{ foreign_keys: number }>('pragma foreign_keys')).toEqual({
        foreign_keys: 1,
      });
    },
  );
});
