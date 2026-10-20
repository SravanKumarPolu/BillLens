import type { MemberId } from '@shared-types/index';

import { InvalidSplitError } from '../../errors/index';
import { type Money } from '../../value-objects/money';

import type { SplitInput, SplitResult, SplitResultEntry, SplitStrategy } from './split-strategy';
import { assertTotalPreserved, prepareParticipants } from './split-strategy';

/**
 * Exact split strategy.
 *
 * Each participant is assigned an explicit amount. The sum of all
 * assigned amounts MUST equal the total expense amount — under- and
 * over-allocation are rejected.
 *
 * The order of `amounts` MUST match the order of `participantIds`. The
 * strategy internally sorts participants for deterministic output, but
 * the input mapping is preserved.
 */
export interface ExactSplitInput extends SplitInput {
  /** Per-participant exact amount, indexed to match `participantIds`. */
  readonly amounts: readonly Money[];
}

export class ExactSplitStrategy implements SplitStrategy<ExactSplitInput> {
  readonly splitType = 'exact' as const;

  calculate(input: ExactSplitInput): SplitResult {
    if (input.amounts.length !== input.participantIds.length) {
      throw new InvalidSplitError(
        `Exact split: amounts length (${input.amounts.length}) does not match participants length (${input.participantIds.length})`,
      );
    }

    // Verify all currencies match.
    for (const amount of input.amounts) {
      if (amount.getCurrency() !== input.totalAmount.getCurrency()) {
        throw new InvalidSplitError(
          `Exact split: amount currency ${amount.getCurrency()} does not match total currency ${input.totalAmount.getCurrency()}`,
        );
      }
    }

    // Build a map from memberId → amount, then sort and produce entries.
    const amountMap = new Map<string, Money>();
    input.participantIds.forEach((id, i) => {
      const amount = input.amounts[i];
      if (!amount) {
        throw new InvalidSplitError(`Missing amount for participant index ${i}`);
      }
      amountMap.set(id as string, amount);
    });

    const sortedIds = prepareParticipants(input.participantIds);
    const entries: SplitResultEntry[] = sortedIds.map((memberId) => {
      const amount = amountMap.get(memberId as string);
      if (!amount) {
        throw new InvalidSplitError(`Missing amount for participant ${memberId}`);
      }
      return {
        memberId,
        amountMinor: amount.toMinor(),
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
 *
 * @example
 *   const result = calculateExactSplit(
 *     Money.fromMinor(1000, 'INR'),
 *     [asMemberId('a'), asMemberId('b')],
 *     [Money.fromMinor(600, 'INR'), Money.fromMinor(400, 'INR')],
 *   );
 */
export function calculateExactSplit(
  totalAmount: Money,
  participantIds: readonly MemberId[],
  amounts: readonly Money[],
): SplitResult {
  return new ExactSplitStrategy().calculate({ totalAmount, participantIds, amounts });
}
