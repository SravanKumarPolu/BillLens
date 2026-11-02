import type { MemberId } from '@shared-types/index';

import { InvalidSplitError } from '../../errors/index';
import { type Money } from '../../value-objects/money';

import type { SplitInput, SplitResult, SplitResultEntry, SplitStrategy } from './split-strategy';
import { assertTotalPreserved, prepareParticipants } from './split-strategy';

/**
 * Share-unit split strategy.
 *
 * Each participant is assigned a positive integer number of "share units".
 * The total amount is distributed proportionally to the share weights:
 *
 *   amountMinor = floor(totalAmountMinor × memberShares / totalShares)
 *
 * Remainder (caused by floor rounding) is distributed one minor unit at a
 * time to participants with the largest fractional remainder, with
 * deterministic tie-breaking by index ascending.
 *
 * Example: ₹300.00 split with shares [1, 1, 2]
 *   30000 minor, totalShares = 4
 *   raw[0] = 30000 × 1 / 4 = 7500.0 → 7500, fraction 0
 *   raw[1] = 7500.0 → 7500, fraction 0
 *   raw[2] = 15000.0 → 15000, fraction 0
 *   No remainder → [7500, 7500, 15000]
 *
 * Example: ₹100.00 split with shares [1, 1, 1]
 *   10000 minor, totalShares = 3
 *   raw[0] = 3333.33... → 3333, fraction 0.33
 *   raw[1] = same
 *   raw[2] = same
 *   Allocated 9999, remainder 1 → distributed to first by tie-break
 *   → [3334, 3333, 3333]
 */
export interface ShareSplitInput extends SplitInput {
  /** Per-participant share units, indexed to match `participantIds`. */
  readonly shareUnits: readonly number[];
}

export class ShareSplitStrategy implements SplitStrategy<ShareSplitInput> {
  readonly splitType = 'shares' as const;

  calculate(input: ShareSplitInput): SplitResult {
    if (input.shareUnits.length !== input.participantIds.length) {
      throw new InvalidSplitError(
        `Share split: shareUnits length (${input.shareUnits.length}) does not match participants length (${input.participantIds.length})`,
      );
    }

    // Validate share units are positive integers.
    let totalShares = 0;
    for (const s of input.shareUnits) {
      if (!Number.isInteger(s) || s <= 0) {
        throw new InvalidSplitError(
          `Share split: share units must be positive integers, got ${s}`,
        );
      }
      totalShares += s;
    }

    const totalMinor = input.totalAmount.toMinor();
    const sortedIds = prepareParticipants(input.participantIds);

    // Map memberId → shareUnits.
    const sharesMap = new Map<string, number>();
    input.participantIds.forEach((id, i) => {
      const s = input.shareUnits[i];
      if (s === undefined) {
        throw new InvalidSplitError(`Missing share units for participant index ${i}`);
      }
      sharesMap.set(id as string, s);
    });

    interface Alloc {
      memberId: MemberId;
      shares: number;
      floor: number;
      remainder: number;
    }
    const allocs: Alloc[] = sortedIds.map((memberId) => {
      const shares = sharesMap.get(memberId as string) ?? 0;
      // Overflow guard: totalMinor * shares must remain in the safe
      // integer range, otherwise the integer remainder arithmetic below
      // would silently lose precision.
      if (!Number.isSafeInteger(totalMinor * shares)) {
        throw new InvalidSplitError(
          `Overflow: totalMinor (${totalMinor}) * shares (${shares}) exceeds safe integer range`,
        );
      }
      const product = totalMinor * shares;
      const floor = Math.floor(product / totalShares);
      const remainder = product % totalShares;
      return { memberId, shares, floor, remainder };
    });

    let remainder = totalMinor - allocs.reduce((acc, a) => acc + a.floor, 0);
    // Pre-compute an index map for O(1) tie-break lookups (avoid O(n²)
    // indexOf calls inside the sort comparator).
    const indexMap = new Map<string, number>();
    sortedIds.forEach((id, i) => indexMap.set(id as string, i));
    const sortedByRemainder = [...allocs].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return (
        (indexMap.get(a.memberId as string) ?? 0) -
        (indexMap.get(b.memberId as string) ?? 0)
      );
    });
    for (let i = 0; i < sortedByRemainder.length && remainder > 0; i++) {
      const alloc = sortedByRemainder[i];
      if (!alloc) continue;
      alloc.floor += 1;
      remainder -= 1;
    }

    const entries: SplitResultEntry[] = allocs.map((a) => ({
      memberId: a.memberId,
      amountMinor: a.floor,
      shareUnits: a.shares,
    }));

    assertTotalPreserved(totalMinor, entries);
    return {
      splitType: this.splitType,
      totalAmountMinor: totalMinor,
      currency: input.totalAmount.getCurrency(),
      entries,
    };
  }
}

export function calculateShareSplit(
  totalAmount: Money,
  participantIds: readonly MemberId[],
  shareUnits: readonly number[],
): SplitResult {
  return new ShareSplitStrategy().calculate({ totalAmount, participantIds, shareUnits });
}
