/**
 * Financial display utilities.
 *
 * Rules:
 *   - Never rely only on red/green — use labels, icons, sign convention, and
 *     colour as secondary reinforcement. Colour-blind users must still
 *     understand the direction from the label and icon alone.
 *   - Always show currency context (symbol + code).
 *   - Use tabular-nums for alignment (enforced by typography tokens).
 *   - Negative amounts are shown with a leading minus sign.
 *   - Amounts owed vs receivable have distinct labels ("You owe" vs
 *     "You are owed"); zero is "Settled".
 *   - Integer-only formatting — no floating-point. Minor units are split
 *     into major + fractional parts with integer arithmetic, matching the
 *     domain `Money` value object.
 *
 * v2.4.0: `getCurrencyDecimals` now defers to the DOMAIN currency table
 * (single source of truth) instead of a private zero-decimal set. This
 * fixes the 10x display bug for 3-decimal currencies (KWD/BHD/JOD/IQD
 * were rendered with 2 decimals) and keeps zero-decimal currencies
 * (JPY/KRW/VND plus XPF/BIF/CLP/DJF/GNF/KMF/RWF/XAF/XOF) correct.
 */

import { getCurrency } from '@domain/entities/currency';

/** Sign classification for a financial amount, from the current user's POV. */
export type FinancialSign = 'positive' | 'negative' | 'zero';

export interface FormattedAmount {
  /** Direction: positive = receivable, negative = owed, zero = settled. */
  readonly sign: FinancialSign;
  /** Human-readable major-unit string, e.g. "1,250.50" (or "1,250" for JPY). */
  readonly formattedMinor: string;
  /** ISO 4217 currency code, e.g. "USD". */
  readonly currencyCode: string;
  /** Currency symbol/glyph, e.g. "$". Falls back to "<CODE> " when unknown. */
  readonly currencySymbol: string;
  /** Plain-language label, e.g. "You are owed". */
  readonly label: string;
  /** Icon name (Ionicons) for the direction, e.g. "arrow-down-circle". */
  readonly icon: string;
}

/** Currencies with zero decimal places that are NOT in the domain table. */
const EXTRA_ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'XPF', 'BIF', 'CLP', 'DJF', 'GNF', 'KMF', 'RWF', 'XAF', 'XOF',
]);

/** Extra 3-decimal currencies beyond the domain table (TND, OMR...). */
const EXTRA_THREE_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set(['TND', 'OMR']);

/** Currency symbol lookup for common currencies. */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'CHF',
  SGD: 'S$',
  AED: 'AED',
  ZAR: 'R',
};

/**
 * Format an integer minor-unit amount for display.
 *
 * @param minor        Amount in minor units (e.g. cents, paise). Negative
 *                     means the user owes money.
 * @param currencyCode ISO 4217 code, e.g. "USD", "INR", "JPY".
 *
 * @example
 *   formatAmount(125050, 'INR') // => "1,250.50", sign 'positive', label 'You are owed'
 *   formatAmount(-500, 'USD')   // => "5.00", sign 'negative', label 'You owe'
 *   formatAmount(0, 'USD')      // => "0.00", sign 'zero', label 'Settled'
 *   formatAmount(1250, 'JPY')   // => "1,250" (zero-decimal currency)
 */
export function formatAmount(minor: number, currencyCode: string): FormattedAmount {
  const isNegative = minor < 0;
  const absMinor = Math.abs(minor);
  const decimals = getCurrencyDecimals(currencyCode);
  const divisor = Math.pow(10, decimals);
  const majorPart = Math.floor(absMinor / divisor);
  const minorPart = absMinor % divisor;

  const formattedMajor = majorPart.toLocaleString('en-US');

  // For zero-decimal currencies there is no fractional part — omit the dot.
  const formatted =
    decimals === 0
      ? formattedMajor
      : `${formattedMajor}.${minorPart.toString().padStart(decimals, '0')}`;

  const sign: FinancialSign = isNegative ? 'negative' : minor > 0 ? 'positive' : 'zero';

  return {
    sign,
    formattedMinor: formatted,
    currencyCode,
    currencySymbol: getSymbol(currencyCode),
    label: getLabel(sign),
    icon: getIcon(sign),
  };
}

/**
 * Number of decimal places for the currency (0, 2, or 3).
 * v2.4.0: the DOMAIN table is the source of truth; the sets above only
 * cover ISO 4217 codes outside the app's supported-currency list.
 */
export function getCurrencyDecimals(code: string): number {
  const domain = getCurrency(code as never);
  if (domain !== undefined) return domain.decimalPlaces;
  if (EXTRA_ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (EXTRA_THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

/** Symbol for a currency code, falling back to "<CODE> " when unknown. */
export function getSymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

/** Plain-language label describing what the sign means to the user. */
export function getLabel(sign: FinancialSign): string {
  switch (sign) {
    case 'positive':
      return 'You are owed';
    case 'negative':
      return 'You owe';
    case 'zero':
      return 'Settled';
  }
}

/** Ionicons glyph name for the direction. */
export function getIcon(sign: FinancialSign): string {
  switch (sign) {
    case 'positive':
      return 'arrow-down-circle';
    case 'negative':
      return 'arrow-up-circle';
    case 'zero':
      return 'checkmark-circle';
  }
}
