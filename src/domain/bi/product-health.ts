/**
 * Product health score — composite of financial, sync, OCR, crash, NPS, SLA.
 *
 * Phase 10 Prompt 95: Business Intelligence.
 *
 * CRITICAL CONSTRAINTS:
 *   - The product health score is AGGREGATED. It does NOT reveal any
 *     individual user's data.
 *   - Each sub-score is normalised to 0-100.
 *   - `financialIntegrity` is the pass-rate of the zero-sum invariant
 *     check (balance engine). 100 = perfect; below 90 = critical.
 *   - `userSatisfaction` is derived from NPS (Net Promoter Score). The
 *     raw NPS (-100 to +100) is mapped to 0-100 via (nps + 100) / 2.
 *
 * This module is PURE: it computes scores from inputs; no I/O.
 *
 * See `docs/business-intelligence.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductHealthScore {
  /** Overall score 0-100. Weighted average of the sub-scores. */
  readonly overall: number;
  /** Zero-sum invariant pass rate (0-100). */
  readonly financialIntegrity: number;
  /** Sync success rate (0-100). */
  readonly syncReliability: number;
  /** OCR field-level accuracy (0-100). */
  readonly ocrAccuracy: number;
  /** Crash-free session rate (0-100). */
  readonly crashFreeRate: number;
  /** NPS-derived user satisfaction (0-100). */
  readonly userSatisfaction: number;
  /** Support SLA compliance (0-100). */
  readonly supportSla: number;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical';

// ---------------------------------------------------------------------------
// Sub-score weights
// ---------------------------------------------------------------------------

/**
 * Weights for the overall health score. The weights reflect BillLens's
 * priorities: financial integrity is paramount (a 25% weight), followed
 * by sync reliability (20%), then user-facing quality (OCR, crash,
 * NPS, SLA each get 10-15%).
 *
 * Weights sum to 1.0.
 */
export type HealthSubScoreKey = keyof Omit<ProductHealthScore, 'overall'>;

export const HEALTH_SCORE_WEIGHTS: Readonly<Record<HealthSubScoreKey, number>> =
  Object.freeze({
    financialIntegrity: 0.25,
    syncReliability: 0.20,
    ocrAccuracy: 0.10,
    crashFreeRate: 0.15,
    userSatisfaction: 0.15,
    supportSla: 0.15,
  });

// ---------------------------------------------------------------------------
// Score normalization
// ---------------------------------------------------------------------------

/**
 * Clamps a number to 0-100.
 */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`value must be finite, got ${value}`);
  }
  return Math.max(0, Math.min(100, value));
}

/**
 * Converts an NPS score (-100 to +100) to a 0-100 user-satisfaction score.
 *
 *   satisfaction = (nps + 100) / 2
 *
 *   NPS = -100 → satisfaction = 0
 *   NPS =    0 → satisfaction = 50
 *   NPS = +100 → satisfaction = 100
 */
export function npsToSatisfaction(nps: number): number {
  if (!Number.isFinite(nps)) {
    throw new Error(`nps must be finite, got ${nps}`);
  }
  if (nps < -100 || nps > 100) {
    throw new Error(`nps must be -100..100, got ${nps}`);
  }
  return clampScore((nps + 100) / 2);
}

/**
 * Converts a rate (0-1) to a 0-100 score.
 *
 *   score = rate * 100
 *
 * Used for: pass rate, success rate, accuracy, crash-free rate.
 */
export function rateToScore(rate: number): number {
  if (!Number.isFinite(rate)) {
    throw new Error(`rate must be finite, got ${rate}`);
  }
  if (rate < 0 || rate > 1) {
    throw new Error(`rate must be 0..1, got ${rate}`);
  }
  return clampScore(rate * 100);
}

// ---------------------------------------------------------------------------
// Overall health
// ---------------------------------------------------------------------------

/**
 * Computes the overall health score as a weighted average of the sub-scores.
 *
 * Throws if any sub-score is not a finite number 0-100.
 */
