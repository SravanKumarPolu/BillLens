/**
 * Feature validator — validates feature candidates against
 * privacy-safe analytics.
 *
 * CRITICAL: every feature MUST be validated against user demand
 * evidence before implementation. The validator pulls:
 *
 *   - `feedbackCount` — from the feedback system (Prompt 82).
 *     Counts how many users submitted feature-request feedback
 *     matching this feature.
 *   - `relatedFeatureAdoption` — from the product analytics
 *     (Prompt 83). The fraction of MAU that have adopted the
 *     closest related existing feature.
 *   - `userDemandScore` — initial 0..100 score from the feature
 *     candidate.
 *   - `implementationCost` — estimated dev-days.
 *   - `estimatedUsersImpacted` — fraction of MAU (0..1) that would
 *     benefit.
 *   - `analyticsSource` — MUST be `'privacy_safe_analytics'`. The
 *     validator refuses to operate on any other source — this
 *     enforces that decisions are based on redacted, aggregate
 *     analytics, never raw PII.
 *
 * shouldImplement=true ONLY if ALL of:
 *   - `userDemandScore >= 50`
 *   - `feedbackCount >= 20`
 *   - `relatedFeatureAdoption >= 0.3`
 *   - cost/value tradeoff acceptable
 *
 * See `docs/product-roadmap.md`.
 */

import type { FeatureCandidate } from './feature-candidate';

// ---------------------------------------------------------------------------
// Inputs + outputs
// ---------------------------------------------------------------------------

export type AnalyticsSource = 'privacy_safe_analytics' | 'raw_analytics' | 'manual_estimate';

export const ALLOWED_ANALYTICS_SOURCES: readonly AnalyticsSource[] = [
  'privacy_safe_analytics',
] as const;

