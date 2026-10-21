/**
 * Item-level expense persistence and splitting over real SQLite.
 *
 * Uses the existing ItemSplitStrategy through the shared manual-split
 * resolver; verifies determinism, persistence and the edit guard.
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
const GROUP = 'g_items';
const A = 'm_items_a';
const B = 'm_items_b';
const USER = 'local-user';

let dir: string;
let db: SqliteCliDatabase;
let services: AppServices;
let expenseId = '';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'billlens-items-'));
  db = new SqliteCliDatabase(join(dir, 'items.db'));
  await runMigrations(db);
  services = createCompositionRoot({ database: db });
  await services.repositories.groups.save(
    createGroup({
      id: GROUP as never,
      name: 'Items',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  for (const [id, name, role, userId] of [
    [A, 'Asha', 'owner', USER],
    [B, 'Bilal', 'member', null],
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
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('itemised expenses', () => {
  it('splits shared items, distributes tax deterministically and persists items', async () => {
    const result = await services.expenses.createExpenseManually.execute({
      groupId: GROUP,
      title: 'Itemised dinner',
      amountMinor: 10_000,
      currencyCode: 'INR',
      expenseDate: '2026-10-20',
      payerContributions: [{ memberId: A, amountMinor: 10_000 }],
      participantIds: [A, B],
      split: {
        splitType: 'items',
        lineItems: [
          {
            id: 'i1',
            name: 'Dosa',
            quantity: 2,
            unitPriceMinor: 3_000,
            totalAmountMinor: 6_000,
            assignedMemberIds: [A, B],
          },
          {
            id: 'i2',
            name: 'Coffee',
            quantity: 1,
            unitPriceMinor: 3_000,
            totalAmountMinor: 3_000,
            assignedMemberIds: [B],
          },
        ],
        charges: [{ type: 'tax', amountMinor: 1_000 }],
      },
      createdBy: USER,
    });
    expenseId = result.expenseId;

    expect(result.splits).toEqual([
      { memberId: A, amountMinor: 3_333 },
      { memberId: B, amountMinor: 6_667 },
    ]);

    const stored = await services.repositories.expenses.findById(expenseId as never);
    expect(stored?.splitType).toBe('items');
    expect(stored?.lineItems).toHaveLength(2);
    expect(stored?.lineItems?.[0]?.assignedMemberIds).toEqual([A, B]);
    expect(stored?.itemCharges).toEqual([{ type: 'tax', amountMinor: 1_000 }]);
  });

  it('rejects a normal split edit on an itemised expense', async () => {
    const current = await services.repositories.expenses.findById(expenseId as never);
    await expect(
      services.expenses.updateExpense.execute({
        expenseId,
        title: 'Itemised dinner',
        amountMinor: 10_000,
        currencyCode: 'INR',
        payerContributions: [{ memberId: A, amountMinor: 10_000 }],
        participantIds: [A, B],
        expectedVersion: current?.version as never,
        actorUserId: USER,
      }),
    ).rejects.toThrow(/itemised/i);
  });

  it('reopens and updates item assignments', async () => {
    const detail = await services.expenses.getExpenseDetail.execute({ expenseId: expenseId as never });
    expect(detail.view.lineItems).toHaveLength(2);

    await services.expenses.updateExpense.execute({
      expenseId,
      title: detail.view.title,
      amountMinor: detail.view.amountMinor,
      currencyCode: detail.view.currencyCode,
      expenseDate: detail.view.expenseDate,
      payerContributions: [{ memberId: A, amountMinor: 10_000 }],
      participantIds: [A, B],
      split: {
        splitType: 'items',
        lineItems: [
          {
            id: 'i1',
            name: 'Dosa',
            quantity: 2,
            unitPriceMinor: 3_000,
            totalAmountMinor: 6_000,
            assignedMemberIds: [A],
          },
          {
            id: 'i2',
            name: 'Coffee',
            quantity: 1,
            unitPriceMinor: 3_000,
            totalAmountMinor: 3_000,
            assignedMemberIds: [B],
          },
        ],
        charges: [{ type: 'tax', amountMinor: 1_000 }],
      },
      expectedVersion: detail.view.version as never,
      actorUserId: USER,
    });

    const updated = await services.repositories.expenses.findById(expenseId as never);
    expect(updated?.lineItems?.[0]?.assignedMemberIds).toEqual([A]);
    const splits = await services.repositories.expenses.listSplits(expenseId as never);
    expect(splits.reduce((sum, split) => sum + split.amountMinor, 0)).toBe(10_000);
  });
});
