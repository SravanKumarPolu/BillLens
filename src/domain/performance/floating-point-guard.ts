/**
 * Floating-point guard — CRITICAL financial integrity.
 *
 * CRITICAL CONTRACT:
 *   - BillLens NEVER uses floating-point math for money. All amounts are
 *     stored as INTEGER minor units (e.g. paise, cents) using JavaScript's
 *     `number` type but constrained to safe integers.
 *   - This module provides guard functions that verify a value is a safe
 *     integer (and throw if not). They are used at the boundaries of
 *     financial computations to catch floating-point leaks.
 *
 * Why safe integers? JavaScript's `number` type is a 64-bit IEEE 754
 * double. It can represent integers exactly in the range
 * `[-(2^53 - 1), 2^53 - 1]` (`Number.MAX_SAFE_INTEGER`). For amounts in
 * minor units, this range is more than sufficient (e.g. ₹1 trillion in
 * paise = 10^14, well below 2^53).
 *
 * Pure functions — no I/O, no globals.
 */

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `value` is a safe integer amount.
 *
 * A safe integer is:
 *   - Of type `number`.
 *   - `Number.isInteger(value)` (no fractional part).
 *   - `Number.isSafeInteger(value)` (within the safe integer range).
 *   - Finite (not NaN, not Infinity).
 */
export function isSafeIntegerAmount(value: number): boolean {
  if (typeof value !== 'number') return false;
  if (!Number.isFinite(value)) return false;
  if (!Number.isInteger(value)) return false;
  if (!Number.isSafeInteger(value)) return false;
  return true;
}

/**
 * Asserts that `amountMinor` is a safe integer. Throws if not.
 *
 * Use this at the boundaries of financial computations to catch
 * floating-point leaks early.
 */
export function assertIntegerMinor(amountMinor: number): void {
  if (!isSafeIntegerAmount(amountMinor)) {
    throw new Error(
      `Amount must be a safe integer (minor units), got ${amountMinor} (type: ${typeof amountMinor}, isInteger: ${Number.isInteger(amountMinor)}, isSafeInteger: ${Number.isSafeInteger(amountMinor)}, isFinite: ${Number.isFinite(amountMinor)})`,
    );
  }
}

/**
 * Verifies that ALL values in a balances array are safe integers (no
 * floats, no non-numbers, no non-finite values).
 *
 * Returns `true` iff every value passes `isSafeIntegerAmount`.
 *
 * Used by the balance cache to verify the zero-sum invariant on retrieval.
 */
export function verifyNoFloatingPointInBalances(
  balances: readonly { readonly netBalanceMinor: number }[],
): boolean {
  if (!Array.isArray(balances)) return false;
  for (const b of balances) {
    if (b === null || typeof b !== 'object') return false;
    if (!isSafeIntegerAmount(b.netBalanceMinor)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Conversion (defensive)
// ---------------------------------------------------------------------------

/**
 * Converts a major-unit amount (e.g. dollars, rupees) to minor units
 * (e.g. cents, paise) by multiplying by 100 and rounding to an integer.
 *
 * CRITICAL: this function ALWAYS rounds to an integer — it never produces
 * a floating-point minor-unit value. Use this when ingesting user input
 * or external API data that arrives in major units.
 *
 * Throws if the resulting value is not a safe integer.
 */
export function majorToMinorUnits(majorAmount: number): number {
  if (typeof majorAmount !== 'number' || !Number.isFinite(majorAmount)) {
    throw new Error(`majorAmount must be a finite number, got ${majorAmount}`);
  }
  const minor = Math.round(majorAmount * 100);
  assertIntegerMinor(minor);
  return minor;
}

/**
 * Converts a minor-unit amount to major units for display.
 *
 * Returns a number with at most 2 decimal places. The result is for
 * DISPLAY ONLY — it should NEVER be used in financial computations
 * (use the integer minor-unit value instead).
 */
export function minorToMajorUnits(minorAmount: number): number {
  assertIntegerMinor(minorAmount);
  return minorAmount / 100;
}

// ---------------------------------------------------------------------------
// Arithmetic (integer-only)
// ---------------------------------------------------------------------------

/**
 * Adds two minor-unit amounts. Asserts both are safe integers.
 *
 * Throws if the result is not a safe integer (overflow).
 */
export function addMinor(a: number, b: number): number {
  assertIntegerMinor(a);
  assertIntegerMinor(b);
  const sum = a + b;
  if (!isSafeIntegerAmount(sum)) {
    throw new Error(`Integer overflow: ${a} + ${b} = ${sum} is not a safe integer`);
  }
  return sum;
}

/**
 * Subtracts two minor-unit amounts. Asserts both are safe integers.
 *
 * Throws if the result is not a safe integer (overflow).
 */
export function subtractMinor(a: number, b: number): number {
  assertIntegerMinor(a);
  assertIntegerMinor(b);
  const diff = a - b;
  if (!isSafeIntegerAmount(diff)) {
    throw new Error(`Integer overflow: ${a} - ${b} = ${diff} is not a safe integer`);
  }
  return diff;
}

/**
 * Sums an array of minor-unit amounts. Asserts each is a safe integer.
 *
 * Throws if the running sum ever becomes a non-safe-integer.
 */
export function sumMinor(amounts: readonly number[]): number {
  let sum = 0;
  for (const a of amounts) {
    assertIntegerMinor(a);
    sum += a;
    if (!isSafeIntegerAmount(sum)) {
      throw new Error(`Integer overflow during sum: partial sum ${sum} is not a safe integer`);
    }
  }
  return sum;
}
