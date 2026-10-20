import type { Branded } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

/**
 * ISO 4217 currency code (uppercase, 3 letters).
 *
 * Examples: USD, EUR, INR, GBP, JPY.
 *
 * The branded type prevents accidental use of arbitrary strings where a
 * currency code is expected. Construction goes through `asCurrencyCode`,
 * which validates the format.
 */
export type CurrencyCode = Branded<string, 'CurrencyCode'>;

const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

/**
 * List of common ISO 4217 currency codes used in BillLens.
 * Not exhaustive — full validation would require a runtime table; for
 * Phase 1 we accept any 3-letter uppercase code and rely on the database
 * CHECK constraint to reject unknown codes if needed.
 *
 * This constant is used by tests and documentation, not by the constructor.
 */
export const COMMON_CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'INR',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'SGD',
  'AED',
  'ZAR',
] as const;

/**
 * Construct a CurrencyCode from a string. Throws if the format is invalid.
 *
 * @example
 *   const code = asCurrencyCode('INR'); // ✅
 *   asCurrencyCode('inr');              // ❌ throws
 *   asCurrencyCode('US');               // ❌ throws
 */
export function asCurrencyCode(value: string): CurrencyCode {
  if (!CURRENCY_CODE_RE.test(value)) {
    throw new InvalidEntityError(
      `Invalid currency code "${value}". Must be a 3-letter uppercase ISO 4217 code (e.g. "USD", "INR").`,
    );
  }
  return value as CurrencyCode;
}

/**
 * Type guard — does the value look like a CurrencyCode?
 * Useful for parsing external data without throwing.
 */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCY_CODE_RE.test(value);
}
