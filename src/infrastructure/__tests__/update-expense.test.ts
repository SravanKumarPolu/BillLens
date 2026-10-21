/**
 * Expense editing: atomic replacement, version guard, multi-payer.
 *
 * Editing must recompute splits through the same domain engine as create,
 * replace (not append) payers/splits, bump the version and never touch
 * settlement history.
 */

import { describe, expect, it } from '@jest/globals';

import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

const GROUP = 'g_edit';
const OWNER = 'm_owner';
const ASHA = 'm_asha';
const RAVI = 'm_ravi';
const MEERA = 'm_meera';
const MEMBERS = [OWNER, ASHA, RAVI, MEERA] as const;

async function seed(): Promise<{ services: AppServices; database: InMemoryDatabase }> {
  const database = new InMemoryDatabase();
  await runMigrations(database);
  const services = createCompositionRoot({ database });
  await services.groups.createGroup.execute({
    groupId: GROUP,
    name: 'Edit group',
    currencyCode: 'INR',
    createdBy: 'local-user',
    ownerMemberId: OWNER,
    now: '2026-10-01T09:00:00.000Z' as never,
  });
  for (const id of MEMBERS.slice(1)) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP as never,
        displayName: id,
        role: 'member',
        now: '2026-10-01T09:00:00.000Z' as never,
      }),
    );
  }
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP,
    expenseId: 'e_edit',
    title: 'Dinner',
    amountMinor: 120_000,
    currencyCode: 'INR',
    expenseDate: '2026-10-20',
    payerContributions: [{ memberId: OWNER, amountMinor: 120_000 }],
    participantIds: [...MEMBERS],
    createdBy: 'local-user',
    now: '2026-10-20T09:00:00.000Z' as never,
  });
  return { services, database };
}

describe('UpdateExpenseUseCase', () => {
  it('replaces splits and payers atomically, recomputing balances', async () => {
    const { services, database } = await seed();

    const result = await services.expenses.updateExpense.execute({
      expenseId: 'e_edit',
      title: 'Dinner (corrected)',
      amountMinor: 80_000,
      currencyCode: 'INR',
      expenseDate: '2026-10-20',
      payerContributions: [
        { memberId: OWNER, amountMinor: 50_000 },
        { memberId: ASHA, amountMinor: 30_000 },
      ],
      participantIds: [OWNER, ASHA, RAVI, MEERA],
      split: {
        splitType: 'exact',
        allocations: [
          { memberId: OWNER, amountMinor: 20_000 },
          { memberId: ASHA, amountMinor: 20_000 },
          { memberId: RAVI, amountMinor: 20_000 },
          { memberId: MEERA, amountMinor: 20_000 },
        ],
      },
      expectedVersion: 1,
      actorUserId: 'local-user',
    });

    expect(result.version).toBe(2);
    expect(result.splits.reduce((sum, s) => sum + s.amountMinor, 0)).toBe(80_000);

    const expense = await services.repositories.expenses.findById('e_edit' as never);
    expect(expense?.amountMinor).toBe(80_000);
    expect(expense?.title).toBe('Dinner (corrected)');
    expect(expense?.splitType).toBe('exact');
    expect(expense?.version).toBe(2);

    const splits = await services.repositories.expenses.listSplits('e_edit' as never);
    expect(splits).toHaveLength(4); // replaced, not appended
    expect(splits.reduce((sum, s) => sum + s.amountMinor, 0)).toBe(80_000);

    const payers = await services.repositories.expenses.listPayers('e_edit' as never);
    expect(payers).toHaveLength(2);
    expect(payers.reduce((sum, p) => sum + p.amountMinor, 0)).toBe(80_000);

    const balances = await services.balances.getGroupBalances.execute({
      groupId: GROUP as never,
    });
    const inr = balances.results.find((row) => row.currencyCode === 'INR');
    const net = (memberId: string): number =>
      inr?.memberCurrencyBalances.find((row) => row.memberId === memberId)?.netBalanceMinor ?? 0;
    // Owner paid 500 of 800, owes 200 → +300. Asha paid 300, owes 200 → +100.
    expect(net(OWNER)).toBe(30_000);
    expect(net(ASHA)).toBe(10_000);
    expect(net(RAVI)).toBe(-20_000);
    expect(net(MEERA)).toBe(-20_000);

    // Old payers/splits were replaced in one save; no duplicates.
    const payerRows = await database.all<{ id: string }>(
      'select id from expense_payers where expense_id = ?',
      ['e_edit'],
    );
    expect(payerRows).toHaveLength(2);
  });

  it('rejects a stale version instead of overwriting', async () => {
    const { services } = await seed();
    await expect(
      services.expenses.updateExpense.execute({
        expenseId: 'e_edit',
        title: 'Stale',
        amountMinor: 100_000,
        currencyCode: 'INR',
        payerContributions: [{ memberId: OWNER, amountMinor: 100_000 }],
        participantIds: [...MEMBERS],
        expectedVersion: 99,
        actorUserId: 'local-user',
      }),
    ).rejects.toThrow(/version conflict/i);
  });

  it('preserves settlement history when an expense is edited', async () => {
    const { services, database } = await seed();
    await services.settlements.createSettlementDraft.execute({
      groupId: GROUP,
      fromMemberId: ASHA,
      toMemberId: OWNER,
      amountMinor: 10_000,
      currencyCode: 'INR',
      method: 'upi',
      note: 'partial',
      createdBy: 'local-user',
      operationId: 'op_edit_settle',
    });

    await services.expenses.updateExpense.execute({
      expenseId: 'e_edit',
      title: 'Dinner v2',
      amountMinor: 80_000,
      currencyCode: 'INR',
      payerContributions: [{ memberId: OWNER, amountMinor: 80_000 }],
      participantIds: [...MEMBERS],
      expectedVersion: 1,
      actorUserId: 'local-user',
    });

    const settlementRows = await database.all<{ id: string }>(
      'select id from settlements where group_id = ? and deleted_at is null',
      [GROUP],
    );
    expect(settlementRows).toHaveLength(1);
  });

  it('refuses to edit a voided expense', async () => {
    const { services } = await seed();
    await services.expenses.voidExpense.execute({
      expenseId: 'e_edit',
      groupId: GROUP,
      actorMemberId: OWNER,
      actorUserId: 'local-user',
      expectedVersion: 1,
    });

    await expect(
      services.expenses.updateExpense.execute({
        expenseId: 'e_edit',
        title: 'Zombie',
        amountMinor: 100_000,
        currencyCode: 'INR',
        payerContributions: [{ memberId: OWNER, amountMinor: 100_000 }],
        participantIds: [...MEMBERS],
        expectedVersion: 2,
        actorUserId: 'local-user',
      }),
    ).rejects.toThrow(/voided expense/i);
  });
});
