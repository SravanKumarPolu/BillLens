import type { ExpenseId, GroupId, ReceiptId, UserId } from '@shared-types/index';

import {
  DeletedEntityError,
  EmptyValueError,
  InvalidEntityError,
  InvalidSplitError,
  PayerTotalMismatchError,
  ValueTooLongError,
  VersionConflictError,
} from '../errors/index';
import {
  type CurrencyCode,
  type DateTime,
  type Money,
  type VersionNumber,
  asCurrencyCode,
  asDateTime,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';

import type { ExpensePayer } from './expense-payer';
import {
  validateNoDuplicateMembers,
  validatePercentageTotal,
  validateShareUnits,
  validateSplitTotal,
} from './expense-split';
import type { ExpenseSplit } from './expense-split';


export function asExpenseId(value: string): ExpenseId {
  return value as ExpenseId;
}

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'items';

export const EXPENSE_TITLE_MAX_LENGTH = 200;
export const EXPENSE_NOTE_MAX_LENGTH = 1000;

export interface Expense {
  readonly id: ExpenseId;
  readonly groupId: GroupId;
  readonly title: string;
  readonly amountMinor: number;
  readonly currencyCode: CurrencyCode;
  readonly expenseDate: DateTime;
  readonly splitType: SplitType;
  readonly receiptId?: ReceiptId;
  readonly note?: string;
  readonly category?: string;
  readonly createdBy: UserId;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
}

export interface ExpenseCreateInput {
  readonly id: ExpenseId;
  readonly groupId: GroupId;
  readonly title: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly expenseDate: string;
  readonly splitType: SplitType;
  readonly receiptId?: string;
  readonly note?: string;
  readonly category?: string;
  readonly createdBy: UserId;
  readonly now?: DateTime;
}

export function createExpense(input: ExpenseCreateInput): Expense {
  validateExpenseTitle(input.title);
  if (input.note !== undefined) validateExpenseNote(input.note);
  if (input.category !== undefined) validateExpenseCategory(input.category);

  validateExpenseAmount(input.amountMinor);

  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    groupId: input.groupId,
    title: input.title.trim(),
    amountMinor: input.amountMinor,
    currencyCode: asCurrencyCode(input.currencyCode),
    expenseDate: asDateTime(input.expenseDate),
    splitType: input.splitType,
    ...(input.receiptId !== undefined ? { receiptId: input.receiptId as ReceiptId } : {}),
    ...(input.note !== undefined ? { note: input.note.trim() } : {}),
    ...(input.category !== undefined ? { category: input.category.trim() } : {}),
    createdBy: input.createdBy,
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface ExpenseUpdateInput {
  readonly title?: string;
  readonly amountMinor?: number;
  readonly expenseDate?: string;
  readonly note?: string;
  readonly category?: string;
  /** Split method may change; currency is immutable. */
  readonly splitType?: SplitType;
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function updateExpense(current: Expense, input: ExpenseUpdateInput): Expense {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `Expense version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new DeletedEntityError(
      `Expense ${current.id} is deleted and cannot be updated`,
      'Expense',
      current.id,
    );
  }
  if (input.title !== undefined) validateExpenseTitle(input.title);
  if (input.note !== undefined) validateExpenseNote(input.note);
  if (input.category !== undefined) validateExpenseCategory(input.category);
  if (input.amountMinor !== undefined) validateExpenseAmount(input.amountMinor);
  if (input.expenseDate !== undefined) asDateTime(input.expenseDate);

  const now = input.now ?? nowDateTime();
  return {
    ...current,
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
    ...(input.expenseDate !== undefined ? { expenseDate: asDateTime(input.expenseDate) } : {}),
    ...(input.note !== undefined ? { note: input.note.trim() } : {}),
    ...(input.category !== undefined ? { category: input.category.trim() } : {}),
    ...(input.splitType !== undefined ? { splitType: input.splitType } : {}),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export interface ExpenseSoftDeleteInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function softDeleteExpense(current: Expense, input: ExpenseSoftDeleteInput): Expense {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `Expense version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new DeletedEntityError(
      `Expense ${current.id} is already deleted`,
      'Expense',
      current.id,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    deletedAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export function isExpenseActive(expense: Expense): boolean {
  return expense.deletedAt === undefined;
}

// -------------------------------------------------------------------------
// Validation helpers
// -------------------------------------------------------------------------

export function validateExpenseTitle(title: string): void {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new EmptyValueError('Expense title must not be empty');
  }
  if (trimmed.length > EXPENSE_TITLE_MAX_LENGTH) {
    throw new ValueTooLongError(
      `Expense title too long: ${trimmed.length} > ${EXPENSE_TITLE_MAX_LENGTH}`,
      'title',
      EXPENSE_TITLE_MAX_LENGTH,
      trimmed.length,
    );
  }
}

export function validateExpenseNote(note: string): void {
  if (note.length > EXPENSE_NOTE_MAX_LENGTH) {
    throw new ValueTooLongError(
      `Expense note too long: ${note.length} > ${EXPENSE_NOTE_MAX_LENGTH}`,
      'note',
      EXPENSE_NOTE_MAX_LENGTH,
      note.length,
    );
  }
}

export function validateExpenseCategory(category: string): void {
  if (category.length > 50) {
    throw new ValueTooLongError(
      `Expense category too long: ${category.length} > 50`,
      'category',
      50,
      category.length,
    );
  }
}

/**
 * Validate the amount of an expense. The amount must be a positive integer
 * (minor units). Zero is rejected unless explicitly defined as a valid
 * adjustment record — that's a separate concern handled by the split engine.
 *
 * Negative amounts are always rejected.
 */
export function validateExpenseAmount(amountMinor: number): void {
  if (!Number.isFinite(amountMinor)) {
    throw new InvalidEntityError(
      `Expense amount must be a finite number, got ${amountMinor}`,
    );
  }
  if (!Number.isSafeInteger(amountMinor)) {
    throw new InvalidEntityError(
      `Expense amount must be a safe integer (minor units), got ${amountMinor}`,
    );
  }
  if (amountMinor < 0) {
    throw new InvalidEntityError(`Expense amount cannot be negative: ${amountMinor}`);
  }
  if (amountMinor === 0) {
    throw new InvalidEntityError(
      'Expense amount cannot be zero. Use a designated adjustment record type for zero-value adjustments (Phase 2 feature).',
    );
  }
}

/**
 * Validate that the sum of payer amounts equals the expense total.
 * Throws `PayerTotalMismatchError` on mismatch.
 */
export function validatePayerTotal(
  expenseTotal: Money | number,
  payerAmounts: readonly (Money | number)[],
): void {
  const total = moneyToMinor(expenseTotal);
  const sum = payerAmounts.reduce<number>((acc, p) => acc + moneyToMinor(p), 0);
  if (sum !== total) {
    throw new PayerTotalMismatchError(
      `Sum of payer amounts (${sum}) does not equal expense total (${total})`,
      total,
      sum,
    );
  }
}

/** Convert a Money-or-number value to its minor-unit number representation. */
function moneyToMinor(value: Money | number): number {
  return typeof value === 'number' ? value : value.toMinor();
}

/**
 * Validate an expense aggregate — the expense itself plus its payers and splits.
 *
 * This is the primary entry point for expense creation and update. It enforces
 * ALL cross-entity invariants that `createExpense` alone cannot check (because
 * payers and splits are separate entities in the DDD design):
 *
 *   1. At least one payer exists.
 *   2. At least one split exists.
 *   3. Sum of payer amounts equals expense total.
 *   4. Sum of split amounts equals expense total.
 *   5. No duplicate members in splits.
 *   6. For percentage splits: sum of basis points = 10,000 and all splits have basis points.
 *   7. For share splits: all splits have positive share units.
 *   8. Expense currency matches group currency (Phase 1 single-currency).
 *
 * @throws `InvalidSplitError` if no payers, no splits, or split invariants fail.
 * @throws `PayerTotalMismatchError` if payer sum ≠ expense total.
 * @throws `InvalidEntityError` if currency mismatch.
 */
export function validateExpenseAggregate(
  expense: Expense,
  payers: readonly ExpensePayer[],
  splits: readonly ExpenseSplit[],
  groupCurrencyCode?: CurrencyCode,
): void {
  // 1. At least one payer
  if (payers.length === 0) {
    throw new InvalidSplitError(
      `Expense ${expense.id} must have at least one payer`,
    );
  }

  // 2. At least one split
  if (splits.length === 0) {
    throw new InvalidSplitError(
      `Expense ${expense.id} must have at least one participant split`,
    );
  }

  // 3. Payer total = expense total
  validatePayerTotal(expense.amountMinor, payers.map((p) => p.amountMinor));

  // 4. Split total = expense total
  validateSplitTotal(expense.amountMinor, splits);

  // 5. No duplicate members in splits
  validateNoDuplicateMembers(splits);

  // 6. Percentage splits: sum of basis points = 10,000
  if (expense.splitType === 'percentage') {
    validatePercentageTotal(splits);
  }

  // 7. Share splits: all share units positive
  if (expense.splitType === 'shares') {
    validateShareUnits(splits);
  }

  // 8. Currency match with group (if group currency provided)
  if (groupCurrencyCode !== undefined && expense.currencyCode !== groupCurrencyCode) {
    throw new InvalidEntityError(
      `Expense ${expense.id} currency ${expense.currencyCode} does not match group currency ${groupCurrencyCode}`,
    );
  }
}
