/**
 * Use case: Record an analytics event.
 *
 * Privacy contract:
 *   1. The raw event is passed through `redactAnalyticsEvent` BEFORE
 *      being handed to the repository. The repository never sees raw
 *      PII or sensitive property keys.
 *   2. The use case validates the event name, anonymousId, and
 *      occurredAt timestamp.
 *   3. The use case enforces a max properties count to prevent
 *      accidental bulk data exfiltration via property dumps.
 */

import {
  redactAnalyticsEvent,
  type AnalyticsEvent,
  type RedactedAnalyticsEvent,
} from '@domain/analytics';

import type { AnalyticsRepository } from './analytics-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export type RecordAnalyticsEventInput = AnalyticsEvent;

export interface RecordAnalyticsEventOutput {
  readonly recorded: boolean;
  readonly redactedName: string;
  readonly redactedAnonymousId: string;
  readonly droppedPropertyKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

const MAX_PROPERTIES = 50;

export class RecordAnalyticsEventUseCase {
  constructor(private readonly repo: AnalyticsRepository) {}

  async execute(input: RecordAnalyticsEventInput): Promise<RecordAnalyticsEventOutput> {
    // 1. Validate basic shape.
    if (typeof input.name !== 'string' || input.name.length === 0) {
      throw new Error('Analytics event name must be a non-empty string');
    }
    if (typeof input.anonymousId !== 'string' || input.anonymousId.length === 0) {
      throw new Error('Analytics event anonymousId must be a non-empty string');
    }
    if (typeof input.occurredAt !== 'string' || Number.isNaN(Date.parse(input.occurredAt))) {
      throw new Error('Analytics event occurredAt must be a valid ISO date-time');
    }
    if (typeof input.properties !== 'object' || input.properties === null) {
      throw new Error('Analytics event properties must be an object');
    }

    // 2. Cap properties count.
    const propKeys = Object.keys(input.properties);
    if (propKeys.length > MAX_PROPERTIES) {
      throw new Error(
        `Analytics event has too many properties: ${propKeys.length} > ${MAX_PROPERTIES}`,
      );
    }

    // 3. Compute the set of property keys that will be dropped (for
    //    transparency in the output).
    const droppedPropertyKeys = propKeys.filter((k) => {
      // Re-implement the sensitive-key check inline to avoid exporting
      // an extra helper — the redactor's set is the source of truth.
      const SENSITIVE = new Set([
        'amountMinor',
        'amountMajor',
        'merchantName',
        'upiId',
        'bankReference',
        'ocrText',
        'receiptImage',
        'groupName',
        'memberName',
        'note',
        'paymentReference',
        'inviteToken',
        'sessionToken',
        'filePath',
      ]);
      return SENSITIVE.has(k);
    });

    // 4. Redact the event.
    const redacted: RedactedAnalyticsEvent = redactAnalyticsEvent(input);

    // 5. Persist.
    await this.repo.record(redacted);

    return {
      recorded: true,
      redactedName: redacted.name,
      redactedAnonymousId: redacted.anonymousId,
      droppedPropertyKeys,
    };
  }
}
