import {
  formatAmountMinor,
  formatDate,
  formatNumber,
  formatPercentage,
} from '../locale-formatter';

describe('i18n / locale-formatter', () => {
  describe('formatAmountMinor', () => {
    it('formats INR in en-IN locale', () => {
      const result = formatAmountMinor(125050, 'INR', 'en-IN');
      // Should contain ₹, the major number with grouping, and 2dp.
      expect(result).toMatch(/₹/);
      expect(result).toMatch(/1,250\.50/);
    });
    it('formats USD in en-US locale', () => {
      const result = formatAmountMinor(125050, 'USD', 'en-US');
      expect(result).toMatch(/\$/);
      expect(result).toMatch(/1,250\.50/);
    });
    it('formats JPY in ja-JP locale (no decimals)', () => {
      const result = formatAmountMinor(1250, 'JPY', 'ja-JP');
      // JPY has 0 minor units → no decimal separator.
      expect(result).toMatch(/1,250/);
      expect(result).not.toMatch(/1,250\./);
    });
    it('formats KWD with 3 decimal places', () => {
      const result = formatAmountMinor(125050, 'KWD', 'en-US');
      // KWD has 3 minor-unit digits → 125.050
      expect(result).toMatch(/125\.050/);
    });
    it('formats VND with no decimals', () => {
      const result = formatAmountMinor(1250, 'VND', 'vi-VN');
      // VND has 0 minor units; vi-VN uses '.' as thousands separator.
      // We expect the integer major amount (1250) without any decimal
      // fraction — i.e. no ",dd" suffix.
      expect(result).not.toMatch(/,\d{2}\b/);
      expect(result).toMatch(/1/);
      expect(result).toMatch(/250/);
    });
    it('formats GBP in en-GB locale', () => {
      const result = formatAmountMinor(125050, 'GBP', 'en-GB');
      expect(result).toMatch(/£/);
      expect(result).toMatch(/1,250\.50/);
    });
    it('handles zero amount', () => {
      const result = formatAmountMinor(0, 'USD', 'en-US');
      expect(result).toMatch(/0\.00/);
    });
    it('handles negative amounts', () => {
      const result = formatAmountMinor(-1250, 'USD', 'en-US');
      // Should include a minus sign and the value.
      expect(result).toMatch(/-/);
      expect(result).toMatch(/12\.50/);
    });
    it('returns string version for non-finite amount', () => {
      const result = formatAmountMinor(Number.NaN, 'USD', 'en-US');
      expect(result).toBe(String(Number.NaN));
    });
    it('returns string version for empty currency code', () => {
      const result = formatAmountMinor(1250, '', 'en-US');
      expect(result).toBe('1250');
    });
    it('returns string version for non-3-letter currency code', () => {
      const result = formatAmountMinor(1250, 'US', 'en-US');
      expect(result).toBe('1250');
    });
    it('falls back to en-US locale on unknown locale', () => {
      // Pass an invalid locale — should not throw.
      const result = formatAmountMinor(125050, 'USD', 'invalid-XX');
      expect(result).toMatch(/1,250\.50/);
    });
    it('handles lowercase currency code', () => {
      const result = formatAmountMinor(125050, 'usd', 'en-US');
      expect(result).toMatch(/1,250\.50/);
    });
  });

  describe('formatDate', () => {
    it('formats short date', () => {
      const result = formatDate('2026-01-15T12:00:00.000Z', 'en-US', 'short');
      // en-US short is M/D/YY
      expect(result).toMatch(/1\/15\/26/);
    });
    it('formats medium date with abbreviated month', () => {
      const result = formatDate('2026-01-15T12:00:00.000Z', 'en-US', 'medium');
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/2026/);
    });
    it('formats long date with full month', () => {
      const result = formatDate('2026-01-15T12:00:00.000Z', 'en-US', 'long');
      expect(result).toMatch(/January/);
    });
    it('defaults to medium format', () => {
      const result = formatDate('2026-01-15T12:00:00.000Z', 'en-US');
      expect(result).toMatch(/Jan/);
    });
    it('returns original string on invalid date', () => {
      const result = formatDate('not-a-date', 'en-US');
      expect(result).toBe('not-a-date');
    });
    it('falls back to en-US on unknown locale', () => {
      const result = formatDate('2026-01-15T12:00:00.000Z', 'invalid-XX', 'medium');
      expect(result).toMatch(/2026/);
    });
  });

  describe('formatNumber', () => {
    it('formats with locale grouping', () => {
      const result = formatNumber(1234567, 'en-US');
      expect(result).toMatch(/1,234,567/);
    });
    it('handles negative numbers', () => {
      const result = formatNumber(-1234, 'en-US');
      expect(result).toMatch(/-/);
    });
    it('returns string version for non-finite', () => {
      expect(formatNumber(Number.POSITIVE_INFINITY, 'en-US')).toBe(
        String(Number.POSITIVE_INFINITY),
      );
    });
  });

  describe('formatPercentage', () => {
    it('formats 0.75 as 75% in en-US', () => {
      const result = formatPercentage(0.75, 'en-US');
      expect(result).toMatch(/75%/);
    });
    it('formats with fraction digits', () => {
      const result = formatPercentage(0.1234, 'en-US', 2);
      expect(result).toMatch(/12\.34%/);
    });
    it('formats 0 as 0%', () => {
      const result = formatPercentage(0, 'en-US');
      expect(result).toMatch(/0%/);
    });
    it('returns string version for non-finite', () => {
      expect(formatPercentage(Number.NaN, 'en-US')).toBe(String(Number.NaN));
    });
  });
});
