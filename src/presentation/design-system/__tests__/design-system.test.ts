/**
 * Design-system unit tests.
 *
 * Covers the pure, framework-agnostic parts of the design system:
 *   - `formatAmount` for positive / negative / zero values
 *   - `formatAmount` across currencies (INR, USD, JPY)
 *   - label correctness (owed / owe / settled)
 *   - light / dark theme colour tokens
 *   - typography token font sizes
 *
 * These tests import the individual modules rather than the barrel so they
 * don't pull in `ThemeProvider` (which depends on the AsyncStorage-backed
 * Zustand store) — keeping the unit tests hermetic.
 */

import { describe, expect, it } from '@jest/globals';

import { formatAmount, getCurrencyDecimals, getIcon, getLabel, getSymbol } from '../financial-format';
import { darkTheme, lightTheme } from '../theme';
import { darkColors, lightColors, typography } from '../tokens';

describe('formatAmount', () => {
  describe('sign classification', () => {
    it('classifies a positive amount as positive', () => {
      const result = formatAmount(125050, 'INR');
      expect(result.sign).toBe('positive');
    });

    it('classifies a negative amount as negative', () => {
      const result = formatAmount(-500, 'USD');
      expect(result.sign).toBe('negative');
    });

    it('classifies zero as zero', () => {
      const result = formatAmount(0, 'USD');
      expect(result.sign).toBe('zero');
    });
  });

  describe('currency formatting', () => {
    it('formats INR minor units into a major string with 2 decimals', () => {
      // 125050 paise = ₹1,250.50
      const result = formatAmount(125050, 'INR');
      expect(result.formattedMinor).toBe('1,250.50');
      expect(result.currencyCode).toBe('INR');
      expect(result.currencySymbol).toBe('₹');
    });

    it('formats USD minor units into a major string with 2 decimals', () => {
      // 999 cents = $9.99
      const result = formatAmount(999, 'USD');
      expect(result.formattedMinor).toBe('9.99');
      expect(result.currencySymbol).toBe('$');
    });

    it('formats JPY with no decimal places', () => {
      // JPY has 0 decimals — 1250 yen stays as "1,250" (no dot)
      const result = formatAmount(1250, 'JPY');
      expect(result.formattedMinor).toBe('1,250');
      expect(result.currencySymbol).toBe('¥');
    });

    it('includes thousands separators for large amounts', () => {
      const result = formatAmount(1234567, 'USD');
      expect(result.formattedMinor).toBe('12,345.67');
    });

    it('treats the absolute value when formatting negatives', () => {
      const result = formatAmount(-125050, 'INR');
      expect(result.formattedMinor).toBe('1,250.50');
      expect(result.sign).toBe('negative');
    });

    it('pads the fractional part to the currency decimal count', () => {
      // 500 cents USD = $5.00 (not "5.0" or "5")
      const result = formatAmount(500, 'USD');
      expect(result.formattedMinor).toBe('5.00');
    });
  });

  describe('labels and icons (accessibility reinforcement)', () => {
    it('labels a positive amount as "You are owed"', () => {
      expect(getLabel('positive')).toBe('You are owed');
      expect(formatAmount(100, 'USD').label).toBe('You are owed');
    });

    it('labels a negative amount as "You owe"', () => {
      expect(getLabel('negative')).toBe('You owe');
      expect(formatAmount(-100, 'USD').label).toBe('You owe');
    });

    it('labels a zero amount as "Settled"', () => {
      expect(getLabel('zero')).toBe('Settled');
      expect(formatAmount(0, 'USD').label).toBe('Settled');
    });

    it('maps each sign to a distinct icon', () => {
      expect(getIcon('positive')).toBe('arrow-down-circle');
      expect(getIcon('negative')).toBe('arrow-up-circle');
      expect(getIcon('zero')).toBe('checkmark-circle');
    });
  });

  describe('currency helpers', () => {
    it('reports 0 decimals for zero-decimal currencies', () => {
      expect(getCurrencyDecimals('JPY')).toBe(0);
      expect(getCurrencyDecimals('KRW')).toBe(0);
      expect(getCurrencyDecimals('VND')).toBe(0);
    });

    it('defaults to 2 decimals for standard currencies', () => {
      expect(getCurrencyDecimals('USD')).toBe(2);
      expect(getCurrencyDecimals('INR')).toBe(2);
      expect(getCurrencyDecimals('EUR')).toBe(2);
    });

    it('falls back to "<CODE> " for unknown currency symbols', () => {
      expect(getSymbol('XYZ')).toBe('XYZ ');
    });
  });
});

