import { beforeEach, describe, expect, it } from '@jest/globals';

import type { RemoteSyncPort, ConnectivityPort } from '@application/sync/sync-coordinator-types';
import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { InvalidEntityError } from '@domain/errors';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

/**
 * CreateExpenseManuallyUseCase INTEGRATION tests — the manual
 * expense-form write path, executed end-to-end over the REAL SQLite
 * repository adapters (in-memory driver, real migrations, real
 * composition root).
 *
 * Lives in the INFRASTRUCTURE test tree because it exercises the use
 * case against the concrete adapters + database (the application-layer
 * independence rule forbids `@infrastructure/*` imports inside
 * `src/application/**`).
 *
 * Proves:
 *   1. The happy path persists expense + payers + splits atomically and
 *      the balance engine immediately reflects the write.
 *   2. The split is the DOMAIN equal-split strategy (deterministic
 *      remainder distribution: 1000 / 3 → [334, 333, 333]).
 *   3. Every write co-enqueues its offline-sync operation.
 *   4. An audit entry is appended.
 *   5. Validation rejects every membership / aggregate violation.
 *   6. Retrying with the SAME expenseId does not duplicate the expense.
 */

class StubConnectivity implements ConnectivityPort {
  async isOnline(): Promise<boolean> {
    return true;
  }
  onConnectivityChange(): () => void {
    return () => undefined;
  }
}

class StubRemoteSync implements RemoteSyncPort {
  async uploadOperation(): Promise<{ status: 'success' }> {
    return { status: 'success' };
  }
}

const GROUP_ID = 'g-77777777-1111-4111-8111-777777777777';
const ALICE = 'm-7aaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const BOB = 'm-7bbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const CAROL = 'm-7ccccccc-1111-4111-8111-cccccccccccc';
const LEFT_MEMBER = 'm-7ddddddd-1111-4111-8111-dddddddddddd';
const USER = 'user-alice';
const NOW = '2026-10-01T10:00:00.000Z';

let db: InMemoryDatabase;
let services: AppServices;

beforeEach(async () => {
  db = new InMemoryDatabase();
  await runMigrations(db);
  services = createCompositionRoot({
    database: db,
    connectivity: new StubConnectivity(),
    remoteSync: new StubRemoteSync(),
  });

  await services.repositories.groups.save(
    createGroup({
      id: GROUP_ID as never,
      name: 'Manual Form Group',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: NOW as never,
    }),
  );
  for (const [id, name, role, userId] of [
    [ALICE, 'Alice', 'owner', USER],
    [BOB, 'Bob', 'member', null],
    [CAROL, 'Carol', 'member', null],
  ] as const) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP_ID as never,
        ...(userId !== null ? { userId: userId as never } : {}),
        displayName: name,
        role: role as never,
        now: NOW as never,
      }),
    );
  }
});

function happyInput(overrides?: Record<string, unknown>) {
  return {
    groupId: GROUP_ID,
    title: 'Dinner',
    amountMinor: 1000,
    currencyCode: 'INR',
    expenseDate: '2026-10-01',
    note: 'Curry night',
    payerContributions: [{ memberId: ALICE, amountMinor: 1000 }],
    participantIds: [ALICE, BOB],
    createdBy: USER,
    ...overrides,
  };
}

