import type { MemberId } from '@shared-types/index';

import { type Money } from '../../value-objects/money';

import type { SplitInput, SplitResult, SplitResultEntry, SplitStrategy } from './split-strategy';
import { assertTotalPreserved, prepareParticipants } from './split-strategy';

/**
 * Equal split strategy.
 *
 * Distributes the total amount equally across all participants. When the
 * amount does not divide evenly, the remainder (in minor units) is
 * distributed one unit at a time to the earliest participants (after
 * deterministic sorting).
 *
 * Example: ₹10.00 split between 3 people:
 *   1000 minor / 3 = 333 r 1
 *   → [334, 333, 333]
 *
 * Example: ₹0.01 split between 3 people:
 *   1 minor / 3 = 0 r 1
 *   → [1, 0, 0]
 *
 * The first recipient (after sort) gets the extra minor unit. This is
 * deterministic and reproducible across devices.
 */
// No additional fields — equal split needs only the total and participants.
export type EqualSplitInput = SplitInput;

export class EqualSplitStrategy implements SplitStrategy<EqualSplitInput> {
  readonly splitType = 'equal' as const;

  calculate(input: EqualSplitInput): SplitResult {
    const sortedIds = prepareParticipants(input.participantIds);
    const shares = input.totalAmount.allocate(sortedIds.length);
    const entries: SplitResultEntry[] = sortedIds.map((memberId, i) => {
      const share = shares[i];
      if (!share) {
        // Unreachable: shares has the same length as sortedIds
        throw new Error('Internal error: share index out of range');
      }
      return {
        memberId,
        amountMinor: share.toMinor(),
      };
    });
    assertTotalPreserved(input.totalAmount.toMinor(), entries);
    return {
      splitType: this.splitType,
      totalAmountMinor: input.totalAmount.toMinor(),
      currency: input.totalAmount.getCurrency(),
      entries,
    };
  }
}

/**
 * Convenience function for callers that don't want to instantiate the class.
 */
export function calculateEqualSplit(
  totalAmount: Money,
  participantIds: readonly MemberId[],
): SplitResult {
  return new EqualSplitStrategy().calculate({ totalAmount, participantIds });
}
