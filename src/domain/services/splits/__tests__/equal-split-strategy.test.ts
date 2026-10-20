import { describe, expect, it } from '@jest/globals';

import { asMemberId } from '@domain/entities';
import { InvalidSplitError } from '@domain/errors';
import { Money } from '@domain/value-objects';

import {
  EqualSplitStrategy,
  calculateEqualSplit,
} from '../equal-split-strategy';

describe('EqualSplitStrategy', () => {
  const a = asMemberId('a');
  const b = asMemberId('b');
  const c = asMemberId('c');

  it('distributes evenly when divisible', () => {
    const result = new EqualSplitStrategy().calculate({
      totalAmount: Money.fromMinor(900, 'INR'),
      participantIds: [a, b, c],
    });
    expect(result.entries.map((e) => e.amountMinor)).toEqual([300, 300, 300]);
    expect(result.splitType).toBe('equal');
  });

  it('distributes remainder to earliest sorted indices', () => {
    // 1000 / 3 = 333 r 1 → first index gets 334
    const result = new EqualSplitStrategy().calculate({
      totalAmount: Money.fromMinor(1000, 'INR'),
      participantIds: [a, b, c],
    });
    expect(result.entries.map((e) => e.amountMinor)).toEqual([334, 333, 333]);
  });

  it('preserves total exactly (₹10 / 3 people)', () => {
    const result = calculateEqualSplit(Money.fromMinor(1000, 'INR'), [a, b, c]);
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(1000);
  });

  it('preserves total exactly (£10 / 3 people — GBP)', () => {
    const result = calculateEqualSplit(Money.fromMinor(1000, 'GBP'), [a, b, c]);
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(1000);
    expect(result.entries.map((e) => e.amountMinor)).toEqual([334, 333, 333]);
    expect(result.currency).toBe('GBP');
  });

  it('preserves total exactly (₹0.01 / 3 people — edge case)', () => {
    const result = calculateEqualSplit(Money.fromMinor(1, 'INR'), [a, b, c]);
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(1);
    expect(result.entries.map((e) => e.amountMinor)).toEqual([1, 0, 0]);
  });

  it('handles single-member split', () => {
    const result = calculateEqualSplit(Money.fromMinor(500, 'INR'), [a]);
    expect(result.entries.map((e) => e.amountMinor)).toEqual([500]);
  });

  it('sorts participants deterministically (input order does not matter)', () => {
    const result1 = calculateEqualSplit(Money.fromMinor(1000, 'INR'), [c, b, a]);
    const result2 = calculateEqualSplit(Money.fromMinor(1000, 'INR'), [a, b, c]);
    expect(result1.entries.map((e) => e.memberId as string)).toEqual(
      result2.entries.map((e) => e.memberId as string),
    );
    expect(result1.entries.map((e) => e.memberId as string)).toEqual(['a', 'b', 'c']);
  });

  it('rejects empty participant list', () => {
    expect(() =>
      calculateEqualSplit(Money.fromMinor(1000, 'INR'), []),
    ).toThrow(InvalidSplitError);
  });

  it('rejects duplicate participants', () => {
    expect(() =>
      calculateEqualSplit(Money.fromMinor(1000, 'INR'), [a, a, b]),
    ).toThrow(InvalidSplitError);
  });

  it('large but safe integer values', () => {
    const large = 9_007_199_254_740_991; // Number.MAX_SAFE_INTEGER
    const result = calculateEqualSplit(Money.fromMinor(large, 'INR'), [a]);
    expect(result.entries[0]?.amountMinor).toBe(large);
  });

  it('returns no percentageBasisPoints or shareUnits on entries', () => {
    const result = calculateEqualSplit(Money.fromMinor(900, 'INR'), [a, b, c]);
    for (const e of result.entries) {
      expect(e.percentageBasisPoints).toBeUndefined();
      expect(e.shareUnits).toBeUndefined();
    }
  });
});
