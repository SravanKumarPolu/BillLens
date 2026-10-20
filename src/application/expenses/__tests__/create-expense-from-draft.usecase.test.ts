/**
 * CreateExpenseFromDraftUseCase unit tests.
 *
 * Exercises the application use case with in-memory test doubles for the
 * repositories and UnitOfWork. Verifies:
 *   - Successful expense creation from a valid draft.
 *   - Throws if the draft is not found.
 *   - Throws if the draft is already confirmed.
 *   - Throws if the draft is missing required fields.
 *   - Throws if financial validation fails (split total ≠ expense total).
 *
 * The in-memory UnitOfWork + repositories simulate transactional rollback
 * so the "missing required fields" and "financial validation fails"
 * tests can assert that no partial writes persisted.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  asExpenseDraftId,
  asGroupId,
  asMemberId,
  asUserId,
  confirmExpenseDraft,
  createExpenseDraft,
  type Expense,
  type ExpenseDraft,
  type ExpensePayer,
  type ExpenseSplit,
} from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type {
  AuditLogEntry,
  AuditRepository,
  ExpenseDraftRepository,
  ExpenseRepository,
  SyncOperation,
  SyncRepository,
  UnitOfWork,
  UnitOfWorkContext,
} from '@domain/repositories';
import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from '@domain/repositories';
import type { DateTime } from '@domain/value-objects';
import { asDateTime } from '@domain/value-objects';
import type { ExpenseDraftId, GroupId, MemberId, UserId } from '@shared-types/index';

import { CreateExpenseFromDraftUseCase } from '../create-expense-from-draft.usecase';

// ---------------------------------------------------------------------------
// In-memory test doubles
// ---------------------------------------------------------------------------

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');
const MEMBER_A = asMemberId('m_a');
const MEMBER_B = asMemberId('m_b');
const MEMBER_C = asMemberId('m_c');

class InMemoryExpenseRepository implements ExpenseRepository {
  private readonly expenses = new Map<string, Expense>();
  private readonly payers = new Map<string, ExpensePayer[]>();
  private readonly splits = new Map<string, ExpenseSplit[]>();

  async findById(id: Expense['id']): Promise<Expense | null> {
    return this.expenses.get(id as string) ?? null;
  }
  async listByGroup(): Promise<PaginatedResult<Expense>> {
    return { items: [], hasMore: false };
  }
  async listUpdatedSince(): Promise<PaginatedResult<Expense>> {
    return { items: [], hasMore: false };
  }
  async listByReceipt(): Promise<readonly Expense[]> {
    return [];
  }
  async listPayers(expenseId: Expense['id']): Promise<readonly ExpensePayer[]> {
    return this.payers.get(expenseId as string) ?? [];
  }
  async listSplits(expenseId: Expense['id']): Promise<readonly ExpenseSplit[]> {
    return this.splits.get(expenseId as string) ?? [];
  }
  async save(
    expense: Expense,
    payers: readonly ExpensePayer[],
    splits: readonly ExpenseSplit[],
  ): Promise<void> {
    this.expenses.set(expense.id as string, expense);
    this.payers.set(expense.id as string, [...payers]);
    this.splits.set(expense.id as string, [...splits]);
  }
  async softDelete(): Promise<SoftDeleteResult> {
    throw new Error('Not implemented in test double');
  }
  async countByPayer(): Promise<number> {
    return 0;
  }
}

class InMemoryExpenseDraftRepository implements ExpenseDraftRepository {
  private readonly store = new Map<string, ExpenseDraft>();

  async findById(id: ExpenseDraftId): Promise<ExpenseDraft | null> {
    return this.store.get(id as string) ?? null;
  }
  async listByGroup(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: [], hasMore: false };
  }
  async listByStatus(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: [], hasMore: false };
  }
  async listByCaptureSource(): Promise<readonly ExpenseDraft[]> {
    return [];
  }
  async listUpdatedSince(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: [], hasMore: false };
  }
  async save(draft: ExpenseDraft): Promise<void> {
    this.store.set(draft.id as string, draft);
  }
  async softDelete(): Promise<SoftDeleteResult> {
    throw new Error('Not implemented in test double');
  }

  seed(draft: ExpenseDraft): void {
    this.store.set(draft.id as string, draft);
  }
  peek(id: ExpenseDraftId): ExpenseDraft | null {
    return this.store.get(id as string) ?? null;
  }
}

class InMemoryAuditRepository implements AuditRepository {
  readonly entries: AuditLogEntry[] = [];

  async append(entry: Omit<AuditLogEntry, 'createdAt'>): Promise<AuditLogEntry> {
    const full: AuditLogEntry = {
      ...entry,
      createdAt: NOW as AuditLogEntry['createdAt'],
    };
    this.entries.push(full);
    return full;
  }
  async listByEntity(): Promise<readonly AuditLogEntry[]> {
    return [];
  }
  async listByActor(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: [], hasMore: false };
  }
  async listByGroup(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: [], hasMore: false };
  }
}

class InMemorySyncRepository implements SyncRepository {
  readonly ops: SyncOperation[] = [];
  private idCounter = 0;

  async enqueue(
    operation: Omit<SyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt'>,
  ): Promise<SyncOperation> {
    this.idCounter += 1;
    const op: SyncOperation = {
      ...operation,
      id: `op-${this.idCounter}`,
      status: 'pending',
      retryCount: 0,
      createdAt: NOW as SyncOperation['createdAt'],
    };
    this.ops.push(op);
    return op;
  }
  async nextPending(): Promise<SyncOperation | null> {
    return this.ops.find((o) => o.status === 'pending') ?? null;
  }
  async listPending(): Promise<readonly SyncOperation[]> {
    return this.ops.filter((o) => o.status === 'pending');
  }
  async listReadyForRetry(): Promise<readonly SyncOperation[]> {
    return [];
  }
  async listPermanentlyFailed(): Promise<readonly SyncOperation[]> {
    return [];
  }
  async listFailed(): Promise<readonly SyncOperation[]> {
    return [];
  }
  async markSyncing(): Promise<void> {}
  async markCompleted(): Promise<void> {}
  async markFailed(): Promise<void> {}
  async markConflict(): Promise<void> {}
  async resetForRetry(): Promise<void> {}
  async countPending(): Promise<number> {
    return this.ops.filter((o) => o.status === 'pending').length;
  }
  async countConflicts(): Promise<number> {
    return this.ops.filter((o) => o.status === 'conflict' || o.status === 'permanently_failed').length;
  }
  async findById(): Promise<SyncOperation | null> {
    return null;
  }
  async recoverStuckSyncing(): Promise<number> {
    return 0;
  }
  // Phase 7 additions — stub implementations for testing
  async listBlocked(): Promise<readonly SyncOperation[]> {
    return [];
  }
  async areDependenciesMet(): Promise<boolean> {
    return true;
  }
  async markPermanentlyFailed(): Promise<void> {}
  async cancelOperation(): Promise<void> {}
  async compactPendingOperations(): Promise<number> {
    return 0;
  }
  async listByEntity(): Promise<readonly SyncOperation[]> {
    return [];
  }
}

/**
 * In-memory UnitOfWork — wraps the four in-memory repositories above
 * and simulates transaction rollback on error.
 */

