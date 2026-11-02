import type { MemberId } from '@shared-types/index';

import { InvalidSplitError } from '../../errors/index';
import { type Money } from '../../value-objects/money';

import type { SplitInput, SplitResult, SplitResultEntry, SplitStrategy } from './split-strategy';
import { assertTotalPreserved, prepareParticipants } from './split-strategy';

/**
 * Percentage split strategy.
 *
 * Each participant is assigned a percentage expressed in basis points
 * (1% = 100 bp, 100% = 10,000 bp). The sum of all basis points MUST
 * equal exactly 10,000.
 *
 * Allocation uses integer arithmetic:
 *   amountMinor = floor(totalAmountMinor × bp / 10000)
 *
 * Remainder (caused by floor rounding) is distributed one minor unit at
 * a time to participants with the largest fractional remainder, with
 * deterministic tie-breaking by index ascending.
 *
 * Example: ₹1,000.00 split 33.33% / 33.33% / 33.34%
 *   100000 minor, bp = [3333, 3333, 3334], sum = 10000 ✓
 *   raw[0] = 100000 × 3333 / 10000 = 33330.0 → floor 33330, fraction 0.0
 *   raw[1] = same → 33330, fraction 0.0
 *   raw[2] = 100000 × 3334 / 10000 = 33340.0 → 33340, fraction 0.0
 *   No remainder → entries = [33330, 33330, 33340]
 */
export interface PercentageSplitInput extends SplitInput {
  /** Per-participant basis points, indexed to match `participantIds`. */
  readonly basisPoints: readonly number[];
}

export class PercentageSplitStrategy implements SplitStrategy<PercentageSplitInput> {
  readonly splitType = 'percentage' as const;

  calculate(input: PercentageSplitInput): SplitResult {
    if (input.basisPoints.length !== input.participantIds.length) {
      throw new InvalidSplitError(
        `Percentage split: basisPoints length (${input.basisPoints.length}) does not match participants length (${input.participantIds.length})`,
      );
    }

    // Validate basis points are integers in [0, 10000] and sum to 10000.
    let total = 0;
    for (const bp of input.basisPoints) {
      if (!Number.isInteger(bp) || bp < 0 || bp > 10000) {
        throw new InvalidSplitError(
          `Percentage split: basis points must be integers in [0, 10000], got ${bp}`,
        );
      }
      total += bp;
    }
    if (total !== 10000) {
      throw new InvalidSplitError(
        `Percentage split: sum of basis points (${total}) does not equal 10,000`,
      );
    }

    const totalMinor = input.totalAmount.toMinor();
    const sortedIds = prepareParticipants(input.participantIds);

    // Build a map from memberId → basis points for deterministic output.
    const bpMap = new Map<string, number>();
    input.participantIds.forEach((id, i) => {
      const bp = input.basisPoints[i];
      if (bp === undefined) {
        throw new InvalidSplitError(`Missing basis points for participant index ${i}`);
      }
      bpMap.set(id as string, bp);
    });

    // Compute floor allocation and integer remainder per participant.
    // Integer arithmetic: floor = (totalMinor * bp) / 10000,
    // remainder = (totalMinor * bp) % 10000 (0..9999).
    interface Alloc {
      memberId: MemberId;
      bp: number;
      floor: number;
      remainder: number;
    }
    const allocs: Alloc[] = sortedIds.map((memberId) => {
      const bp = bpMap.get(memberId as string) ?? 0;
      // Overflow guard: totalMinor * bp must remain in the safe integer
      // range, otherwise the integer remainder arithmetic below would
      // silently lose precision.
      if (!Number.isSafeInteger(totalMinor * bp)) {
        throw new InvalidSplitError(
          `Overflow: totalMinor (${totalMinor}) * basisPoints (${bp}) exceeds safe integer range`,
        );
      }
      const product = totalMinor * bp;
      const floor = Math.floor(product / 10000);
      const remainder = product % 10000; // integer remainder, 0-9999
      return { memberId, bp, floor, remainder };
    });

    // Distribute remainder one minor unit at a time to largest remainder.
    let allocated = allocs.reduce((acc, a) => acc + a.floor, 0);
    let remainder = totalMinor - allocated;
    // Pre-compute an index map for O(1) tie-break lookups (avoid O(n²)
    // indexOf calls inside the sort comparator).
    const indexMap = new Map<string, number>();
    sortedIds.forEach((id, i) => indexMap.set(id as string, i));
    const sortedByRemainder = [...allocs].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      // Tie-break by original index ascending (already in sortedIds order).
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
      percentageBasisPoints: a.bp,
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

export function calculatePercentageSplit(
  totalAmount: Money,
  participantIds: readonly MemberId[],
  basisPoints: readonly number[],
): SplitResult {
  return new PercentageSplitStrategy().calculate({
    totalAmount,
    participantIds,
    basisPoints,
  });
}
