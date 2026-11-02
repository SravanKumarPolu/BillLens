import type { Branded } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

/**
 * Percentage expressed as a number 0–100 (with up to 2 decimal places).
 *
 * BillLens stores percentages as basis points internally (see `BasisPoints`)
 * to avoid floating-point. This value object is provided for convenience
 * when constructing domain inputs from user-supplied percentages.
 *
 * @example
 *   const tip = asPercentage(15);       // 15%
 *   const odd = asPercentage(33.33);    // 33.33%
 */
export type Percentage = Branded<number, 'Percentage'>;

const MAX_PERCENTAGE = 100;
const MAX_DECIMAL_PLACES = 2;

export function asPercentage(value: number): Percentage {
  if (!Number.isFinite(value)) {
    throw new InvalidEntityError(`Percentage must be finite, got ${value}`);
  }
  if (value < 0 || value > MAX_PERCENTAGE) {
    throw new InvalidEntityError(
      `Percentage must be in [0, 100], got ${value}`,
    );
  }
  const decimals = decimalPlaces(value);
  if (decimals > MAX_DECIMAL_PLACES) {
    throw new InvalidEntityError(
      `Percentage supports at most ${MAX_DECIMAL_PLACES} decimal places, got ${decimals}`,
    );
  }
  return value as Percentage;
}

export function percentageToBasisPoints(p: Percentage): number {
  return Math.round(p * 100);
}

function decimalPlaces(n: number): number {
  const s = String(n);
  if (!s.includes('.')) return 0;
  const [, decimals] = s.split('.');
  if (!decimals) return 0;
  return decimals.length;
}
