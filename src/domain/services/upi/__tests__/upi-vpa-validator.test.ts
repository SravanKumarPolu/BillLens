import { describe, expect, it } from '@jest/globals';

import { InvalidEntityError } from '../../../errors';
import {
  isValidUpiVpa,
  maskUpiVpa,
  validateUpiVpa,
} from '../upi-vpa-validator';

describe('UPI VPA validator', () => {
  // ── Valid VPAs ────────────────────────────────────────────────

  describe('valid VPAs', () => {
    const validCases: readonly string[] = [
      'john.doe@oksbi',
      'shop@paytm',
      '1234567890@ybl',
      'a@ibl',                     // shortest valid name
      'a.b@oksbi',                 // single char + dot
      'a_b@oksbi',                 // underscore
      'a-b@oksbi',                 // dash
      'abcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghij@oksbi', // 100-char name
      'john@ab',                   // 2-char PSP (min)
      'john@abcdefghijklmnopqrst',  // 20-char PSP (max)
    ];

    for (const vpa of validCases) {
      it(`accepts "${vpa}"`, () => {
        expect(() => validateUpiVpa(vpa)).not.toThrow();
        expect(validateUpiVpa(vpa)).toBe(vpa.trim());
      });
    }
  });

  // ── Invalid VPAs ─────────────────────────────────────────────

  describe('invalid VPAs', () => {
    const invalidCases: readonly (readonly [string, string])[] = [
      ['', 'VPA must not be empty'],
      ['   ', 'VPA must not be empty'],
      ['john', 'missing the @ separator'],         // no @
      ['@oksbi', 'missing the name part'],          // empty name
      ['john@', 'missing the PSP part'],            // empty PSP
      ['john@o', 'PSP part "o" is invalid'],        // PSP too short
      ['john@OKSBI', 'PSP part "OKSBI" is invalid'], // PSP uppercase
      ['john doe@oksbi', 'name part "john doe" is invalid'], // space
      ['john@oksbi@ybl', 'name part'],              // multiple @ — name part "john@oksbi" fails
      ['.john@oksbi', 'name part ".john" is invalid'], // leading dot
      ['_john@oksbi', 'name part "_john" is invalid'], // leading underscore
      ['-john@oksbi', 'name part "-john" is invalid'], // leading dash
      ['john@1ybl', 'PSP part "1ybl" is invalid'], // PSP starts with digit
    ];

    for (const [vpa, expectedErrorFragment] of invalidCases) {
      it(`rejects "${vpa}" with "${expectedErrorFragment}"`, () => {
        expect(() => validateUpiVpa(vpa)).toThrow(InvalidEntityError);
        try {
          validateUpiVpa(vpa);
        } catch (e) {
          expect((e as Error).message).toContain(expectedErrorFragment);
        }
      });
    }

    it('rejects non-string input', () => {
      expect(() => validateUpiVpa(null as never)).toThrow(InvalidEntityError);
      expect(() => validateUpiVpa(undefined as never)).toThrow(InvalidEntityError);
      expect(() => validateUpiVpa(42 as never)).toThrow(InvalidEntityError);
    });
  });

  // ── isValidUpiVpa predicate ──────────────────────────────────

  describe('isValidUpiVpa', () => {
    it('returns true for valid VPAs', () => {
      expect(isValidUpiVpa('john.doe@oksbi')).toBe(true);
      expect(isValidUpiVpa('shop@paytm')).toBe(true);
    });

    it('returns false for invalid VPAs without throwing', () => {
      expect(isValidUpiVpa('')).toBe(false);
      expect(isValidUpiVpa('john')).toBe(false);
      expect(isValidUpiVpa('@oksbi')).toBe(false);
      expect(isValidUpiVpa('john@o')).toBe(false);
      expect(isValidUpiVpa('john@OKSBI')).toBe(false);
    });
  });

  // ── maskUpiVpa ───────────────────────────────────────────────

  describe('maskUpiVpa', () => {
    it('masks the name part of a long VPA, keeping first 2 chars', () => {
      expect(maskUpiVpa('john.doe@oksbi')).toBe('jo***@oksbi');
      expect(maskUpiVpa('shopkeeper@paytm')).toBe('sh***@paytm');
    });

    it('masks the name part of a short VPA, keeping first char only', () => {
      expect(maskUpiVpa('ab@oksbi')).toBe('a***@oksbi');
      expect(maskUpiVpa('xyz@oksbi')).toBe('x***@oksbi');
    });

    it('never masks the PSP part', () => {
      const masked = maskUpiVpa('john.doe@oksbi');
      expect(masked).toContain('@oksbi');
      expect(masked).not.toContain('@***');
    });

    it('throws on invalid input', () => {
      expect(() => maskUpiVpa('')).toThrow(InvalidEntityError);
      expect(() => maskUpiVpa('john')).toThrow(InvalidEntityError);
    });
  });
});
