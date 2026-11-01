import type { ExpenseId, GroupId, MemberId, ReceiptId } from '@shared-types/index';

import type { Expense } from '../entities/expense';
import type { ExpensePayer } from '../entities/expense-payer';
import type { ExpenseSplit } from '../entities/expense-split';
import type { DateTime } from '../value-objects/date-time';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `Expense` entity and its dependent records
 * (ExpensePayer, ExpenseSplit).
 *
 * IMPORTANT: saving an expense MUST atomically save the expense itself
 * AND all of its payers and splits, within a single transaction. This
 * is enforced by the `UnitOfWork` abstraction (see `unit-of-work.ts`).
 */
export interface ExpenseRepository {
  findById(id: ExpenseId): Promise<Expense | null>;
  /** List active (non-deleted) expenses for a group, ordered by expenseDate DESC. */
  listByGroup(groupId: GroupId, pagination: Pagination): Promise<PaginatedResult<Expense>>;
  /** List expenses updated since a given timestamp (used by sync engine). */
  listUpdatedSince(groupId: GroupId, since: DateTime, pagination: Pagination): Promise<PaginatedResult<Expense>>;
  /** Find expenses linked to a specific receipt (for duplicate detection). */
  listByReceipt(receiptId: ReceiptId): Promise<readonly Expense[]>;
  /** Get all payers for an expense. */
  listPayers(expenseId: ExpenseId): Promise<readonly ExpensePayer[]>;
  /** Get all splits for an expense. */
  listSplits(expenseId: ExpenseId): Promise<readonly ExpenseSplit[]>;
  /**
   * Save an expense atomically with its payers and splits.
   * The payers and splits arrays REPLACE any existing payers/splits for
   * this expense (full replacement, not partial update).
   */
  save(expense: Expense, payers: readonly ExpensePayer[], splits: readonly ExpenseSplit[]): Promise<void>;
  softDelete(id: ExpenseId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
  /** Count expenses paid by a member (for balance engine audits). */
  countByPayer(payerId: MemberId): Promise<number>;
}
