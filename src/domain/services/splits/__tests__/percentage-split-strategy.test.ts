import { describe, expect, it } from '@jest/globals';

import { asMemberId } from '@domain/entities';
import { InvalidSplitError } from '@domain/errors';
import { Money } from '@domain/value-objects';

import {
  PercentageSplitStrategy,
  calculatePercentageSplit,
} from '../percentage-split-strategy';

describe('PercentageSplitStrategy', () => {
  const a = asMemberId('a');
  const b = asMemberId('b');
  const c = asMemberId('c');

  it('accepts basis points summing to 10000', () => {
    const result = new PercentageSplitStrategy().calculate({
      totalAmount: Money.fromMinor(100000, 'INR'), // ₹1000
      participantIds: [a, b, c],
      basisPoints: [3333, 3333, 3334],
    });
    expect(result.entries.map((e) => e.amountMinor)).toEqual([33330, 33330, 33340]);
    expect(result.entries.map((e) => e.percentageBasisPoints)).toEqual([3333, 3333, 3334]);
  });

  it('preserves total exactly with non-even percentages', () => {
    const result = calculatePercentageSplit(
      Money.fromMinor(100, 'INR'), // ₹1
      [a, b, c],
      [3333, 3333, 3334],
    );
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(100);
  });

  it('handles 100% to single participant', () => {
    const result = calculatePercentageSplit(
      Money.fromMinor(1000, 'INR'),
      [a],
      [10000],
    );
    expect(result.entries[0]?.amountMinor).toBe(1000);
    expect(result.entries[0]?.percentageBasisPoints).toBe(10000);
  });

  it('distributes remainder deterministically (₹100 / 33.33% / 33.33% / 33.34%)', () => {
    // 10000 minor, 3333 bp = 3333.00, 3334 bp = 3334.00 → no remainder
    const result = calculatePercentageSplit(
      Money.fromMinor(10000, 'INR'),
      [a, b, c],
      [3333, 3333, 3334],
    );
    expect(result.entries.map((e) => e.amountMinor)).toEqual([3333, 3333, 3334]);
  });

  it('distributes remainder to largest fractional shares (₹1 / 33.33% / 33.33% / 33.34%)', () => {
    // 100 minor, 3333 bp = 33.33, 3334 bp = 33.34
    // floor: 33, 33, 33 = 99. Remainder 1 → distributed by largest fraction
    // fractions: 0.33, 0.33, 0.34 → third (c) gets the extra
    const result = calculatePercentageSplit(
      Money.fromMinor(100, 'INR'),
      [a, b, c],
      [3333, 3333, 3334],
    );
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(100);
    // c gets the extra unit because its fraction is highest
    expect(result.entries[2]?.amountMinor).toBe(34);
  });

  it('rejects basis points not summing to 10000', () => {
    expect(() =>
      calculatePercentageSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [5000, 4000], // sum 9000
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects negative basis points', () => {
    expect(() =>
      calculatePercentageSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [-100, 10100],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects basis points > 10000', () => {
    expect(() =>
      calculatePercentageSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [10001, -1],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects non-integer basis points', () => {
    expect(() =>
      calculatePercentageSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [5000.5, 4999.5],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects mismatched lengths', () => {
    expect(() =>
      calculatePercentageSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b, c], // 3
        [5000, 5000], // 2
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects duplicate participants', () => {
    expect(() =>
      calculatePercentageSplit(
        Money.fromMinor(1000, 'INR'),
        [a, a],
        [5000, 5000],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects empty participants', () => {
    expect(() =>
      calculatePercentageSplit(Money.fromMinor(1000, 'INR'), [], []),
    ).toThrow(InvalidSplitError);
  });

  it('sorts entries by member ID in output', () => {
    const result = calculatePercentageSplit(
      Money.fromMinor(1000, 'INR'),
      [c, a, b],
      [3334, 3333, 3333],
    );
    expect(result.entries.map((e) => e.memberId as string)).toEqual(['a', 'b', 'c']);
  });
});
