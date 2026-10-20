/**
 * OCR improvement consent manager.
 *
 * CRITICAL CONTRACT:
 *   - BillLens NEVER uploads user receipts to its training dataset without
 *     EXPLICIT, GRANULAR, REVERSIBLE consent.
 *   - The DEFAULT consent scope is the MOST conservative:
 *       scope='anonymous_stats_only', consentGiven=false.
 *   - The default means NO data of any kind is uploaded — not even
 *     anonymous aggregate statistics — until the user opts in.
 *   - Training on INDIVIDUAL RECEIPTS requires BOTH:
 *       scope='individual_receipts' AND consentGiven=true.
 *   - Consent is REVERSIBLE — withdrawing consent sets `withdrawnAt`
 *     and reverts to the default. Withdrawn consent is treated as
 *     "no consent" for all data uses.
 *
 * The consent scope is a strict hierarchy:
 *   anonymous_stats_only ⊂ aggregated_patterns ⊂ individual_receipts
 *
 *   - `anonymous_stats_only`: aggregate counts only (e.g. "100 OCR
 *     operations, 12 corrections"). No patterns, no receipt data.
 *   - `aggregated_patterns`: anonymous aggregated patterns (e.g. "the
 *     total field is misread 12% of the time when the merchant name
 *     contains 'restaurant'"). No individual receipt data.
 *   - `individual_receipts`: full individual receipt content (image +
 *     extracted text) MAY be uploaded for training. STILL anonymized
 *     by removing user IDs and group IDs, but the receipt content
 *     itself is shared.
 */

// ---------------------------------------------------------------------------
// Consent scope (strict hierarchy)
// ---------------------------------------------------------------------------

export type OcrConsentScope =
  | 'anonymous_stats_only'
  | 'aggregated_patterns'
  | 'individual_receipts';

export const OCR_CONSENT_SCOPES: readonly OcrConsentScope[] = [
  'anonymous_stats_only',
  'aggregated_patterns',
  'individual_receipts',
] as const;

