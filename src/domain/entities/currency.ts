import type { CurrencyCode } from '../value-objects/index';

/**
 * Metadata for a supported currency.
 *
 * Phase 1: hard-coded list of common currencies. Future: loaded from a
 * server table or a library like `currency-codes`.
 */
export interface Currency {
  readonly code: CurrencyCode;
  readonly name: string;
  readonly symbol: string;
  /** Number of decimal places in the major unit (e.g. INR = 2, JPY = 0). */
  readonly decimalPlaces: 0 | 1 | 2 | 3;
  readonly numericCode: string;
}

export const SUPPORTED_CURRENCIES: readonly Currency[] = [
  { code: 'USD' as CurrencyCode, name: 'US Dollar', symbol: '$', decimalPlaces: 2, numericCode: '840' },
  { code: 'EUR' as CurrencyCode, name: 'Euro', symbol: '€', decimalPlaces: 2, numericCode: '978' },
  { code: 'GBP' as CurrencyCode, name: 'British Pound', symbol: '£', decimalPlaces: 2, numericCode: '826' },
  { code: 'INR' as CurrencyCode, name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2, numericCode: '356' },
  { code: 'JPY' as CurrencyCode, name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0, numericCode: '392' },
  // v2.4.0: additional ZERO-decimal currencies (the settlement form already
  // accepted KRW/VND input while the domain table silently treated them as
  // 2-decimal — a 100x display/conversion bug).
  { code: 'KRW' as CurrencyCode, name: 'South Korean Won', symbol: '₩', decimalPlaces: 0, numericCode: '410' },
  { code: 'VND' as CurrencyCode, name: 'Vietnamese Dong', symbol: '₫', decimalPlaces: 0, numericCode: '704' },
  // v2.4.0: THREE-decimal currencies (minor units of 1000). The settlement
  // form already parsed these correctly (1.234 KWD → 1234 minor); the
  // domain table and display layer now agree.
  { code: 'KWD' as CurrencyCode, name: 'Kuwaiti Dinar', symbol: 'KD', decimalPlaces: 3, numericCode: '414' },
  { code: 'BHD' as CurrencyCode, name: 'Bahraini Dinar', symbol: 'BD', decimalPlaces: 3, numericCode: '048' },
  { code: 'JOD' as CurrencyCode, name: 'Jordanian Dinar', symbol: 'JD', decimalPlaces: 3, numericCode: '400' },
  { code: 'IQD' as CurrencyCode, name: 'Iraqi Dinar', symbol: 'IQD', decimalPlaces: 3, numericCode: '368' },
  { code: 'AUD' as CurrencyCode, name: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2, numericCode: '036' },
  { code: 'CAD' as CurrencyCode, name: 'Canadian Dollar', symbol: 'C$', decimalPlaces: 2, numericCode: '124' },
  { code: 'CHF' as CurrencyCode, name: 'Swiss Franc', symbol: 'CHF', decimalPlaces: 2, numericCode: '756' },
  { code: 'CNY' as CurrencyCode, name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2, numericCode: '156' },
  { code: 'SGD' as CurrencyCode, name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2, numericCode: '702' },
  { code: 'AED' as CurrencyCode, name: 'UAE Dirham', symbol: 'AED', decimalPlaces: 2, numericCode: '784' },
  { code: 'ZAR' as CurrencyCode, name: 'South African Rand', symbol: 'R', decimalPlaces: 2, numericCode: '710' },
];

export function getCurrency(code: CurrencyCode): Currency | undefined {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code);
}

export function isCurrencySupported(code: CurrencyCode): boolean {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code);
}

/**
 * Format an integer minor-unit amount as a plain major-unit decimal
 * string honoring the currency's minor-unit scale (v2.5.0).
 *
 * WHY: several display/export paths hardcoded `minor / 100` with
 * `toFixed(2)` — a JPY amount of ¥1500 (minor 1500, 0 decimals)
 * rendered as "15.00" and KWD lost its third decimal. Pure integer
 * math, no floats: the divisor and the padded fractional part come
 * from the currency registry. Unknown codes default to 2 decimals.
 *
 *   formatMinorAmount(1050, 'INR') // "10.50"
 *   formatMinorAmount(1500, 'JPY') // "1500"
 *   formatMinorAmount(1234, 'KWD') // "1.234"
 */
export function formatMinorAmount(minor: number, currencyCode: CurrencyCode): string {
  if (!Number.isFinite(minor) || !Number.isInteger(minor)) {
    throw new Error(`formatMinorAmount requires a finite integer minor amount, got ${String(minor)}`);
  }
  const decimals = getCurrency(currencyCode)?.decimalPlaces ?? 2;
  const divisor = Math.pow(10, decimals);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const majorPart = Math.floor(abs / divisor);
  const minorPart = abs % divisor;
  return `${sign}${majorPart}.${minorPart.toString().padStart(decimals, '0')}`;
}
