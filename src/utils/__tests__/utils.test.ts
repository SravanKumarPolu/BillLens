import { describe, expect, it } from '@jest/globals';

import {
  assertDefined,
  clamp,
  fingerprintString,
  isNonEmptyString,
  nowISO,
} from '../utils';

describe('utils', () => {
  describe('assertDefined', () => {
    it('returns the value when defined', () => {
      expect(assertDefined(42, 'answer')).toBe(42);
      expect(assertDefined('hello', 'greeting')).toBe('hello');
      expect(assertDefined(0, 'zero')).toBe(0);
      expect(assertDefined('', 'emptyString')).toBe('');
    });

    it('throws for null', () => {
      expect(() => assertDefined(null, 'value')).toThrow(/value/);
    });

    it('throws for undefined', () => {
      expect(() => assertDefined(undefined, 'value')).toThrow(/value/);
    });
  });

  describe('nowISO', () => {
    it('returns a valid ISO 8601 string', () => {
      const iso = nowISO();
      expect(() => new Date(iso).toISOString()).not.toThrow();
      expect(new Date(iso).toString()).not.toBe('Invalid Date');
    });
  });

  describe('clamp', () => {
    it('clamps below min', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });
    it('clamps above max', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });
    it('returns value when in range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });
    it('throws when min > max', () => {
      expect(() => clamp(5, 10, 0)).toThrow();
    });
  });

  describe('isNonEmptyString', () => {
    it('accepts non-empty string', () => {
      expect(isNonEmptyString('hello')).toBe(true);
    });
    it('rejects empty string', () => {
      expect(isNonEmptyString('')).toBe(false);
    });
    it('rejects null', () => {
      expect(isNonEmptyString(null)).toBe(false);
    });
    it('rejects undefined', () => {
      expect(isNonEmptyString(undefined)).toBe(false);
    });
    it('rejects number', () => {
      expect(isNonEmptyString(42)).toBe(false);
    });
  });

  describe('fingerprintString', () => {
    it('returns a stable 8-char hex string', () => {
      const fp = fingerprintString('paradise-biryani-1250');
      expect(fp).toMatch(/^[0-9a-f]{8}$/);
      expect(fingerprintString('paradise-biryani-1250')).toBe(fp);
    });
    it('produces different fingerprints for different inputs', () => {
      expect(fingerprintString('a')).not.toBe(fingerprintString('b'));
    });
    it('is sensitive to whitespace', () => {
      expect(fingerprintString('hello')).not.toBe(fingerprintString('hello '));
    });
  });
});