export function isOcrConsentScope(value: unknown): value is OcrConsentScope {
  return (
    typeof value === 'string' &&
    (OCR_CONSENT_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * Returns the ordinal rank of a scope within the hierarchy
 * (0 = anonymous_stats_only, 1 = aggregated_patterns, 2 = individual_receipts).
 */
export function scopeRank(scope: OcrConsentScope): number {
  switch (scope) {
    case 'anonymous_stats_only':
      return 0;
    case 'aggregated_patterns':
      return 1;
    case 'individual_receipts':
      return 2;
  }
}

/**
 * Returns `true` when `scope` is at least as permissive as `required`.
 *
 * Example: `scopeAtLeast('aggregated_patterns', 'anonymous_stats_only')`
 * returns `true` (aggregated_patterns includes anonymous_stats_only).
 */
export function scopeAtLeast(
  scope: OcrConsentScope,
  required: OcrConsentScope,
): boolean {
  return scopeRank(scope) >= scopeRank(required);
}

// ---------------------------------------------------------------------------
// Consent entity
// ---------------------------------------------------------------------------

export interface OcrImprovementConsent {
  /** Stable identifier — usually the user's profile ID. */
  readonly profileId: string;
  /** Consent scope (granular level of data use). */
  readonly scope: OcrConsentScope;
  /** Whether the user has granted consent for the given scope. */
  readonly consentGiven: boolean;
  /** Version of the consent text the user agreed to. */
  readonly consentVersion: string;
  /** ISO date-time when consent was granted, or undefined if not granted. */
  readonly grantedAt?: string;
  /** ISO date-time when consent was withdrawn, or undefined if not withdrawn. */
  readonly withdrawnAt?: string;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export const CURRENT_CONSENT_VERSION = '2025.01';

/**
 * Returns the DEFAULT consent for a profile.
 *
 * CRITICAL: the default is the MOST CONSERVATIVE:
 *   - scope = 'anonymous_stats_only'
 *   - consentGiven = false
 *
 * This means NO data of any kind is uploaded — not even anonymous
 * aggregate statistics — until the user explicitly opts in.
 */
export function getDefaultConsent(profileId: string): OcrImprovementConsent {
  if (profileId.trim().length === 0) {
    throw new Error('profileId must not be empty');
  }
  return Object.freeze({
    profileId,
    scope: 'anonymous_stats_only',
    consentGiven: false,
    consentVersion: CURRENT_CONSENT_VERSION,
  });
}

/**
 * Grants consent at the given scope. Records `grantedAt` and clears
 * any prior `withdrawnAt`. Returns a NEW frozen consent object.
 */
export function grantConsent(
  consent: OcrImprovementConsent,
  scope: OcrConsentScope,
  grantedAt: string,
): OcrImprovementConsent {
  if (!isOcrConsentScope(scope)) {
    throw new Error(`Unknown consent scope: ${scope}`);
  }
  if (Number.isNaN(Date.parse(grantedAt))) {
    throw new Error('grantedAt must be a valid ISO date-time');
  }
  return Object.freeze({
    profileId: consent.profileId,
    scope,
    consentGiven: true,
    consentVersion: CURRENT_CONSENT_VERSION,
    grantedAt,
  });
}

/**
 * Withdraws consent. Records `withdrawnAt` and reverts the scope to the
 * default (`anonymous_stats_only`). Returns a NEW frozen consent object.
 *
 * After withdrawal, `canUseReceiptForTraining`, `canUseAggregatedPatterns`,
 * and `canUseAnonymousStats` ALL return `false`.
 */
export function withdrawConsent(
  consent: OcrImprovementConsent,
  withdrawnAt: string,
): OcrImprovementConsent {
  if (Number.isNaN(Date.parse(withdrawnAt))) {
    throw new Error('withdrawnAt must be a valid ISO date-time');
  }
  return Object.freeze({
    profileId: consent.profileId,
    scope: 'anonymous_stats_only',
    consentGiven: false,
    consentVersion: CURRENT_CONSENT_VERSION,
    ...(consent.grantedAt !== undefined ? { grantedAt: consent.grantedAt } : {}),
    withdrawnAt,
  });
}

// ---------------------------------------------------------------------------
// Consent checks
// ---------------------------------------------------------------------------

/**
 * Returns `true` ONLY when the user has explicitly consented to having
 * their individual receipts used for training.
 *
 * CRITICAL: this is the most permissive use — it requires BOTH:
 *   - scope = 'individual_receipts'
 *   - consentGiven = true
 *
 * Even a user with `aggregated_patterns` consent has NOT consented to
 * individual-receipt training. The default (anonymous_stats_only with
 * consentGiven=false) ALWAYS returns `false`.
 */
export function canUseReceiptForTraining(
  consent: OcrImprovementConsent,
): boolean {
  return (
    consent.consentGiven === true &&
    consent.scope === 'individual_receipts'
  );
}

/**
 * Returns `true` when the user has consented to having their AGGREGATED
 * patterns (anonymized, structural) used for OCR improvement.
 *
 * True when:
 *   - consentGiven = true AND
 *   - scope is 'aggregated_patterns' OR 'individual_receipts'
 *
 * (The hierarchy: individual_receipts implicitly includes aggregated_patterns.)
 */
export function canUseAggregatedPatterns(
  consent: OcrImprovementConsent,
): boolean {
  if (!consent.consentGiven) return false;
  return scopeAtLeast(consent.scope, 'aggregated_patterns');
}

/**
 * Returns `true` when the user has consented to having their ANONYMOUS
 * aggregate statistics (counts only) used for OCR improvement.
 *
 * True when:
 *   - consentGiven = true
 *
 * (Any scope, as long as consent is granted. The default
 * `anonymous_stats_only` scope with consentGiven=false returns `false`.)
 */
export function canUseAnonymousStats(
  consent: OcrImprovementConsent,
): boolean {
  return consent.consentGiven === true;
}

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

/**
 * Returns a summary of what data uses the consent currently allows.
 * Used by dashboards and audit logs.
 */
export function summarizeConsent(consent: OcrImprovementConsent): {
  readonly profileId: string;
  readonly scope: OcrConsentScope;
  readonly consentGiven: boolean;
  readonly canUseAnonymousStats: boolean;
  readonly canUseAggregatedPatterns: boolean;
  readonly canUseReceiptForTraining: boolean;
} {
  return Object.freeze({
    profileId: consent.profileId,
    scope: consent.scope,
    consentGiven: consent.consentGiven,
    canUseAnonymousStats: canUseAnonymousStats(consent),
    canUseAggregatedPatterns: canUseAggregatedPatterns(consent),
    canUseReceiptForTraining: canUseReceiptForTraining(consent),
  });
}