describe('CreateExpenseManuallyUseCase (over the SQLite adapters)', () => {
  it('persists the aggregate and the balance engine reflects it immediately', async () => {
    const output = await services.expenses.createExpenseManually.execute(happyInput());

    expect(output.groupId).toBe(GROUP_ID);
    expect(output.amountMinor).toBe(1000);
    expect(output.currencyCode).toBe('INR');
    expect(output.splits).toEqual([
      { memberId: ALICE, amountMinor: 500 },
      { memberId: BOB, amountMinor: 500 },
    ]);

    // Round-trip: the expense + payers + splits are all persisted.
    const expense = await services.repositories.expenses.findById(
      output.expenseId as never,
    );
    expect(expense?.title).toBe('Dinner');
    expect(expense?.splitType).toBe('equal');
    expect(expense?.note).toBe('Curry night');
    const payers = await services.repositories.expenses.listPayers(output.expenseId as never);
    expect(payers.map((p) => p.memberId)).toEqual([ALICE]);
    const splits = await services.repositories.expenses.listSplits(output.expenseId as never);
    expect(splits.map((s) => s.amountMinor).sort((a, b) => a - b)).toEqual([500, 500]);

    // Date-only input normalised to midnight UTC.
    expect(expense?.expenseDate).toBe('2026-10-01T00:00:00.000Z');

    // The balance engine sees the write: Alice +500 / Bob −500.
    const balances = await services.balances.getGroupBalances.execute({
      groupId: GROUP_ID as never,
    });
    const inr = balances.results[0];
    expect(inr?.memberCurrencyBalances.find((m) => m.memberId === ALICE)?.netBalanceMinor).toBe(500);
    expect(inr?.memberCurrencyBalances.find((m) => m.memberId === BOB)?.netBalanceMinor).toBe(-500);
  });

  it('distributes uneven splits deterministically (1000 / 3 → 334, 333, 333)', async () => {
    const output = await services.expenses.createExpenseManually.execute(
      happyInput({ participantIds: [ALICE, BOB, CAROL] }),
    );
    expect(output.splits).toEqual([
      { memberId: ALICE, amountMinor: 334 },
      { memberId: BOB, amountMinor: 333 },
      { memberId: CAROL, amountMinor: 333 },
    ]);

    // The invariant the aggregate validator enforces: sum = total.
    const sum = output.splits.reduce((acc, s) => acc + s.amountMinor, 0);
    expect(sum).toBe(1000);
  });

  it('co-enqueues the offline-sync operation and appends the audit entry', async () => {
    const output = await services.expenses.createExpenseManually.execute(happyInput());

    const ops = await db.all<Record<string, unknown>>(
      `select entity_type, operation, idempotency_key from sync_operations where entity_id = ?`,
      [output.expenseId],
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]?.['entity_type']).toBe('expense');
    expect(ops[0]?.['operation']).toBe('create');

    const auditEntries = await services.repositories.audit.listByEntity(
      'expense',
      output.expenseId,
    );
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]?.action).toBe('create');
    expect(auditEntries[0]?.groupId).toBe(GROUP_ID);
    expect(auditEntries[0]?.changeSummary).toMatchObject({ source: 'manual_form' });
  });

  it('retrying with the SAME expenseId does not duplicate the expense', async () => {
    const expenseId = 'e-77777777-1111-4111-8111-777777777777';
    const first = await services.expenses.createExpenseManually.execute(
      happyInput({ expenseId }),
    );
    expect(first.expenseId).toBe(expenseId);

    // A crash between save and navigation → the user submits again with
    // the same client-generated id → upsert, not a duplicate.
    await services.expenses.createExpenseManually.execute(happyInput({ expenseId }));

    const count = await db.get<Record<string, unknown>>(
      `select count(*) as cnt from expenses where id = ?`,
      [expenseId],
    );
    expect(count?.['cnt']).toBe(1);
    const splits = await services.repositories.expenses.listSplits(expenseId as never);
    expect(splits).toHaveLength(2);
  });

  it('supports multiple payers whose contributions sum to the total', async () => {
    const output = await services.expenses.createExpenseManually.execute(
      happyInput({
        payerContributions: [
          { memberId: ALICE, amountMinor: 600 },
          { memberId: BOB, amountMinor: 400 },
        ],
      }),
    );
    const payers = await services.repositories.expenses.listPayers(output.expenseId as never);
    expect(payers.map((p) => p.amountMinor).sort((a, b) => a - b)).toEqual([400, 600]);
  });

  // -------------------------------------------------------------------
  // Validation rejections
  // -------------------------------------------------------------------

  it('rejects an unknown group', async () => {
    await expect(
      services.expenses.createExpenseManually.execute(happyInput({ groupId: 'g-nope' })),
    ).rejects.toThrow(InvalidEntityError);
  });

  it('rejects a payer who is not an active member', async () => {
    await expect(
      services.expenses.createExpenseManually.execute(
        happyInput({ payerContributions: [{ memberId: 'm-stranger', amountMinor: 1000 }] }),
      ),
    ).rejects.toThrow('not an active member');
  });

  it('rejects a participant who is not an active member', async () => {
    await expect(
      services.expenses.createExpenseManually.execute(
        happyInput({ participantIds: [ALICE, 'm-stranger'] }),
      ),
    ).rejects.toThrow('not an active member');
  });

  it('rejects duplicate participants', async () => {
    await expect(
      services.expenses.createExpenseManually.execute(
        happyInput({ participantIds: [ALICE, ALICE] }),
      ),
    ).rejects.toThrow('Duplicate participant');
  });

  it('rejects an empty participant list', async () => {
    await expect(
      services.expenses.createExpenseManually.execute(happyInput({ participantIds: [] })),
    ).rejects.toThrow('At least one participant');
  });

  it('rejects payer contributions that do not sum to the total', async () => {
    await expect(
      services.expenses.createExpenseManually.execute(
        happyInput({ payerContributions: [{ memberId: ALICE, amountMinor: 900 }] }),
      ),
    ).rejects.toThrow('must equal the expense total');
  });

  it('rejects an unparseable expense date', async () => {
    await expect(
      services.expenses.createExpenseManually.execute(
        happyInput({ expenseDate: 'not-a-date' }),
      ),
    ).rejects.toThrow('not parseable');
  });
});

