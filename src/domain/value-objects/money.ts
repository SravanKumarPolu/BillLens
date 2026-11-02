import type { Branded } from '@shared-types/index';

import { getCurrency } from '../entities/currency';
import { CurrencyMismatchError, InvalidMoneyError } from '../errors/index';

import { asCurrencyCode, type CurrencyCode } from './currency-code';

/**
 * Money is stored as integer minor units (e.g. paise for INR, cents for USD).
 *
 * Examples:
 *   Money.fromMinor(125050, 'INR') // ₹1,250.50
 *   Money.fromMinor(999, 'USD')    // $9.99
 *
 * Hard rules (enforced by this class):
 *   - Always an integer (no floating-point)
 *   - Always finite (no NaN, no Infinity)
 *   - Always within safe integer range
 *   - Always paired with a currency
 *   - Arithmetic only between same-currency Money values
 *
 * The branded `MinorUnit` type makes it harder to accidentally pass a
 * plain number where a money amount is expected.
 */
export type MinorUnit = Branded<number, 'MinorUnit'>;

/**
 * Branded Money type. Instances are created only via the static factory
 * methods `fromMinor`, `fromMajor`, `zero`, and `sum` — direct construction
 * is forbidden to ensure all invariants are validated.
 */
export class Money {
  private constructor(
    private readonly amountMinor: MinorUnit,
    private readonly currency: CurrencyCode,
  ) {}

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  /**
   * Construct Money from an integer minor-unit amount.
   *
   * @example Money.fromMinor(125050, 'INR') // ₹1,250.50
   */
  static fromMinor(amount: number, currency: CurrencyCode | string): Money {
    const code = typeof currency === 'string' ? asCurrencyCode(currency) : currency;
    validateMinorAmount(amount);
    return new Money(amount as MinorUnit, code);
  }

  /**
   * Construct Money from a major-unit decimal amount.
   *
   * Uses string-based parsing to avoid floating-point multiplication
   * precision issues (e.g. `Math.round(1.005 * 100)` returns 100 because
   * `1.005 * 100` evaluates to `100.49999999999999`). The major amount is
   * converted to its shortest round-trippable string representation and
   * then split into integer and fractional parts, which are combined into
   * minor units using only integer arithmetic. The fractional part is
   * rounded half-up to the nearest minor unit based on the third digit.
   *
   * WARNING: prefer `fromMinor` for any value sourced from a database,
   * API, or OCR — those should already be in minor units. `fromMajor` is
   * a convenience for tests and human input.
   *
   * @example Money.fromMajor(1250.50, 'INR') // ₹1,250.50
   */
  static fromMajor(amount: number, currency: CurrencyCode | string): Money {
    if (!Number.isFinite(amount)) {
      throw new InvalidMoneyError(`Cannot create Money from non-finite amount: ${amount}`);
    }
    const code = typeof currency === 'string' ? asCurrencyCode(currency) : currency;
    const decimals = getCurrency(code)?.decimalPlaces ?? 2;
    const minor = majorToMinor(amount, decimals);
    return Money.fromMinor(minor, code);
  }

  /** Construct a zero-value Money in the given currency. */
  static zero(currency: CurrencyCode | string): Money {
    return Money.fromMinor(0, currency);
  }

  /**
   * Sum a list of Money values. All must share the same currency.
   * Returns `null` for an empty list (the caller decides what to do when
   * there is nothing to sum).
   */
  static sum(values: readonly Money[]): Money | null {
    if (values.length === 0) {
      return null;
    }
    const first = values[0];
    if (!first) throw new InvalidMoneyError('Unreachable: empty values handled above');
    const currency = first.currency;
    let acc = 0;
    for (const v of values) {
      if (v.currency !== currency) {
        throw new CurrencyMismatchError(
          `Cannot sum Money with different currencies: ${currency} vs ${v.currency}`,
          currency,
          v.currency,
        );
      }
      acc += v.amountMinor;
    }
    return Money.fromMinor(acc, currency);
  }

