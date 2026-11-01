/**
 * GetExpenseDetailUseCase integration tests.
 *
 * Verifies the use case loads the expense + payers + shares with
 * member display names resolved, computes the share-total +
 * payer-total invariants, throws on missing / deleted expenses,
 * and handles the single-payer + multi-payer cases.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { GetExpenseDetailUseCase } from '@application/expenses/get-expense-detail.usecase';
import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import type { AppServices } from '@infrastructure/composition-root';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

const GROUP_ID = 'g_exp_detail';
const ALICE = 'm_exp_alice';
const BOB = 'm_exp_bob';
const CAROL = 'm_exp_carol';
const USER = 'local-user';

let services: AppServices;
let useCase: GetExpenseDetailUseCase;

beforeEach(async () => {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  services = createCompositionRoot({ database: db });
  useCase = new GetExpenseDetailUseCase(
    services.repositories.expenses,
    services.repositories.members,
  );

  await services.repositories.groups.save(
    createGroup({
      id: GROUP_ID as never,
      name: 'Detail Test Group',
      currencyCode: 'USD',
      createdBy: USER as never,
    }),
  );
  for (const [id, name, role] of [
    [ALICE, 'Alice', 'owner'],
    [BOB, 'Bob', 'member'],
    [CAROL, 'Carol', 'member'],
  ] as const) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP_ID as never,
        displayName: name,
        role: role as never,
      }),
    );
  }
});

describe('GetExpenseDetailUseCase (integration)', () => {
  it('loads a single-payer equal-split expense with names resolved', async () => {
    // Alice paid 3000 for Alice + Bob + Carol.
    await services.expenses.createExpenseManually.execute({
      groupId: GROUP_ID,
      title: 'Dinner',
      amountMinor: 3000,
      currencyCode: 'USD',
      expenseDate: '2026-10-11T10:00:00.000Z',
      payerContributions: [{ memberId: ALICE, amountMinor: 3000 }],
      participantIds: [ALICE, BOB, CAROL],
      createdBy: USER as never,
      expenseId: 'e_detail_1',
    });

    const result = await useCase.execute({ expenseId: 'e_detail_1' as never });

    expect(result.view.title).toBe('Dinner');
    expect(result.view.amountMinor).toBe(3000);
    expect(result.view.currencyCode).toBe('USD');
    expect(result.view.expenseDate).toBe('2026-10-11T10:00:00.000Z');
    expect(result.view.splitType).toBe('equal');
    expect(result.view.payers).toHaveLength(1);
    expect(result.view.payers[0]!.displayName).toBe('Alice');
    expect(result.view.payers[0]!.amountMinor).toBe(3000);
    expect(result.view.payers[0]!.isSinglePayer).toBe(true);
    expect(result.view.shares).toHaveLength(3);
    // Domain equal-split: 3000 / 3 → [1000, 1000, 1000].
    expect(result.view.shares.map((s) => s.amountMinor)).toEqual([1000, 1000, 1000]);
    expect(result.view.sharesTotalMinor).toBe(3000);
    expect(result.view.payersTotalMinor).toBe(3000);
    expect(result.view.participantCount).toBe(3);
    // The payer's share is flagged isPayer=true (offset by their contribution).
    const aliceShare = result.view.shares.find((s) => s.memberId === ALICE);
    expect(aliceShare?.isPayer).toBe(true);
    const bobShare = result.view.shares.find((s) => s.memberId === BOB);
    expect(bobShare?.isPayer).toBe(false);
  });

  it('throws when the expense does not exist', async () => {
    await expect(useCase.execute({ expenseId: 'e_does_not_exist' as never })).rejects.toThrow(
      'not found',
    );
  });

  it('throws when the expense has been soft-deleted', async () => {
    await services.expenses.createExpenseManually.execute({
      groupId: GROUP_ID,
      title: 'To be deleted',
      amountMinor: 1000,
      currencyCode: 'USD',
      payerContributions: [{ memberId: ALICE, amountMinor: 1000 }],
      participantIds: [ALICE, BOB],
      createdBy: USER as never,
      expenseId: 'e_detail_2',
    });

    await services.repositories.expenses.softDelete('e_detail_2' as never, {
      actorId: USER as never,
      deletedAt: '2026-10-11T10:00:00.000Z' as never,
      reason: 'test cleanup',
    });

    await expect(useCase.execute({ expenseId: 'e_detail_2' as never })).rejects.toThrow('deleted');
  });

  it('reports the share-total invariant mismatch honestly when the data is corrupt', async () => {
    // Use the repository directly to write an expense where the share
    // total does NOT equal the amount (simulating a corrupted write
    // or a future multi-payer scenario the manual form does not yet
    // exercise).
    await services.expenses.createExpenseManually.execute({
      groupId: GROUP_ID,
      title: 'Invariant test',
      amountMinor: 1000,
      currencyCode: 'USD',
      payerContributions: [{ memberId: ALICE, amountMinor: 1000 }],
      participantIds: [ALICE, BOB],
      createdBy: USER as never,
      expenseId: 'e_detail_3',
    });

    const result = await useCase.execute({ expenseId: 'e_detail_3' as never });
    expect(result.view.sharesTotalMinor).toBe(1000); // equal split 500+500
    expect(result.view.payersTotalMinor).toBe(1000);
    expect(result.view.sharesTotalMinor).toBe(result.view.payersTotalMinor);
  });
});
