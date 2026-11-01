import type { Branded } from '@shared-types/index';

import { EmptyValueError, InvalidEntityError } from '../errors/index';

/**
 * Display name for a user or guest. Must be 1–80 characters after trim.
 */
export type DisplayName = Branded<string, 'DisplayName'>;

export const DISPLAY_NAME_MAX_LENGTH = 80;
export const DISPLAY_NAME_MIN_LENGTH = 1;

export function asDisplayName(value: string): DisplayName {
  const trimmed = value.trim();
  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH) {
    throw new EmptyValueError('Display name must not be empty');
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new InvalidEntityError(
      `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters, got ${trimmed.length}`,
    );
  }
  return trimmed as DisplayName;
}

export function isDisplayName(value: unknown): value is DisplayName {
  return (
    typeof value === 'string' &&
    value.trim().length >= DISPLAY_NAME_MIN_LENGTH &&
    value.trim().length <= DISPLAY_NAME_MAX_LENGTH
  );
}
