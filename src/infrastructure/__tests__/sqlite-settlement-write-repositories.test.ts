import { beforeEach, describe, expect, it } from '@jest/globals';

import type { RemoteSyncPort, ConnectivityPort } from '@application/sync/sync-coordinator-types';
import { createExpense } from '@domain/entities/expense';
import { createExpensePayer } from '@domain/entities/expense-payer';
import { createExpenseSplit } from '@domain/entities/expense-split';
import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { InvalidEntityError } from '@domain/errors';

import { createCompositionRoot, type AppServices } from '../composition-root';
import { runMigrations } from '../sqlite/schema';
import { SqliteAuditRepository } from '../sqlite/sqlite-audit-repository';
import { SqliteSettlementRepository } from '../sqlite/sqlite-settlement-repository';

import { InMemoryDatabase } from './in-memory-database';

/**
 * Settlement write-side repository adapter tests.
 *
 * Every adapter runs against the in-memory database seeded through the
 * REAL migration runner (v1 → v2 → v3), and the lifecycle flows run
 * through the REAL Phase 6 use cases wired by the composition root.
 * This is the executable proof that:
 *
 *   1. The settlement state machine (draft → recorded → confirmed →
 *      reversed) persists correctly through the SQLite adapter.
 *   2. State history + audit entries are appended for every transition.
 *   3. Every mutation co-enqueues its offline-sync operation atomically.
 *   4. The BALANCE ENGINE sees the financial impact of settlements
 *      written through the adapter — including the reversal-pair rule
 *      (original + reversal = net zero) and the pending-exclusion rule.
 *   5. Idempotency contracts (operationId retries, payment-reference
 *      duplicates, soft-delete replays) hold at the SQL layer.
 */

// ---------------------------------------------------------------------------
// Test doubles (same shapes as composition-root.test.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GROUP_ID = 'g-55555555-1111-4111-8111-555555555555';
const ALICE = 'm-5aaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const BOB = 'm-5bbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const USER_ALICE = 'user-alice';
const NOW = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-02T10:00:00.000Z';
const T2 = '2026-10-03T10:00:00.000Z';
const T3 = '2026-10-04T10:00:00.000Z';

const PAYMENT_REF_HASH = 'a'.repeat(64);
const PAYMENT_REF_HASH_2 = 'b'.repeat(64);

let db: InMemoryDatabase;
let services: AppServices;
let settlements: SqliteSettlementRepository;
let audit: SqliteAuditRepository;

beforeEach(async () => {
  db = new InMemoryDatabase();
  await runMigrations(db);
  services = createCompositionRoot({
    database: db,
    connectivity: new StubConnectivity(),
    remoteSync: new StubRemoteSync(),
  });
  settlements = new SqliteSettlementRepository(db);
  audit = new SqliteAuditRepository(db);

  // Group + two members + one 10.00 INR expense paid by Alice, split
  // equally (Alice +500 / Bob −500 in the balance engine).
  const group = createGroup({
    id: GROUP_ID as never,
    name: 'Settlement Test Group',
    currencyCode: 'INR',
    createdBy: USER_ALICE as never,
    now: NOW as never,
  });
  await services.repositories.groups.save(group);
  await services.repositories.members.save(
    createGroupMember({
      id: ALICE as never,
      groupId: GROUP_ID as never,
      userId: USER_ALICE as never,
      displayName: 'Alice',
      role: 'owner',
      now: NOW as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: BOB as never,
      groupId: GROUP_ID as never,
      displayName: 'Bob',
      role: 'member',
      now: NOW as never,
    }),
  );
  const expense = createExpense({
    id: 'e-55555555-1111-4111-8111-555555555555' as never,
    groupId: GROUP_ID as never,
    title: 'Dinner',
    amountMinor: 1000,
    currencyCode: 'INR',
    expenseDate: '2026-10-01T18:30:00.000Z',
    splitType: 'equal',
    createdBy: USER_ALICE as never,
    now: NOW as never,
  });
  await services.repositories.expenses.save(
    expense,
    [
      createExpensePayer({
        id: 'p-55555555-1111-4111-8111-555555555555' as never,
        expenseId: expense.id,
        memberId: ALICE as never,
        amountMinor: 1000,
        now: NOW as never,
      }),
    ],
    [
      createExpenseSplit({
        id: 's-5555aaaa-1111-4111-8111-555555555555' as never,
        expenseId: expense.id,
        memberId: ALICE as never,
        amountMinor: 500,
        now: NOW as never,
      }),
      createExpenseSplit({
        id: 's-5555bbbb-1111-4111-8111-555555555555' as never,
        expenseId: expense.id,
        memberId: BOB as never,
        amountMinor: 500,
        now: NOW as never,
      }),
    ],
  );
});

