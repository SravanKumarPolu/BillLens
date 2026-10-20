import type { Branded } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

/**
 * Share units — positive integers used in "shares" split type.
 *
 * Example: 3 members split a $300 bill with shares [1, 1, 2].
 * Total shares = 4. Member allocations: $75, $75, $150.
 */
export type ShareUnits = Branded<number, 'ShareUnits'>;

export function asShareUnits(value: number): ShareUnits {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidEntityError(
      `Share units must be a positive integer, got ${value}`,
    );
  }
  return value as ShareUnits;
}
