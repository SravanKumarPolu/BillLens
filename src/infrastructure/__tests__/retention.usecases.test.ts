/**
 * Retention assessment + local-copy deletion tests.
 *
 * Uses the real composition root over the in-memory database, so the
 * guards run against the production use cases and repositories.
 */

import { describe, expect, it } from '@jest/globals';

import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const OLD = '2024-01-01T09:00:00.000Z';

async function makeServices(): Promise<{
  database: InMemoryDatabase;
  services: ReturnType<typeof createCompositionRoot>;
}> {
  const database = new InMemoryDatabase();
  await runMigrations(database);
  return { database, services: createCompositionRoot({ database }) };
}

/** Group where the only participant is the payer → zero balances. */
async function seedSettledGroup(
  services: ReturnType<typeof createCompositionRoot>,
  id: string,
): Promise<void> {
  await services.groups.createGroup.execute({
    groupId: id,
    name: `Old trip ${id}`,
    currencyCode: 'INR',
    createdBy: 'local-user',
    ownerMemberId: `${id}_owner`,
    now: OLD as never,
  });
  await services.expenses.createExpenseManually.execute({
    groupId: id,
    expenseId: `${id}_expense`,
    title: 'Solo lunch',
    amountMinor: 50_000,
    currencyCode: 'INR',
    expenseDate: '2024-01-02',
    payerContributions: [{ memberId: `${id}_owner`, amountMinor: 50_000 }],
    participantIds: [`${id}_owner`],
    createdBy: 'local-user',
    now: OLD as never,
  });
}

async function seedUnsettledGroup(
  services: ReturnType<typeof createCompositionRoot>,
  id: string,
): Promise<void> {
  await services.groups.createGroup.execute({
    groupId: id,
    name: `Open trip ${id}`,
    currencyCode: 'INR',
    createdBy: 'local-user',
    ownerMemberId: `${id}_owner`,
    now: OLD as never,
  });
  await services.repositories.members.save(
    createGroupMember({
      id: `${id}_friend` as never,
      groupId: id as never,
      displayName: 'Asha',
      role: 'member',
      now: OLD as never,
    }),
  );
  await services.expenses.createExpenseManually.execute({
    groupId: id,
    expenseId: `${id}_expense`,
    title: 'Dinner',
    amountMinor: 100_000,
    currencyCode: 'INR',
    expenseDate: '2024-01-02',
    payerContributions: [{ memberId: `${id}_owner`, amountMinor: 100_000 }],
    participantIds: [`${id}_owner`, `${id}_friend`],
    createdBy: 'local-user',
    now: OLD as never,
  });
}

describe('AssessRetentionUseCase', () => {
  it('separates eligible, recent and protected groups', async () => {
    const { services } = await makeServices();
    await seedSettledGroup(services, 'g_settled');
    await seedUnsettledGroup(services, 'g_open');

    // A recent, settled group.
    await services.groups.createGroup.execute({
      groupId: 'g_recent',
      name: 'New trip',
      currencyCode: 'INR',
      createdBy: 'local-user',
      ownerMemberId: 'g_recent_owner',
      now: '2026-10-01T09:00:00.000Z' as never,
    });

    const result = await services.data.assessRetention.execute({
      groupIds: ['g_settled', 'g_open', 'g_recent'],
      cloudSyncEnabled: false,
      now: NOW,
    });

    const byId = new Map(result.rows.map((row) => [row.groupId, row]));
    expect(byId.get('g_settled')?.state).toBe('eligible');
    expect(byId.get('g_open')?.state).toBe('protected');
    expect(byId.get('g_open')?.hasOutstandingBalance).toBe(true);
    expect(byId.get('g_recent')?.state).toBe('too_recent');
    expect(result.eligibleCount).toBe(1);
  });

  it('protects every group while local changes are unsynced in cloud mode', async () => {
    const { services } = await makeServices();
    await seedSettledGroup(services, 'g_settled');

    const result = await services.data.assessRetention.execute({
      groupIds: ['g_settled'],
      cloudSyncEnabled: true,
      now: NOW,
    });

    expect(result.rows[0]?.state).toBe('protected');
    expect(result.rows[0]?.pendingLocalChanges).toBeGreaterThan(0);
  });
});

describe('DeleteLocalGroupCopyUseCase', () => {
  it('deletes a settled, local-only group without queuing a sync delete', async () => {
    const { database, services } = await makeServices();
    await seedSettledGroup(services, 'g_settled');

    const before = await database.get<{ count: number }>(
      'select count(*) as count from sync_operations',
    );

    const result = await services.data.deleteLocalGroupCopy.execute({
      groupId: 'g_settled',
      actorId: 'local-user',
      cloudSyncEnabled: false,
    });
    expect(result.groupId).toBe('g_settled');

    const group = await database.get<{ id: string }>('select id from groups where id = ?', [
      'g_settled',
    ]);
    expect(group).toBeNull();

    const after = await database.get<{ count: number }>(
      'select count(*) as count from sync_operations',
    );
    expect(after?.count).toBe(before?.count);

    const audit = await database.get<{ action: string }>(
      "select action from audit_logs where entity_id = 'g_settled' and entity_type = 'group_local_copy'",
    );
    expect(audit?.action).toBe('delete');
  });

  it('refuses to delete a group with outstanding balances', async () => {
    const { services } = await makeServices();
    await seedUnsettledGroup(services, 'g_open');

    await expect(
      services.data.deleteLocalGroupCopy.execute({
        groupId: 'g_open',
        actorId: 'local-user',
        cloudSyncEnabled: false,
      }),
    ).rejects.toThrow(/unsettled balances/i);
  });

  it('refuses when cloud sync is configured (shared record)', async () => {
    const { services } = await makeServices();
    await seedSettledGroup(services, 'g_settled');

    await expect(
      services.data.deleteLocalGroupCopy.execute({
        groupId: 'g_settled',
        actorId: 'local-user',
        cloudSyncEnabled: true,
      }),
    ).rejects.toThrow(/cloud sync/i);
  });
});