/** Minimal in-memory GroupRepository for the UoW context (v2.5.0). */
class InMemoryGroupRepository {
  readonly store = new Map<string, { id: string; currencyCode: string; deletedAt?: string; version: number }>();
  async findById(id: unknown) {
    return this.store.get(String(id)) ?? null;
  }
  async save(group: { id: string; currencyCode: string; deletedAt?: string; version: number }) {
    this.store.set(group.id, group);
  }
}

class InMemoryUnitOfWork implements UnitOfWork {
  readonly groups = new InMemoryGroupRepository();

  constructor(
    private readonly expenses: InMemoryExpenseRepository,
    private readonly drafts: InMemoryExpenseDraftRepository,
    private readonly audit: InMemoryAuditRepository,
    private readonly sync: InMemorySyncRepository,
  ) {}

  async execute<T>(callback: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    // Snapshot all repo state so we can roll back if the callback throws.
    const expensesSnapshot = new Map(this.expenses['expenses']);
    const payersSnapshot = new Map(this.expenses['payers']);
    const splitsSnapshot = new Map(this.expenses['splits']);
    const draftsSnapshot = new Map(this.drafts['store']);
    const auditSnapshot = [...this.audit.entries];
    const syncSnapshot = [...this.sync.ops];

    try {
      const ctx: UnitOfWorkContext = {
        users: undefined as never,
        groups: this.groups as never,
        members: undefined as never,
        invites: undefined as never,
        expenses: this.expenses,
        drafts: this.drafts,
        receipts: undefined as never,
        settlements: undefined as never,
        audit: this.audit,
        sync: this.sync,
        conflicts: undefined as never,
        enqueueSync: (op) => this.sync.enqueue(op),
      };
      return await callback(ctx);
    } catch (err) {
      // Rollback: restore every snapshot.
      this.expenses['expenses'].clear();
      for (const [k, v] of expensesSnapshot) this.expenses['expenses'].set(k, v);
      this.expenses['payers'].clear();
      for (const [k, v] of payersSnapshot) this.expenses['payers'].set(k, v);
      this.expenses['splits'].clear();
      for (const [k, v] of splitsSnapshot) this.expenses['splits'].set(k, v);
      this.drafts['store'].clear();
      for (const [k, v] of draftsSnapshot) this.drafts['store'].set(k, v);
      this.audit.entries.length = 0;
      this.audit.entries.push(...auditSnapshot);
      this.sync.ops.length = 0;
      this.sync.ops.push(...syncSnapshot);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers — build a draft for tests
// ---------------------------------------------------------------------------

interface MakeDraftOverrides {
  readonly id?: ExpenseDraftId;
  readonly amountMinor?: number;
  readonly currencyCode?: string;
  readonly title?: string;
  readonly payerCandidates?: readonly MemberId[];
  readonly participantCandidates?: readonly MemberId[];
  readonly status?: ExpenseDraft['status'];
  readonly version?: number;
  readonly groupId?: GroupId;
  readonly createdBy?: UserId;
  readonly expenseDate?: string;
}

function makeDraft(overrides: MakeDraftOverrides = {}): ExpenseDraft {
  // Build the createExpenseDraft input. We deliberately use the `in`
  // operator (not `??`) for the optional fields so a test can pass
  // `{ currencyCode: undefined }` to produce a draft WITHOUT a
  // currencyCode (the `??` operator would fall through to the default
  // in that case, which is not what the "missing field" tests want).
  const input: Parameters<typeof createExpenseDraft>[0] = {
    id: overrides.id ?? asExpenseDraftId('draft-1'),
    source: 'receipt',
    merchantName: 'Paradise Biryani',
    createdBy: overrides.createdBy ?? USER_ID,
    now: NOW,
    title: 'title' in overrides ? overrides.title : 'Lunch',
    amountMinor: 'amountMinor' in overrides ? overrides.amountMinor : 1000,
    currencyCode: 'currencyCode' in overrides ? overrides.currencyCode : 'INR',
    expenseDate: 'expenseDate' in overrides ? overrides.expenseDate : '2026-07-29',
    payerCandidates: 'payerCandidates' in overrides ? overrides.payerCandidates : [MEMBER_A],
    participantCandidates:
      'participantCandidates' in overrides
        ? overrides.participantCandidates
        : [MEMBER_A, MEMBER_B],
  };

  let draft = createExpenseDraft(input);

  // Apply status / version / groupId overrides AFTER createExpenseDraft
  // so the test can exercise non-default statuses (confirmed, discarded,
  // etc.). Status transitions go through the real domain functions where
  // possible so version bookkeeping stays correct.
  if (overrides.status === 'confirmed') {
    draft = confirmExpenseDraft(draft, {
      confirmedExpenseId: 'exp-pre-confirmed' as never,
      expectedVersion: draft.version,
      now: NOW,
    });
  } else if (overrides.status !== undefined) {
    // For non-confirmed statuses (e.g. 'discarded'), apply structurally.
    // The use case only checks for 'confirmed' / 'discarded' before
    // proceeding, so we don't need the full transition machinery here.
    draft = { ...draft, status: overrides.status };
  }

  if (overrides.version !== undefined) {
    draft = { ...draft, version: overrides.version };
  }
  if (overrides.groupId !== undefined) {
    draft = { ...draft, groupId: overrides.groupId };
  }
  return draft;
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

interface Fixture {
  readonly expenses: InMemoryExpenseRepository;
  readonly drafts: InMemoryExpenseDraftRepository;
  readonly audit: InMemoryAuditRepository;
  readonly sync: InMemorySyncRepository;
  readonly uow: InMemoryUnitOfWork;
  readonly useCase: CreateExpenseFromDraftUseCase;
}

function makeFixture(): Fixture {
  const expenses = new InMemoryExpenseRepository();
  const drafts = new InMemoryExpenseDraftRepository();
  const audit = new InMemoryAuditRepository();
  const sync = new InMemorySyncRepository();
  const uow = new InMemoryUnitOfWork(expenses, drafts, audit, sync);
  // v2.5.0: the confirm use case now loads the group (existence +
  // currency invariant) — seed the default test group.
  uow.groups.save({ id: GROUP_ID, currencyCode: 'INR', version: 1 });
  const useCase = new CreateExpenseFromDraftUseCase(uow);
  return { expenses, drafts, audit, sync, uow, useCase };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateExpenseFromDraftUseCase', () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture();
  });

  describe('successful expense creation', () => {
    it('creates an expense, payers, splits, and a sync op from a valid draft', async () => {
      // Draft has amount 1000, 1 payer (memberA), 2 participants
      // (memberA, memberB). Equal split = 500 each, sum = 1000 ✓.
      const draft = makeDraft();
      fx.drafts.seed(draft);

      const output = await fx.useCase.execute({
        draftId: draft.id,
        groupId: GROUP_ID as string,
        expectedVersion: draft.version,
      });

      // Output: the new expense id and the (now confirmed) draft status.
      expect(output.expenseId).toEqual(expect.any(String));
      expect(output.draftStatus).toBe('confirmed');

      // Expense persisted with payers and splits.
      const saved = await fx.expenses.findById(output.expenseId as never);
      expect(saved).not.toBeNull();
      expect(saved?.title).toBe('Lunch');
      expect(saved?.amountMinor).toBe(1000);
      expect(saved?.currencyCode).toBe('INR');
      expect(saved?.splitType).toBe('equal');
      expect(saved?.groupId).toBe(GROUP_ID);

      const payers = await fx.expenses.listPayers(output.expenseId as never);
      expect(payers).toHaveLength(1);
      expect(payers[0]?.memberId).toBe(MEMBER_A);
      expect(payers[0]?.amountMinor).toBe(1000);

      const splits = await fx.expenses.listSplits(output.expenseId as never);
      expect(splits).toHaveLength(2);
      // Equal split: 1000 / 2 = 500 each.
      expect(splits[0]?.amountMinor).toBe(500);
      expect(splits[1]?.amountMinor).toBe(500);
      const splitMemberIds = splits.map((s) => s.memberId as string).sort();
      expect(splitMemberIds).toEqual([MEMBER_A as string, MEMBER_B as string]);

      // Draft was confirmed and its version was bumped.
      const confirmedDraft = fx.drafts.peek(draft.id);
      expect(confirmedDraft?.status).toBe('confirmed');
      expect(confirmedDraft?.version).toBe(draft.version + 1);
      expect(confirmedDraft?.confirmedExpenseId as string).toBe(output.expenseId);

      // v2.4.0: the use case NO LONGER enqueues its own sync op — the
      // SQLite expense repository co-enqueues the expense sync operation
      // INSIDE the same transaction as the row writes (see
      // sqlite-write-repositories tests for that coverage). A second,
      // differently-keyed op from the use case would double-upload and
      // surface as a phantom server-side conflict.
      expect(fx.sync.ops).toHaveLength(0);
    });

    it('uses the draft title, amount, currency, and date in the expense', async () => {
      const draft = makeDraft({
        id: asExpenseDraftId('draft-2'),
        title: 'Dinner at Goa',
        amountMinor: 2500,
        currencyCode: 'INR',
        expenseDate: '2026-08-01',
      });
      fx.drafts.seed(draft);

      const output = await fx.useCase.execute({
        draftId: draft.id,
        groupId: GROUP_ID as string,
        expectedVersion: draft.version,
      });

      const saved = await fx.expenses.findById(output.expenseId as never);
      expect(saved?.title).toBe('Dinner at Goa');
      expect(saved?.amountMinor).toBe(2500);
      expect(saved?.currencyCode).toBe('INR');
      expect(saved?.expenseDate as string).toBe('2026-08-01T00:00:00.000Z');
    });
  });

  describe('draft not found', () => {
    it('throws InvalidEntityError when the draft id does not exist', async () => {
      await expect(
        fx.useCase.execute({
          draftId: asExpenseDraftId('does-not-exist'),
          groupId: GROUP_ID as string,
          expectedVersion: 1,
        }),
      ).rejects.toThrow(InvalidEntityError);

      // No partial writes — no expense, no sync op.
      expect(fx.sync.ops).toHaveLength(0);
    });
  });

  describe('draft already confirmed', () => {
    it('throws InvalidEntityError when the draft is already confirmed', async () => {
      // makeDraft with status: 'confirmed' goes through the real
      // confirmExpenseDraft domain transition so the version is bumped
      // correctly (draft.version = 2 after confirmation).
      const confirmedDraft = makeDraft({
        id: asExpenseDraftId('draft-confirmed'),
        status: 'confirmed',
      });
      fx.drafts.seed(confirmedDraft);

      await expect(
        fx.useCase.execute({
          draftId: confirmedDraft.id,
          groupId: GROUP_ID as string,
          expectedVersion: confirmedDraft.version,
        }),
      ).rejects.toThrow(/already confirmed/);

      // No partial writes.
      expect(fx.sync.ops).toHaveLength(0);
    });
  });

  describe('draft missing required fields', () => {
    it('throws InvalidEntityError when amountMinor is undefined', async () => {
      const draft = makeDraft({ amountMinor: undefined });
      fx.drafts.seed(draft);

      await expect(
        fx.useCase.execute({
          draftId: draft.id,
          groupId: GROUP_ID as string,
          expectedVersion: draft.version,
        }),
      ).rejects.toThrow(/missing required fields/);

      // No expense was saved.
      expect(fx.sync.ops).toHaveLength(0);
    });

    it('throws InvalidEntityError when title is empty', async () => {
      const draft = makeDraft({ title: '   ' });
      fx.drafts.seed(draft);

      await expect(
        fx.useCase.execute({
          draftId: draft.id,
          groupId: GROUP_ID as string,
          expectedVersion: draft.version,
        }),
      ).rejects.toThrow(/missing required fields/);
    });

    it('throws InvalidEntityError when currencyCode is undefined', async () => {
      const draft = makeDraft({ currencyCode: undefined });
      fx.drafts.seed(draft);

      await expect(
        fx.useCase.execute({
          draftId: draft.id,
          groupId: GROUP_ID as string,
          expectedVersion: draft.version,
        }),
      ).rejects.toThrow(/missing required fields/);
    });
  });

  describe('financial validation fails (mismatched totals)', () => {
    it('splits non-divisible amounts deterministically so the total is preserved', async () => {
      // v2.4.0: the DOMAIN equal-split engine (largest-remainder by
      // ascending member id) replaced the naive floor split. amountMinor
      // = 1000 across 3 participants → [334, 333, 333] — the aggregate
      // invariant Σ splits === total now holds for ANY amount, so the
      // old "throws when floor loses pennies" case is obsolete.
      const draft = makeDraft({
        id: asExpenseDraftId('draft-remainder'),
        amountMinor: 1000,
        participantCandidates: [MEMBER_A, MEMBER_B, MEMBER_C],
      });
      fx.drafts.seed(draft);

      const output = await fx.useCase.execute({
        draftId: draft.id,
        groupId: GROUP_ID as string,
        expectedVersion: draft.version,
      });
      expect(output.draftStatus).toBe('confirmed');

      const splits = await fx.expenses.listSplits(output.expenseId as never);
      expect(splits).toHaveLength(3);
      const amounts = splits.map((s) => s.amountMinor).sort((a, b) => b - a);
      expect(amounts).toEqual([334, 333, 333]);
      expect(amounts.reduce((sum, a) => sum + a, 0)).toBe(1000);
    });

    it('still rejects a genuinely invalid aggregate (validation fires)', async () => {
      // Direct proof that the aggregate validation still throws when
      // the invariant is violated: a participant list with a DUPLICATE
      // member id makes validateExpenseAggregate reject (duplicate
      // split members are forbidden regardless of amounts).
      const draft = makeDraft({
        id: asExpenseDraftId('draft-duplicate-participant'),
        amountMinor: 1000,
        participantCandidates: [MEMBER_A, MEMBER_A],
      });
      fx.drafts.seed(draft);

      await expect(
        fx.useCase.execute({
          draftId: draft.id,
          groupId: GROUP_ID as string,
          expectedVersion: draft.version,
        }),
      ).rejects.toThrow();

      // The transaction rolled back — no sync op enqueued, draft not
      // confirmed.
      expect(fx.sync.ops).toHaveLength(0);
      const unchangedDraft = fx.drafts.peek(draft.id);
      expect(unchangedDraft?.status).not.toBe('confirmed');
      expect(unchangedDraft?.version).toBe(draft.version);
    });
  });

  describe('version conflict on confirm', () => {
    it('throws when expectedVersion does not match the persisted draft version', async () => {
      const draft = makeDraft();
      fx.drafts.seed(draft);

      // Pass the WRONG expectedVersion — confirmExpenseDraft should
      // throw a version-conflict error.
      await expect(
        fx.useCase.execute({
          draftId: draft.id,
          groupId: GROUP_ID as string,
          expectedVersion: draft.version + 99,
        }),
      ).rejects.toThrow(InvalidEntityError);

      // Transaction rolled back — no expense, no sync op, draft unchanged.
      expect(fx.sync.ops).toHaveLength(0);
      const unchangedDraft = fx.drafts.peek(draft.id);
      expect(unchangedDraft?.status).not.toBe('confirmed');
      expect(unchangedDraft?.version).toBe(draft.version);
    });
  });
});

// ---------------------------------------------------------------------------
// Type-only re-exports to satisfy the unused-imports linter when the
// types are referenced only in JSDoc annotations.
// ---------------------------------------------------------------------------

export type { DateTime, Pagination };
export type { DeleteMetadata };