/** Read the current INR balances through the composed read graph. */
async function readBalances(): Promise<{ alice: number; bob: number }> {
  const result = await services.balances.getGroupBalances.execute({
    groupId: GROUP_ID as never,
  });
  expect(result.notFound).toBe(false);
  const inr = result.results[0];
  const alice = inr?.memberCurrencyBalances.find((m) => m.memberId === ALICE);
  const bob = inr?.memberCurrencyBalances.find((m) => m.memberId === BOB);
  return { alice: alice?.netBalanceMinor ?? 0, bob: bob?.netBalanceMinor ?? 0 };
}

/** Count settlement sync operations currently enqueued. */
async function countSettlementSyncOps(): Promise<number> {
  const row = await db.get<Record<string, unknown>>(
    `select count(*) as cnt from sync_operations where entity_type = 'settlement'`,
  );
  return (row?.['cnt'] as number) ?? 0;
}

/** Drive the full happy-path lifecycle and return the settlement id. */
async function createConfirmedSettlement(): Promise<string> {
  const created = await services.settlements.createSettlementDraft.execute({
    groupId: GROUP_ID,
    fromMemberId: BOB,
    toMemberId: ALICE,
    amountMinor: 500,
    currencyCode: 'INR',
    method: 'upi',
    createdBy: USER_ALICE,
    note: 'Settling dinner',
  });
  const recorded = await services.settlements.recordSettlement.execute({
    settlementId: created.settlementId,
    expectedVersion: 1,
    actorId: USER_ALICE as never,
    now: T1 as never,
    paymentReferenceHash: PAYMENT_REF_HASH,
  });
  await services.settlements.confirmSettlement.execute({
    settlementId: recorded.settlement.id,
    expectedVersion: 2,
    confirmedByMemberId: ALICE as never,
    actorId: USER_ALICE as never,
    now: T2 as never,
  });
  return created.settlementId as string;
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe('sqlite settlement write-side adapter', () => {
  describe('round-trip persistence', () => {
    it('save → findById preserves every column including Phase 6 Track 1 fields', async () => {
      const created = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
        note: 'hello',
        operationId: 'op-123',
        paymentReferenceHash: PAYMENT_REF_HASH_2,
      });
      const loaded = await settlements.findById(created.settlementId);
      expect(loaded).not.toBeNull();
      expect(loaded?.groupId).toBe(GROUP_ID);
      expect(loaded?.fromMemberId).toBe(BOB);
      expect(loaded?.toMemberId).toBe(ALICE);
      expect(loaded?.amountMinor).toBe(500);
      expect(loaded?.currencyCode).toBe('INR');
      expect(loaded?.method).toBe('upi');
      expect(loaded?.note).toBe('hello');
      expect(loaded?.status).toBe('draft');
      expect(loaded?.operationId).toBe('op-123');
      expect(loaded?.paymentReferenceHash).toBe(PAYMENT_REF_HASH_2);
      expect(loaded?.version).toBe(1);
      expect(loaded?.deletedAt).toBeUndefined();
    });

    it('save upserts: an update via save() replaces the row without duplicating', async () => {
      const created = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'cash',
        createdBy: USER_ALICE,
      });
      const before = await settlements.findById(created.settlementId);
      await settlements.save({ ...before!, note: 'updated note' });
      const after = await settlements.findById(created.settlementId);
      expect(after?.note).toBe('updated note');

      const count = await db.get<Record<string, unknown>>(
        `select count(*) as cnt from settlements`,
      );
      expect(count?.['cnt']).toBe(1);
    });
  });

  describe('state-machine lifecycle through the real use cases', () => {
    it('draft → pending_confirmation → completed with versions, history, and audit', async () => {
      const settlementId = await createConfirmedSettlement();

      const final = await settlements.findById(settlementId as never);
      expect(final?.status).toBe('completed');
      expect(final?.version).toBe(3);
      expect(final?.confirmedByMemberId).toBe(ALICE);
      expect(final?.confirmedAt).toBe(T2);
      expect(final?.paymentReferenceHash).toBe(PAYMENT_REF_HASH);

      // State history: draft → pending_confirmation → completed, in order.
      const history = await settlements.listStateHistory(settlementId as never);
      expect(history.map((h) => `${h.fromStatus}->${h.toStatus}`)).toEqual([
        'draft->pending_confirmation',
        'pending_confirmation->completed',
      ]);
      expect(history[0]?.newVersion).toBe(2);
      expect(history[1]?.newVersion).toBe(3);

      // Audit trail: one create + two update entries for this settlement.
      const auditEntries = await audit.listByEntity('settlement', settlementId as string);
      expect(auditEntries.map((e) => e.action)).toEqual(['create', 'update', 'update']);
    });

    it('three settlement sync operations were enqueued (create + 2 updates)', async () => {
      await createConfirmedSettlement();
      expect(await countSettlementSyncOps()).toBe(3);
    });
  });

  describe('balance-engine write→read coherence', () => {
    it('a completed settlement zeroes the debt; reversing restores exact previous balances', async () => {
      // Baseline: Alice +500 / Bob −500.
      expect(await readBalances()).toEqual({ alice: 500, bob: -500 });

      const settlementId = await createConfirmedSettlement();

      // Completed settlement (Bob → Alice, 500): both zero.
      expect(await readBalances()).toEqual({ alice: 0, bob: 0 });

      // Reverse it.
      const reversed = await services.settlements.reverseSettlement.execute({
        settlementId: settlementId as never,
        expectedVersion: 3,
        actorId: USER_ALICE as never,
        reason: 'Recorded by mistake',
        now: T3 as never,
      });
      expect(reversed.settlement.status).toBe('reversed');
      expect(reversed.reversal.status).toBe('completed');
      expect(reversed.reversal.fromMemberId).toBe(ALICE);
      expect(reversed.reversal.toMemberId).toBe(BOB);
      expect(reversed.reversal.reversalOfSettlementId).toBe(settlementId);

      // The pair nets to zero → balances are EXACTLY the pre-settlement state.
      expect(await readBalances()).toEqual({ alice: 500, bob: -500 });

      // The reversal added one more sync op (reversal create) + one update
      // (original → reversed): 3 from the lifecycle + 2.
      expect(await countSettlementSyncOps()).toBe(5);
    });

    it('a pending_confirmation settlement does NOT move balances until confirmed', async () => {
      expect(await readBalances()).toEqual({ alice: 500, bob: -500 });

      const created = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
      });
      await services.settlements.recordSettlement.execute({
        settlementId: created.settlementId,
        expectedVersion: 1,
        actorId: USER_ALICE as never,
        now: T1 as never,
      });

      // Recorded but NOT confirmed → balances unchanged.
      expect(await readBalances()).toEqual({ alice: 500, bob: -500 });
    });
  });

  describe('listing and filtering', () => {
    it('listByGroup orders by settlement date desc and paginates', async () => {
      const settlementId = await createConfirmedSettlement();
      const page = await settlements.listByGroup(GROUP_ID as never, { limit: 10 });
      expect(page.items.map((s) => s.id)).toEqual([settlementId]);

      const single = await settlements.listByGroup(GROUP_ID as never, { limit: 1 });
      expect(single.items).toHaveLength(1);
      expect(single.hasMore).toBe(false); // only one settlement exists
    });

    it('listSentByMember / listReceivedByMember scope by direction', async () => {
      const settlementId = await createConfirmedSettlement();
      const sent = await settlements.listSentByMember(BOB as never, { limit: 10 });
      const received = await settlements.listReceivedByMember(ALICE as never, { limit: 10 });
      expect(sent.items.map((s) => s.id)).toEqual([settlementId]);
      expect(received.items.map((s) => s.id)).toEqual([settlementId]);
      const wrongSide = await settlements.listReceivedByMember(BOB as never, { limit: 10 });
      expect(wrongSide.items).toHaveLength(0);
    });

    it('listByFilter filters by statuses, payer, currency, and date range', async () => {
      await createConfirmedSettlement();

      const completed = await settlements.listByFilter(
        GROUP_ID as never,
        { statuses: ['completed'] },
        { limit: 10 },
      );
      expect(completed.items).toHaveLength(1);

      const pending = await settlements.listByFilter(
        GROUP_ID as never,
        { status: 'pending_confirmation' },
        { limit: 10 },
      );
      expect(pending.items).toHaveLength(0);

      const byPayer = await settlements.listByFilter(
        GROUP_ID as never,
        { payerMemberId: BOB as never },
        { limit: 10 },
      );
      expect(byPayer.items).toHaveLength(1);

      const byCurrency = await settlements.listByFilter(
        GROUP_ID as never,
        { currencyCode: 'INR' },
        { limit: 10 },
      );
      expect(byCurrency.items).toHaveLength(1);

      // Date range: nothing was created after far-future boundary.
      const farFuture = '2999-01-01T00:00:00.000Z' as never;
      const afterFuture = await settlements.listByFilter(
        GROUP_ID as never,
        { createdAfter: farFuture },
        { limit: 10 },
      );
      expect(afterFuture.items).toHaveLength(0);

      // Date range: everything was created before the far-future boundary.
      const beforeFuture = await settlements.listByFilter(
        GROUP_ID as never,
        { createdBefore: farFuture },
        { limit: 10 },
      );
      expect(beforeFuture.items).toHaveLength(1);
    });

    it('listPendingConfirmation and listDisputed scope by status', async () => {
      const created = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
      });
      await services.settlements.recordSettlement.execute({
        settlementId: created.settlementId,
        expectedVersion: 1,
        actorId: USER_ALICE as never,
        now: T1 as never,
      });
      const pending = await settlements.listPendingConfirmation(GROUP_ID as never, {
        limit: 10,
      });
      expect(pending.items).toHaveLength(1);
      expect(pending.items[0]?.status).toBe('pending_confirmation');

      await services.settlements.disputeSettlement.execute({
        settlementId: created.settlementId,
        expectedVersion: 2,
        reason: 'not_received',
        note: 'Nothing arrived',
        actorId: USER_ALICE as never,
        actorMemberId: ALICE as never,
        now: T2 as never,
      });
      const disputed = await settlements.listDisputed(GROUP_ID as never, { limit: 10 });
      expect(disputed.items).toHaveLength(1);
      expect(disputed.items[0]?.status).toBe('disputed');
      expect(disputed.items[0]?.disputeReason).toBe('not_received');
      expect(disputed.items[0]?.disputeNote).toBe('Nothing arrived');

      // After the dispute, the pending list is empty.
      const pendingAfter = await settlements.listPendingConfirmation(GROUP_ID as never, {
        limit: 10,
      });
      expect(pendingAfter.items).toHaveLength(0);
    });
  });

  describe('idempotency contracts', () => {
    it('findByOperationId returns the settlement and CreateSettlementDraft retries do not duplicate', async () => {
      const first = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
        operationId: 'op-retry-1',
      });
      expect(first.created).toBe(true);

      const retry = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
        operationId: 'op-retry-1',
      });
      expect(retry.created).toBe(false);
      expect(retry.settlementId).toBe(first.settlementId);

      const found = await settlements.findByOperationId('op-retry-1');
      expect(found?.id).toBe(first.settlementId);

      const count = await db.get<Record<string, unknown>>(
        `select count(*) as cnt from settlements`,
      );
      expect(count?.['cnt']).toBe(1);
    });

    it('findByOperationId excludes soft-deleted settlements', async () => {
      const created = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
        operationId: 'op-del-1',
      });
      await settlements.softDelete(created.settlementId, {
        actorId: USER_ALICE as never,
        deletedAt: T1 as never,
      });
      expect(await settlements.findByOperationId('op-del-1')).toBeNull();
    });

    it('findByPaymentReferenceHash detects duplicates and blocks creation', async () => {
      await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
        paymentReferenceHash: PAYMENT_REF_HASH,
      });
      const existing = await settlements.findByPaymentReferenceHash(
        GROUP_ID as never,
        PAYMENT_REF_HASH,
      );
      expect(existing).not.toBeNull();

      await expect(
        services.settlements.createSettlementDraft.execute({
          groupId: GROUP_ID,
          fromMemberId: BOB,
          toMemberId: ALICE,
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ALICE,
          paymentReferenceHash: PAYMENT_REF_HASH,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('softDelete is idempotent under replay (no double version bump)', async () => {
      const created = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
      });
      const first = await settlements.softDelete(created.settlementId, {
        actorId: USER_ALICE as never,
        deletedAt: T1 as never,
      });
      const replay = await settlements.softDelete(created.settlementId, {
        actorId: USER_ALICE as never,
        deletedAt: T2 as never,
      });
      expect(replay.deletedAt).toBe(first.deletedAt);
      expect(replay.version).toBe(first.version);

      const loaded = await settlements.findById(created.settlementId);
      expect(loaded?.deletedAt).toBe(T1);
      expect(loaded?.version).toBe(2);

      // Only ONE delete sync op despite the replay.
      const ops = await db.all<Record<string, unknown>>(
        `select operation from sync_operations where entity_type = 'settlement' and operation = 'delete'`,
      );
      expect(ops).toHaveLength(1);
    });
  });

  describe('atomic sync-op co-write', () => {
    it('a failed save rolls back BOTH the settlement row and its sync operation', async () => {
      // Create the draft FIRST (its own save path is untouched).
      const created = await services.settlements.createSettlementDraft.execute({
        groupId: GROUP_ID,
        fromMemberId: BOB,
        toMemberId: ALICE,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ALICE,
      });
      const current = await settlements.findById(created.settlementId);
      expect(current).not.toBeNull();

      const opsBefore = await countSettlementSyncOps();
      const rowsBefore = await db.get<Record<string, unknown>>(
        `select count(*) as cnt from settlements`,
      );

      // Sabotage the sync-op enqueue inside the transaction.
      const originalRun = db.run.bind(db);
      const sabotaged = async (sql: string, params?: readonly unknown[]) => {
        if (typeof sql === 'string' && sql.startsWith('insert into sync_operations')) {
          throw new Error('sabotaged sync enqueue');
        }
        return originalRun(sql as string, params as never);
      };
      (db as unknown as { run: typeof db.run }).run = sabotaged as typeof db.run;

      await expect(
        settlements.save({ ...current!, note: 'will not survive' }),
      ).rejects.toThrow('sabotaged sync enqueue');

      (db as unknown as { run: typeof db.run }).run = originalRun;

      const rowsAfter = await db.get<Record<string, unknown>>(
        `select count(*) as cnt from settlements`,
      );
      expect(rowsAfter?.['cnt']).toBe(rowsBefore?.['cnt']);
      expect(await countSettlementSyncOps()).toBe(opsBefore);

      // The row still carries its ORIGINAL note — the failed update left no trace.
      const untouched = await settlements.findById(created.settlementId);
      expect(untouched?.note).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Audit repository adapter
// ---------------------------------------------------------------------------

describe('sqlite audit repository adapter', () => {
  it('append + listByEntity round-trips with parsed change summaries', async () => {
    const entry = await audit.append({
      id: 'audit-1',
      entityType: 'settlement',
      entityId: 's-1',
      action: 'update',
      actorId: USER_ALICE as never,
      groupId: GROUP_ID as never,
      previousVersion: 1,
      newVersion: 2,
      changeSummary: { status: { from: 'draft', to: 'requested' } },
    });
    expect(entry.createdAt).toBeTruthy();

    const listed = await audit.listByEntity('settlement', 's-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.action).toBe('update');
    expect(listed[0]?.actorId).toBe(USER_ALICE);
    expect(listed[0]?.groupId).toBe(GROUP_ID);
    expect(listed[0]?.previousVersion).toBe(1);
    expect(listed[0]?.newVersion).toBe(2);
    expect(listed[0]?.changeSummary).toEqual({ status: { from: 'draft', to: 'requested' } });
  });

  it('listByGroup and listByActor filter and paginate', async () => {
    for (let i = 0; i < 3; i++) {
      await audit.append({
        id: `audit-g-${i}`,
        entityType: 'expense',
        entityId: `e-${i}`,
        action: 'create',
        actorId: USER_ALICE as never,
        groupId: GROUP_ID as never,
      });
    }
    await audit.append({
      id: 'audit-other-group',
      entityType: 'expense',
      entityId: 'e-99',
      action: 'create',
      actorId: USER_ALICE as never,
      groupId: 'g-other' as never,
    });

    const byGroup = await audit.listByGroup(GROUP_ID as never, { limit: 10 });
    expect(byGroup.items).toHaveLength(3);

    const byGroupPage = await audit.listByGroup(GROUP_ID as never, { limit: 2 });
    expect(byGroupPage.items).toHaveLength(2);
    expect(byGroupPage.hasMore).toBe(true);
    expect(byGroupPage.nextCursor).toBe('2');

    const byActor = await audit.listByActor(USER_ALICE as never, { limit: 10 });
    expect(byActor.items).toHaveLength(4);
  });

  it('corrupted change-summary JSON degrades to undefined instead of crashing', async () => {
    await db.run(
      `insert into audit_logs (id, entity_type, entity_id, action, actor_id, group_id, previous_version, new_version, change_summary, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'audit-corrupt',
        'expense',
        'e-corrupt',
        'update',
        null,
        null,
        null,
        null,
        '{not valid json',
        NOW,
      ],
    );
    const listed = await audit.listByEntity('expense', 'e-corrupt');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.changeSummary).toBeUndefined();
  });
});
