/**
 * Guarded full-local-data wipe over real SQLite.
 * Receipt file intent survives in the existing cleanup queue.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const dir = mkdtempSync(join(tmpdir(), 'billlens-wipe-'));
const GROUP = 'g_wipe';
const USER = 'local-user';

let db: SqliteCliDatabase;
let services: AppServices;

beforeAll(async () => {
  db = new SqliteCliDatabase(join(dir, 'wipe.db'));
  await runMigrations(db);
  services = createCompositionRoot({ database: db });
  await services.repositories.groups.save(
    createGroup({
      id: GROUP as never,
      name: 'Wipe me',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: 'm_wipe' as never,
      groupId: GROUP as never,
      userId: USER as never,
      displayName: 'Owner',
      role: 'owner',
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP,
    title: 'Lunch',
    amountMinor: 1_000,
    currencyCode: 'INR',
    payerContributions: [{ memberId: 'm_wipe', amountMinor: 1_000 }],
    participantIds: ['m_wipe'],
    createdBy: USER,
  });
  await db.run(
    `insert into receipts (
       id, group_id, source, storage_mode, uploaded_by, created_at, updated_at,
       image_uri, client_created_at, client_updated_at, version
     ) values ('r_wipe', ?, 'paper', 'local_only', ?, ?, ?, 'file:///tmp/wipe.jpg', ?, ?, 1)`,
    [
      GROUP,
      USER,
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    ],
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('full local data wipe', () => {
  it('requires the exact confirmation and preserves schema + cleanup intent', async () => {
    const preview = await services.data.wipeAll.preview();
    expect(preview.groups).toBe(1);
    expect(preview.expenses).toBe(1);
    expect(preview.receipts).toBe(1);

    await expect(services.data.wipeAll.execute('delete')).rejects.toThrow(/DELETE/);
    const stillThere = await db.get<{ count: number }>('select count(*) as count from groups');
    expect(stillThere?.count).toBe(1);

    const result = await services.data.wipeAll.execute('DELETE');
    expect(result.filesQueued).toBe(1);

    const after = await services.data.wipeAll.preview();
    expect(after).toEqual({ groups: 0, expenses: 0, settlements: 0, receipts: 0 });

    const schema = await db.get<{ version: number }>(
      'select max(version) as version from schema_version',
    );
    expect(schema?.version).toBe(13);

    const queue = await db.get<{ count: number }>(
      "select count(*) as count from file_cleanup_queue where reason = 'local_data_erased'",
    );
    expect(queue?.count).toBe(1);

    // Idempotent second run: nothing left to wipe or queue.
    const second = await services.data.wipeAll.execute('DELETE');
    expect(second.filesQueued).toBe(0);
  });
});
