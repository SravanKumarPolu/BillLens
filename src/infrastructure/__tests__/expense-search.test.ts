/**
 * Expense search over the real repository graph.
 *
 * Covers group scoping, free text (including literal LIKE wildcards),
 * date/amount bounds and pagination. Uses the in-memory SQL double so the
 * assertions stay fast; the SQL adapter itself is exercised through it.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const GROUP_A = 'g_search_a';
const GROUP_B = 'g_search_b';
const OWNER_A = 'm_search_a_owner';
const OWNER_B = 'm_search_b_owner';
const USER = 'local-user';

let services: AppServices;
let dir: string;

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;

async function seedGroup(groupId: string, name: string, ownerId: string): Promise<void> {
  await services.repositories.groups.save(
    createGroup({
      id: groupId as never,
      name,
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-10-01T10:00:00.000Z' as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: ownerId as never,
      groupId: groupId as never,
      userId: USER as never,
      displayName: 'Owner',
      role: 'owner',
      now: '2026-10-01T10:00:00.000Z' as never,
    }),
  );
}

async function addExpense(
  groupId: string,
  ownerId: string,
  title: string,
  amountMinor: number,
  date: string,
  note?: string,
): Promise<void> {
  await services.expenses.createExpenseManually.execute({
    groupId,
    title,
    amountMinor,
    currencyCode: 'INR',
    expenseDate: date,
    ...(note !== undefined ? { note } : {}),
    payerContributions: [{ memberId: ownerId, amountMinor }],
    participantIds: [ownerId],
    createdBy: USER,
  });
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'billlens-search-'));
  const database = new SqliteCliDatabase(join(dir, 'search.db'));
  await runMigrations(database);
  services = createCompositionRoot({ database });
  await seedGroup(GROUP_A, 'Goa Trip', OWNER_A);
  await seedGroup(GROUP_B, 'Flat', OWNER_B);
  await addExpense(GROUP_A, OWNER_A, 'Dinner', 1000, '2026-10-01', 'Curry night');
  await addExpense(GROUP_A, OWNER_A, 'Metro card', 50000, '2026-09-15');
  await addExpense(GROUP_B, OWNER_B, 'Dinner at home', 2500, '2026-10-05', 'Groceries');
  await addExpense(GROUP_B, OWNER_B, '100% deposit', 100000, '2026-08-01');
});

describeWithSqlite('SearchExpensesUseCase', () => {
  it('matches title and note case-insensitively and returns the group name', async () => {
    const result = await services.expenses.searchExpenses.execute({
      groupIds: [GROUP_A as never],
      text: 'curry',
    });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.expense.title).toBe('Dinner');
    expect(result.hits[0]?.groupName).toBe('Goa Trip');
  });

  it('scopes results to visible groups', async () => {
    const result = await services.expenses.searchExpenses.execute({
      groupIds: [GROUP_B as never],
      text: 'dinner',
    });
    expect(result.hits.map((hit) => hit.expense.title)).toEqual(['Dinner at home']);
  });

  it('applies date and amount bounds', async () => {
    const result = await services.expenses.searchExpenses.execute({
      groupIds: [GROUP_A as never],
      fromDate: '2026-09-01',
      toDate: '2026-10-02',
      minAmountMinor: 2000,
    });
    expect(result.hits.map((hit) => hit.expense.title)).toEqual(['Metro card']);
  });

  it('treats % and _ as literal characters, not wildcards', async () => {
    const percent = await services.expenses.searchExpenses.execute({
      groupIds: [GROUP_B as never],
      text: '%',
    });
    expect(percent.hits.map((hit) => hit.expense.title)).toEqual(['100% deposit']);

    const underscore = await services.expenses.searchExpenses.execute({
      groupIds: [GROUP_B as never],
      text: '_',
    });
    expect(underscore.hits).toHaveLength(0);
  });

  it('paginates with a bounded page size', async () => {
    const first = await services.expenses.searchExpenses.execute({
      groupIds: [GROUP_A as never, GROUP_B as never],
      limit: 2,
    });
    expect(first.hits).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    const second = await services.expenses.searchExpenses.execute({
      groupIds: [GROUP_A as never, GROUP_B as never],
      limit: 2,
      offset: 2,
    });
    expect(second.hits).toHaveLength(2);
    expect(second.hasMore).toBe(false);
  });

  it('returns no rows when the caller has no groups', async () => {
    const result = await services.expenses.searchExpenses.execute({ groupIds: [] });
    expect(result).toEqual({ hits: [], hasMore: false });
  });

  it('rejects an inverted date range', async () => {
    await expect(
      services.expenses.searchExpenses.execute({
        groupIds: [GROUP_A as never],
        fromDate: '2026-10-10',
        toDate: '2026-10-01',
      }),
    ).rejects.toThrow(/Start date/);
  });
});
