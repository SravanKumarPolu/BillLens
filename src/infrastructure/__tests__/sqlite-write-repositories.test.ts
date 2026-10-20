import { beforeEach, describe, expect, it } from '@jest/globals';

import { createDraftCharge } from '@domain/entities/draft-charge';
import { createDraftLineItem } from '@domain/entities/draft-line-item';
import { createExpense } from '@domain/entities/expense';
import { createExpenseDraft } from '@domain/entities/expense-draft';
import { createExpensePayer } from '@domain/entities/expense-payer';
import { createExpenseSplit } from '@domain/entities/expense-split';
import { createFieldReviewIssue } from '@domain/entities/field-review-issue';
import { createGroup, updateGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';

import { runMigrations } from '../sqlite/schema';
import { SqliteExpenseDraftRepository } from '../sqlite/sqlite-expense-draft-repository';
import { SqliteExpenseRepository } from '../sqlite/sqlite-expense-repository';
import { SqliteGroupMemberRepository } from '../sqlite/sqlite-group-member-repository';
import { SqliteGroupRepository } from '../sqlite/sqlite-group-repository';

import { InMemoryDatabase } from './in-memory-database';

/**
 * Write-side repository adapter tests.
 *
 * Every adapter runs against the in-memory database seeded through the
 * REAL migration runner — the same statements the production expo-sqlite
 * driver executes. Round-trip, atomicity, pagination and sync-op
 * co-write behaviour are therefore proven at the SQL layer, with only
 * the driver differing from production.
 */

const NOW_A = '2026-10-01T10:00:00.000Z';
const NOW_B = '2026-10-02T10:00:00.000Z';
const NOW_C = '2026-10-03T10:00:00.000Z';

let db: InMemoryDatabase;
let groups: SqliteGroupRepository;
let members: SqliteGroupMemberRepository;
let expenses: SqliteExpenseRepository;
let drafts: SqliteExpenseDraftRepository;

beforeEach(async () => {
  db = new InMemoryDatabase();
  await runMigrations(db);
  groups = new SqliteGroupRepository(db);
  members = new SqliteGroupMemberRepository(db);
  expenses = new SqliteExpenseRepository(db);
  drafts = new SqliteExpenseDraftRepository(db);
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGroup(overrides?: { id?: string; name?: string; currency?: string; now?: string }) {
  return createGroup({
    id: (overrides?.id ?? 'g-10000000-0000-4000-8000-000000000001') as never,
    name: overrides?.name ?? 'Goa Trip',
    currencyCode: overrides?.currency ?? 'INR',
    createdBy: 'user-alice' as never,
    now: (overrides?.now ?? NOW_A) as never,
  });
}

function makeOwner(groupId: string, now = NOW_A, id = 'm-10000000-0000-4000-8000-000000000001') {
  return createGroupMember({
    id: id as never,
    groupId: groupId as never,
    userId: 'user-alice' as never,
    displayName: 'Alice',
    role: 'owner',
    now: now as never,
  });
}

function makeGuest(groupId: string, id: string, name: string, now = NOW_A) {
  return createGroupMember({
    id: id as never,
    groupId: groupId as never,
    displayName: name,
    role: 'member',
    now: now as never,
  });
}

interface ExpenseFixture {
  expense: ReturnType<typeof createExpense>;
  payers: ReturnType<typeof createExpensePayer>[];
  splits: ReturnType<typeof createExpenseSplit>[];
}

/** 10.00 INR paid by the owner, split equally owner/guest. */
function makeExpense(
  groupId: string,
  ownerId: string,
  guestId: string,
  overrides?: { id?: string; amountMinor?: number; now?: string; date?: string },
): ExpenseFixture {
  const amount = overrides?.amountMinor ?? 1000;
  const expense = createExpense({
    id: (overrides?.id ?? 'e-10000000-0000-4000-8000-000000000001') as never,
    groupId: groupId as never,
    title: 'Dinner',
    amountMinor: amount,
    currencyCode: 'INR',
    expenseDate: overrides?.date ?? '2026-10-01T18:30:00.000Z',
    splitType: 'equal',
    createdBy: 'user-alice' as never,
    now: (overrides?.now ?? NOW_A) as never,
  });
  const payers = [
    createExpensePayer({
      id: 'p-10000000-0000-4000-8000-000000000001' as never,
      expenseId: expense.id,
      memberId: ownerId as never,
      amountMinor: amount,
      now: expense.createdAt,
    }),
  ];
  const half = amount / 2;
  const splits = [
    createExpenseSplit({
      id: 's-10000000-0000-4000-8000-000000000001' as never,
      expenseId: expense.id,
      memberId: ownerId as never,
      amountMinor: half,
      now: expense.createdAt,
    }),
    createExpenseSplit({
      id: 's-10000000-0000-4000-8000-000000000002' as never,
      expenseId: expense.id,
      memberId: guestId as never,
      amountMinor: amount - half,
      now: expense.createdAt,
    }),
  ];
  return { expense, payers, splits };
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

describe('SqliteGroupRepository', () => {
  it('round-trips a group through save → findById with every column', async () => {
    const group = makeGroup({ name: 'Manali Trek' });
    await groups.save(group);

    const loaded = await groups.findById(group.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(group.id);
    expect(loaded?.name).toBe('Manali Trek');
    expect(loaded?.currencyCode).toBe('INR');
    expect(loaded?.createdBy).toBe('user-alice');
    expect(loaded?.createdAt).toBe(NOW_A);
    expect(loaded?.updatedAt).toBe(NOW_A);
    expect(loaded?.deletedAt).toBeUndefined();
    expect(loaded?.version).toBe(1);
  });

  it('updates in place on re-save (no duplicate row) and enqueues update ops', async () => {
    const original = makeGroup();
    await groups.save(original);

    const renamed = updateGroup(original, {
      name: 'Goa Trip 2027',
      now: NOW_B as never,
      expectedVersion: original.version,
    });
    await groups.save(renamed);

    const count = await db.get<Record<string, unknown>>(
      `select count(*) as cnt from groups where id = ?`,
      [original.id],
    );
    expect(count?.['cnt']).toBe(1);
    const loaded = await groups.findById(original.id);
    expect(loaded?.name).toBe('Goa Trip 2027');
    expect(loaded?.version).toBe(2);

    const ops = await db.all<Record<string, unknown>>(
      `select * from sync_operations where entity_type = 'group' order by created_at asc`,
    );
    expect(ops.map((o) => o['operation'])).toEqual(['create', 'update']);
  });

  it('soft-deletes, excludes from active listings, and replays idempotently', async () => {
    const group = makeGroup();
    await groups.save(group);
    await members.save(makeOwner(group.id as string));

    const result = await groups.softDelete(group.id, {
      actorId: 'user-alice' as never,
      deletedAt: NOW_B as never,
      reason: 'cleanup',
    });
    expect(result.id).toBe(group.id);
    expect(result.deletedAt).toBe(NOW_B);
    expect(result.version).toBe(2);

    // Idempotent replay returns the existing tombstone.
    const replay = await groups.softDelete(group.id, {
      actorId: 'user-alice' as never,
      deletedAt: NOW_C as never,
    });
    expect(replay.deletedAt).toBe(NOW_B);
    expect(replay.version).toBe(2);

    expect(await groups.findById(group.id)).not.toBeNull(); // row preserved
    const byCurrency = await groups.listByCurrency('INR' as never, { limit: 10 });
    expect(byCurrency.items).toHaveLength(0); // excluded from active listing
  });

  it('throws NOT_FOUND when soft-deleting an unknown group', async () => {
    await expect(
      groups.softDelete('g-does-not-exist' as never, {
        actorId: 'user-alice' as never,
        deletedAt: NOW_B as never,
      }),
    ).rejects.toThrow('not found');
  });

  it('listByUser returns only groups with an active membership', async () => {
    const g1 = makeGroup({ id: 'g-20000000-0000-4000-8000-000000000001' as never });
    const g2 = makeGroup({
      id: 'g-20000000-0000-4000-8000-000000000002' as never,
      name: 'Second',
      now: NOW_B,
    });
    const g3 = makeGroup({
      id: 'g-20000000-0000-4000-8000-000000000003' as never,
      name: 'Deleted later',
      now: NOW_B,
    });
    await groups.save(g1);
    await groups.save(g2);
    await groups.save(g3);

    // g1: active membership for user-alice.
    await members.save(makeOwner(g1.id as string));
    // g2: only a placeholder member without a user_id → not "the user's".
    await members.save(makeGuest(g2.id as string, 'm-20000000-0000-4000-8000-000000000002' as never, 'Bob', NOW_B));
    // g3: active membership, but the group itself is soft-deleted.
    await members.save(makeOwner(g3.id as string, NOW_B, 'm-20000000-0000-4000-8000-000000000003'));
    await groups.softDelete(g3.id, { actorId: 'user-alice' as never, deletedAt: NOW_C as never });

    const page = await groups.listByUser('user-alice' as never, { limit: 10 });
    expect(page.items.map((g) => g.id)).toEqual([g1.id]);
    expect(page.hasMore).toBe(false);
  });

  it('paginates listByCurrency with numeric-offset cursors', async () => {
    for (let i = 1; i <= 3; i++) {
      const group = makeGroup({
        id: `g-30000000-0000-4000-8000-00000000000${i}` as never,
        name: `Group ${i}`,
        now: i === 1 ? NOW_A : i === 2 ? NOW_B : NOW_C,
      });
      await groups.save(group);
    }

    const page1 = await groups.listByCurrency('INR' as never, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe('2');

    const page2 = await groups.listByCurrency('INR' as never, { limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBeUndefined();

    // Newest-activity ordering.
    expect(page1.items[0]?.name).toBe('Group 3');
    expect(page1.items[1]?.name).toBe('Group 2');
  });
});

// ---------------------------------------------------------------------------
// Group members
// ---------------------------------------------------------------------------

describe('SqliteGroupMemberRepository', () => {
  it('round-trips a member and answers the active/owner queries', async () => {
    const group = makeGroup();
    await groups.save(group);
    const owner = makeOwner(group.id as string);
    const guest = makeGuest(group.id as string, 'm-20000000-0000-4000-8000-000000000002' as never, 'Bob');
    await members.save(owner);
    await members.save(guest);

    expect(await members.findById(owner.id)).not.toBeNull();
    expect(await members.findActiveByGroupAndUser(group.id, 'user-alice' as never)?.then((m) => m?.id)).toBe(owner.id);
    expect(await members.findActiveByGroupAndUser(group.id, 'user-nobody' as never)).toBeNull();

    const active = await members.listActiveByGroup(group.id);
    expect(active.map((m) => m.displayName)).toEqual(['Alice', 'Bob']);

    const ownerRow = await members.findActiveOwner(group.id);
    expect(ownerRow?.id).toBe(owner.id);
    expect(ownerRow?.role).toBe('owner');
  });

  it('updateRole bumps version, no-ops on same role, rejects left members', async () => {
    const group = makeGroup();
    await groups.save(group);
    const guest = makeGuest(group.id as string, 'm-20000000-0000-4000-8000-000000000003' as never, 'Bob');
    await members.save(guest);

    const promoted = await members.updateRole(guest.id, 'admin');
    expect(promoted.role).toBe('admin');
    expect(promoted.version).toBe(2);

    const same = await members.updateRole(guest.id, 'admin');
    expect(same.version).toBe(2); // no-op: no spurious bump

    await members.softDelete(guest.id, { actorId: 'user-alice' as never, deletedAt: NOW_B as never });
    await expect(members.updateRole(guest.id, 'member')).rejects.toThrow('left');
  });

  it('softDelete sets left_at, keeps history in listAllByGroup, replays idempotently', async () => {
    const group = makeGroup();
    await groups.save(group);
    const owner = makeOwner(group.id as string);
    await members.save(owner);

    const result = await members.softDelete(owner.id, {
      actorId: 'user-alice' as never,
      deletedAt: NOW_B as never,
    });
    expect(result.version).toBe(2);

    const active = await members.listActiveByGroup(group.id);
    expect(active).toHaveLength(0);
    const all = await members.listAllByGroup(group.id, { limit: 10 });
    expect(all.items).toHaveLength(1); // history preserved

    const replay = await members.softDelete(owner.id, {
      actorId: 'user-alice' as never,
      deletedAt: NOW_C as never,
    });
    expect(replay.deletedAt).toBe(NOW_B);
  });
});

// ---------------------------------------------------------------------------
// Expenses (atomic aggregate)
// ---------------------------------------------------------------------------

describe('SqliteExpenseRepository', () => {
  it('saves the aggregate atomically and reads it back with payers and splits', async () => {
    const group = makeGroup();
    await groups.save(group);
    const owner = makeOwner(group.id as string);
    const guest = makeGuest(group.id as string, 'm-30000000-0000-4000-8000-000000000002' as never, 'Bob');
    await members.save(owner);
    await members.save(guest);

    const fixture = makeExpense(group.id as string, owner.id as string, guest.id as string);
    await expenses.save(fixture.expense, fixture.payers, fixture.splits);

    const loaded = await expenses.findById(fixture.expense.id);
    expect(loaded?.title).toBe('Dinner');
    expect(loaded?.amountMinor).toBe(1000);
    expect(loaded?.splitType).toBe('equal');

    const payers = await expenses.listPayers(fixture.expense.id);
    expect(payers).toHaveLength(1);
    expect(payers[0]?.amountMinor).toBe(1000);

    const splits = await expenses.listSplits(fixture.expense.id);
    expect(splits.map((s) => s.amountMinor).sort()).toEqual([500, 500]);
  });

  it('REPLACES payers and splits on re-save (full replacement semantics)', async () => {
    const group = makeGroup();
    await groups.save(group);
    const owner = makeOwner(group.id as string);
    const guest = makeGuest(group.id as string, 'm-30000000-0000-4000-8000-000000000003' as never, 'Bob');
    await members.save(owner);
    await members.save(guest);

    const fixture = makeExpense(group.id as string, owner.id as string, guest.id as string);
    await expenses.save(fixture.expense, fixture.payers, fixture.splits);

    // Re-save with the guest as a second payer and only one split.
    const payers2 = [
      createExpensePayer({
        id: 'p-30000000-0000-4000-8000-000000000002' as never,
        expenseId: fixture.expense.id,
        memberId: owner.id,
        amountMinor: 600,
        now: NOW_B as never,
      }),
      createExpensePayer({
        id: 'p-30000000-0000-4000-8000-000000000003' as never,
        expenseId: fixture.expense.id,
        memberId: guest.id,
        amountMinor: 400,
        now: NOW_B as never,
      }),
    ];
    const splits2 = [
      createExpenseSplit({
        id: 's-30000000-0000-4000-8000-000000000003' as never,
        expenseId: fixture.expense.id,
        memberId: owner.id,
        amountMinor: 1000,
        now: NOW_B as never,
      }),
    ];
    await expenses.save(fixture.expense, payers2, splits2);

    const payers = await expenses.listPayers(fixture.expense.id);
    expect(payers.map((p) => p.memberId)).toEqual([owner.id, guest.id]);
    const splits = await expenses.listSplits(fixture.expense.id);
    expect(splits).toHaveLength(1);
    expect(splits[0]?.amountMinor).toBe(1000);
  });

  it('rolls back the whole aggregate when any statement fails', async () => {
    const group = makeGroup();
    await groups.save(group);
    const owner = makeOwner(group.id as string);
    const guest = makeGuest(group.id as string, 'm-30000000-0000-4000-8000-000000000004' as never, 'Bob');
    await members.save(owner);
    await members.save(guest);

    const fixture = makeExpense(group.id as string, owner.id as string, guest.id as string);

    // Sabotage the 3rd split insert inside the transaction.
    const originalRun = db.run.bind(db);
    let splitInserts = 0;
    const sabotagedRun = async (sql: string, params?: readonly unknown[]) => {
      if (typeof sql === 'string' && sql.includes('insert into expense_splits')) {
        splitInserts++;
        if (splitInserts === 2) throw new Error('sabotaged split insert');
      }
      return originalRun(sql as string, params as never);
    };
    (db as unknown as { run: typeof db.run }).run = sabotagedRun as typeof db.run;

    await expect(
      expenses.save(fixture.expense, fixture.payers, fixture.splits),
    ).rejects.toThrow('sabotaged split insert');

    (db as unknown as { run: typeof db.run }).run = originalRun;

    // Nothing survived: no expense, no payers, no splits, no sync op.
    expect(await expenses.findById(fixture.expense.id)).toBeNull();
    expect(await db.get<Record<string, unknown>>(
      `select count(*) as cnt from expense_payers`,
    )?.then((r) => r?.['cnt'])).toBe(0);
    const splitsCount = await db.get<Record<string, unknown>>(
      `select count(*) as cnt from expense_splits`,
    );
    expect(splitsCount?.['cnt']).toBe(0);
    const syncCount = await db.get<Record<string, unknown>>(
      `select count(*) as cnt from sync_operations where entity_type = 'expense'`,
    );
    expect(syncCount?.['cnt']).toBe(0);
  });

  it('soft-deletes, excludes from listByGroup, and counts payers on active expenses only', async () => {
    const group = makeGroup();
    await groups.save(group);
    const owner = makeOwner(group.id as string);
    const guest = makeGuest(group.id as string, 'm-30000000-0000-4000-8000-000000000005' as never, 'Bob');
    await members.save(owner);
    await members.save(guest);

    const kept = makeExpense(group.id as string, owner.id as string, guest.id as string, {
      id: 'e-30000000-0000-4000-8000-000000000002' as never,
    });
    const deleted = makeExpense(group.id as string, owner.id as string, guest.id as string, {
      id: 'e-30000000-0000-4000-8000-000000000003' as never,
    });
    await expenses.save(kept.expense, kept.payers, kept.splits);
    await expenses.save(deleted.expense, deleted.payers, deleted.splits);

    const page = await expenses.listByGroup(group.id, { limit: 10 });
    expect(page.items).toHaveLength(2);

    await expenses.softDelete(deleted.expense.id, {
      actorId: 'user-alice' as never,
      deletedAt: NOW_B as never,
    });

    const page2 = await expenses.listByGroup(group.id, { limit: 10 });
    expect(page2.items.map((e) => e.id)).toEqual([kept.expense.id]);

    // Owner paid both expenses but only the active one counts.
    expect(await expenses.countByPayer(owner.id)).toBe(1);

    // Idempotent replay.
    const replay = await expenses.softDelete(deleted.expense.id, {
      actorId: 'user-alice' as never,
      deletedAt: NOW_C as never,
    });
    expect(replay.deletedAt).toBe(NOW_B);
  });

  it('listUpdatedSince returns strictly-newer expenses in ascending order', async () => {
    const group = makeGroup();
    await groups.save(group);
    const owner = makeOwner(group.id as string);
    const guest = makeGuest(group.id as string, 'm-30000000-0000-4000-8000-000000000006' as never, 'Bob');
    await members.save(owner);
    await members.save(guest);

    const e1 = makeExpense(group.id as string, owner.id as string, guest.id as string, {
      id: 'e-30000000-0000-4000-8000-000000000004' as never,
      now: NOW_A,
    });
    const e2 = makeExpense(group.id as string, owner.id as string, guest.id as string, {
      id: 'e-30000000-0000-4000-8000-000000000005' as never,
      now: NOW_B,
    });
    await expenses.save(e1.expense, e1.payers, e1.splits);
    await expenses.save(e2.expense, e2.payers, e2.splits);

    const delta = await expenses.listUpdatedSince(group.id, NOW_A as never, { limit: 10 });
    expect(delta.items.map((e) => e.id)).toEqual([e2.expense.id]);
  });

  it('listByReceipt finds expenses linked to a receipt', async () => {
    const group = makeGroup();
    await groups.save(group);
    const owner = makeOwner(group.id as string);
    const guest = makeGuest(group.id as string, 'm-30000000-0000-4000-8000-000000000007' as never, 'Bob');
    await members.save(owner);
    await members.save(guest);

    const fixture = makeExpense(group.id as string, owner.id as string, guest.id as string);
    const withReceipt = createExpense({
      id: 'e-30000000-0000-4000-8000-000000000006' as never,
      groupId: group.id,
      title: 'With receipt',
      amountMinor: 500,
      currencyCode: 'INR',
      expenseDate: '2026-10-01T18:30:00.000Z',
      splitType: 'equal',
      receiptId: 'r-10000000-0000-4000-8000-000000000001' as never,
      createdBy: 'user-alice' as never,
      now: NOW_A as never,
    });
    const payers = [
      createExpensePayer({
        id: 'p-30000000-0000-4000-8000-000000000004' as never,
        expenseId: withReceipt.id,
        memberId: owner.id,
        amountMinor: 500,
        now: withReceipt.createdAt,
      }),
    ];
    const splits = [
      createExpenseSplit({
        id: 's-30000000-0000-4000-8000-000000000004' as never,
        expenseId: withReceipt.id,
        memberId: owner.id,
        amountMinor: 250,
        now: withReceipt.createdAt,
      }),
      createExpenseSplit({
        id: 's-30000000-0000-4000-8000-000000000005' as never,
        expenseId: withReceipt.id,
        memberId: guest.id,
        amountMinor: 250,
        now: withReceipt.createdAt,
      }),
    ];
    await expenses.save(fixture.expense, fixture.payers, fixture.splits);
    await expenses.save(withReceipt, payers, splits);

    const linked = await expenses.listByReceipt('r-10000000-0000-4000-8000-000000000001' as never);
    expect(linked.map((e) => e.id)).toEqual([withReceipt.id]);
  });
});

// ---------------------------------------------------------------------------
// Expense drafts
// ---------------------------------------------------------------------------

describe('SqliteExpenseDraftRepository', () => {
  it('round-trips the draft body through draft_data JSON and fixed columns', async () => {
    const draft = createExpenseDraft({
      id: 'd-10000000-0000-4000-8000-000000000001' as never,
      groupId: 'g-10000000-0000-4000-8000-000000000001' as never,
      source: 'receipt',
      captureSourceId: 'c-10000000-0000-4000-8000-000000000001' as never,
      title: 'Cafe bill',
      amountMinor: 1250,
      currencyCode: 'INR',
      merchantName: 'Blue Tokai',
      expenseDate: '2026-10-01T18:30:00.000Z',
      overallConfidence: 0.874,
      lineItems: [
        createDraftLineItem({
          id: 'li-10000000-0000-4000-8000-000000000001' as never,
          name: 'Latte',
          quantity: 2,
          unitPriceMinor: 300,
          assignedMemberIds: ['m-10000000-0000-4000-8000-000000000001' as never],
        }),
      ],
      charges: [
        createDraftCharge({
          id: 'ch-10000000-0000-4000-8000-000000000001' as never,
          type: 'tax',
          amountMinor: 150,
          label: 'GST',
        }),
      ],
      unresolvedIssues: [
        createFieldReviewIssue({
          id: 'i-10000000-0000-4000-8000-000000000001' as never,
          issueType: 'low_confidence',
          severity: 'warning',
          fieldName: 'merchantName',
          message: 'Merchant confidence below threshold',
        }),
      ],
      createdBy: 'user-alice' as never,
      now: NOW_A as never,
    });
    await drafts.save(draft);

    const loaded = await drafts.findById(draft.id);
    expect(loaded?.source).toBe('receipt');
    expect(loaded?.status).toBe('capturing');
    expect(loaded?.title).toBe('Cafe bill');
    expect(loaded?.amountMinor).toBe(1250);
    expect(loaded?.merchantName).toBe('Blue Tokai');
    expect(loaded?.overallConfidence).toBeCloseTo(0.874, 6);
    expect(loaded?.payerCandidates).toEqual([]);
    expect(loaded?.lineItems).toHaveLength(1);
    expect(loaded?.lineItems[0]?.name).toBe('Latte');
    expect(loaded?.lineItems[0]?.assignedMemberIds).toEqual([
      'm-10000000-0000-4000-8000-000000000001',
    ]);
    expect(loaded?.charges).toHaveLength(1);
    expect(loaded?.charges[0]?.type).toBe('tax');
    expect(loaded?.unresolvedIssues).toHaveLength(1);
    expect(loaded?.unresolvedIssues[0]?.issueType).toBe('low_confidence');
    expect(loaded?.version).toBe(1);
  });

  it('lists by status and by capture source, excluding soft-deleted drafts', async () => {
    const d1 = createExpenseDraft({
      id: 'd-20000000-0000-4000-8000-000000000001' as never,
      groupId: 'g-10000000-0000-4000-8000-000000000001' as never,
      source: 'manual',
      createdBy: 'user-alice' as never,
      now: NOW_A as never,
    });
    const d2 = createExpenseDraft({
      id: 'd-20000000-0000-4000-8000-000000000002' as never,
      groupId: 'g-10000000-0000-4000-8000-000000000001' as never,
      source: 'receipt',
      captureSourceId: 'c-20000000-0000-4000-8000-000000000001' as never,
      createdBy: 'user-alice' as never,
      now: NOW_B as never,
    });
    await drafts.save(d1);
    await drafts.save(d2);

    const capturing = await drafts.listByStatus('capturing', { limit: 10 });
    expect(capturing.items).toHaveLength(2);

    const byCapture = await drafts.listByCaptureSource('c-20000000-0000-4000-8000-000000000001');
    expect(byCapture.map((d) => d.id)).toEqual([d2.id]);

    await drafts.softDelete(d1.id, { actorId: 'user-alice' as never, deletedAt: NOW_C as never });
    const afterDelete = await drafts.listByStatus('capturing', { limit: 10 });
    expect(afterDelete.items.map((d) => d.id)).toEqual([d2.id]);
  });

  it('persists edits: re-save updates status, candidates and version in place', async () => {
    const draft = createExpenseDraft({
      id: 'd-30000000-0000-4000-8000-000000000001' as never,
      groupId: 'g-10000000-0000-4000-8000-000000000001' as never,
      source: 'manual',
      createdBy: 'user-alice' as never,
      now: NOW_A as never,
    });
    await drafts.save(draft);

    const edited = {
      ...draft,
      status: 'ready' as const,
      payerCandidates: ['m-10000000-0000-4000-8000-000000000001' as never],
      participantCandidates: [
        'm-10000000-0000-4000-8000-000000000001' as never,
        'm-10000000-0000-4000-8000-000000000002' as never,
      ],
      updatedAt: NOW_B as never,
      version: 2,
    };
    await drafts.save(edited);

    const count = await db.get<Record<string, unknown>>(
      `select count(*) as cnt from expense_drafts where id = ?`,
      [draft.id],
    );
    expect(count?.['cnt']).toBe(1);

    const loaded = await drafts.findById(draft.id);
    expect(loaded?.status).toBe('ready');
    expect(loaded?.payerCandidates).toEqual(['m-10000000-0000-4000-8000-000000000001']);
    expect(loaded?.participantCandidates).toHaveLength(2);
    expect(loaded?.version).toBe(2);
  });

  it('soft-delete replays idempotently and throws for unknown drafts', async () => {
    const draft = createExpenseDraft({
      id: 'd-40000000-0000-4000-8000-000000000001' as never,
      groupId: 'g-10000000-0000-4000-8000-000000000001' as never,
      source: 'manual',
      createdBy: 'user-alice' as never,
      now: NOW_A as never,
    });
    await drafts.save(draft);

    const first = await drafts.softDelete(draft.id, {
      actorId: 'user-alice' as never,
      deletedAt: NOW_B as never,
    });
    expect(first.version).toBe(2);

    const replay = await drafts.softDelete(draft.id, {
      actorId: 'user-alice' as never,
      deletedAt: NOW_C as never,
    });
    expect(replay.deletedAt).toBe(NOW_B);

    await expect(
      drafts.softDelete('d-unknown' as never, {
        actorId: 'user-alice' as never,
        deletedAt: NOW_B as never,
      }),
    ).rejects.toThrow('not found');
  });
});
