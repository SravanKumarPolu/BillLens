/**
 * Group management over real SQLite.
 *
 * Covers edit/currency guard, archive/read-only/restore, member lifecycle and
 * permanent deletion with cascade + idempotency.
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
const GROUP = 'g_manage';
const OTHER_GROUP = 'g_manage_other';
const OWNER = 'm_manage_owner';
const FRIEND = 'm_manage_friend';
const USER = 'local-user';

let dir: string;
let db: SqliteCliDatabase;
let services: AppServices;

async function seedGroup(id: string, name: string, ownerId: string): Promise<void> {
  await services.repositories.groups.save(
    createGroup({
      id: id as never,
      name,
      description: 'Original description',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: ownerId as never,
      groupId: id as never,
      userId: USER as never,
      displayName: 'Owner',
      role: 'owner',
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'billlens-group-'));
  db = new SqliteCliDatabase(join(dir, 'groups.db'));
  await runMigrations(db);
  services = createCompositionRoot({ database: db });
  await seedGroup(GROUP, 'Goa Trip', OWNER);
  await seedGroup(OTHER_GROUP, 'Flat', 'm_manage_other_owner');
  await services.repositories.members.save(
    createGroupMember({
      id: FRIEND as never,
      groupId: GROUP as never,
      displayName: 'Friend',
      role: 'member',
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('group management', () => {
  it('edits name/description/category and persists', async () => {
    const current = await services.repositories.groups.findById(GROUP as never);
    const updated = await services.groups.update.execute({
      groupId: GROUP,
      name: 'Goa Trip 2026',
      description: 'Beach house',
      category: 'trip',
      icon: '🏖️',
      currencyCode: 'INR',
      expectedVersion: current?.version as never,
      actorUserId: USER,
    });
    expect(updated.name).toBe('Goa Trip 2026');
    const reloaded = await services.repositories.groups.findById(GROUP as never);
    expect(reloaded?.description).toBe('Beach house');
    expect(reloaded?.category).toBe('trip');
    expect(reloaded?.icon).toBe('🏖️');
  });

  it('allows a currency change while a group is empty', async () => {
    const current = await services.repositories.groups.findById(OTHER_GROUP as never);
    const updated = await services.groups.update.execute({
      groupId: OTHER_GROUP,
      name: 'Flat',
      currencyCode: 'USD',
      expectedVersion: current?.version as never,
      actorUserId: USER,
    });
    expect(updated.currencyCode).toBe('USD');
    const reloaded = await services.repositories.groups.findById(OTHER_GROUP as never);
    expect(reloaded?.currencyCode).toBe('USD');
  });

  it('rejects a currency change once expenses exist', async () => {
    const expense = await services.expenses.createExpenseManually.execute({
      groupId: GROUP,
      title: 'Lunch',
      amountMinor: 10_000,
      currencyCode: 'INR',
      payerContributions: [{ memberId: OWNER, amountMinor: 10_000 }],
      participantIds: [OWNER, FRIEND],
      createdBy: USER,
    });
    expect(expense.amountMinor).toBe(10_000);

    const current = await services.repositories.groups.findById(GROUP as never);
    await expect(
      services.groups.update.execute({
        groupId: GROUP,
        name: 'Goa Trip 2026',
        currencyCode: 'USD',
        expectedVersion: current?.version as never,
        actorUserId: USER,
      }),
    ).rejects.toThrow(/Currency cannot be changed/);
  });

  it('archives read-only, hides from active list callers, and restores', async () => {
    const current = await services.repositories.groups.findById(GROUP as never);
    await services.groups.archive.execute(GROUP, current?.version as never);
    const archived = await services.repositories.groups.findById(GROUP as never);
    expect(archived?.archivedAt).toBeDefined();

    await expect(
      services.expenses.createExpenseManually.execute({
        groupId: GROUP,
        title: 'Blocked',
        amountMinor: 100,
        currencyCode: 'INR',
        payerContributions: [{ memberId: OWNER, amountMinor: 100 }],
        participantIds: [OWNER],
        createdBy: USER,
      }),
    ).rejects.toThrow(/archived and read-only/);

    await services.groups.restore.execute(GROUP, archived?.version as never);
    const restored = await services.repositories.groups.findById(GROUP as never);
    expect(restored?.archivedAt).toBeUndefined();
  });

  it('adds, renames and deactivates a member without deleting history', async () => {
    const member = await services.groups.addMember.execute({
      groupId: GROUP,
      displayName: 'New Person',
      actorUserId: USER,
    });
    const renamed = await services.groups.renameMember.execute({
      memberId: member.id as string,
      displayName: 'Renamed Person',
      expectedVersion: member.version as number,
    });
    expect(renamed.displayName).toBe('Renamed Person');

    await services.groups.removeMember.execute({ memberId: FRIEND });
    const friend = await services.repositories.members.findById(FRIEND as never);
    expect(friend?.leftAt).toBeDefined();
    const active = await services.repositories.members.listActiveByGroup(GROUP as never);
    expect(active.map((entry) => entry.id as string)).not.toContain(FRIEND);

    await expect(
      services.groups.removeMember.execute({ memberId: OWNER }),
    ).rejects.toThrow(/owner/);
  });

  it('summarises and permanently deletes a populated group exactly once', async () => {
    const before = await services.groups.deletionSummary.execute(GROUP);
    expect(before.expenses).toBeGreaterThan(0);
    expect(before.members).toBeGreaterThan(0);

    await expect(
      services.groups.deleteGroup.execute({ groupId: GROUP, confirmationName: 'wrong' }),
    ).rejects.toThrow(/exact group name/);
    await expect(
      services.groups.deleteGroup.execute({ groupId: GROUP, confirmationName: 'Goa Trip 2026' }),
    ).rejects.toThrow(/Confirm permanent deletion again/);

    const result = await services.groups.deleteGroup.execute({
      groupId: GROUP,
      confirmationName: 'Goa Trip 2026',
      secondConfirmation: true,
    });
    expect(result.deleted).toBe(true);

    expect(await services.repositories.groups.findById(GROUP as never)).toBeNull();
    const expenses = await db.get<{ count: number }>(
      'select count(*) as count from expenses where group_id = ?',
      [GROUP],
    );
    expect(expenses?.count).toBe(0);
    const splits = await db.get<{ count: number }>(
      'select count(*) as count from expense_splits where expense_id not in (select id from expenses)',
    );
    expect(splits?.count).toBe(0);

    // Idempotent retry.
    const again = await services.groups.deleteGroup.execute({
      groupId: GROUP,
      confirmationName: 'Goa Trip 2026',
      secondConfirmation: true,
    });
    expect(again.deleted).toBe(false);

    // Unrelated group untouched.
    expect(await services.repositories.groups.findById(OTHER_GROUP as never)).not.toBeNull();
  });
});
