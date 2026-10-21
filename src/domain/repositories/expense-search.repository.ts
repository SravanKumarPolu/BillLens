/**
 * Cross-group expense search.
 *
 * Read-side port kept separate from `ExpenseRepository` so search can join
 * group names and apply filters without expanding the write aggregate's
 * contract. The SQL adapter constrains `group_id IN (...)` so SQLite can use
 * `idx_expenses_group_date`.
 */

import type { Expense } from '@domain/entities/expense';
import type { GroupId } from '@shared-types/index';

export interface ExpenseSearchCriteria {
  /** Groups the caller can see. Empty means "no groups" (no results). */
  readonly groupIds: readonly GroupId[];
  /** Free text matched against title, note and category (case-insensitive). */
  readonly text?: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  readonly fromDate?: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  readonly toDate?: string;
  /** Inclusive amount bounds in minor units. */
  readonly minAmountMinor?: number;
  readonly maxAmountMinor?: number;
  readonly limit: number;
  readonly offset: number;
}

export interface ExpenseSearchHit {
  readonly expense: Expense;
  readonly groupName: string;
}

export interface ExpenseSearchResult {
  readonly hits: readonly ExpenseSearchHit[];
  /** True when another page exists. */
  readonly hasMore: boolean;
}

export interface ExpenseSearchRepository {
  search(criteria: ExpenseSearchCriteria): Promise<ExpenseSearchResult>;
}
