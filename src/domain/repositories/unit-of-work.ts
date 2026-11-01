import type { AuditRepository } from './audit.repository';
import type { ExpenseDraftRepository } from './expense-draft.repository';
import type { ExpenseRepository } from './expense.repository';
import type { GroupInviteRepository } from './group-invite.repository';
import type { GroupMemberRepository } from './group-member.repository';
import type { GroupRepository } from './group.repository';
import type { ReceiptRepository } from './receipt.repository';
import type { SettlementRepository } from './settlement.repository';
import type { SyncConflictRepository, SyncOperation } from './sync.repository';
import type { SyncRepository } from './sync.repository';
import type { UserRepository } from './user.repository';

/**
 * Unit of Work — abstraction for atomic multi-repository transactions.
 *
 * BillLens's most important invariant is that financial mutations are
 * atomic. When a user adds an expense, the system must save:
 *
 *   - The expense record
 *   - All expense_payers records
 *   - All expense_splits records
 *   - An audit_log entry
 *   - A sync_operations entry (for the offline sync queue)
 *
 * If ANY of these fails, ALL must roll back. Otherwise the local
 * database would be in an inconsistent state (e.g. an expense with no
 * splits, or splits with no expense).
 *
 * The UnitOfWork pattern provides a single `execute` method that wraps
 * a callback. The callback receives a `UnitOfWorkContext` that exposes
 * repository-like methods operating within the transaction. If the
 * callback throws, the transaction is rolled back; if it returns
 * successfully, the transaction is committed.
 *
 * The concrete implementation (SQLite transaction in Prompt 8) handles
 * the actual BEGIN/COMMIT/ROLLBACK. The domain interface is storage-
 * agnostic.
 */
export interface UnitOfWork {
  /**
   * Execute a callback within a transaction.
   *
   * @param callback Receives a UnitOfWorkContext with access to all
   *                 repositories operating within the transaction.
   * @returns The callback's return value.
   * @throws Whatever the callback throws (transaction is rolled back).
   */
  execute<T>(callback: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T>;
}

/**
 * Context passed to a UnitOfWork callback. Provides access to all
 * repositories operating within the current transaction, plus a method
 * to enqueue sync operations atomically.
 *
 * The context is single-use: after the callback returns (or throws),
 * it cannot be reused.
 */
export interface UnitOfWorkContext {
  readonly users: UserRepository;
  readonly groups: GroupRepository;
  readonly members: GroupMemberRepository;
  readonly invites: GroupInviteRepository;
  readonly expenses: ExpenseRepository;
  readonly drafts: ExpenseDraftRepository;
  readonly receipts: ReceiptRepository;
  readonly settlements: SettlementRepository;
  readonly audit: AuditRepository;
  readonly sync: SyncRepository;
  readonly conflicts: SyncConflictRepository;

  /**
   * Enqueue a sync operation within the current transaction.
   * If the transaction commits, the operation is persisted; if it
   * rolls back, the operation is discarded.
   *
   * Convenience method — equivalent to `ctx.sync.enqueue(...)` but
   * highlighted here because it's the most common operation in
   * financial mutations.
   */
  enqueueSync(operation: Omit<SyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt'>): Promise<SyncOperation>;
}

/**
 * Thrown when a UnitOfWork execution fails. The original error is
 * preserved in `cause`.
 */
export class UnitOfWorkError extends Error {
  readonly code = 'UNIT_OF_WORK_ERROR';
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UnitOfWorkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
