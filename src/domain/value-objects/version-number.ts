import type { Branded } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

/**
 * Optimistic-concurrency version number.
 *
 * Every mutation of an entity increments its version. When a client sends
 * an update, it includes its current version; the server rejects the
 * update if its stored version is higher (someone else updated first).
 *
 * Version numbers are positive integers starting at 1.
 */
export type VersionNumber = Branded<number, 'VersionNumber'>;

export const INITIAL_VERSION = 1;

export function asVersionNumber(value: number): VersionNumber {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidEntityError(
      `Version number must be a positive integer, got ${value}`,
    );
  }
  return value as VersionNumber;
}

export function initialVersionNumber(): VersionNumber {
  return 1 as VersionNumber;
}

export function nextVersionNumber(current: VersionNumber): VersionNumber {
  const next = current + 1;
  if (!Number.isSafeInteger(next)) {
    throw new InvalidEntityError(
      `Version number overflow: ${current} + 1 exceeds safe integer range`,
    );
  }
  return next as VersionNumber;
}
