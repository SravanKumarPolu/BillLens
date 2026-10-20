import type { MemberId } from '@shared-types/index';

import type { SplitType } from '../../entities/expense';
import { InvalidSplitError } from '../../errors/index';
import type { Money } from '../../value-objects/money';

/**
 * Input to a split strategy: the total amount to split, the participating
 * members, and method-specific configuration.
 *
 * `participantIds` MUST be a non-empty list of unique member IDs. The
 * strategy implementation is responsible for sorting them deterministically
 * before distributing remainders (see `sortMemberIds` in `utils`).
 */
export interface SplitInput {
  readonly totalAmount: Money;
  readonly participantIds: readonly MemberId[];
}

/**
 * Output of a split strategy: a list of `ExpenseSplit`-shaped records
 * (without DB metadata like `id`, `expenseId`, `createdAt`, `version` —
 * those are added by the repository when persisting).
 *
 * The sum of `amountMinor` across all results MUST equal the input total.
 * The list is ordered the same as the sorted `participantIds`.
 */
export interface SplitResultEntry {
  readonly memberId: MemberId;
  readonly amountMinor: number;
  readonly percentageBasisPoints?: number;
  readonly shareUnits?: number;
}

export interface SplitResult {
  readonly splitType: SplitType;
  readonly totalAmountMinor: number;
  readonly currency: string;
  readonly entries: readonly SplitResultEntry[];
}

/**
 * Common interface for all split strategies. Each strategy takes a typed
 * input and returns a deterministic `SplitResult`.
 *
 * Implementations MUST:
 *   - Reject empty participant lists
 *   - Reject duplicate participant IDs
 *   - Sort participant IDs deterministically before distributing remainder
 *   - Ensure `Σ entries.amountMinor === totalAmount.toMinor()`
 *   - Be pure functions (no side effects, no I/O)
 */
export interface SplitStrategy<TInput extends SplitInput> {
  readonly splitType: SplitType;
  calculate(input: TInput): SplitResult;
}

/**
 * Validate that `participantIds` is non-empty and contains no duplicates.
 * Sorts the IDs deterministically (ascending string order) so remainder
 * distribution is reproducible across runs and devices.
 *
 * @returns The sorted, unique participant IDs.
 */
export function prepareParticipants(
  participantIds: readonly MemberId[],
): MemberId[] {
  if (participantIds.length === 0) {
    throw new InvalidSplitError('Cannot split: participant list is empty');
  }
  const seen = new Set<string>();
  for (const id of participantIds) {
    const key = id as string;
    if (seen.has(key)) {
      throw new InvalidSplitError(`Duplicate participant ID: ${id}`);
    }
    seen.add(key);
  }
  return sortMemberIds(participantIds);
}

/**
 * Deterministic sort for member IDs. Uses string comparison so the order
 * is the same on every device and in every test run.
 */
export function sortMemberIds(ids: readonly MemberId[]): MemberId[] {
  return [...ids].sort((a, b) => {
    const sa = a as string;
    const sb = b as string;
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  });
}

/**
 * Validate the invariant `Σ entries.amountMinor === totalAmountMinor`.
 * Throws `InvalidSplitError` if the invariant is violated.
 */
export function assertTotalPreserved(
  totalAmountMinor: number,
  entries: readonly SplitResultEntry[],
): void {
  const sum = entries.reduce((acc, e) => acc + e.amountMinor, 0);
  if (sum !== totalAmountMinor) {
    throw new InvalidSplitError(
      `Split total mismatch: sum of entries (${sum}) does not equal total (${totalAmountMinor})`,
    );
  }
}
