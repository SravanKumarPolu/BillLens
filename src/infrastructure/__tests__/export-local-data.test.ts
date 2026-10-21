/**
 * Export use case tests (offline data portability).
 *
 * Runs over the in-memory database + real composition root so the
 * repository reads and entity mapping are the production ones.
 */

import { describe, expect, it } from '@jest/globals';

import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

const GROUP_ID = 'g_export';
const OWNER = 'm_export_owner';

async function seed(): Promise<ReturnType<typeof createCompositionRoot>> {
  const database = new InMemoryDatabase();
  await runMigrations(database);
  const services = createCompositionRoot({ database, appVersion: '2.7.1' });

  await services.groups.createGroup.execute({
    groupId: GROUP_ID,
    name: 'Export trip',
    currencyCode: 'INR',
    createdBy: 'local-user',
    ownerMemberId: OWNER,
  });
  await services.repositories.members.save(
    createGroupMember({
      id: 'm_export_friend' as never,
      groupId: GROUP_ID as never,
      displayName: 'Asha',
      role: 'member',
    }),
  );
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP_ID,
    expenseId: 'e_export_dinner',
    title: 'Dinner',
    amountMinor: 120_000,
    currencyCode: 'INR',
    expenseDate: '2026-10-20',
    payerContributions: [{ memberId: OWNER, amountMinor: 120_000 }],
    participantIds: [OWNER, 'm_export_friend'],
    createdBy: 'local-user',
  });
  return services;
}

describe('ExportLocalDataUseCase', () => {
  it('exports a versioned JSON backup and an accounting CSV', async () => {
    const services = await seed();

    const exported = await services.data.exportLocalData.execute({ groupIds: [GROUP_ID] });

    expect(exported.schemaVersion).toBe(1);
    expect(exported.appVersion).toBe('2.7.1');
    expect(exported.truncated).toBe(false);
    expect(exported.counts).toEqual({ groups: 1, members: 2, expenses: 1, settlements: 0 });

    const parsed = JSON.parse(exported.json) as {
      schemaVersion: number;
      groups: { name: string; members: unknown[]; expenses: { amountMinor: number }[] }[];
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.groups[0]?.name).toBe('Export trip');
    expect(parsed.groups[0]?.members).toHaveLength(2);
    expect(parsed.groups[0]?.expenses[0]?.amountMinor).toBe(120_000);

    // CSV reuses the domain exporter: RFC 4180 quoting + major units.
    expect(exported.csv.split('\n')[0]).toBe('"date","amount","currency","description","category"');
    expect(exported.csv).toContain('"2026-10-20","1200.00","INR","Dinner"');
  });

  it('never includes receipt images, tokens or raw OCR text', async () => {
    const services = await seed();
    const exported = await services.data.exportLocalData.execute({ groupIds: [GROUP_ID] });

    for (const forbidden of ['receiptId', 'captureSourceId', 'access_token', 'extractionResultId']) {
      expect(exported.json).not.toContain(forbidden);
    }
  });

  it('skips missing and deleted groups instead of failing the export', async () => {
    const services = await seed();
    const exported = await services.data.exportLocalData.execute({
      groupIds: [GROUP_ID, 'g_missing'],
    });
    expect(exported.counts.groups).toBe(1);
  });
});
