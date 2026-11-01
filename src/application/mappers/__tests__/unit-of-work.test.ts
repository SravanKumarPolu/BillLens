import { describe, expect, it } from '@jest/globals';

import {
  asGroupId,
  asUserId,
  createGroup,
  type ExpenseDraft,
} from '@domain/entities';
import type {
  AuditLogEntry,
  AuditRepository,
  ExpenseDraftRepository,
  ExpenseRepository,
  GroupRepository,
  SyncOperation,
  SyncRepository,
  UnitOfWork,
  UnitOfWorkContext,
} from '@domain/repositories';
import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from '@domain/repositories';
import type { DateTime } from '@domain/value-objects';
import { asDateTime } from '@domain/value-objects';
import type { ExpenseDraftId, GroupId } from '@shared-types/index';

// ============================================================================
// In-memory test doubles for repositories.
//
// These are NOT production code — they live in the application test folder
// so application-layer use cases can be unit-tested without infrastructure.
// Production implementations live in src/infrastructure/repositories/.
// ============================================================================

class InMemoryGroupRepository implements GroupRepository {
  private readonly store = new Map<string, ReturnType<typeof createGroup>>();

  async findById(id: ReturnType<typeof asGroupId>) {
    return this.store.get(id as string) ?? null;
  }
  async listByUser() {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
  async listByCurrency() {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
  async save(group: ReturnType<typeof createGroup>) {
    this.store.set(group.id as string, group);
  }
  async softDelete(id: ReturnType<typeof asGroupId>) {
    return {
      id: id as string,
      deletedAt: asDateTime('2026-07-30T10:00:00.000Z'),
      version: 2 as never,
    };
  }
}

class InMemoryExpenseRepository implements ExpenseRepository {
  async findById(): Promise<null> {
    return null;
  }
  async listByGroup(): Promise<{ items: never[]; hasMore: boolean }> {
    return { items: [], hasMore: false };
  }
  async listUpdatedSince(): Promise<{ items: never[]; hasMore: boolean }> {
    return { items: [], hasMore: false };
  }
  async listByReceipt(): Promise<never[]> {
    return [];
  }
  async listPayers(): Promise<never[]> {
    return [];
  }
  async listSplits(): Promise<never[]> {
    return [];
  }
  async save(): Promise<void> {}
  async softDelete(): Promise<{
    id: string;
    deletedAt: ReturnType<typeof asDateTime>;
    version: never;
  }> {
    throw new Error('Not implemented in test double');
  }
  async countByPayer(): Promise<number> {
    return 0;
  }
}

/**
 * In-memory ExpenseDraftRepository for tests.
 *
 * The UnitOfWorkContext now exposes `drafts` so that the
 * CreateExpenseFromDraftUseCase can load and confirm drafts atomically
 * with the expense write. Tests that exercise that use case need a real
 * (in-memory) draft repository.
 */
class InMemoryExpenseDraftRepository implements ExpenseDraftRepository {
  private readonly store = new Map<string, ExpenseDraft>();

  async findById(id: ExpenseDraftId): Promise<ExpenseDraft | null> {
    return this.store.get(id as string) ?? null;
  }
  async listByGroup(
    _groupId: GroupId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: [], hasMore: false };
  }
  async listByStatus(
    _status: ExpenseDraft['status'],
    _pagination: Pagination,
  ): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: [], hasMore: false };
  }
  async listByCaptureSource(_captureSourceId: string): Promise<readonly ExpenseDraft[]> {
    return [];
  }
  async listUpdatedSince(
    _groupId: GroupId,
    _since: DateTime,
    _pagination: Pagination,
  ): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: [], hasMore: false };
  }
  async save(draft: ExpenseDraft): Promise<void> {
    this.store.set(draft.id as string, draft);
  }
  async softDelete(_id: ExpenseDraftId, _metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    throw new Error('Not implemented in test double');
  }

  /** Test-only helper: pre-seed the repository with a draft. */
  seed(draft: ExpenseDraft): void {
    this.store.set(draft.id as string, draft);
  }

  /** Test-only helper: read back the persisted draft (or null). */
  peek(id: ExpenseDraftId): ExpenseDraft | null {
    return this.store.get(id as string) ?? null;
  }
}