describe('light theme colours', () => {
  it('uses warm ivory backgrounds', () => {
    expect(lightColors.background).toBe('#FAF8F5');
    expect(lightColors.surface).toBe('#FFFFFF');
    expect(lightColors.surfaceMuted).toBe('#F2EEE8');
  });

  it('uses deep slate text', () => {
    expect(lightColors.textPrimary).toBe('#1A1B25');
    expect(lightColors.textSecondary).toBe('#5A5D6B');
    expect(lightColors.textMuted).toBe('#9B9EA8');
  });

  it('exposes semantic and brand colours', () => {
    expect(lightColors.positive).toBe('#3F7A5E');
    expect(lightColors.negative).toBe('#A8323C');
    expect(lightColors.warning).toBe('#B07A1E');
    expect(lightColors.critical).toBe('#7A1E26');
    expect(lightColors.info).toBe('#2E5B9A');
    expect(lightColors.brandPrimary).toBe('#2B3A8C');
    expect(lightColors.brandSecondary).toBe('#5A3B92');
  });

  it('exposes confidence and sync tokens', () => {
    expect(lightColors.confidenceHigh).toBe('#3F7A5E');
    expect(lightColors.confidenceLow).toBe('#A8323C');
    expect(lightColors.syncComplete).toBe('#3F7A5E');
    expect(lightColors.syncFailed).toBe('#A8323C');
  });

  it('binds the colours through the Theme object', () => {
    expect(lightTheme.mode).toBe('light');
    expect(lightTheme.colors).toBe(lightColors);
  });
});

describe('dark theme colours', () => {
  it('uses deep warm-slate backgrounds', () => {
    expect(darkColors.background).toBe('#15161D');
    expect(darkColors.surface).toBe('#1F1F29');
    expect(darkColors.surfaceElevated).toBe('#2A2A36');
  });

  it('uses near-white text', () => {
    expect(darkColors.textPrimary).toBe('#F4F1EA');
    expect(darkColors.textSecondary).toBe('#C7C3B7');
    expect(darkColors.textMuted).toBe('#84827D');
  });

  it('keeps semantic colours identical to light mode (calibrated for both)', () => {
    expect(darkColors.positive).toBe(lightColors.positive);
    expect(darkColors.negative).toBe(lightColors.negative);
    expect(darkColors.brandPrimary).toBe(lightColors.brandPrimary);
  });

  it('binds the colours through the Theme object', () => {
    expect(darkTheme.mode).toBe('dark');
    expect(darkTheme.colors).toBe(darkColors);
  });
});

describe('typography tokens', () => {
  it('defines display and screen title sizes', () => {
    expect(typography.display.fontSize).toBe(36);
    expect(typography.display.fontWeight).toBe('700');
    expect(typography.screenTitle.fontSize).toBe(28);
  });

  it('defines section, card, and body sizes', () => {
    expect(typography.sectionTitle.fontSize).toBe(20);
    expect(typography.cardTitle.fontSize).toBe(16);
    expect(typography.body.fontSize).toBe(15);
    expect(typography.bodyStrong.fontSize).toBe(15);
    expect(typography.bodyStrong.fontWeight).toBe('600');
  });

  it('defines caption and label sizes', () => {
    expect(typography.caption.fontSize).toBe(13);
    expect(typography.label.fontSize).toBe(12);
    expect(typography.label.fontWeight).toBe('600');
  });

  it('defines amount variants with tabular-nums for alignment', () => {
    expect(typography.amountLarge.fontSize).toBe(32);
    expect(typography.amountMedium.fontSize).toBe(20);
    expect(typography.amountSmall.fontSize).toBe(15);
    expect(typography.amountLarge.fontVariant).toEqual(['tabular-nums']);
    expect(typography.amountMedium.fontVariant).toEqual(['tabular-nums']);
    expect(typography.amountSmall.fontVariant).toEqual(['tabular-nums']);
  });

  it('defines button, input, and error sizes', () => {
    expect(typography.button.fontSize).toBe(16);
    expect(typography.input.fontSize).toBe(16);
    expect(typography.error.fontSize).toBe(13);
  });

  it('exposes typography through the Theme object', () => {
    expect(lightTheme.typography).toBe(typography);
    expect(darkTheme.typography).toBe(typography);
  });
});
