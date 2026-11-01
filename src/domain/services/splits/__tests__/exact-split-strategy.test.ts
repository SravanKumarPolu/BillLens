import { describe, expect, it } from '@jest/globals';

import { asMemberId } from '@domain/entities';
import { InvalidSplitError } from '@domain/errors';
import { Money } from '@domain/value-objects';

import {
  ExactSplitStrategy,
  calculateExactSplit,
} from '../exact-split-strategy';

describe('ExactSplitStrategy', () => {
  const a = asMemberId('a');
  const b = asMemberId('b');
  const c = asMemberId('c');

  it('accepts amounts summing exactly to total', () => {
    const result = new ExactSplitStrategy().calculate({
      totalAmount: Money.fromMinor(1000, 'INR'),
      participantIds: [a, b, c],
      amounts: [
        Money.fromMinor(500, 'INR'),
        Money.fromMinor(300, 'INR'),
        Money.fromMinor(200, 'INR'),
      ],
    });
    expect(result.entries.map((e) => e.amountMinor)).toEqual([500, 300, 200]); // sorted by memberId
    expect(result.splitType).toBe('exact');
  });

  it('sorts entries by member ID in output', () => {
    const result = calculateExactSplit(
      Money.fromMinor(1000, 'INR'),
      [c, a, b], // unsorted input
      [
        Money.fromMinor(200, 'INR'), // for c
        Money.fromMinor(500, 'INR'), // for a
        Money.fromMinor(300, 'INR'), // for b
      ],
    );
    expect(result.entries.map((e) => e.memberId as string)).toEqual(['a', 'b', 'c']);
    expect(result.entries.map((e) => e.amountMinor)).toEqual([500, 300, 200]);
  });

  it('rejects under-allocation (sum < total)', () => {
    expect(() =>
      calculateExactSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [Money.fromMinor(500, 'INR'), Money.fromMinor(400, 'INR')], // sum = 900
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects over-allocation (sum > total)', () => {
    expect(() =>
      calculateExactSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [Money.fromMinor(600, 'INR'), Money.fromMinor(500, 'INR')], // sum = 1100
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects currency mismatch between amounts and total', () => {
    expect(() =>
      calculateExactSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [Money.fromMinor(500, 'USD'), Money.fromMinor(500, 'INR')],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects mismatched lengths', () => {
    expect(() =>
      calculateExactSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b, c], // 3 participants
        [Money.fromMinor(500, 'INR'), Money.fromMinor(500, 'INR')], // 2 amounts
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects empty participants', () => {
    expect(() =>
      calculateExactSplit(Money.fromMinor(1000, 'INR'), [], []),
    ).toThrow(InvalidSplitError);
  });

  it('rejects duplicate participants', () => {
    expect(() =>
      calculateExactSplit(
        Money.fromMinor(1000, 'INR'),
        [a, a],
        [Money.fromMinor(500, 'INR'), Money.fromMinor(500, 'INR')],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('zero-value allocations are allowed (e.g. one participant pays nothing)', () => {
    const result = calculateExactSplit(
      Money.fromMinor(1000, 'INR'),
      [a, b],
      [Money.fromMinor(1000, 'INR'), Money.fromMinor(0, 'INR')],
    );
    expect(result.entries.map((e) => e.amountMinor)).toEqual([1000, 0]);
  });
});