  // -------------------------------------------------------------------------
  // Arithmetic — all return new Money instances (immutable)
  // -------------------------------------------------------------------------

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.amountMinor - other.amountMinor, this.currency);
  }

  /**
   * Multiply by an integer scalar. Used when splitting an amount equally
   * (e.g. per-member share before remainder distribution).
   *
   * Throws if `factor` is not a non-negative integer.
   */
  multiply(factor: number): Money {
    if (!Number.isInteger(factor) || factor < 0) {
      throw new InvalidMoneyError(
        `Money.multiply requires a non-negative integer factor, got ${factor}`,
      );
    }
    return Money.fromMinor(this.amountMinor * factor, this.currency);
  }

  /**
   * Divide by an integer divisor, returning a quotient and remainder.
   * The quotient is rounded down (floor); the remainder is non-negative
   * and strictly less than the divisor.
   *
   * @example Money.fromMinor(1000, 'INR').divide(3)
   *   // => { quotient: Money(333), remainder: 1 }
   */
  divide(divisor: number): { quotient: Money; remainder: number } {
    if (!Number.isInteger(divisor) || divisor <= 0) {
      throw new InvalidMoneyError(
        `Money.divide requires a positive integer divisor, got ${divisor}`,
      );
    }
    const q = Math.floor(this.amountMinor / divisor);
    const r = this.amountMinor - q * divisor;
    return {
      quotient: Money.fromMinor(q, this.currency),
      remainder: r,
    };
  }

  /**
   * Allocate this Money across `count` recipients as evenly as possible.
   *
   * The first `remainder` recipients receive one extra minor unit, so the
   * total always equals `this.amountMinor`. Recipients are ordered by
   * their index in the returned array — the caller is responsible for
   * mapping indices to member IDs deterministically (typically by sorting
   * member IDs ascending).
   *
   * @example Money.fromMinor(1000, 'INR').allocate(3)
   *   // => [Money(334), Money(333), Money(333)]
   */
  allocate(count: number): Money[] {
    if (!Number.isInteger(count) || count <= 0) {
      throw new InvalidMoneyError(
        `Money.allocate requires a positive integer count, got ${count}`,
      );
    }
    const { quotient, remainder } = this.divide(count);
    const result: Money[] = [];
    for (let i = 0; i < count; i++) {
      if (i < remainder) {
        result.push(quotient.add(Money.fromMinor(1, this.currency)));
      } else {
        result.push(quotient);
      }
    }
    return result;
  }

  /**
   * Allocate this Money according to integer weights (e.g. share units).
   *
   * The total is distributed proportionally using integer arithmetic: each
   * weight receives `floor(amountMinor * weight / totalWeight)`, and the
   * leftover minor units (at most `weights.length - 1`) are distributed one
   * at a time to the entries with the largest integer remainder
   * `(amountMinor * weight) % totalWeight`. Ties are broken by index
   * ascending, ensuring deterministic output.
   *
   * @example Money.fromMinor(1000, 'INR').allocateByWeights([1, 1, 2])
   *   // 250, 250, 500 (with deterministic remainder handling)
   */
  allocateByWeights(weights: readonly number[]): Money[] {
    if (weights.length === 0) {
      throw new InvalidMoneyError('allocateByWeights requires at least one weight');
    }
    if (weights.some((w) => !Number.isInteger(w) || w <= 0)) {
      throw new InvalidMoneyError(
        'allocateByWeights requires positive integer weights',
      );
    }
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    // Overflow guard: amountMinor * weight must remain in the safe
    // integer range, otherwise the integer remainder arithmetic below
    // would silently lose precision.
    for (const w of weights) {
      if (!Number.isSafeInteger(this.amountMinor * w)) {
        throw new InvalidMoneyError(
          `allocateByWeights overflow: amountMinor=${this.amountMinor} * weight=${w} exceeds safe integer range`,
        );
      }
    }

    // Integer arithmetic: compute floor and remainder per weight.
    const allocations = weights.map((w, index) => {
      const product = this.amountMinor * w;
      const floor = Math.floor(product / totalWeight);
      const remainder = product % totalWeight;
      return { index, floor, remainder };
    });

    let allocated = 0;
    for (const a of allocations) {
      allocated += a.floor;
    }
    let leftover = this.amountMinor - allocated;

    // Distribute leftover minor units to entries with the largest
    // remainder; tie-break by index ascending (deterministic).
    const sorted = [...allocations].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return a.index - b.index;
    });
    for (let i = 0; i < sorted.length && leftover > 0; i++) {
      const a = sorted[i];
      if (!a) continue;
      a.floor += 1;
      leftover -= 1;
    }

    return allocations.map((a) => Money.fromMinor(a.floor, this.currency));
  }

  // -------------------------------------------------------------------------
  // Comparison
  // -------------------------------------------------------------------------

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinor > other.amountMinor;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinor < other.amountMinor;
  }

  isZero(): boolean {
    return this.amountMinor === 0;
  }

  isPositive(): boolean {
    return this.amountMinor > 0;
  }

  isNegative(): boolean {
    return this.amountMinor < 0;
  }

  // -------------------------------------------------------------------------
  // Conversion
  // -------------------------------------------------------------------------

  /** Returns the minor-unit amount as a plain number. */
  toMinor(): number {
    return this.amountMinor;
  }

  /** Returns the currency code of this Money. */
  getCurrency(): CurrencyCode {
    return this.currency;
  }

  /**
   * Returns the major-unit amount as a number (may lose precision for
   * currencies with 0 decimal places).
   *
   * Respects the currency's `decimalPlaces` setting (e.g. JPY has 0
   * decimals so `toMajor()` returns the minor amount directly; INR has 2
   * so `toMajor()` divides by 100). Unknown currencies default to 2
   * decimal places.
   */
  toMajor(): number {
    const currency = getCurrency(this.currency);
    const decimals = currency?.decimalPlaces ?? 2;
    return this.amountMinor / Math.pow(10, decimals);
  }

  /**
   * Returns a string representation in the form "<amountMinor> <currency>".
   * Useful for debugging and tests; NOT for display to users (use a
   * currency formatter in the presentation layer for that).
   */
  toString(): string {
    return `${this.amountMinor} ${this.currency}`;
  }

  toJSON(): { amountMinor: number; currency: string } {
    return { amountMinor: this.amountMinor, currency: this.currency };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(
        `Money operation between different currencies: ${this.currency} vs ${other.currency}`,
        this.currency,
        other.currency,
      );
    }
  }
}

