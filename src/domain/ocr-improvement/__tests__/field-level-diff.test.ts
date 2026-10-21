import { afterEach, describe, expect, it } from '@jest/globals';

import {
  CORRECTION_TYPES,
  EXTRACTION_CONFIDENCES,
  OCR_FIELD_NAMES,
  anonymizeValue,
  computeDiff,
  diffContainsRawPii,
  isExtractionConfidence,
  isOcrFieldName,
  parseCalendarDates,
  sameCalendarDate,
  type FieldLevelDiff,
} from '../index';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('field-level-diff', () => {
  describe('OCR_FIELD_NAMES', () => {
    it('contains exactly 7 field names', () => {
      expect(OCR_FIELD_NAMES.length).toBe(7);
    });

    it.each(OCR_FIELD_NAMES)('includes %s', (field) => {
      expect(OCR_FIELD_NAMES).toContain(field);
    });
  });

  describe('isOcrFieldName', () => {
    it.each(OCR_FIELD_NAMES)('returns true for %s', (field) => {
      expect(isOcrFieldName(field)).toBe(true);
    });

    it('returns false for unknown strings', () => {
      expect(isOcrFieldName('unknown_field')).toBe(false);
      expect(isOcrFieldName('')).toBe(false);
      expect(isOcrFieldName(null)).toBe(false);
    });
  });

  describe('EXTRACTION_CONFIDENCES + isExtractionConfidence', () => {
    it('contains 4 confidence levels', () => {
      expect(EXTRACTION_CONFIDENCES.length).toBe(4);
    });

    it.each(EXTRACTION_CONFIDENCES)('returns true for %s', (conf) => {
      expect(isExtractionConfidence(conf)).toBe(true);
    });

    it('returns false for unknown strings', () => {
      expect(isExtractionConfidence('very_high')).toBe(false);
    });
  });

  describe('CORRECTION_TYPES', () => {
    it('contains 4 correction types', () => {
      expect(CORRECTION_TYPES.length).toBe(4);
    });

    it.each(CORRECTION_TYPES)('includes %s', (type) => {
      expect(CORRECTION_TYPES).toContain(type);
    });
  });

  describe('anonymizeValue', () => {
    describe('amount fields (total, subtotal, tax)', () => {
      it('anonymizes a simple numeric amount to <amount>', () => {
        expect(anonymizeValue('1234.56', 'total')).toBe('<amount>');
        expect(anonymizeValue('99.99', 'subtotal')).toBe('<amount>');
        expect(anonymizeValue('10.50', 'tax')).toBe('<amount>');
      });

      it('anonymizes a currency-prefixed amount to <amount>', () => {
        expect(anonymizeValue('₹1234.56', 'total')).toBe('<amount>');
        expect(anonymizeValue('$99.99', 'total')).toBe('<amount>');
        expect(anonymizeValue('Rs. 500', 'total')).toBe('<amount>');
        expect(anonymizeValue('INR 1000', 'total')).toBe('<amount>');
      });

      it('CRITICAL: does NOT preserve the actual amount value', () => {
        const result = anonymizeValue('1234.56', 'total');
        expect(result).not.toContain('1234');
        expect(result).not.toContain('1234.56');
      });

      it('returns <non_amount> for non-numeric values', () => {
        expect(anonymizeValue('hello world', 'total')).toBe('<non_amount>');
        expect(anonymizeValue('ABC123XYZ', 'total')).toBe('<non_amount>');
      });

      it('returns <empty> for empty string', () => {
        expect(anonymizeValue('', 'total')).toBe('<empty>');
      });
    });

    describe('date field', () => {
      it('anonymizes ISO YYYY-MM-DD date', () => {
        expect(anonymizeValue('2025-01-15', 'date')).toBe('<date:YYYY-MM-DD>');
      });

      it('anonymizes ISO YYYY-MM date', () => {
        expect(anonymizeValue('2025-01', 'date')).toBe('<date:YYYY-MM>');
      });

      it('anonymizes 4-digit year', () => {
        expect(anonymizeValue('2025', 'date')).toBe('<date:YYYY>');
      });

      it('anonymizes DD/MM/YYYY date', () => {
        expect(anonymizeValue('15/01/2025', 'date')).toBe('<date:DD/MM/YYYY>');
        expect(anonymizeValue('15-01-2025', 'date')).toBe('<date:DD/MM/YYYY>');
      });

      it('anonymizes the month-first order when the digits force it', () => {
        expect(anonymizeValue('01/15/2025', 'date')).toBe('<date:MM/DD/YYYY>');
        expect(anonymizeValue('01-15-25', 'date')).toBe('<date:MM/DD/YYYY>');
      });

      it('labels day/month-first dates as ambiguous when both orders are valid', () => {
        expect(anonymizeValue('01/02/2025', 'date')).toBe('<date:DD/MM-ambiguous>');
      });

      it('normalizes slash-separated year-first dates to the ISO shape', () => {
        expect(anonymizeValue('2025/01/15', 'date')).toBe('<date:YYYY-MM-DD>');
        expect(anonymizeValue('2025.01.15', 'date')).toBe('<date:YYYY-MM-DD>');
        // A timestamp still only reveals its date shape, never the time.
        expect(anonymizeValue('2025-01-15T19:53:11Z', 'date')).toBe(
          '<date:YYYY-MM-DD>',
        );
      });

      it('CRITICAL: does NOT preserve the actual date value', () => {
        const result = anonymizeValue('2025-01-15', 'date');
        expect(result).not.toContain('2025');
        expect(result).not.toContain('01-15');
        expect(result).not.toContain('15');
      });

      it('returns <date:unknown_format> for unparseable strings', () => {
        expect(anonymizeValue('January 15th', 'date')).toBe('<date:unknown_format>');
        expect(anonymizeValue('hello', 'date')).toBe('<date:unknown_format>');
      });
    });

    describe('merchant field', () => {
      it('anonymizes short merchant names', () => {
        const result = anonymizeValue('Cafe', 'merchant');
        expect(result).toContain('<merchant:');
        expect(result).toContain('len=short');
      });

      it('anonymizes medium merchant names', () => {
        const result = anonymizeValue('The Coffee Shop', 'merchant');
        expect(result).toContain('len=medium');
      });

      it('anonymizes long merchant names', () => {
        const result = anonymizeValue('International House of Pancakes LLC', 'merchant');
        expect(result).toContain('len=long');
      });

      it('detects digits in merchant names', () => {
        const result = anonymizeValue('7-Eleven', 'merchant');
        expect(result).toContain('has_digits');
      });

      it('detects special characters in merchant names', () => {
        const result = anonymizeValue('Cafe & Co.', 'merchant');
        expect(result).toContain('has_special');
      });

      it('CRITICAL: does NOT preserve the actual merchant name', () => {
        const result = anonymizeValue('McDonalds Restaurant', 'merchant');
        expect(result).not.toContain('McDonalds');
        expect(result).not.toContain('Restaurant');
      });

      it('CRITICAL: does not preserve common merchant names', () => {
        for (const name of ['Amazon', 'Swiggy', 'Zomato', 'Flipkart', 'Starbucks']) {
          const result = anonymizeValue(name, 'merchant');
          expect(result).not.toContain(name);
        }
      });
    });

    describe('payment_method field', () => {
      it('anonymizes card payment methods', () => {
        expect(anonymizeValue('Credit Card', 'payment_method')).toBe('<payment_method:card>');
        expect(anonymizeValue('Debit Card', 'payment_method')).toBe('<payment_method:card>');
        expect(anonymizeValue('Visa Card', 'payment_method')).toBe('<payment_method:card>');
      });

      it('anonymizes cash payment methods', () => {
        expect(anonymizeValue('Cash', 'payment_method')).toBe('<payment_method:cash>');
      });

      it('anonymizes UPI payment methods', () => {
        expect(anonymizeValue('UPI', 'payment_method')).toBe('<payment_method:upi>');
        expect(anonymizeValue('user@upi', 'payment_method')).toBe('<payment_method:upi>');
      });

      it('anonymizes wallet payment methods', () => {
        expect(anonymizeValue('Paytm Wallet', 'payment_method')).toBe('<payment_method:wallet>');
        expect(anonymizeValue('PhonePe', 'payment_method')).toBe('<payment_method:wallet>');
        expect(anonymizeValue('GPay', 'payment_method')).toBe('<payment_method:wallet>');
      });

      it('returns <payment_method:other> for unknown methods', () => {
        expect(anonymizeValue('Cryptocurrency', 'payment_method')).toBe('<payment_method:other>');
      });
    });

    describe('line_items field', () => {
      it('anonymizes to a placeholder (NEVER stores item details)', () => {
        expect(anonymizeValue('Burger x2, Fries x1', 'line_items')).toBe('<line_items>');
        expect(anonymizeValue('anything', 'line_items')).toBe('<line_items>');
      });

      it('CRITICAL: never preserves item names', () => {
        const result = anonymizeValue('Burger, Fries, Coke', 'line_items');
        expect(result).not.toContain('Burger');
        expect(result).not.toContain('Fries');
        expect(result).not.toContain('Coke');
      });
    });

    describe('empty / unknown values', () => {
      it('returns <empty> for empty string', () => {
        expect(anonymizeValue('', 'total')).toBe('<empty>');
        expect(anonymizeValue('', 'merchant')).toBe('<empty>');
      });

      it('returns <unknown> for non-string values', () => {
        expect(anonymizeValue(123 as unknown as string, 'total')).toBe('<unknown>');
        expect(anonymizeValue(null as unknown as string, 'total')).toBe('<unknown>');
      });
    });
  });

  describe('computeDiff', () => {
    it('returns an empty list when extracted === corrected', () => {
      const extracted = { total: '100.00', merchant: 'Cafe' };
      const corrected = { total: '100.00', merchant: 'Cafe' };
      expect(computeDiff(extracted, corrected)).toEqual([]);
    });

    it('detects a value_change in the total field', () => {
      const extracted = { total: '100.00' };
      const corrected = { total: '150.00' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.fieldName).toBe('total');
      expect(diffs[0]!.correctionType).toBe('value_change');
      expect(diffs[0]!.extractedValuePattern).toBe('<amount>');
      expect(diffs[0]!.correctedValuePattern).toBe('<amount>');
    });

    it('detects a format_change when only formatting differs', () => {
      const extracted = { total: '100' };
      const corrected = { total: '$100.00' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.correctionType).toBe('format_change');
    });

    it('detects field_added when the user adds a missing field', () => {
      const extracted = { total: '100.00' };
      const corrected = { total: '100.00', merchant: 'Cafe' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.fieldName).toBe('merchant');
      expect(diffs[0]!.correctionType).toBe('field_added');
    });

    it('detects field_removed when the user removes a field', () => {
      const extracted = { total: '100.00', merchant: 'Cafe' };
      const corrected = { total: '100.00' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.fieldName).toBe('merchant');
      expect(diffs[0]!.correctionType).toBe('field_removed');
    });

    it('detects multiple diffs at once', () => {
      const extracted = { total: '100.00', merchant: 'Cafe', date: '2025-01-15' };
      const corrected = { total: '150.00', merchant: 'Coffee Shop', date: '2025-01-15' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(2);
      const fields = diffs.map((d) => d.fieldName);
      expect(fields).toContain('total');
      expect(fields).toContain('merchant');
    });

    it('ignores fields not in the canonical OCR field list', () => {
      const extracted = { total: '100.00', random_field: 'foo' };
      const corrected = { total: '100.00', random_field: 'bar' };
      // `random_field` is not in OCR_FIELD_NAMES — should be ignored.
      expect(computeDiff(extracted, corrected)).toEqual([]);
    });

    it('CRITICAL: diffs NEVER contain raw values', () => {
      const extracted = {
        total: '1234.56',
        merchant: 'McDonalds',
        date: '2025-01-15',
        payment_method: 'Visa Card',
      };
      const corrected = {
        total: '1500.00',
        merchant: 'Burger King',
        date: '2025-01-16',
        payment_method: 'Mastercard',
      };
      const diffs = computeDiff(extracted, corrected);
      expect(diffContainsRawPii(diffs)).toBe(false);
      // Explicit checks.
      for (const d of diffs) {
        expect(d.extractedValuePattern).not.toContain('1234');
        expect(d.extractedValuePattern).not.toContain('McDonalds');
        expect(d.extractedValuePattern).not.toContain('2025-01-15');
        expect(d.correctedValuePattern).not.toContain('1500');
        expect(d.correctedValuePattern).not.toContain('Burger King');
        expect(d.correctedValuePattern).not.toContain('2025-01-16');
      }
    });

    it('CRITICAL: diffs never contain raw emails or UPI VPAs', () => {
      const extracted = { merchant: 'user@upi' };
      const corrected = { merchant: 'user@example.com' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffContainsRawPii(diffs)).toBe(false);
      for (const d of diffs) {
        expect(d.extractedValuePattern).not.toContain('user@upi');
        expect(d.correctedValuePattern).not.toContain('user@example.com');
      }
    });

    it('returns a frozen list', () => {
      const extracted = { total: '100.00' };
      const corrected = { total: '150.00' };
      const diffs = computeDiff(extracted, corrected);
      expect(Object.isFrozen(diffs)).toBe(true);
    });

    it('does NOT mutate the inputs', () => {
      const extracted = { total: '100.00' };
      const corrected = { total: '150.00' };
      const extractedCopy = { ...extracted };
      const correctedCopy = { ...corrected };
      computeDiff(extracted, corrected);
      expect(extracted).toEqual(extractedCopy);
      expect(corrected).toEqual(correctedCopy);
    });

    it('handles undefined values gracefully', () => {
      const extracted = { total: undefined };
      const corrected = { total: '100.00' };
      const diffs = computeDiff(extracted as Record<string, unknown>, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.correctionType).toBe('field_added');
    });

    it('handles null values gracefully', () => {
      const extracted = { total: null };
      const corrected = { total: '100.00' };
      const diffs = computeDiff(extracted as Record<string, unknown>, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.correctionType).toBe('field_added');
    });

    it('infers extraction confidence from the extracted value', () => {
      const extracted = { total: '100.00', date: '2025-01-15' };
      const corrected = { total: '200.00', date: '2025-01-16' };
      const diffs = computeDiff(extracted, corrected);
      const total = diffs.find((d) => d.fieldName === 'total');
      const date = diffs.find((d) => d.fieldName === 'date');
      // Total amount: looks like an amount → medium.
      expect(total?.extractionConfidence).toBe('medium');
      // Date: ISO format → high.
      expect(date?.extractionConfidence).toBe('high');
    });

    it('detects format change for dates that parse to the same value', () => {
      const extracted = { date: '2025/01/15' };
      const corrected = { date: '2025-01-15' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.correctionType).toBe('format_change');
    });

    it('detects value change for genuinely different dates', () => {
      const extracted = { date: '2025-01-15' };
      const corrected = { date: '2025-01-16' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.correctionType).toBe('value_change');
    });

    it('detects format change for amounts that parse to the same value', () => {
      const extracted = { total: '100' };
      const corrected = { total: '100.00' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.correctionType).toBe('format_change');
    });

    it('detects format change for merchant names differing only in case', () => {
      const extracted = { merchant: 'cafe' };
      const corrected = { merchant: 'Cafe' };
      const diffs = computeDiff(extracted, corrected);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.correctionType).toBe('format_change');
    });

    it('CRITICAL: diff patterns are deterministic (same input → same output)', () => {
      const extracted = { total: '100.00', merchant: 'Cafe' };
      const corrected = { total: '150.00', merchant: 'Coffee Shop' };
      const d1 = computeDiff(extracted, corrected);
      const d2 = computeDiff(extracted, corrected);
      expect(d1).toEqual(d2);
    });
  });

  describe('calendar-date comparison', () => {
    it('parses ISO dates and reports a single reading', () => {
      expect(parseCalendarDates('2025-01-15')).toEqual([
        { year: 2025, month: 1, day: 15 },
      ]);
      expect(parseCalendarDates('2025/01/15')).toEqual([
        { year: 2025, month: 1, day: 15 },
      ]);
      expect(parseCalendarDates('2025.01.15')).toEqual([
        { year: 2025, month: 1, day: 15 },
      ]);
    });

    it('parses day-first and month-first dates from the digit values', () => {
      expect(parseCalendarDates('15/01/2025')).toEqual([
        { year: 2025, month: 1, day: 15 },
      ]);
      expect(parseCalendarDates('01/15/2025')).toEqual([
        { year: 2025, month: 1, day: 15 },
      ]);
      expect(parseCalendarDates('15.01.25')).toEqual([
        { year: 2025, month: 1, day: 15 },
      ]);
    });

    it('keeps both readings for a genuinely ambiguous date', () => {
      expect(parseCalendarDates('01/02/2025')).toEqual([
        { year: 2025, month: 2, day: 1 },
        { year: 2025, month: 1, day: 2 },
      ]);
    });

    it('rejects impossible dates and free text', () => {
      expect(parseCalendarDates('31/02/2025')).toEqual([]);
      expect(parseCalendarDates('2025-13-01')).toEqual([]);
      expect(parseCalendarDates('2025-01-32')).toEqual([]);
      expect(parseCalendarDates('January 15th')).toEqual([]);
      expect(parseCalendarDates('')).toEqual([]);
    });

    it('accepts 29 February only in a leap year', () => {
      expect(parseCalendarDates('2024-02-29')).toEqual([
        { year: 2024, month: 2, day: 29 },
      ]);
      expect(parseCalendarDates('2025-02-29')).toEqual([]);
      expect(parseCalendarDates('2000-02-29')).toEqual([
        { year: 2000, month: 2, day: 29 },
      ]);
      expect(parseCalendarDates('1900-02-29')).toEqual([]);
    });

    it('compares calendar days without any timezone shift', () => {
      expect(sameCalendarDate('2025/01/15', '2025-01-15')).toBe(true);
      expect(sameCalendarDate('15/01/2025', '2025-01-15')).toBe(true);
      expect(sameCalendarDate('01/15/2025', '2025-01-15')).toBe(true);
      expect(sameCalendarDate('2025-01-15', '2025-01-16')).toBe(false);
      expect(sameCalendarDate('2025-01-15', 'not a date')).toBe(false);
    });
  });

  describe('timezone independence', () => {
    // Regression: these assertions used to depend on Date.parse semantics
    // (ISO = UTC, slashes = local) and therefore on the machine timezone.
    // They must hold identically whether the host runs in UTC, IST, or
    // anywhere else.
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it.each(['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
      'classifies reformatted dates as format_change under TZ=%s',
      (tz) => {
        process.env.TZ = tz;
        const diffs = computeDiff(
          { date: '2025/01/15' },
          { date: '2025-01-15' },
        );
        expect(diffs.length).toBe(1);
        expect(diffs[0]!.correctionType).toBe('format_change');
      },
    );

    it.each(['UTC', 'Asia/Kolkata', 'America/Los_Angeles'])(
      'classifies different days as value_change under TZ=%s',
      (tz) => {
        process.env.TZ = tz;
        const diffs = computeDiff(
          { date: '2025-01-15' },
          { date: '2025-01-16' },
        );
        expect(diffs[0]!.correctionType).toBe('value_change');
      },
    );
  });

  describe('diffContainsRawPii', () => {
    it('returns false for properly anonymized diffs', () => {
      const diffs: FieldLevelDiff[] = [
        {
          fieldName: 'total',
          extractedValuePattern: '<amount>',
          correctedValuePattern: '<amount>',
          extractionConfidence: 'medium',
          correctionType: 'value_change',
        },
      ];
      expect(diffContainsRawPii(diffs)).toBe(false);
    });

    it('returns true if a raw email leaks into the diff', () => {
      const diffs: FieldLevelDiff[] = [
        {
          fieldName: 'merchant',
          extractedValuePattern: '<merchant:len=medium>',
          correctedValuePattern: 'user@example.com', // raw email!
          extractionConfidence: 'medium',
          correctionType: 'value_change',
        },
      ];
      expect(diffContainsRawPii(diffs)).toBe(true);
    });

    it('returns true if a raw date leaks into the diff', () => {
      const diffs: FieldLevelDiff[] = [
        {
          fieldName: 'date',
          extractedValuePattern: '2025-01-15', // raw date!
          correctedValuePattern: '<date:YYYY-MM-DD>',
          extractionConfidence: 'high',
          correctionType: 'value_change',
        },
      ];
      expect(diffContainsRawPii(diffs)).toBe(true);
    });
  });
});
