/**
 * Encrypted backup + restore over real SQLite.
 *
 * Restores into a fresh database with the same schema and checks financial
 * rows survive exactly. Also covers wrong password and tamper rejection.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from '@jest/globals';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const GROUP = 'g_backup';
const OWNER = 'm_backup_owner';
const FRIEND = 'm_backup_friend';
const USER = 'local-user';
const PASSWORD = 'correct horse battery';
const dir = mkdtempSync(join(tmpdir(), 'billlens-backup-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function open(name: string): Promise<{ db: SqliteCliDatabase; services: AppServices }> {
  const db = new SqliteCliDatabase(join(dir, name));
  await runMigrations(db);
  return { db, services: createCompositionRoot({ database: db, appVersion: '2.15.0' }) };
}

async function seed(services: AppServices): Promise<void> {
  await services.repositories.groups.save(
    createGroup({
      id: GROUP as never,
      name: 'Backup group',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  for (const [id, name, role, userId] of [
    [OWNER, 'Owner', 'owner', USER],
    [FRIEND, 'Friend', 'member', null],
  ] as const) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP as never,
        ...(userId !== null ? { userId: userId as never } : {}),
        displayName: name,
        role: role as never,
        now: '2026-10-01T00:00:00.000Z' as never,
      }),
    );
  }
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP,
    title: 'Dinner ₹1,200',
    amountMinor: 120_000,
    currencyCode: 'INR',
    expenseDate: '2026-10-20',
    note: 'Unicode: फ़ोटो, ünïcode',
    payerContributions: [
      { memberId: OWNER, amountMinor: 70_000 },
      { memberId: FRIEND, amountMinor: 50_000 },
    ],
    participantIds: [OWNER, FRIEND],
    createdBy: USER,
  });
}

describeWithSqlite('encrypted backup', () => {
  it('round-trips financial tables into a clean database', async () => {
    const source = await open('source.db');
    await seed(source.services);

    const created = await source.services.backup.create.execute(PASSWORD);
    expect(created.preview.counts.groups).toBe(1);
    expect(created.preview.counts.expenses).toBe(1);
    expect(created.envelopeJson).not.toContain('Dinner ₹1,200');

    const target = await open('target.db');
    const preview = await target.services.backup.inspect.execute(
      created.envelopeJson,
      PASSWORD,
    );
    expect(preview.counts.expenses).toBe(1);

    await target.services.backup.restore.execute(created.envelopeJson, PASSWORD);

    const expense = await target.db.get<{ amount_minor: number; title: string }>(
      'select amount_minor, title from expenses where group_id = ?',
      [GROUP],
    );
    expect(expense?.amount_minor).toBe(120_000);
    expect(expense?.title).toBe('Dinner ₹1,200');

    const splits = await target.db.all<{ amount_minor: number }>(
      'select amount_minor from expense_splits order by amount_minor',
    );
    expect(splits.map((row) => row.amount_minor)).toEqual([60_000, 60_000]);
  }, 30_000);

  it('rejects a wrong password without changing data', async () => {
    const source = await open('wrong-source.db');
    await seed(source.services);
    const created = await source.services.backup.create.execute(PASSWORD);

    const target = await open('wrong-target.db');
    await expect(
      target.services.backup.restore.execute(created.envelopeJson, 'not the password'),
    ).rejects.toThrow(/Wrong password/);

    const count = await target.db.get<{ count: number }>('select count(*) as count from groups');
    expect(count?.count).toBe(0);
  }, 30_000);

  it('rejects a tampered ciphertext', async () => {
    const source = await open('tamper.db');
    await seed(source.services);
    const created = await source.services.backup.create.execute(PASSWORD);
    const envelope = JSON.parse(created.envelopeJson) as Record<string, string>;
    envelope.ciphertextHex = `${envelope.ciphertextHex?.slice(0, -2)}00`;
    await expect(
      source.services.backup.inspect.execute(JSON.stringify(envelope), PASSWORD),
    ).rejects.toThrow(/corrupted/i);
  }, 30_000);
});
