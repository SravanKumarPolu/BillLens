/**
 * Repository port for analytics event persistence.
 *
 * Implementations MUST only persist already-redacted events. The use
 * case redacts BEFORE calling the port; this port contract is
 * defense-in-depth.
 */

import type { RedactedAnalyticsEvent } from '@domain/analytics';

export interface AnalyticsRepository {
  /** Persist a redacted analytics event. Idempotent by (anonymousId, occurredAt, name). */
  record(event: RedactedAnalyticsEvent): Promise<void>;

  /** Count distinct anonymous IDs active in the last N days. */
  countActiveAnonymousIds(days: number): Promise<number>;

  /** Fetch events for a given anonymous ID (used in retention calculations). */
  eventsForAnonymousId(anonymousId: string): Promise<readonly RedactedAnalyticsEvent[]>;

  /** Count events of a given name in a time window. */
  countEventsByName(name: string, sinceDaysAgo: number): Promise<number>;
}
