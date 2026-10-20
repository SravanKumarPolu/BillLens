import type { ISODateString, UserId } from '@shared-types/index';

import type { DateTime, VersionNumber } from '../value-objects/index';

/**
 * Metadata recorded when an entity is soft-deleted.
 *
 * Captures WHO deleted the entity, WHEN, and an optional reason. The
 * reason is used by the audit system and the explanation engine.
 */
export interface DeleteMetadata {
  readonly actorId: UserId;
  readonly reason?: string;
  readonly deletedAt: DateTime;
}

/**
 * Result of a soft-delete operation, returned by repositories.
 */
export interface SoftDeleteResult {
  readonly id: string;
  readonly deletedAt: DateTime;
  readonly version: VersionNumber;
}

/**
 * Pagination contract used by all `list*` repository methods.
 *
 * `limit` is the maximum number of records to return (1–200).
 * `cursor` is an opaque pagination cursor returned by the previous call.
 * Callers should pass `cursor` unchanged to the next call to get the
 * next page.
 */
export interface Pagination {
  readonly limit: number;
  readonly cursor?: string;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}

/**
 * Convert a `Date` (or ISO string) to a `DateTime` branded value.
 * Re-exported here so repository consumers don't need to import from
 * value-objects directly.
 */
export function toDateTime(value: string | Date): DateTime {
  const iso = typeof value === 'string' ? value : value.toISOString();
  return iso as DateTime;
}

/**
 * Re-export ISODateString type for callers that need it.
 */
export type { ISODateString };