export interface FeatureValidationInput {
  /** The feature candidate being validated. */
  readonly feature: FeatureCandidate;
  /** Number of feedback entries matching this feature (from Prompt 82). */
  readonly feedbackCount: number;
  /** Adoption rate of the closest related existing feature (from Prompt 83). */
  readonly relatedFeatureAdoption: number;
  /** User demand score (0..100) — may override the feature's initial score. */
  readonly userDemandScore: number;
  /** Estimated dev-days to implement. */
  readonly implementationCost: number;
  /** Estimated fraction of MAU (0..1) that would benefit. */
  readonly estimatedUsersImpacted: number;
  /**
   * CRITICAL: must be `'privacy_safe_analytics'`. The validator
   * refuses any other source — feature decisions must be based on
   * redacted, aggregate analytics, never raw PII.
   */
  readonly analyticsSource: AnalyticsSource;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type RecommendedPriority = 'now' | 'next' | 'later' | 'never';

export interface FeatureValidationResult {
  /** Whether the feature should be implemented. */
  readonly shouldImplement: boolean;
  /** Confidence in the decision (low / medium / high). */
  readonly confidenceLevel: ConfidenceLevel;
  /** Human-readable reasoning for the decision. */
  readonly reasoning: string;
  /** Recommended priority bucket. */
  readonly recommendedPriority: RecommendedPriority;
  /** Conditions that must hold before implementation begins. */
  readonly conditions: readonly string[];
  /** Documents which analytics sources informed the decision. */
  readonly evidenceSources: readonly string[];
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const MIN_USER_DEMAND_SCORE = 50;
export const MIN_FEEDBACK_COUNT = 20;
export const MIN_RELATED_FEATURE_ADOPTION = 0.3;
export const MIN_ESTIMATED_USERS_IMPACTED = 0.1;
export const MAX_COST_PER_VALUE_POINT_DEV_DAYS = 10;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateFeatureInput(input: FeatureValidationInput): void {
  if (!input || typeof input !== 'object') {
    throw new Error('input must be a FeatureValidationInput object');
  }
  if (!input.feature) {
    throw new Error('feature is required');
  }
  if (
    !Number.isInteger(input.feedbackCount) ||
    input.feedbackCount < 0
  ) {
    throw new Error(`feedbackCount must be a non-negative integer, got ${input.feedbackCount}`);
  }
  if (
    !Number.isFinite(input.relatedFeatureAdoption) ||
    input.relatedFeatureAdoption < 0 ||
    input.relatedFeatureAdoption > 1
  ) {
    throw new Error(
      `relatedFeatureAdoption must be in [0, 1], got ${input.relatedFeatureAdoption}`,
    );
  }
  if (
    !Number.isInteger(input.userDemandScore) ||
    input.userDemandScore < 0 ||
    input.userDemandScore > 100
  ) {
    throw new Error(
      `userDemandScore must be an integer in [0, 100], got ${input.userDemandScore}`,
    );
  }
  if (
    !Number.isFinite(input.implementationCost) ||
    input.implementationCost <= 0
  ) {
    throw new Error(`implementationCost must be a positive finite number, got ${input.implementationCost}`);
  }
  if (
    !Number.isFinite(input.estimatedUsersImpacted) ||
    input.estimatedUsersImpacted < 0 ||
    input.estimatedUsersImpacted > 1
  ) {
    throw new Error(
      `estimatedUsersImpacted must be in [0, 1], got ${input.estimatedUsersImpacted}`,
    );
  }
  if (input.analyticsSource !== 'privacy_safe_analytics') {
    throw new Error(
      `analyticsSource must be 'privacy_safe_analytics', got '${input.analyticsSource}'. ` +
        `Feature decisions must be based on redacted, aggregate analytics only.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate a feature candidate against real usage data.
 *
 * CRITICAL: shouldImplement=true ONLY if ALL of:
 *   - `userDemandScore >= 50`
 *   - `feedbackCount >= 20`
 *   - `relatedFeatureAdoption >= 0.3`
 *   - cost/value tradeoff acceptable
 *
 * "Every feature must be validated against user demand before
 *  implementation."
 *
 * Confidence level:
 *   - `high`   — all four thresholds met + cost/value acceptable.
 *   - `medium` — three of four thresholds met.
 *   - `low`    — fewer than three thresholds met.
 *
 * Recommended priority:
 *   - `now`   — shouldImplement=true AND confidence=high.
 *   - `next`  — shouldImplement=true AND confidence=medium.
 *   - `later` — shouldImplement=false but at least one threshold
 *               met (worth revisiting).
 *   - `never` — shouldImplement=false AND zero thresholds met.
 */
export function validateFeature(input: FeatureValidationInput): FeatureValidationResult {
  validateFeatureInput(input);

  const evidenceSources: string[] = [
    'privacy_safe_analytics:feedback_count',
    'privacy_safe_analytics:related_feature_adoption',
    'privacy_safe_analytics:user_demand_score',
  ];
  const conditions: string[] = [];
  const reasons: string[] = [];

  // 1. Check each threshold.
  const demandMet = input.userDemandScore >= MIN_USER_DEMAND_SCORE;
  const feedbackMet = input.feedbackCount >= MIN_FEEDBACK_COUNT;
  const adoptionMet = input.relatedFeatureAdoption >= MIN_RELATED_FEATURE_ADOPTION;
  const costValueMet = isCostValueAcceptable(input);
  const usersImpactedMet = input.estimatedUsersImpacted >= MIN_ESTIMATED_USERS_IMPACTED;

  if (!demandMet) {
    reasons.push(
      `User demand score ${input.userDemandScore} below threshold ${MIN_USER_DEMAND_SCORE}.`,
    );
  }
  if (!feedbackMet) {
    reasons.push(
      `Feedback count ${input.feedbackCount} below threshold ${MIN_FEEDBACK_COUNT}.`,
    );
  }
  if (!adoptionMet) {
    reasons.push(
      `Related feature adoption ${input.relatedFeatureAdoption} below threshold ${MIN_RELATED_FEATURE_ADOPTION}.`,
    );
  }
  if (!costValueMet) {
    reasons.push(
      `Cost/value tradeoff not acceptable: ${input.implementationCost} dev-days for value ${input.feature.estimatedValue}.`,
    );
  }
  if (!usersImpactedMet) {
    reasons.push(
      `Estimated users impacted ${input.estimatedUsersImpacted} below threshold ${MIN_ESTIMATED_USERS_IMPACTED}.`,
    );
  }

  // 2. Count thresholds met (out of 5).
  const thresholdsMet = [demandMet, feedbackMet, adoptionMet, costValueMet, usersImpactedMet]
    .filter(Boolean)
    .length;

  // 3. CRITICAL: shouldImplement=true ONLY if ALL of demand + feedback
  //    + adoption + cost/value are met.
  const shouldImplement = demandMet && feedbackMet && adoptionMet && costValueMet;

  // 4. Confidence level.
  let confidenceLevel: ConfidenceLevel;
  if (thresholdsMet >= 5) confidenceLevel = 'high';
  else if (thresholdsMet >= 3) confidenceLevel = 'medium';
  else confidenceLevel = 'low';

  // 5. Recommended priority.
  let recommendedPriority: RecommendedPriority;
  if (shouldImplement && confidenceLevel === 'high') {
    recommendedPriority = 'now';
  } else if (shouldImplement && confidenceLevel === 'medium') {
    recommendedPriority = 'next';
  } else if (shouldImplement) {
    recommendedPriority = 'next';
  } else if (thresholdsMet >= 1) {
    recommendedPriority = 'later';
  } else {
    recommendedPriority = 'never';
  }

  // 6. Add conditions for implementation.
  if (shouldImplement) {
    conditions.push(`Ship after prerequisites: ${input.feature.prerequisites.length > 0 ? input.feature.prerequisites.join(', ') : 'none'}.`);
    if (input.feature.riskLevel === 'high') {
      conditions.push('Conduct a design review before implementation (risk level: high).');
    }
    conditions.push(`Re-validate analytics quarterly (source: privacy_safe_analytics).`);
  } else {
    if (!demandMet) {
      conditions.push(`Increase user demand score to >= ${MIN_USER_DEMAND_SCORE} before re-validation.`);
    }
    if (!feedbackMet) {
      conditions.push(`Collect >= ${MIN_FEEDBACK_COUNT} feedback entries before re-validation.`);
    }
    if (!adoptionMet) {
      conditions.push(`Grow related feature adoption to >= ${MIN_RELATED_FEATURE_ADOPTION} before re-validation.`);
    }
  }

  // 7. Compose reasoning.
  const reasoningHeader = shouldImplement
    ? `Feature '${input.feature.key}' should be implemented (confidence: ${confidenceLevel}).`
    : `Feature '${input.feature.key}' should NOT be implemented yet (confidence: ${confidenceLevel}).`;
  const reasoning = reasons.length === 0
    ? `${reasoningHeader} All thresholds met.`
    : `${reasoningHeader} ${reasons.join(' ')}`;

  return Object.freeze({
    shouldImplement,
    confidenceLevel,
    reasoning,
    recommendedPriority,
    conditions: Object.freeze(conditions),
    evidenceSources: Object.freeze(evidenceSources),
  });
}

// ---------------------------------------------------------------------------
// Cost / value tradeoff
// ---------------------------------------------------------------------------

/**
 * Returns true when the cost/value tradeoff is acceptable.
 *
 * The tradeoff is the ratio of `implementationCost` (dev-days) to
 * `estimatedValue` (1..5). If the ratio exceeds
 * `MAX_COST_PER_VALUE_POINT_DEV_DAYS` (10), the tradeoff is NOT
 * acceptable.
 *
 * Examples:
 *   - cost=10, value=5 → ratio 2.0 → acceptable.
 *   - cost=50, value=5 → ratio 10.0 → acceptable (boundary).
 *   - cost=60, value=5 → ratio 12.0 → NOT acceptable.
 *   - cost=5, value=1  → ratio 5.0 → acceptable.
 *   - cost=15, value=1 → ratio 15.0 → NOT acceptable.
 */
export function isCostValueAcceptable(input: FeatureValidationInput): boolean {
  const ratio = input.implementationCost / input.feature.estimatedValue;
  return ratio <= MAX_COST_PER_VALUE_POINT_DEV_DAYS;
}

// ---------------------------------------------------------------------------
// Aggregate validation
// ---------------------------------------------------------------------------

export interface RoadmapValidationSummary {
  readonly totalCandidates: number;
  readonly shouldImplementCount: number;
  readonly nowCount: number;
  readonly nextCount: number;
  readonly laterCount: number;
  readonly neverCount: number;
  readonly results: readonly FeatureValidationResult[];
}

/**
 * Validate a set of feature candidates. Returns a summary with the
 * per-candidate results + aggregate counts.
 */
export function validateFeatures(
  inputs: readonly FeatureValidationInput[],
): RoadmapValidationSummary {
  const results = inputs.map((input) => validateFeature(input));
  let shouldImplement = 0;
  let now = 0;
  let next = 0;
  let later = 0;
  let never = 0;
  for (const r of results) {
    if (r.shouldImplement) shouldImplement += 1;
    switch (r.recommendedPriority) {
      case 'now': now += 1; break;
      case 'next': next += 1; break;
      case 'later': later += 1; break;
      case 'never': never += 1; break;
    }
  }
  return Object.freeze({
    totalCandidates: results.length,
    shouldImplementCount: shouldImplement,
    nowCount: now,
    nextCount: next,
    laterCount: later,
    neverCount: never,
    results: Object.freeze(results),
  });
}
