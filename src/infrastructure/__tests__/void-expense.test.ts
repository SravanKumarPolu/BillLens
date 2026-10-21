/**
 * Expense voiding — permission, audit and balance effects.
 *
 * Financial history is preserved (soft delete), and voiding must be
 * refused for members who neither administer the group nor created the
 * expense.
 */

import { describe, expect, it } from '@jest/globals';

import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

const GROUP = 'g_void';
const OWNER = 'm_void_owner';
const MEMBER = 'm_void_member';

async function seed(): Promise<{ services: AppServices; database: InMemoryDatabase }> {
  const database = new InMemoryDatabase();
  await runMigrations(database);
  const services = createCompositionRoot({ database });
  await services.groups.createGroup.execute({
    groupId: GROUP,
    name: 'Void group',
    currencyCode: 'INR',
    createdBy: 'local-user',
    ownerMemberId: OWNER,
    now: '2026-10-01T09:00:00.000Z' as never,
  });
  await services.repositories.members.save(
    createGroupMember({
      id: MEMBER as never,
      groupId: GROUP as never,
      displayName: 'Asha',
      role: 'member',
      now: '2026-10-01T09:00:00.000Z' as never,
    }),
  );
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP,
    expenseId: 'e_void',
    title: 'Dinner',
    amountMinor: 100_000,
    currencyCode: 'INR',
    expenseDate: '2026-10-20',
    payerContributions: [{ memberId: OWNER, amountMinor: 100_000 }],
    participantIds: [OWNER, MEMBER],
    createdBy: 'local-user',
    now: '2026-10-20T09:00:00.000Z' as never,
  });
  return { services, database };
}

describe('VoidExpenseUseCase', () => {
  it('soft-deletes for the owner and removes the balance effect', async () => {
    const { services, database } = await seed();
    expect(
      await services.balances.getGroupBalances.execute({ groupId: GROUP as never }),
    ).toMatchObject({ notFound: false });

    await services.expenses.voidExpense.execute({
      expenseId: 'e_void',
      groupId: GROUP,
      actorMemberId: OWNER,
      actorUserId: 'local-user',
      expectedVersion: 1,
      reason: 'duplicate',
    });

    const row = await database.get<{ deleted_at: string | null }>(
      'select deleted_at from expenses where id = ?',
      ['e_void'],
    );
    expect(row?.deleted_at).not.toBeNull();

    const audit = await database.get<{ action: string }>(
      "select action from audit_logs where entity_id = 'e_void' and action = 'delete'",
    );
    expect(audit?.action).toBe('delete');

    const balances = await services.balances.getGroupBalances.execute({
      groupId: GROUP as never,
    });
    const anyNonZero = balances.results.some((currency) =>
      currency.memberCurrencyBalances.some((balance) => balance.netBalanceMinor !== 0),
    );
    expect(anyNonZero).toBe(false);
  });

  it('refuses a regular member voiding someone else’s expense', async () => {
    const { services } = await seed();
    await expect(
      services.expenses.voidExpense.execute({
        expenseId: 'e_void',
        groupId: GROUP,
        actorMemberId: MEMBER,
        actorUserId: 'another-user',
        expectedVersion: 1,
      }),
    ).rejects.toThrow(/admin|creator/i);
  });

  it('is idempotent for an already-voided expense', async () => {
    const { services } = await seed();
    await services.expenses.voidExpense.execute({
      expenseId: 'e_void',
      groupId: GROUP,
      actorMemberId: OWNER,
      actorUserId: 'local-user',
      expectedVersion: 1,
    });
    await expect(
      services.expenses.voidExpense.execute({
        expenseId: 'e_void',
        groupId: GROUP,
        actorMemberId: OWNER,
        actorUserId: 'local-user',
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({ expenseId: 'e_void' });
  });
});
