import { describe, expect, it } from '@jest/globals';

import {
  asCurrencyCode,
  isCurrencyCode,
} from '../../value-objects/index';

describe('CurrencyCode', () => {
  describe('asCurrencyCode', () => {
    it('accepts valid 3-letter uppercase code', () => {
      expect(asCurrencyCode('INR')).toBe('INR');
      expect(asCurrencyCode('USD')).toBe('USD');
      expect(asCurrencyCode('JPY')).toBe('JPY');
    });

    it('rejects lowercase', () => {
      expect(() => asCurrencyCode('inr')).toThrow();
    });

    it('rejects 2-letter code', () => {
      expect(() => asCurrencyCode('US')).toThrow();
    });

    it('rejects 4-letter code', () => {
      expect(() => asCurrencyCode('USDD')).toThrow();
    });

    it('rejects empty string', () => {
      expect(() => asCurrencyCode('')).toThrow();
    });

    it('rejects non-alpha characters', () => {
      expect(() => asCurrencyCode('12A')).toThrow();
      expect(() => asCurrencyCode('U$D')).toThrow();
    });
  });

  describe('isCurrencyCode (type guard)', () => {
    it('returns true for valid codes', () => {
      expect(isCurrencyCode('INR')).toBe(true);
    });

    it('returns false for invalid codes', () => {
      expect(isCurrencyCode('inr')).toBe(false);
      expect(isCurrencyCode('US')).toBe(false);
      expect(isCurrencyCode('')).toBe(false);
      expect(isCurrencyCode(123)).toBe(false);
      expect(isCurrencyCode(null)).toBe(false);
      expect(isCurrencyCode(undefined)).toBe(false);
    });
  });
});
