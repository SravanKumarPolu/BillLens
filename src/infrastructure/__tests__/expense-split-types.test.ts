/**
 * Manual expense creation across split types.
 *
 * Equality, exact, percentage and shares must all reconcile to the total
 * and persist per-member splits. Remainders are the domain engine's
 * deterministic allocation; these tests pin the end-to-end result.
 */

import { describe, expect, it } from '@jest/globals';

import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

const GROUP = 'g_split';
const MEMBERS = ['m_owner', 'm_asha', 'm_ravi', 'm_meera'] as const;

async function seed(): Promise<AppServices> {
  const database = new InMemoryDatabase();
  await runMigrations(database);
  const services = createCompositionRoot({ database });
  await services.groups.createGroup.execute({
    groupId: GROUP,
    name: 'Split group',
    currencyCode: 'INR',
    createdBy: 'local-user',
    ownerMemberId: MEMBERS[0],
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
  return services;
}

function base(expenseId: string) {
  return {
    groupId: GROUP,
    expenseId,
    title: `Expense ${expenseId}`,
    amountMinor: 120_000,
    currencyCode: 'INR',
    expenseDate: '2026-10-20',
    payerContributions: [{ memberId: MEMBERS[0], amountMinor: 120_000 }],
    participantIds: [...MEMBERS],
    createdBy: 'local-user',
    now: '2026-10-20T09:00:00.000Z' as never,
  };
}

describe('CreateExpenseManuallyUseCase — split types', () => {
  it('splits equally by default', async () => {
    const services = await seed();
    const result = await services.expenses.createExpenseManually.execute(base('e_equal'));
    expect(result.splits.map((s) => s.amountMinor)).toEqual([30_000, 30_000, 30_000, 30_000]);
  });

  it('splits exact amounts and preserves the total', async () => {
    const services = await seed();
    const result = await services.expenses.createExpenseManually.execute({
      ...base('e_exact'),
      split: {
        splitType: 'exact',
        allocations: [
          { memberId: MEMBERS[0], amountMinor: 60_000 },
          { memberId: MEMBERS[1], amountMinor: 20_000 },
          { memberId: MEMBERS[2], amountMinor: 20_000 },
          { memberId: MEMBERS[3], amountMinor: 20_000 },
        ],
      },
    });
    expect(result.splits.reduce((sum, s) => sum + s.amountMinor, 0)).toBe(120_000);
    expect(result.splits.find((s) => s.memberId === MEMBERS[0])?.amountMinor).toBe(60_000);
  });

  it('splits percentages from basis points', async () => {
    const services = await seed();
    const result = await services.expenses.createExpenseManually.execute({
      ...base('e_pct'),
      split: {
        splitType: 'percentage',
        allocations: [
          { memberId: MEMBERS[0], basisPoints: 5000 },
          { memberId: MEMBERS[1], basisPoints: 2500 },
          { memberId: MEMBERS[2], basisPoints: 1250 },
          { memberId: MEMBERS[3], basisPoints: 1250 },
        ],
      },
    });
    expect(result.splits.reduce((sum, s) => sum + s.amountMinor, 0)).toBe(120_000);
    expect(result.splits.find((s) => s.memberId === MEMBERS[0])?.amountMinor).toBe(60_000);
  });

  it('splits weighted shares with deterministic remainders', async () => {
    const services = await seed();
    const result = await services.expenses.createExpenseManually.execute({
      ...base('e_shares'),
      amountMinor: 100_000,
      payerContributions: [{ memberId: MEMBERS[0], amountMinor: 100_000 }],
      split: {
        splitType: 'shares',
        allocations: [
          { memberId: MEMBERS[0], units: 1 },
          { memberId: MEMBERS[1], units: 1 },
          { memberId: MEMBERS[2], units: 1 },
          { memberId: MEMBERS[3], units: 1 },
        ],
      },
    });
    expect(result.splits.reduce((sum, s) => sum + s.amountMinor, 0)).toBe(100_000);
    expect(result.splits.map((s) => s.amountMinor).sort((a, b) => a - b)).toEqual([
      25_000, 25_000, 25_000, 25_000,
    ]);
  });

  it('rejects allocations that do not cover every participant', async () => {
    const services = await seed();
    await expect(
      services.expenses.createExpenseManually.execute({
        ...base('e_missing'),
        split: {
          splitType: 'exact',
          allocations: [{ memberId: MEMBERS[0], amountMinor: 120_000 }],
        },
      }),
    ).rejects.toThrow(/every participant/i);
  });

  it('rejects a percentage total that is not 100%', async () => {
    const services = await seed();
    await expect(
      services.expenses.createExpenseManually.execute({
        ...base('e_bad_pct'),
        split: {
          splitType: 'percentage',
          allocations: MEMBERS.map((memberId) => ({ memberId, basisPoints: 2000 })),
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an allocation for a non-participant', async () => {
    const services = await seed();
    await expect(
      services.expenses.createExpenseManually.execute({
        ...base('e_stranger'),
        split: {
          splitType: 'shares',
          allocations: [
            ...MEMBERS.map((memberId) => ({ memberId, units: 1 })),
            { memberId: 'm_stranger', units: 1 },
          ],
        },
      }),
    ).rejects.toThrow(/not a participant/i);
  });
});
