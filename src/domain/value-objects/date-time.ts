import type { ISODateString } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

/**
 * ISO 8601 date-time string (e.g. "2026-07-29T10:30:00.000Z").
 * Always UTC (ends with "Z") to prevent timezone ambiguity.
 *
 * The branded type prevents mixing plain strings with date values.
 */
export type DateTime = ISODateString;

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export function asDateTime(value: string): DateTime {
  if (!ISO_DATE_RE.test(value)) {
    throw new InvalidEntityError(
      `Invalid ISO date-time: "${value}". Expected format: YYYY-MM-DDTHH:mm:ss.sssZ (UTC).`,
    );
  }
  // Validate it actually parses.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidEntityError(`Unparseable date-time: "${value}"`);
  }
  return value as DateTime;
}

export function isDateTime(value: unknown): value is DateTime {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

/**
 * Returns the current UTC time as a DateTime.
 *
 * Pure wrapper around `new Date().toISOString()` so tests can mock a
 * single function.
 */
export function nowDateTime(): DateTime {
  return new Date().toISOString() as DateTime;
}
