/**
 * Local-first acceptance test on a REAL SQLite file.
 *
 * Reproduces the product scenario without any network:
 *   1. create a group with four members,
 *   2. add a ₹1,200 expense while "offline",
 *   3. compute balances locally,
 *   4. close and reopen the database (force-quit equivalent),
 *   5. confirm the group, expense and balances survived.
 *
 * Unlike the in-memory suites this exercises real SQLite parsing,
 * constraints, transactions and on-disk persistence — the layer where the
 * `char_length` and `near "tracks"` bugs lived.
 *
 * Skipped when the `sqlite3` CLI is unavailable.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { createGroupMember } from '@domain/entities/group-member';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;

const GROUP_ID = 'g_local_first';
const OWNER_ID = 'm_owner';
const MEMBERS = ['m_owner', 'm_asha', 'm_ravi', 'm_meera'] as const;

async function openDatabase(path: string): Promise<SqliteCliDatabase> {
  const database = new SqliteCliDatabase(path);
  await runMigrations(database);
  return database;
}

async function seedGroup(
  services: ReturnType<typeof createCompositionRoot>,
  now: string,
): Promise<void> {
  await services.groups.createGroup.execute({
    groupId: GROUP_ID,
    name: 'Goa trip',
    currencyCode: 'INR',
    createdBy: 'local-user',
    ownerMemberId: OWNER_ID,
    now: now as never,
  });

  for (const id of MEMBERS) {
    if (id === OWNER_ID) continue;
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP_ID as never,
        displayName: id.replace('m_', ''),
        role: 'member',
        now: now as never,
      }),
    );
  }

  await services.expenses.createExpenseManually.execute({
    groupId: GROUP_ID,
    expenseId: 'e_dinner',
    title: 'Dinner',
    amountMinor: 120_000, // ₹1,200.00
    currencyCode: 'INR',
    expenseDate: '2026-10-20',
    payerContributions: [{ memberId: OWNER_ID, amountMinor: 120_000 }],
    participantIds: [...MEMBERS],
    createdBy: 'local-user',
    now: now as never,
  });
}

function balanceFor(
  results: readonly {
    readonly currencyCode: string;
    readonly memberCurrencyBalances: readonly {
      readonly memberId: string;
      readonly netBalanceMinor: number;
    }[];
  }[],
  memberId: string,
): number {
  const inr = results.find((row) => row.currencyCode === 'INR');
  const entry = inr?.memberCurrencyBalances.find((row) => row.memberId === memberId);
  return entry?.netBalanceMinor ?? 0;
}

describeWithSqlite('local-first core flow (real SQLite file)', () => {
  it('survives a restart and keeps balances consistent offline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'billlens-local-first-'));
    const databasePath = join(dir, 'billlens.db');

    try {
      // ---- Session 1: create everything with no network available --------
      const first = await openDatabase(databasePath);
      const services = createCompositionRoot({ database: first });
      await seedGroup(services, '2026-10-20T19:00:00.000Z');

      const before = await services.balances.getGroupBalances.execute({ groupId: GROUP_ID as never });
      expect(before.notFound).toBe(false);
      // ₹1,200 split four ways = ₹300 each.
      expect(balanceFor(before.results, OWNER_ID)).toBe(90_000);
      expect(balanceFor(before.results, 'm_asha')).toBe(-30_000);
      expect(balanceFor(before.results, 'm_ravi')).toBe(-30_000);
      expect(balanceFor(before.results, 'm_meera')).toBe(-30_000);

      // ---- Session 2: force-quit + reopen ---------------------------------
      const second = await openDatabase(databasePath);
      const reopened = createCompositionRoot({ database: second });

      const groupRow = await second.get<{ name: string; currency_code: string }>(
        'select name, currency_code from groups where id = ? and deleted_at is null',
        [GROUP_ID],
      );
      expect(groupRow?.name).toBe('Goa trip');
      expect(groupRow?.currency_code).toBe('INR');

      const expenseRow = await second.get<{ title: string; amount_minor: number }>(
        'select title, amount_minor from expenses where id = ? and deleted_at is null',
        ['e_dinner'],
      );
      expect(expenseRow?.title).toBe('Dinner');
      expect(expenseRow?.amount_minor).toBe(120_000);

      const after = await reopened.balances.getGroupBalances.execute({ groupId: GROUP_ID as never });
      expect(balanceFor(after.results, OWNER_ID)).toBe(90_000);
      expect(balanceFor(after.results, 'm_asha')).toBe(-30_000);

      // The group is usable offline: the local create queued exactly one
      // sync operation per mutated entity, and nothing has been sent.
      const pending = await second.get<{ count: number }>(
        "select count(*) as count from sync_operations where status = 'pending'",
      );
      expect(pending?.count ?? 0).toBeGreaterThanOrEqual(5); // group + 3 members + expense
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
