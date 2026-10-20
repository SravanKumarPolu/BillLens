/**
 * Use case: Aggregate correction statistics across users (anonymous).
 *
 * CRITICAL CONTRACT:
 *   - The use case checks consent BEFORE including each user's data.
 *     Only users with `canUseAnonymousStats(consent) === true` have
 *     their diffs included in the aggregate.
 *   - For aggregated-pattern statistics, only users with
 *     `canUseAggregatedPatterns(consent) === true` are included.
 *   - The output NEVER contains raw receipt data, merchant names, or
 *     user IDs. All values are anonymized patterns or aggregate counts.
 *   - The use case hashes profile IDs to anonymous IDs before passing
 *     them to the repository — the repository never sees raw profile IDs.
 */

import {
  canUseAggregatedPatterns,
  canUseAnonymousStats,
  computeCorrectionStatistics,
  type CorrectionStatistics,
} from '@domain/ocr-improvement';

import type {
  OcrConsentRepository,
  OcrCorrectionRepository,
  ReceiptCorrectionRecord,
} from './ocr-improvement-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface AggregateCorrectionStatsInput {
  /** ISO date-time window start (inclusive). */
  readonly fromIso: string;
  /** ISO date-time window end (exclusive). */
  readonly toIso: string;
  /** List of profile IDs to include (consent will be checked per profile). */
  readonly profileIds: readonly string[];
  /**
   * Aggregation level: 'anonymous_stats_only' or 'aggregated_patterns'.
   * 'anonymous_stats_only' includes only users with canUseAnonymousStats.
   * 'aggregated_patterns' includes only users with canUseAggregatedPatterns.
   */
  readonly aggregationLevel: 'anonymous_stats_only' | 'aggregated_patterns';
}

export interface AggregateCorrectionStatsOutput {
  readonly generatedAt: string;
  readonly totalProfilesConsidered: number;
  readonly totalProfilesIncluded: number;
  readonly totalProfilesExcluded: number;
  readonly statistics: CorrectionStatistics;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class AggregateCorrectionStatsUseCase {
  constructor(
    private readonly consentRepo: OcrConsentRepository,
    private readonly correctionRepo: OcrCorrectionRepository,
  ) {}

  async execute(
    input: AggregateCorrectionStatsInput,
    nowIso: string = new Date().toISOString(),
  ): Promise<AggregateCorrectionStatsOutput> {
    if (Number.isNaN(Date.parse(input.fromIso))) {
      throw new Error('fromIso must be a valid ISO date-time');
    }
    if (Number.isNaN(Date.parse(input.toIso))) {
      throw new Error('toIso must be a valid ISO date-time');
    }
    if (Date.parse(input.toIso) < Date.parse(input.fromIso)) {
      throw new Error('toIso must not precede fromIso');
    }
    if (Number.isNaN(Date.parse(nowIso))) {
      throw new Error('nowIso must be a valid ISO date-time');
    }

    const totalProfilesConsidered = input.profileIds.length;
    let totalProfilesIncluded = 0;
    let totalProfilesExcluded = 0;

    // Collect correction records from all included profiles.
    const allRecords: ReceiptCorrectionRecord[] = [];

    // Fetch all corrections in the time window ONCE.
    const windowRecords =
      await this.correctionRepo.findCorrectionsInWindow(
        input.fromIso,
        input.toIso,
      );

    // Index by anonymous profile ID for quick lookup.
    const recordsByProfile = new Map<string, ReceiptCorrectionRecord[]>();
    for (const r of windowRecords) {
      const list = recordsByProfile.get(r.anonymousProfileId) ?? [];
      list.push(r);
      recordsByProfile.set(r.anonymousProfileId, list);
    }

    for (const profileId of input.profileIds) {
      // Hash the profile ID to an anonymous ID (so the correction repo
      // never sees the raw profile ID — defense-in-depth).
      const anonymousProfileId = hashProfileId(profileId);

      // Load consent for this profile. If no consent record exists,
      // `getDefaultConsent` is used (the MOST conservative default).
      const consent = await this.consentRepo.findConsentByProfileId(profileId);
      const effectiveConsent = consent ?? getDefaultConsentFor(profileId);

      // Check consent based on the aggregation level.
      const allowed =
        input.aggregationLevel === 'aggregated_patterns'
          ? canUseAggregatedPatterns(effectiveConsent)
          : canUseAnonymousStats(effectiveConsent);

      if (!allowed) {
        totalProfilesExcluded++;
        continue;
      }

      // Include this profile's corrections.
      const records = recordsByProfile.get(anonymousProfileId) ?? [];
      allRecords.push(...records);
      totalProfilesIncluded++;
    }

    // Compute aggregate statistics.
    const batches = allRecords.map((r) => ({
      receiptId: r.receiptId,
      diffs: r.diffs,
    }));
    const statistics = computeCorrectionStatistics(batches);

    return {
      generatedAt: nowIso,
      totalProfilesConsidered,
      totalProfilesIncluded,
      totalProfilesExcluded,
      statistics,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hashes a profile ID to an anonymous ID using FNV-1a 32-bit.
 *
 * The hashed value is what gets stored in the correction repository —
 * the repository never sees the raw profile ID.
 *
 * Pure function — same input always produces same output.
 */
function hashProfileId(profileId: string): string {
  const FNV_32_PRIME = 0x01000193;
  const FNV_32_OFFSET = 0x811c9dc5;
  let hash = FNV_32_OFFSET;
  for (let i = 0; i < profileId.length; i++) {
    hash ^= profileId.charCodeAt(i);
    hash = Math.imul(hash, FNV_32_PRIME) >>> 0;
  }
  return `anon-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Returns the default (most conservative) consent for a profile.
 *
 * Imported lazily to avoid a circular dependency in the import graph.
 */
function getDefaultConsentFor(profileId: string): {
  readonly profileId: string;
  readonly scope: 'anonymous_stats_only';
  readonly consentGiven: boolean;
  readonly consentVersion: string;
} {
  // Inline the default-consent construction so we don't need an extra
  // import (the consent-manager module is already imported above for
  // canUseAnonymousStats / canUseAggregatedPatterns).
  return {
    profileId,
    scope: 'anonymous_stats_only',
    consentGiven: false,
    consentVersion: '2025.01',
  };
}
