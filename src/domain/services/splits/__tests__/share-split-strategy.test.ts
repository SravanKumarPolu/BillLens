import { describe, expect, it } from '@jest/globals';

import { asMemberId } from '@domain/entities';
import { InvalidSplitError } from '@domain/errors';
import { Money } from '@domain/value-objects';

import { ShareSplitStrategy, calculateShareSplit } from '../share-split-strategy';

describe('ShareSplitStrategy', () => {
  const a = asMemberId('a');
  const b = asMemberId('b');
  const c = asMemberId('c');

  it('allocates proportionally by share weights (1:1:2)', () => {
    const result = new ShareSplitStrategy().calculate({
      totalAmount: Money.fromMinor(30000, 'INR'), // ₹300
      participantIds: [a, b, c],
      shareUnits: [1, 1, 2],
    });
    expect(result.entries.map((e) => e.amountMinor)).toEqual([7500, 7500, 15000]);
    expect(result.entries.map((e) => e.shareUnits)).toEqual([1, 1, 2]);
  });

  it('preserves total exactly when evenly divisible', () => {
    const result = calculateShareSplit(
      Money.fromMinor(900, 'INR'),
      [a, b, c],
      [1, 1, 1],
    );
    expect(result.entries.map((e) => e.amountMinor)).toEqual([300, 300, 300]);
  });

  it('preserves total exactly with remainder', () => {
    // 10000 / 3 = 3333 r 1
    const result = calculateShareSplit(
      Money.fromMinor(10000, 'INR'),
      [a, b, c],
      [1, 1, 1],
    );
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(10000);
    expect(result.entries.map((e) => e.amountMinor)).toEqual([3334, 3333, 3333]);
  });

  it('handles unequal weights with remainder', () => {
    // 100 / [1, 2, 3] = 16.67 / 33.33 / 50.0
    // floor: 16, 33, 50 = 99. Remainder 1 → largest fraction (33.33 → b)
    const result = calculateShareSplit(
      Money.fromMinor(100, 'INR'),
      [a, b, c],
      [1, 2, 3],
    );
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(100);
    // a: floor 16, fraction 0.67
    // b: floor 33, fraction 0.33
    // c: floor 50, fraction 0.0
    // → a gets the extra (largest fraction)
    expect(result.entries.map((e) => e.amountMinor)).toEqual([17, 33, 50]);
  });

  it('single participant gets full amount', () => {
    const result = calculateShareSplit(
      Money.fromMinor(1000, 'INR'),
      [a],
      [5],
    );
    expect(result.entries[0]?.amountMinor).toBe(1000);
    expect(result.entries[0]?.shareUnits).toBe(5);
  });

  it('rejects zero share units', () => {
    expect(() =>
      calculateShareSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [1, 0],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects negative share units', () => {
    expect(() =>
      calculateShareSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [1, -1],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects non-integer share units', () => {
    expect(() =>
      calculateShareSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [1.5, 1],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects mismatched lengths', () => {
    expect(() =>
      calculateShareSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b, c],
        [1, 1], // 2 share units for 3 participants
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects duplicate participants', () => {
    expect(() =>
      calculateShareSplit(
        Money.fromMinor(1000, 'INR'),
        [a, a],
        [1, 1],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('sorts entries by member ID in output', () => {
    const result = calculateShareSplit(
      Money.fromMinor(900, 'INR'),
      [c, a, b],
      [3, 1, 2],
    );
    expect(result.entries.map((e) => e.memberId as string)).toEqual(['a', 'b', 'c']);
    // a: 1 share, b: 2 shares, c: 3 shares → 150, 300, 450
    expect(result.entries.map((e) => e.amountMinor)).toEqual([150, 300, 450]);
  });

  it('large share values', () => {
    const result = calculateShareSplit(
      Money.fromMinor(100000, 'INR'),
      [a, b],
      [999999, 1],
    );
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(100000);
    // a gets almost all of it
    expect(result.entries[0]?.amountMinor).toBeGreaterThan(90000);
  });
});
