/**
 * Search expenses across the groups the user can see.
 *
 * SQLite does the filtering and bounding; the UI never loads a full group
 * history into memory. `group_id IN (...)` keeps the existing
 * `idx_expenses_group_date` index usable.
 */

import type {
  ExpenseSearchCriteria,
  ExpenseSearchRepository,
  ExpenseSearchResult,
} from '@domain/repositories/expense-search.repository';
import type { GroupId } from '@shared-types/index';

export interface SearchExpensesInput {
  readonly groupIds: readonly GroupId[];
  readonly text?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly minAmountMinor?: number;
  readonly maxAmountMinor?: number;
  readonly limit?: number;
  readonly offset?: number;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function nonNegativeInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export class SearchExpensesUseCase {
  constructor(private readonly repository: ExpenseSearchRepository) {}

  async execute(input: SearchExpensesInput): Promise<ExpenseSearchResult> {
    const text = input.text?.trim();

    if (input.fromDate !== undefined && !DATE_PATTERN.test(input.fromDate)) {
      throw new Error('Start date must be YYYY-MM-DD.');
    }
    if (input.toDate !== undefined && !DATE_PATTERN.test(input.toDate)) {
      throw new Error('End date must be YYYY-MM-DD.');
    }
    if (input.fromDate !== undefined && input.toDate !== undefined && input.fromDate > input.toDate) {
      throw new Error('Start date must be on or before the end date.');
    }
    const min = input.minAmountMinor;
    const max = input.maxAmountMinor;
    if (min !== undefined && min < 0) throw new Error('Minimum amount cannot be negative.');
    if (max !== undefined && max < 0) throw new Error('Maximum amount cannot be negative.');
    if (min !== undefined && max !== undefined && min > max) {
      throw new Error('Minimum amount cannot exceed the maximum.');
    }

    const criteria: ExpenseSearchCriteria = {
      groupIds: [...new Set(input.groupIds)],
      ...(text !== undefined && text.length > 0 ? { text } : {}),
      ...(input.fromDate !== undefined ? { fromDate: input.fromDate } : {}),
      ...(input.toDate !== undefined ? { toDate: input.toDate } : {}),
      ...(min !== undefined ? { minAmountMinor: min } : {}),
      ...(max !== undefined ? { maxAmountMinor: max } : {}),
      limit: Math.min(MAX_LIMIT, nonNegativeInt(input.limit, DEFAULT_LIMIT) || DEFAULT_LIMIT),
      offset: nonNegativeInt(input.offset, 0),
    };

    if (criteria.groupIds.length === 0) return { hits: [], hasMore: false };
    return this.repository.search(criteria);
  }
}
