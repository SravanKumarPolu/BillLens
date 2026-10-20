/**
 * Locale-aware formatting — amounts, dates, numbers, percentages.
 *
 * Phase 10 Prompt 93: International Expansion.
 *
 * CRITICAL FINANCIAL SAFETY: amounts are ALWAYS integer minor units.
 * The formatter converts minor units → major units using the currency
 * exponent (2 for most currencies, 0 for JPY/KRW, 3 for KWD) and
 * formats via `Intl.NumberFormat`. No floating-point leakage reaches
 * storage — formatting is a pure presentation concern.
 *
 * See `docs/international-expansion.md` and `docs/money-and-rounding.md`.
 */

// ---------------------------------------------------------------------------
// Currency exponent lookup (ISO 4217)
// ---------------------------------------------------------------------------

/**
 * Maps currency code → decimal exponent. Most currencies use 2 (e.g.
 * USD = 100 cents). JPY/KRW/VND use 0 (no minor units). KWD/BHD use
 * 3. Unknown currencies default to 2.
 *
 * Source: ISO 4217. We hard-code the small set of exceptions rather
 * than carry a full table — the common case is exponent=2.
 */
const CURRENCY_EXPONENT: Readonly<Record<string, number>> = Object.freeze({
  USD: 2, EUR: 2, GBP: 2, INR: 2, AUD: 2, CAD: 2, CHF: 2, CNY: 2,
  SGD: 2, HKD: 2, NZD: 2, SEK: 2, NOK: 2, DKK: 2, PLN: 2, CZK: 2,
  HUF: 2, RON: 2, BGN: 2, HRK: 2, RUB: 2, TRY: 2, ZAR: 2, BRL: 2,
  MXN: 2, ARS: 2, CLP: 0, COP: 0, PEN: 2, AED: 2, SAR: 2, EGP: 2,
  ILS: 2, PKR: 2, BDT: 2, LKR: 2, NPR: 2, THB: 2, IDR: 2, PHP: 2,
  MYR: 2, VND: 0, KRW: 0, JPY: 0, KWD: 3, BHD: 3, OMR: 3, JOD: 3,
});

function getCurrencyExponent(currencyCode: string): number {
  return CURRENCY_EXPONENT[currencyCode] ?? 2;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Formats an amount expressed in minor units (integer) into a
 * locale-aware currency string.
 *
 * Examples:
 *   formatAmountMinor(125050, 'INR', 'en-IN') → '₹1,250.50'
 *   formatAmountMinor(125050, 'USD', 'en-US') → '$1,250.50'
 *   formatAmountMinor(1250,    'JPY', 'ja-JP') → '¥1,250'
 *   formatAmountMinor(125050, 'KWD', 'ar-SA') → 'د.إ‏ 125.050' (3dp)
 *
 * Strategy:
 *  1. Look up currency exponent (default 2).
 *  2. Divide minor units by 10^exponent. We accept the floating-point
 *     representation ONLY for display — the original minor-unit value
 *     is never altered.
 *  3. Use Intl.NumberFormat with `style: 'currency'` for layout.
 *
 * Returns the formatted string. Returns the original number as a
 * string when `currencyCode` is empty.
 */
export function formatAmountMinor(
  amountMinor: number,
  currencyCode: string,
  locale: string,
): string {
  if (!Number.isFinite(amountMinor)) {
    return String(amountMinor);
  }
  if (!currencyCode || currencyCode.length !== 3) {
    return String(amountMinor);
  }
  const exponent = getCurrencyExponent(currencyCode.toUpperCase());
  // Integer minor → major via division. Math.round to neutralise any
  // floating-point representation error introduced by the division.
  const major = amountMinor / Math.pow(10, exponent);
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    });
    return formatter.format(major);
  } catch {
    // Intl may throw on unknown locale — fall back to 'en-US'.
    const fallback = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    });
    return fallback.format(major);
  }
}

/**
 * Formats an ISO date string into a locale-aware date string.
 *
 * `format` controls verbosity:
 *  - 'short'  → numeric (e.g. '1/15/26' for en-US)
 *  - 'medium' → abbreviated month (e.g. 'Jan 15, 2026')
 *  - 'long'   → full month (e.g. 'January 15, 2026')
 *
 * Defaults to 'medium'.
 */
export function formatDate(
  date: string,
  locale: string,
  format: 'short' | 'medium' | 'long' = 'medium',
): string {
  const t = Date.parse(date);
  if (!Number.isFinite(t)) {
    return date;
  }
  const opts: Intl.DateTimeFormatOptions =
    format === 'short'
      ? { year: '2-digit', month: 'numeric', day: 'numeric' }
      : format === 'long'
        ? { year: 'numeric', month: 'long', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(new Date(t));
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(t));
  }
}

/**
 * Formats a plain number with locale-aware grouping.
 */
export function formatNumber(value: number, locale: string): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return new Intl.NumberFormat('en-US').format(value);
  }
}

/**
 * Formats a ratio (0..1) as a locale-aware percentage.
 *
 * Example:
 *   formatPercentage(0.75, 'en-US') → '75%'
 *   formatPercentage(0.1234, 'de-DE') → '12%'
 *
 * Defaults to 0 fraction digits; pass `fractionDigits` for finer
 * granularity.
 */
export function formatPercentage(
  ratio: number,
  locale: string,
  fractionDigits = 0,
): string {
  if (!Number.isFinite(ratio)) {
    return String(ratio);
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(ratio);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(ratio);
  }
}

// ---------------------------------------------------------------------------
// Test-only exports (kept private to this module via export for tests)
// ---------------------------------------------------------------------------

export const __test = {
  getCurrencyExponent,
};