// ---------------------------------------------------------------------------
// ListRecentExpensesForGroupUseCase — the group home read path
// ---------------------------------------------------------------------------

describe('ListRecentExpensesForGroupUseCase', () => {
  it('lists newest-first with payer names and participant counts', async () => {
    await services.expenses.createExpenseManually.execute(
      happyInput({ title: 'Older', expenseDate: '2026-10-01' }),
    );
    await services.expenses.createExpenseManually.execute(
      happyInput({
        title: 'Newer',
        expenseDate: '2026-10-05',
        participantIds: [ALICE, BOB, CAROL],
      }),
    );

    const result = await services.expenses.listRecentExpenses.execute({
      groupId: GROUP_ID,
      limit: 10,
    });
    expect(result.entries).toHaveLength(2);
    // Newest expense_date first.
    expect(result.entries[0]?.title).toBe('Newer');
    expect(result.entries[0]?.payerName).toBe('Alice');
    expect(result.entries[0]?.participantCount).toBe(3);
    expect(result.entries[1]?.title).toBe('Older');
    expect(result.entries[1]?.participantCount).toBe(2);
    expect(result.hasMore).toBe(false);
  });

  it('paginates with the numeric-offset cursor', async () => {
    await services.expenses.createExpenseManually.execute(
      happyInput({ title: 'A', expenseDate: '2026-10-01' }),
    );
    await services.expenses.createExpenseManually.execute(
      happyInput({ title: 'B', expenseDate: '2026-10-02' }),
    );

    const firstPage = await services.expenses.listRecentExpenses.execute({
      groupId: GROUP_ID,
      limit: 1,
    });
    expect(firstPage.entries.map((e) => e.title)).toEqual(['B']);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBe('1');

    const secondPage = await services.expenses.listRecentExpenses.execute({
      groupId: GROUP_ID,
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.entries.map((e) => e.title)).toEqual(['A']);
    expect(secondPage.hasMore).toBe(false);
  });

  it('throws for an unknown group', async () => {
    await expect(
      services.expenses.listRecentExpenses.execute({ groupId: 'g-nope', limit: 10 }),
    ).rejects.toThrow(InvalidEntityError);
  });
});

// ---------------------------------------------------------------------------
// ListGroupMembersUseCase — the form's member picker read path
// ---------------------------------------------------------------------------

describe('ListGroupMembersUseCase', () => {
  it('returns the group header plus ACTIVE members only', async () => {
    // A member who left (leftAt set) must NOT appear in the picker.
    const left = createGroupMember({
      id: LEFT_MEMBER as never,
      groupId: GROUP_ID as never,
      displayName: 'Dave',
      role: 'member' as never,
      now: NOW as never,
    });
    await services.repositories.members.save({ ...left, leftAt: (NOW as never) });

    const result = await services.groups.listGroupMembers.execute(GROUP_ID);
    expect(result.groupName).toBe('Manual Form Group');
    expect(result.currencyCode).toBe('INR');
    expect(result.members.map((m) => m.displayName)).toEqual(['Alice', 'Bob', 'Carol']);
    expect(result.members.find((m) => m.displayName === 'Alice')?.isRegisteredUser).toBe(true);
    expect(result.members.find((m) => m.displayName === 'Bob')?.isRegisteredUser).toBe(false);
  });

  it('throws for an unknown group', async () => {
    await expect(services.groups.listGroupMembers.execute('g-nope')).rejects.toThrow(
      InvalidEntityError,
    );
  });
});