class InMemoryAuditRepository implements AuditRepository {
  readonly entries: AuditLogEntry[] = [];

  async append(entry: Omit<AuditLogEntry, 'createdAt'>): Promise<AuditLogEntry> {
    const full: AuditLogEntry = {
      ...entry,
      createdAt: asDateTime('2026-07-29T10:00:00.000Z') as AuditLogEntry['createdAt'],
    };
    this.entries.push(full);
    return full;
  }
  async listByEntity(entityType: string, entityId: string) {
    return this.entries.filter((e) => e.entityType === entityType && e.entityId === entityId);
  }
  async listByActor(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: this.entries, hasMore: false };
  }
  async listByGroup(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: this.entries, hasMore: false };
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
      createdAt: asDateTime('2026-07-29T10:00:00.000Z') as SyncOperation['createdAt'],
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
    return this.ops.filter((o) => o.status === 'failed');
  }
  async markSyncing(id: string): Promise<void> {
    const op = this.ops.find((o) => o.id === id);
    if (op) (op as { status: SyncOperation['status'] }).status = 'syncing';
  }
  async markCompleted(id: string): Promise<void> {
    const idx = this.ops.findIndex((o) => o.id === id);
    if (idx >= 0) this.ops.splice(idx, 1);
  }
  async markFailed(): Promise<void> {}
  async markConflict(): Promise<void> {}
  async resetForRetry(): Promise<void> {}
  async countPending(): Promise<number> {
    return this.ops.filter((o) => o.status === 'pending').length;
  }
  async countConflicts(): Promise<number> {
    return this.ops.filter((o) => o.status === 'conflict' || o.status === 'permanently_failed').length;
  }
  async findById(id: string): Promise<SyncOperation | null> {
    return this.ops.find((o) => o.id === id) ?? null;
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
 * In-memory UnitOfWork — wraps a set of in-memory repositories and
 * simulates transaction semantics (rollback on error).
 */
class InMemoryUnitOfWork implements UnitOfWork {
  constructor(
    private readonly groups: InMemoryGroupRepository,
    private readonly expenses: InMemoryExpenseRepository,
    private readonly audit: InMemoryAuditRepository,
    private readonly sync: InMemorySyncRepository,
    private readonly drafts: InMemoryExpenseDraftRepository = new InMemoryExpenseDraftRepository(),
  ) {}

  async execute<T>(callback: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    // In-memory: no actual transaction. Snapshot all repo state so we can
    // roll back if the callback throws.
    const groupsSnapshot = new Map(this.groups['store']);
    const auditSnapshot = [...this.audit.entries];
    const syncSnapshot = [...this.sync.ops];
    const draftsSnapshot = new Map(this.drafts['store']);
    try {
      const ctx: UnitOfWorkContext = {
        users: undefined as never,
        groups: this.groups,
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
      // Rollback
      this.groups['store'].clear();
      for (const [k, v] of groupsSnapshot) this.groups['store'].set(k, v);
      this.audit.entries.length = 0;
      this.audit.entries.push(...auditSnapshot);
      this.sync.ops.length = 0;
      this.sync.ops.push(...syncSnapshot);
      this.drafts['store'].clear();
      for (const [k, v] of draftsSnapshot) this.drafts['store'].set(k, v);
      throw err;
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('UnitOfWork pattern (in-memory test doubles)', () => {
  const USER_ID = asUserId('user-1');
  const GROUP_ID = asGroupId('group-1');

  it('commits all writes when callback succeeds', async () => {
    const groups = new InMemoryGroupRepository();
    const expenses = new InMemoryExpenseRepository();
    const audit = new InMemoryAuditRepository();
    const sync = new InMemorySyncRepository();
    const uow = new InMemoryUnitOfWork(groups, expenses, audit, sync);

    const group = createGroup({
      id: GROUP_ID,
      name: 'Goa Trip',
      currencyCode: 'INR',
      createdBy: USER_ID,
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });

    await uow.execute(async (ctx) => {
      await ctx.groups.save(group);
      await ctx.audit.append({
        id: 'audit-1',
        entityType: 'group',
        entityId: group.id as string,
        action: 'create',
        actorId: USER_ID,
        newVersion: 1,
      });
      await ctx.enqueueSync({
        entityType: 'group',
        entityId: group.id as string,
        operation: 'create',
        payload: { name: 'Goa Trip' },
        idempotencyKey: 'idem-1',
        baseVersion: 0,
        localVersion: 1,
      });
    });

    // All three writes are persisted.
    expect(await groups.findById(GROUP_ID)).toEqual(group);
    expect(audit.entries).toHaveLength(1);
    expect(sync.ops).toHaveLength(1);
    expect(sync.ops[0]?.status).toBe('pending');
  });

  it('rolls back all writes when callback throws', async () => {
    const groups = new InMemoryGroupRepository();
    const expenses = new InMemoryExpenseRepository();
    const audit = new InMemoryAuditRepository();
    const sync = new InMemorySyncRepository();
    const uow = new InMemoryUnitOfWork(groups, expenses, audit, sync);

    const group = createGroup({
      id: GROUP_ID,
      name: 'Goa Trip',
      currencyCode: 'INR',
      createdBy: USER_ID,
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });

    await expect(
      uow.execute(async (ctx) => {
        await ctx.groups.save(group);
        await ctx.audit.append({
          id: 'audit-1',
          entityType: 'group',
          entityId: group.id as string,
          action: 'create',
          actorId: USER_ID,
        });
        await ctx.enqueueSync({
          entityType: 'group',
          entityId: group.id as string,
          operation: 'create',
          payload: {},
          idempotencyKey: 'idem-1',
          baseVersion: 0,
          localVersion: 1,
        });
        throw new Error('Simulated failure');
      }),
    ).rejects.toThrow('Simulated failure');

    // All writes are rolled back.
    expect(await groups.findById(GROUP_ID)).toBeNull();
    expect(audit.entries).toHaveLength(0);
    expect(sync.ops).toHaveLength(0);
  });

  it('enqueueSync helper delegates to sync repository', async () => {
    const groups = new InMemoryGroupRepository();
    const expenses = new InMemoryExpenseRepository();
    const audit = new InMemoryAuditRepository();
    const sync = new InMemorySyncRepository();
    const uow = new InMemoryUnitOfWork(groups, expenses, audit, sync);

    const op = await uow.execute(async (ctx) => {
      return ctx.enqueueSync({
        entityType: 'expense',
        entityId: 'exp-1',
        operation: 'create',
        payload: { amount: 1000 },
        idempotencyKey: 'idem-1',
        baseVersion: 0,
        localVersion: 1,
      });
    });

    expect(op.id).toBeDefined();
    expect(op.status).toBe('pending');
    expect(sync.ops).toHaveLength(1);
  });
});

describe('Repository contract types', () => {
  it('SyncOperation type has the expected shape', () => {
    const op: SyncOperation = {
      id: 'op-1',
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
      status: 'pending',
      retryCount: 0,
      createdAt: asDateTime('2026-07-29T10:00:00.000Z') as SyncOperation['createdAt'],
    };
    expect(op.id).toBe('op-1');
    expect(op.status).toBe('pending');
  });

  it('AuditLogEntry type has the expected shape', () => {
    const entry: AuditLogEntry = {
      id: 'audit-1',
      entityType: 'expense',
      entityId: 'exp-1',
      action: 'create',
      newVersion: 1,
      createdAt: asDateTime('2026-07-29T10:00:00.000Z') as AuditLogEntry['createdAt'],
    };
    expect(entry.action).toBe('create');
  });
});
