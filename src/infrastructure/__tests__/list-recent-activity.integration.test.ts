/**
 * ListRecentActivityUseCase tests.
 *
 * Verifies the use case merges expenses + settlements across multiple
 * groups, orders by timestamp DESC, caps at the limit, and skips
 * failing groups without aborting the timeline.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { ListRecentActivityUseCase } from '@application/activity/list-recent-activity.usecase';
import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import type { AppServices } from '@infrastructure/composition-root';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

async function makeInMemoryServices(): Promise<AppServices> {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  return createCompositionRoot({ database: db });
}

const NOW = '2026-10-11T10:00:00.000Z';
const GROUP_A = 'g_act_a';
const GROUP_B = 'g_act_b';
const ALICE = 'm_act_alice';
const BOB = 'm_act_bob';
const CAROL = 'm_act_carol';

async function seed(services: AppServices): Promise<void> {
  // Group A: Alice + Bob
  await services.repositories.groups.save(
    createGroup({
      id: GROUP_A as never,
      name: 'Trip A',
      currencyCode: 'USD',
      createdBy: 'local-user' as never,
      now: NOW as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: ALICE as never,
      groupId: GROUP_A as never,
      displayName: 'Alice',
      role: 'owner',
      now: NOW as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: BOB as never,
      groupId: GROUP_A as never,
      displayName: 'Bob',
      role: 'member',
      now: NOW as never,
    }),
  );

  // Group B: Carol + Alice
  await services.repositories.groups.save(
    createGroup({
      id: GROUP_B as never,
      name: 'Trip B',
      currencyCode: 'USD',
      createdBy: 'local-user' as never,
      now: NOW as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: CAROL as never,
      groupId: GROUP_B as never,
      displayName: 'Carol',
      role: 'owner',
      now: NOW as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: 'm_act_alice2' as never,
      groupId: GROUP_B as never,
      displayName: 'Alice',
      role: 'member',
      now: NOW as never,
    }),
  );

  // Group A: expense 1 (Alice paid 3000 for Alice+Bob at 10:00)
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP_A,
    title: 'Dinner',
    amountMinor: 3000,
    currencyCode: 'USD',
    expenseDate: '2026-10-11T10:00:00.000Z',
    payerContributions: [{ memberId: ALICE, amountMinor: 3000 }],
    participantIds: [ALICE, BOB],
    createdBy: 'local-user' as never,
    expenseId: 'e_act_1',
  });

  // Group B: expense 2 (Carol paid 2000 at 09:00 — earlier)
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP_B,
    title: 'Lunch',
    amountMinor: 2000,
    currencyCode: 'USD',
    expenseDate: '2026-10-11T09:00:00.000Z',
    payerContributions: [{ memberId: CAROL, amountMinor: 2000 }],
    participantIds: [CAROL, 'm_act_alice2'],
    createdBy: 'local-user' as never,
    expenseId: 'e_act_2',
  });

  // Group A: settlement (Bob pays Alice 1000 — newest, at 11:00)
  const draft = await services.settlements.createSettlementDraft.execute({
    groupId: GROUP_A,
    fromMemberId: BOB,
    toMemberId: ALICE,
    amountMinor: 1000,
    currencyCode: 'USD',
    method: 'upi',
    note: 'Settling dinner',
    settlementDate: '2026-10-11T11:00:00.000Z' as never,
    createdBy: 'local-user' as never,
    operationId: 'op_act_1',
  });
  await services.settlements.recordSettlement.execute({
    settlementId: draft.settlementId,
    expectedVersion: 1,
    actorMemberId: BOB as never,
    note: 'UPI sent',
  });
}

describe('ListRecentActivityUseCase (integration)', () => {
  let services: AppServices;
  let useCase: ListRecentActivityUseCase;

  beforeEach(async () => {
    services = await makeInMemoryServices();
    useCase = new ListRecentActivityUseCase(
      services.repositories.members,
      services.repositories.expenses,
      services.repositories.settlements,
    );
  });

  it('merges expenses + settlements across groups, ordered by timestamp DESC', async () => {
    await seed(services);

    const result = await useCase.execute({
      groupIds: [GROUP_A as never, GROUP_B as never],
      limit: 20,
    });

    expect(result.entries.length).toBe(3);
    // The settlement was created with settlementDate=11:00 — it is the newest.
    expect(result.entries[0]!.kind).toBe('settlement');
    expect(result.entries[0]!.description).toContain('Bob');
    expect(result.entries[0]!.description).toContain('Alice');
    // The Group A expense (10:00) and Group B expense (09:00) follow.
    expect(result.entries[1]!.kind).toBe('expense');
    expect(result.entries[2]!.kind).toBe('expense');
    expect(result.entries[1]!.description).toBe('Dinner');
    expect(result.entries[2]!.description).toBe('Lunch');
  });

  it('respects the limit and reports hasMore', async () => {
    await seed(services);

    const result = await useCase.execute({
      groupIds: [GROUP_A as never, GROUP_B as never],
      limit: 1,
    });

    expect(result.entries.length).toBe(1);
    expect(result.hasMore).toBe(true);
  });

  it('returns an empty timeline when no group ids are supplied', async () => {
    const result = await useCase.execute({ groupIds: [], limit: 20 });
    expect(result.entries).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('skips a non-existent group without aborting the timeline', async () => {
    await seed(services);

    const result = await useCase.execute({
      groupIds: [GROUP_A as never, 'g_does_not_exist' as never, GROUP_B as never],
      limit: 20,
    });

    // Group A + Group B = 3 entries (the missing group contributes nothing).
    expect(result.entries.length).toBe(3);
  });

  it('clamps the limit to the [1, 50] range', async () => {
    await seed(services);

    // limit:0 clamps to 1 → only the newest entry is returned.
    const tooSmall = await useCase.execute({ groupIds: [GROUP_A as never, GROUP_B as never], limit: 0 });
    expect(tooSmall.entries.length).toBe(1);
    expect(tooSmall.hasMore).toBe(true);

    // limit:999 clamps to 50 → all 3 entries returned, hasMore=false.
    const tooLarge = await useCase.execute({ groupIds: [GROUP_A as never, GROUP_B as never], limit: 999 });
    expect(tooLarge.entries.length).toBe(3);
    expect(tooLarge.hasMore).toBe(false);
  });

  it('builds a stable id from the kind + entity id', async () => {
    await seed(services);

    const result = await useCase.execute({
      groupIds: [GROUP_A as never],
      limit: 20,
    });

    const ids = result.entries.map((e) => e.id);
    expect(ids).toContain('expense:e_act_1');
    expect(ids.filter((id) => id.startsWith('settlement:')).length).toBe(1);
  });

  it('excludes soft-deleted settlements from the timeline', async () => {
    await seed(services);

    // Soft-delete the settlement we created in seed()
    const listResult = await services.repositories.settlements.listByGroup(GROUP_A as never, {
      limit: 50,
    });
    const settlementId = listResult.items[0]!.id;
    await services.repositories.settlements.softDelete(settlementId, {
      actorId: 'local-user' as never,
      deletedAt: NOW as never,
      reason: 'test cleanup',
    });

    const result = await useCase.execute({
      groupIds: [GROUP_A as never],
      limit: 20,
    });

    // Only the expense remains.
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]!.kind).toBe('expense');
  });
});
