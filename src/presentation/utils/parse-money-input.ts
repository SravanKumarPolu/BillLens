/**
 * Shared money-input parser for presentation forms (v2.4.0).
 *
 * WHY THIS EXISTS: v2.3.0 had THREE inconsistent amount parsers —
 * `expense-form.parseAmountToMinor` (strict, safe-integer guarded),
 * `use-settlement-form.parseAmountToMinor` (currency-aware, no guards),
 * and inline `Math.round(parseFloat(x) * 100)` calls in two settlement
 * screens (the exact float anti-pattern the domain forbids: 1.005 →
 * 100 instead of 101, and hardcoded x100 breaks JPY/KWD). This module
 * is the ONE parser every amount input uses.
 *
 * Contract (integer minor units, string arithmetic, never floats):
 *   - Rejects: negatives, multiple dots, commas, spaces, empty input,
 *     scientific notation, extra decimals beyond the currency's scale,
 *     integer parts longer than 15 digits, and non-safe-integer results.
 *   - Accepts: "5", "5.2", "5.25" for 2-decimal currencies; "1.234" for
 *     KWD-family (3-decimal); "500" only (no dot) semantics for
 *     zero-decimal currencies — a dot with only zeroes ("500.00") is
 *     tolerated for zero-decimal currencies because users paste it.
 */

import { getCurrency } from '@domain/entities/currency';

export type ParsedMoneyInput =
  | { readonly ok: true; readonly minor: number }
  | { readonly ok: false; readonly error: string };

/** Currency decimal scale from the DOMAIN table (fallback 2). */
export function moneyDecimals(currencyCode: string): number {
  return getCurrency(currencyCode.toUpperCase() as never)?.decimalPlaces ?? 2;
}

export function parseMoneyInput(raw: string, currencyCode: string): ParsedMoneyInput {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Enter an amount.' };
  }
  // Digits with at most one dot. No signs, commas, or exponents.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { ok: false, error: 'Enter a plain positive number, e.g. 12.50.' };
  }

  const decimals = moneyDecimals(currencyCode);
  const [wholeRaw, fractionRaw] = trimmed.split('.');
  if (wholeRaw === undefined) {
    return { ok: false, error: 'Enter a plain positive number.' };
  }
  if (wholeRaw.length > 15) {
    return { ok: false, error: 'The amount is too large.' };
  }
  // For zero-decimal currencies, a fractional part must be all zeroes
  // ("500.00" ok — pasted; "500.50" is a genuine input error). Checked
  // BEFORE the over-precision rule so pasted ".00" never trips it.
  if (decimals === 0 && fractionRaw !== undefined && !/^0*$/.test(fractionRaw)) {
    return {
      ok: false,
      error: `${currencyCode.toUpperCase()} does not use decimal places.`,
    };
  }
  // Over-precision is REJECTED (domain policy: never silently round
  // money). Exception: the all-zero fraction for zero-decimal currencies
  // was already accepted above, so only enforce this when decimals > 0
  // OR the fraction is non-zero.
  if (fractionRaw !== undefined && decimals > 0 && fractionRaw.length > decimals) {
    return {
      ok: false,
      error: `${currencyCode.toUpperCase()} allows at most ${decimals} decimal${
        decimals === 1 ? '' : 's'
      }.`,
    };
  }
  const fraction = (fractionRaw ?? '').padEnd(decimals, '0').slice(0, decimals);

  const whole = Number.parseInt(wholeRaw, 10);
  const fracNum = decimals === 0 ? 0 : Number.parseInt(fraction, 10);
  const minor = whole * 10 ** decimals + fracNum;
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    return { ok: false, error: 'Enter a valid amount greater than zero.' };
  }
  return { ok: true, minor };
}

/** True while the raw input is a valid, submittable amount. */
export function isValidMoneyInput(raw: string, currencyCode: string): boolean {
  return parseMoneyInput(raw, currencyCode).ok;
}
