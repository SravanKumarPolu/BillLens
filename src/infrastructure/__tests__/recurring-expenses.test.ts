/**
 * Recurring expenses over real SQLite.
 *
 * Verifies catch-up, month-end anchors, deterministic ids (no duplicates on
 * retry), pause, and that generated rows are ordinary expenses.
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
const GROUP = 'g_recurring';
const OWNER = 'm_recurring_owner';
const OTHER = 'm_recurring_other';
const USER = 'local-user';

let dir: string;
let db: SqliteCliDatabase;
let services: AppServices;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'billlens-recurring-'));
  db = new SqliteCliDatabase(join(dir, 'recurring.db'));
  await runMigrations(db);
  services = createCompositionRoot({ database: db });
  await services.repositories.groups.save(
    createGroup({
      id: GROUP as never,
      name: 'Rent',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-01-01T00:00:00.000Z' as never,
    }),
  );
  for (const [id, name, role, userId] of [
    [OWNER, 'Owner', 'owner', USER],
    [OTHER, 'Other', 'member', null],
  ] as const) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP as never,
        ...(userId !== null ? { userId: userId as never } : {}),
        displayName: name,
        role: role as never,
        now: '2026-01-01T00:00:00.000Z' as never,
      }),
    );
  }
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('recurring expenses', () => {
  it('creates, catches up month-end occurrences, and is idempotent', async () => {
    const source = await services.expenses.createExpenseManually.execute({
      groupId: GROUP,
      title: 'Rent',
      amountMinor: 100_000,
      currencyCode: 'INR',
      expenseDate: '2026-01-31',
      payerContributions: [{ memberId: OWNER, amountMinor: 100_000 }],
      participantIds: [OWNER, OTHER],
      createdBy: USER,
    });

    const template = await services.recurring.createFromExpense.execute({
      expenseId: source.expenseId,
      frequency: 'monthly',
      startDate: '2026-01-31',
      now: '2026-01-01T00:00:00.000Z',
    });
    expect(template.splits).toHaveLength(2);

    const first = await services.recurring.materializeDue.execute({
      groupIds: [GROUP],
      today: '2026-03-01',
      now: '2026-03-01T00:00:00.000Z',
    });
    expect(first.expensesCreated).toBe(2);

    const rows = await db.all<{ expense_date: string; amount_minor: number }>(
      "select expense_date, amount_minor from expenses where title = 'Rent' and deleted_at is null order by expense_date",
    );
    expect(rows.map((row) => row.expense_date.slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-01-31',
      '2026-02-28',
    ]);

    const second = await services.recurring.materializeDue.execute({
      groupIds: [GROUP],
      today: '2026-03-01',
      now: '2026-03-01T00:05:00.000Z',
    });
    expect(second.expensesCreated).toBe(0);

    const listed = await services.recurring.list.execute([GROUP]);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.nextOccurrenceDate).toBe('2026-03-31');

    await services.recurring.setPaused.execute(template.id, true);
    const paused = await services.recurring.materializeDue.execute({
      groupIds: [GROUP],
      today: '2026-04-30',
    });
    expect(paused.expensesCreated).toBe(0);
  });
});