/**
 * Convert a major-unit decimal amount to minor units using only integer
 * arithmetic after a string parse, avoiding the floating-point precision
 * issues of `Math.round(amount * 100)` (e.g. `1.005 * 100` is
 * `100.49999999999999` in IEEE 754, so `Math.round` returns 100 instead
 * of 101).
 *
 * Algorithm:
 *   1. Take `String(Math.abs(amount))` — the shortest decimal
 *      representation that round-trips to the same float.
 *   2. Split on the decimal point into integer and fractional parts.
 *   3. Pad the fractional part to `decimals + 1` digits; use the
 *      `(decimals + 1)`-th digit to round half-up into the first
 *      `decimals` digits (carrying into the integer part if the
 *      `decimals`-digit fraction overflows).
 *   4. Combine as `integerPart * 10^decimals + fractionalPart`, then
 *      re-apply the original sign.
 *
 * @param decimals  Currency decimal places (e.g. 2 for INR/USD, 0 for JPY,
 *                  3 for KWD). Defaults to 2 for unknown currencies.
 */
function majorToMinor(amount: number, decimals: number = 2): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
    // Defensive: ISO 4217 uses 0–3 decimal places; allow 4 for headroom.
    // Anything beyond that would be a programming error.
    throw new InvalidMoneyError(
      `majorToMinor requires decimals in [0, 4], got ${decimals}`,
    );
  }

  const isNegative = amount < 0;
  let str = String(Math.abs(amount));
  // Handle scientific notation (e.g. 1e-7) by expanding to fixed notation.
  // Values this extreme are likely to fail the safe-integer check
  // downstream; we just want to avoid crashing on string parsing here.
  if (str.includes('e') || str.includes('E')) {
    str = Math.abs(amount).toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
  }

  const dotIndex = str.indexOf('.');
  let intPartStr: string;
  let fracPartStr: string;
  if (dotIndex === -1) {
    intPartStr = str;
    fracPartStr = '';
  } else {
    intPartStr = str.slice(0, dotIndex);
    fracPartStr = str.slice(dotIndex + 1);
  }

  const intVal = intPartStr === '' ? 0 : parseInt(intPartStr, 10);
  const multiplier = Math.pow(10, decimals);
  // Pad/truncate fractional part to (decimals + 1) digits so we can round
  // half-up to `decimals` digits.
  const padded = (fracPartStr + '0'.repeat(decimals + 1)).slice(0, decimals + 1);
  let minorFrac = decimals === 0 ? 0 : parseInt(padded.slice(0, decimals), 10);
  const roundDigit = parseInt(padded[decimals] ?? '0', 10);
  let minorInt = intVal;

  if (roundDigit >= 5) {
    minorFrac += 1;
    if (minorFrac >= multiplier) {
      minorFrac -= multiplier;
      minorInt += 1;
    }
  }

  const minor = minorInt * multiplier + minorFrac;
  return isNegative ? -minor : minor;
}

/**
 * Validate that a number is a safe, finite, integer minor-unit amount.
 * Throws `InvalidMoneyError` on failure.
 */
function validateMinorAmount(amount: number): void {
  if (Number.isNaN(amount)) {
    throw new InvalidMoneyError('Money amount cannot be NaN');
  }
  if (!Number.isFinite(amount)) {
    throw new InvalidMoneyError(`Money amount cannot be Infinity or -Infinity: ${amount}`);
  }
  if (!Number.isInteger(amount)) {
    throw new InvalidMoneyError(
      `Money amount must be an integer (minor units), got ${amount}. Use Money.fromMajor for decimal input.`,
    );
  }
  if (!Number.isSafeInteger(amount)) {
    throw new InvalidMoneyError(
      `Money amount is outside the safe integer range: ${amount}`,
    );
  }
}