export function computeOverallHealth(
  score: Omit<ProductHealthScore, 'overall'>,
): number {
  const subScores: readonly { key: HealthSubScoreKey; value: number }[] = [
    { key: 'financialIntegrity', value: score.financialIntegrity },
    { key: 'syncReliability', value: score.syncReliability },
    { key: 'ocrAccuracy', value: score.ocrAccuracy },
    { key: 'crashFreeRate', value: score.crashFreeRate },
    { key: 'userSatisfaction', value: score.userSatisfaction },
    { key: 'supportSla', value: score.supportSla },
  ];
  for (const s of subScores) {
    if (!Number.isFinite(s.value)) {
      throw new Error(`${s.key} must be finite, got ${s.value}`);
    }
    if (s.value < 0 || s.value > 100) {
      throw new Error(`${s.key} must be 0..100, got ${s.value}`);
    }
  }
  let sum = 0;
  let weightSum = 0;
  for (const s of subScores) {
    const weight = HEALTH_SCORE_WEIGHTS[s.key];
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      throw new Error(`Missing weight for ${s.key}`);
    }
    sum += s.value * weight;
    weightSum += weight;
  }
  if (weightSum === 0) {
    throw new Error('Weights sum to 0 — cannot compute overall');
  }
  return clampScore(sum / weightSum);
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Returns the health status based on the overall score.
 *
 *   >= 80 → 'healthy'
 *   >= 60 → 'warning'
 *   <  60 → 'critical'
 *
 * These thresholds are intentionally conservative. A score below 80
 * already indicates a problem worth investigating.
 */
export function getHealthStatus(score: number): HealthStatus {
  if (!Number.isFinite(score)) {
    throw new Error(`score must be finite, got ${score}`);
  }
  if (score < 0 || score > 100) {
    throw new Error(`score must be 0..100, got ${score}`);
  }
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warning';
  return 'critical';
}

// ---------------------------------------------------------------------------
// Snapshot construction
// ---------------------------------------------------------------------------

export interface ProductHealthInput {
  readonly zeroSumPassRate: number; // 0-1
  readonly syncSuccessRate: number; // 0-1
  readonly ocrFieldAccuracy: number; // 0-1
  readonly crashFreeSessionRate: number; // 0-1
  readonly nps: number; // -100..100
  readonly supportSlaComplianceRate: number; // 0-1
}

/**
 * Constructs a `ProductHealthScore` from raw rate-based inputs. Converts
 * each rate to a 0-100 sub-score, then computes the overall weighted
 * average.
 *
 * The snapshot is frozen and ready to render in the BI dashboard.
 */
export function createProductHealthScore(
  input: ProductHealthInput,
): ProductHealthScore {
  const financialIntegrity = rateToScore(input.zeroSumPassRate);
  const syncReliability = rateToScore(input.syncSuccessRate);
  const ocrAccuracy = rateToScore(input.ocrFieldAccuracy);
  const crashFreeRate = rateToScore(input.crashFreeSessionRate);
  const userSatisfaction = npsToSatisfaction(input.nps);
  const supportSla = rateToScore(input.supportSlaComplianceRate);
  const overall = computeOverallHealth({
    financialIntegrity,
    syncReliability,
    ocrAccuracy,
    crashFreeRate,
    userSatisfaction,
    supportSla,
  });
  return Object.freeze({
    overall,
    financialIntegrity,
    syncReliability,
    ocrAccuracy,
    crashFreeRate,
    userSatisfaction,
    supportSla,
  });
}

/**
 * Returns the lowest-scoring sub-score. Useful for the dashboard's
 * "weakest link" callout.
 *
 * Returns `null` when all sub-scores are >= 90 (no weak link).
 */
export function getWeakestSubScore(
  score: ProductHealthScore,
): { key: HealthSubScoreKey; value: number } | null {
  const candidates: readonly { key: HealthSubScoreKey; value: number }[] = [
    { key: 'financialIntegrity', value: score.financialIntegrity },
    { key: 'syncReliability', value: score.syncReliability },
    { key: 'ocrAccuracy', value: score.ocrAccuracy },
    { key: 'crashFreeRate', value: score.crashFreeRate },
    { key: 'userSatisfaction', value: score.userSatisfaction },
    { key: 'supportSla', value: score.supportSla },
  ];
  let weakest: { key: HealthSubScoreKey; value: number } | null = null;
  for (const c of candidates) {
    if (c.value < 90) {
      if (weakest === null || c.value < weakest.value) {
        weakest = c;
      }
    }
  }
  return weakest;
}
