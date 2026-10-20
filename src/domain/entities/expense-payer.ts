import type { ExpenseId, ExpensePayerId, MemberId } from '@shared-types/index';

import { DeletedEntityError, InvalidEntityError, VersionConflictError } from '../errors/index';
import {
  type DateTime,
  type VersionNumber,
  asDateTime,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asExpensePayerId(value: string): ExpensePayerId {
  return value as ExpensePayerId;
}

/**
 * A single payer contribution to an expense.
 *
 * An expense may have multiple payers (e.g. split-the-bill where two
 * people each pay part of the total). The sum of all `ExpensePayer.amountMinor`
 * for a given `expenseId` MUST equal `Expense.amountMinor`. This invariant
 * is enforced by `validatePayerTotal` in `expense.ts`.
 */
export interface ExpensePayer {
  readonly id: ExpensePayerId;
  readonly expenseId: ExpenseId;
  readonly memberId: MemberId;
  readonly amountMinor: number;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
}

export interface ExpensePayerCreateInput {
  readonly id: ExpensePayerId;
  readonly expenseId: ExpenseId;
  readonly memberId: MemberId;
  readonly amountMinor: number;
  readonly now?: DateTime;
}

export function createExpensePayer(input: ExpensePayerCreateInput): ExpensePayer {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new InvalidEntityError(
      `Payer amount must be a non-negative integer, got ${input.amountMinor}`,
    );
  }
  if (!Number.isSafeInteger(input.amountMinor)) {
    throw new InvalidEntityError(
      `Payer amount outside safe integer range: ${input.amountMinor}`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    expenseId: input.expenseId,
    memberId: input.memberId,
    amountMinor: input.amountMinor,
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface ExpensePayerSoftDeleteInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

/**
 * Soft-delete an `ExpensePayer`.
 *
 * Soft-deletion preserves the row for historical integrity (audit trail,
 * balance explanations) but excludes it from future balance calculations
 * and prevents further mutation. The payer's `version` is incremented so
 * optimistic-concurrency clients detect the change.
 *
 * @throws `VersionConflictError` if `expectedVersion` does not match the
 *   payer's current `version`.
 * @throws `DeletedEntityError` if the payer is already soft-deleted.
 */
export function softDeleteExpensePayer(
  current: ExpensePayer,
  input: ExpensePayerSoftDeleteInput,
): ExpensePayer {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `ExpensePayer version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new DeletedEntityError(
      `ExpensePayer ${current.id} is already deleted`,
      'ExpensePayer',
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
