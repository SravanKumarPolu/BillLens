import type { Branded } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

/**
 * Basis points — 1/100th of a percent. 100% = 10,000 basis points.
 *
 * Used internally for percentage splits to avoid floating-point.
 *
 * Range: [0, 10000].
 */
export type BasisPoints = Branded<number, 'BasisPoints'>;

export const BASIS_POINTS_PER_PERCENT = 100;
export const BASIS_POINTS_PER_WHOLE = 10000; // 100%

export function asBasisPoints(value: number): BasisPoints {
  if (!Number.isInteger(value)) {
    throw new InvalidEntityError(
      `Basis points must be an integer, got ${value}`,
    );
  }
  if (value < 0 || value > BASIS_POINTS_PER_WHOLE) {
    throw new InvalidEntityError(
      `Basis points must be in [0, ${BASIS_POINTS_PER_WHOLE}], got ${value}`,
    );
  }
  return value as BasisPoints;
}

export function basisPointsFromPercentage(p: number): BasisPoints {
  return asBasisPoints(Math.round(p * BASIS_POINTS_PER_PERCENT));
}
