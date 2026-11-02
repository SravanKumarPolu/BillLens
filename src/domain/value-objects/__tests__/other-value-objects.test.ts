import { describe, expect, it } from '@jest/globals';

import {
  asBasisPoints,
  asDisplayName,
  asEmailAddress,
  asPercentage,
  asShareUnits,
  asVersionNumber,
  basisPointsFromPercentage,
  initialVersionNumber,
  isDisplayName,
  isEmailAddress,
  nextVersionNumber,
  percentageToBasisPoints,
} from '../../value-objects/index';

describe('DisplayName', () => {
  it('accepts a normal name', () => {
    expect(asDisplayName('Sravan')).toBe('Sravan');
  });

  it('trims surrounding whitespace', () => {
    expect(asDisplayName('  Sravan  ')).toBe('Sravan');
  });

  it('rejects empty after trim', () => {
    expect(() => asDisplayName('   ')).toThrow();
  });

  it('rejects name longer than 80 chars', () => {
    const long = 'a'.repeat(81);
    expect(() => asDisplayName(long)).toThrow();
  });

  it('isDisplayName type guard works', () => {
    expect(isDisplayName('Sravan')).toBe(true);
    expect(isDisplayName('')).toBe(false);
    expect(isDisplayName(123)).toBe(false);
  });
});

describe('EmailAddress', () => {
  it('accepts a valid email', () => {
    expect(asEmailAddress('sravan@example.com')).toBe('sravan@example.com');
  });

  it('lowercases the email', () => {
    expect(asEmailAddress('Sravan@Example.COM')).toBe('sravan@example.com');
  });

  it('trims whitespace', () => {
    expect(asEmailAddress('  sravan@example.com  ')).toBe('sravan@example.com');
  });

  it('rejects empty', () => {
    expect(() => asEmailAddress('')).toThrow();
  });

  it('rejects missing @', () => {
    expect(() => asEmailAddress('notanemail')).toThrow();
  });

  it('rejects missing domain', () => {
    expect(() => asEmailAddress('sravan@')).toThrow();
  });

  it('rejects missing TLD', () => {
    expect(() => asEmailAddress('sravan@example')).toThrow();
  });

  it('rejects too long (>254)', () => {
    const long = 'a'.repeat(255) + '@example.com';
    expect(() => asEmailAddress(long)).toThrow();
  });

  it('isEmailAddress type guard works', () => {
    expect(isEmailAddress('sravan@example.com')).toBe(true);
    expect(isEmailAddress('notanemail')).toBe(false);
    expect(isEmailAddress(123)).toBe(false);
  });
});

describe('VersionNumber', () => {
  it('accepts positive integers', () => {
    expect(asVersionNumber(1)).toBe(1);
    expect(asVersionNumber(42)).toBe(42);
  });

  it('rejects zero', () => {
    expect(() => asVersionNumber(0)).toThrow();
  });

  it('rejects negative', () => {
    expect(() => asVersionNumber(-1)).toThrow();
  });

  it('rejects non-integer', () => {
    expect(() => asVersionNumber(1.5)).toThrow();
  });

  it('initialVersionNumber returns 1', () => {
    expect(initialVersionNumber()).toBe(1);
  });

  it('nextVersionNumber increments', () => {
    expect(nextVersionNumber(1 as never)).toBe(2);
    expect(nextVersionNumber(42 as never)).toBe(43);
  });
});

describe('Percentage / BasisPoints', () => {
  it('asPercentage accepts valid values', () => {
    expect(asPercentage(0)).toBe(0);
    expect(asPercentage(50)).toBe(50);
    expect(asPercentage(100)).toBe(100);
    expect(asPercentage(33.33)).toBe(33.33);
  });

  it('asPercentage rejects negative', () => {
    expect(() => asPercentage(-1)).toThrow();
  });

  it('asPercentage rejects >100', () => {
    expect(() => asPercentage(101)).toThrow();
  });

  it('asPercentage rejects >2 decimal places', () => {
    expect(() => asPercentage(33.333)).toThrow();
  });

  it('percentageToBasisPoints converts correctly', () => {
    expect(percentageToBasisPoints(asPercentage(0))).toBe(0);
    expect(percentageToBasisPoints(asPercentage(50))).toBe(5000);
    expect(percentageToBasisPoints(asPercentage(100))).toBe(10000);
    expect(percentageToBasisPoints(asPercentage(33.33))).toBe(3333);
  });

  it('basisPointsFromPercentage rounds correctly', () => {
    expect(basisPointsFromPercentage(33.33)).toBe(3333);
    expect(basisPointsFromPercentage(50)).toBe(5000);
  });

  it('asBasisPoints accepts 0–10000', () => {
    expect(asBasisPoints(0)).toBe(0);
    expect(asBasisPoints(5000)).toBe(5000);
    expect(asBasisPoints(10000)).toBe(10000);
  });

  it('asBasisPoints rejects >10000', () => {
    expect(() => asBasisPoints(10001)).toThrow();
  });

  it('asBasisPoints rejects negative', () => {
    expect(() => asBasisPoints(-1)).toThrow();
  });

  it('asBasisPoints rejects non-integer', () => {
    expect(() => asBasisPoints(50.5)).toThrow();
  });
});

describe('ShareUnits', () => {
  it('accepts positive integers', () => {
    expect(asShareUnits(1)).toBe(1);
    expect(asShareUnits(42)).toBe(42);
  });

  it('rejects zero', () => {
    expect(() => asShareUnits(0)).toThrow();
  });

  it('rejects negative', () => {
    expect(() => asShareUnits(-1)).toThrow();
  });

  it('rejects non-integer', () => {
    expect(() => asShareUnits(1.5)).toThrow();
  });
});
