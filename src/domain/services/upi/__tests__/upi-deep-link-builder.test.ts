import { describe, expect, it } from '@jest/globals';

import { InvalidEntityError } from '../../../errors';
import {
  assertUpiSupportedCurrency,
  buildUpiDeepLink,
  isUpiSupportedCurrency,
  UPI_DEEP_LINK_SCHEME,
  UPI_SUPPORTED_CURRENCIES,
} from '../upi-deep-link-builder';

describe('UPI deep-link builder', () => {
  // ── Currency gate ─────────────────────────────────────────────

  describe('assertUpiSupportedCurrency', () => {
    it('accepts INR', () => {
      expect(() => assertUpiSupportedCurrency('INR')).not.toThrow();
    });

    it('accepts lowercase "inr" (case-insensitive)', () => {
      expect(() => assertUpiSupportedCurrency('inr')).not.toThrow();
    });

    it('rejects non-INR currencies', () => {
      expect(() => assertUpiSupportedCurrency('USD')).toThrow(InvalidEntityError);
      expect(() => assertUpiSupportedCurrency('GBP')).toThrow(InvalidEntityError);
      expect(() => assertUpiSupportedCurrency('EUR')).toThrow(InvalidEntityError);
    });

    it('rejects empty / invalid strings', () => {
      expect(() => assertUpiSupportedCurrency('')).toThrow(InvalidEntityError);
      expect(() => assertUpiSupportedCurrency('XYZ')).toThrow(InvalidEntityError);
    });
  });

  describe('isUpiSupportedCurrency', () => {
    it('returns true for INR', () => {
      expect(isUpiSupportedCurrency('INR')).toBe(true);
    });

    it('returns false for non-INR', () => {
      expect(isUpiSupportedCurrency('USD')).toBe(false);
      expect(isUpiSupportedCurrency('GBP')).toBe(false);
    });
  });

  it('UPI_SUPPORTED_CURRENCIES contains only INR for the MVP', () => {
    expect(UPI_SUPPORTED_CURRENCIES).toEqual(['INR']);
  });

  // ── Happy path ────────────────────────────────────────────────

  describe('buildUpiDeepLink (happy path)', () => {
    it('builds a valid upi:// URI for INR', () => {
      const out = buildUpiDeepLink({
        payeeVpa: 'john.doe@oksbi',
        payeeName: 'John Doe',
        amount: 42.50,
        currencyCode: 'INR',
        note: 'Dinner split',
        reference: 'BL-X7Y8Z9',
      });
      expect(out.uri.startsWith(`${UPI_DEEP_LINK_SCHEME}://pay?`)).toBe(true);
      // Required parameters present. URLSearchParams encodes spaces as '+'
      // (per NPCI convention).
      expect(out.uri).toContain('pa=john.doe%40oksbi');
      expect(out.uri).toContain('pn=John+Doe');
      expect(out.uri).toContain('am=42.50');
      expect(out.uri).toContain('cu=INR');
      expect(out.uri).toContain('tn=Dinner+split');
      expect(out.uri).toContain('tr=BL-X7Y8Z9');
    });

    it('returns the validated VPA and the reference', () => {
      const out = buildUpiDeepLink({
        payeeVpa: '  john.doe@oksbi  ', // whitespace should be trimmed
        payeeName: 'John Doe',
        amount: 100,
        currencyCode: 'INR',
        reference: 'BL-ABC123',
      });
      expect(out.payeeVpa).toBe('john.doe@oksbi');
      expect(out.transactionReference).toBe('BL-ABC123');
    });

    it('generates a short reference if not provided', () => {
      const out = buildUpiDeepLink({
        payeeVpa: 'john.doe@oksbi',
        payeeName: 'John Doe',
        amount: 100,
        currencyCode: 'INR',
      });
      expect(out.transactionReference).toMatch(/^BL-[0-9a-f]{8}$/);
      expect(out.uri).toContain(`tr=${out.transactionReference}`);
    });

    it('formats integer amounts without decimals', () => {
      const out = buildUpiDeepLink({
        payeeVpa: 'john.doe@oksbi',
        payeeName: 'John Doe',
        amount: 100,
        currencyCode: 'INR',
      });
      expect(out.uri).toContain('am=100');
      expect(out.uri).not.toContain('am=100.00');
    });

    it('formats fractional amounts with 2 decimal places', () => {
      const out = buildUpiDeepLink({
        payeeVpa: 'john.doe@oksbi',
        payeeName: 'John Doe',
        amount: 42.5,
        currencyCode: 'INR',
      });
      expect(out.uri).toContain('am=42.50');
    });

    it('omits the tn parameter if note is empty/whitespace', () => {
      const out = buildUpiDeepLink({
        payeeVpa: 'john.doe@oksbi',
        payeeName: 'John Doe',
        amount: 100,
        currencyCode: 'INR',
        note: '   ',
      });
      expect(out.uri).not.toContain('tn=');
    });

    it('URL-encodes special characters in the note', () => {
      const out = buildUpiDeepLink({
        payeeVpa: 'john.doe@oksbi',
        payeeName: 'John Doe',
        amount: 100,
        currencyCode: 'INR',
        note: 'Weekend trip & dinner',
      });
      // URLSearchParams encodes spaces as '+' and '&' as '%26'.
      expect(out.uri).toContain('tn=Weekend+trip+%26+dinner');
    });
  });

  // ── Validation errors ─────────────────────────────────────────

  describe('validation errors', () => {
    it('rejects non-INR currency', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'john.doe@oksbi',
          payeeName: 'John Doe',
          amount: 100,
          currencyCode: 'USD',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects an invalid VPA', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'not-a-vpa',
          payeeName: 'John Doe',
          amount: 100,
          currencyCode: 'INR',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a zero amount', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'john.doe@oksbi',
          payeeName: 'John Doe',
          amount: 0,
          currencyCode: 'INR',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a negative amount', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'john.doe@oksbi',
          payeeName: 'John Doe',
          amount: -10,
          currencyCode: 'INR',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects an empty payee name', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'john.doe@oksbi',
          payeeName: '   ',
          amount: 100,
          currencyCode: 'INR',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a payee name longer than 100 chars', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'john.doe@oksbi',
          payeeName: 'x'.repeat(101),
          amount: 100,
          currencyCode: 'INR',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a note longer than 80 chars', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'john.doe@oksbi',
          payeeName: 'John Doe',
          amount: 100,
          currencyCode: 'INR',
          note: 'x'.repeat(81),
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a reference longer than 35 chars', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'john.doe@oksbi',
          payeeName: 'John Doe',
          amount: 100,
          currencyCode: 'INR',
          reference: 'x'.repeat(36),
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects an empty reference if provided', () => {
      expect(() =>
        buildUpiDeepLink({
          payeeVpa: 'john.doe@oksbi',
          payeeName: 'John Doe',
          amount: 100,
          currencyCode: 'INR',
          reference: '   ',
        }),
      ).toThrow(InvalidEntityError);
    });
  });
});
