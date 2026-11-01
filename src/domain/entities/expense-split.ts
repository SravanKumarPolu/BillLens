import type { ExpenseId, ExpenseSplitId, MemberId } from '@shared-types/index';

import { DeletedEntityError, InvalidSplitError, VersionConflictError } from '../errors/index';
import {
  type BasisPoints,
  type DateTime,
  type ShareUnits,
  type VersionNumber,
  asDateTime,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asExpenseSplitId(value: string): ExpenseSplitId {
  return value as ExpenseSplitId;
}

/**
 * A single member's share of an expense.
 *
 * Depending on the parent expense's `splitType`, different fields are
 * populated:
 *
 *   - `equal`     → only `amountMinor` matters; `percentageBasisPoints`
 *                   and `shareUnits` are undefined.
 *   - `exact`     → only `amountMinor` matters.
 *   - `percentage`→ `percentageBasisPoints` is set; `amountMinor` is
 *                   derived from it. Sum of all members' basis points
 *                   MUST equal 10,000.
 *   - `shares`    → `shareUnits` is set; `amountMinor` is derived from it.
 *                   Sum of all members' share units is arbitrary (≥ 1).
 *   - `items`     → `amountMinor` is derived from the items assigned to
 *                   this member. `percentageBasisPoints` and `shareUnits`
 *                   are undefined.
 *
 * The sum of all `ExpenseSplit.amountMinor` for a given `expenseId` MUST
 * equal `Expense.amountMinor`. This invariant is enforced by
 * `validateSplitTotal` below.
 */
export interface ExpenseSplit {
  readonly id: ExpenseSplitId;
  readonly expenseId: ExpenseId;
  readonly memberId: MemberId;
  readonly amountMinor: number;
  readonly percentageBasisPoints?: BasisPoints;
  readonly shareUnits?: ShareUnits;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
}

export interface ExpenseSplitCreateInput {
  readonly id: ExpenseSplitId;
  readonly expenseId: ExpenseId;
  readonly memberId: MemberId;
  readonly amountMinor: number;
  readonly percentageBasisPoints?: number;
  readonly shareUnits?: number;
  readonly now?: DateTime;
}

export function createExpenseSplit(input: ExpenseSplitCreateInput): ExpenseSplit {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new InvalidSplitError(
      `Split amount must be a non-negative integer, got ${input.amountMinor}`,
    );
  }
  if (!Number.isSafeInteger(input.amountMinor)) {
    throw new InvalidSplitError(
      `Split amount outside safe integer range: ${input.amountMinor}`,
    );
  }
  if (input.percentageBasisPoints !== undefined && (input.percentageBasisPoints < 0 || input.percentageBasisPoints > 10000)) {
    throw new InvalidSplitError(
      `percentageBasisPoints must be in [0, 10000], got ${input.percentageBasisPoints}`,
    );
  }
  if (input.shareUnits !== undefined && (input.shareUnits <= 0 || !Number.isInteger(input.shareUnits))) {
    throw new InvalidSplitError(`shareUnits must be a positive integer, got ${input.shareUnits}`);
  }
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    expenseId: input.expenseId,
    memberId: input.memberId,
    amountMinor: input.amountMinor,
    ...(input.percentageBasisPoints !== undefined ? { percentageBasisPoints: input.percentageBasisPoints as BasisPoints } : {}),
    ...(input.shareUnits !== undefined ? { shareUnits: input.shareUnits as ShareUnits } : {}),
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface ExpenseSplitSoftDeleteInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

/**
 * Soft-delete an `ExpenseSplit`.
 *
 * Soft-deletion preserves the row for historical integrity (audit trail,
 * balance explanations) but excludes it from future balance calculations
 * and prevents further mutation. The split's `version` is incremented so
 * optimistic-concurrency clients detect the change.
 *
 * @throws `VersionConflictError` if `expectedVersion` does not match the
 *   split's current `version`.
 * @throws `DeletedEntityError` if the split is already soft-deleted.
 */
export function softDeleteExpenseSplit(
  current: ExpenseSplit,
  input: ExpenseSplitSoftDeleteInput,
): ExpenseSplit {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `ExpenseSplit version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new DeletedEntityError(
      `ExpenseSplit ${current.id} is already deleted`,
      'ExpenseSplit',
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

/**
 * Validate that the sum of split amounts equals the expense total.
 * Throws `InvalidSplitError` on mismatch.
 */
export function validateSplitTotal(
  expenseTotalMinor: number,
  splits: readonly ExpenseSplit[],
): void {
  if (splits.length === 0) {
    throw new InvalidSplitError('Cannot validate splits: empty list');
  }
  const sum = splits.reduce((acc, s) => acc + s.amountMinor, 0);
  if (sum !== expenseTotalMinor) {
    throw new InvalidSplitError(
      `Sum of split amounts (${sum}) does not equal expense total (${expenseTotalMinor})`,
    );
  }
}

/**
 * Validate that percentage splits sum to exactly 10,000 basis points.
 */
export function validatePercentageTotal(splits: readonly ExpenseSplit[]): void {
  for (const s of splits) {
    if (s.percentageBasisPoints === undefined) {
      throw new InvalidSplitError(
        `Split for member ${s.memberId} is missing percentageBasisPoints — required for percentage splits`,
      );
    }
  }
  const total = splits.reduce((acc, s) => acc + (s.percentageBasisPoints ?? 0), 0);
  if (total !== 10000) {
    throw new InvalidSplitError(
      `Sum of percentage basis points (${total}) does not equal 10,000 (100%)`,
    );
  }
}

/**
 * Validate that share units are all positive integers.
 */
export function validateShareUnits(splits: readonly ExpenseSplit[]): void {
  for (const s of splits) {
    if (s.shareUnits === undefined || s.shareUnits <= 0) {
      throw new InvalidSplitError(
        `Split for member ${s.memberId} has invalid shareUnits: ${s.shareUnits}`,
      );
    }
  }
}

/**
 * Validate that no two splits reference the same member.
 */
export function validateNoDuplicateMembers(splits: readonly ExpenseSplit[]): void {
  const seen = new Set<string>();
  for (const s of splits) {
    const key = s.memberId as string;
    if (seen.has(key)) {
      throw new InvalidSplitError(`Duplicate member in splits: ${s.memberId}`);
    }
    seen.add(key);
  }
}
