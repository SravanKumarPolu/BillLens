/**
 * Statistical significance for A/B experiments.
 *
 * Implements a two-proportion Z-test (the standard test for comparing
 * conversion rates between two variants), along with helpers for
 * confidence intervals and minimum-sample-size estimation.
 *
 * All functions are PURE — no I/O, no globals.
 *
 * CRITICAL: This module NEVER makes financial decisions. It only computes
 * statistical quantities that the experimenter uses to decide whether a
 * UI/UX variant outperforms control. The decision to ship a variant is
 * made by a human, not by this code.
 */

import type { ExperimentVariant } from './experiment-model';

// ---------------------------------------------------------------------------
// Inputs — per-variant counts
// ---------------------------------------------------------------------------

export interface VariantConversionStats {
  readonly variant: ExperimentVariant;
  readonly trials: number;
  readonly successes: number;
}

// ---------------------------------------------------------------------------
// Z-test for two proportions
// ---------------------------------------------------------------------------

/**
 * Normal cumulative distribution function (CDF).
 *
 * Uses the Zelen & Severo (1964) approximation (A&S 7.1.26 alternate
 * form, also documented as A&S 26.2.17) — accurate to ~1e-7 across the
 * practical range. Pure function.
 */
export function normalCdf(z: number): number {
  // Zelen & Severo approximation for the standard normal CDF.
  const p = 0.2316419;
  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const t = 1.0 / (1.0 + p * Math.abs(z));
  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  const phiStd = 1.0 / Math.sqrt(2 * Math.PI) * Math.exp(-z * z / 2);
  const cdf = 1.0 - phiStd * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

/**
 * Computes the two-sided p-value for the null hypothesis that the two
 * variants have the same conversion rate.
 *
 * Returns `NaN` when:
 *   - either variant has zero trials
 *   - the pooled proportion is 0 or 1 (no variance)
 *
 * In those cases the caller should treat the result as "not enough data"
 * rather than "significant" or "not significant".
 */
export function twoProportionZTest(
  control: VariantConversionStats,
  treatment: VariantConversionStats,
): { z: number; pValue: number; significant: boolean; alpha: number } {
  const alpha = 0.05;

  if (control.trials <= 0 || treatment.trials <= 0) {
    return { z: NaN, pValue: NaN, significant: false, alpha };
  }

  const p1 = control.successes / control.trials;
  const p2 = treatment.successes / treatment.trials;
  const n1 = control.trials;
  const n2 = treatment.trials;

  // Pooled proportion.
  const pPooled = (control.successes + treatment.successes) / (n1 + n2);
  if (pPooled <= 0 || pPooled >= 1) {
    return { z: NaN, pValue: NaN, significant: false, alpha };
  }

  // Standard error under the null hypothesis.
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
  if (se <= 0) {
    return { z: NaN, pValue: NaN, significant: false, alpha };
  }

  const z = (p2 - p1) / se;

  // Two-sided p-value: 2 * (1 - Φ(|z|))
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  // Guard against floating-point overflow when z is very large.
  const safePValue = Math.min(1, Math.max(0, pValue));

  return {
    z,
    pValue: safePValue,
    significant: safePValue < alpha,
    alpha,
  };
}

// ---------------------------------------------------------------------------
// Confidence interval for the difference of two proportions
// ---------------------------------------------------------------------------

/**
 * Computes a (1 - alpha) confidence interval for the difference
 * (treatment - control) of two proportions.
 *
 * Uses the unpooled standard error (Wald interval). Returns an object
 * with `lower`, `upper`, `pointEstimate`, and `confidenceLevel`.
 *
 * Returns `NaN` values when either variant has zero trials.
 */
export function differenceConfidenceInterval(
  control: VariantConversionStats,
  treatment: VariantConversionStats,
  confidenceLevel: number = 0.95,
): {
  readonly lower: number;
  readonly upper: number;
  readonly pointEstimate: number;
  readonly confidenceLevel: number;
} {
  if (control.trials <= 0 || treatment.trials <= 0) {
    return { lower: NaN, upper: NaN, pointEstimate: NaN, confidenceLevel };
  }
  if (confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new Error(`confidenceLevel must be in (0, 1), got ${confidenceLevel}`);
  }

  const p1 = control.successes / control.trials;
  const p2 = treatment.successes / treatment.trials;
  const n1 = control.trials;
  const n2 = treatment.trials;

  // Unpooled standard error.
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const pointEstimate = p2 - p1;

  // Convert confidence level to z critical value via inverse-erf.
  // For the common 95% case, z ≈ 1.959964. For 99%, z ≈ 2.575829.
  const zCritical = inverseNormalCdf((1 + confidenceLevel) / 2);

  const margin = zCritical * se;
  return {
    lower: pointEstimate - margin,
    upper: pointEstimate + margin,
    pointEstimate,
    confidenceLevel,
  };
}

/**
 * Inverse normal CDF (probit function) via the rational approximation of
 * Peter Acklam. Accurate to ~1e-9.
 *
 * Returns the z such that Φ(z) = p, for p in (0, 1).
 */
export function inverseNormalCdf(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error(`p must be in (0, 1), got ${p}`);
  }
  // Acklam's rational approximation.
  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ];

  const plow = 0.02425;
  const phigh = 1 - plow;

  let q: number;
  let r: number;

  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    r =
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q +
        c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    r =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r +
        a[5]!) *
        q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    r =
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q +
        c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Minimum sample size
// ---------------------------------------------------------------------------

/**
 * Minimum sample size per variant needed to detect a difference
 * `delta` (= p_treatment - p_control) at the given confidence level
 * and statistical power.
 *
 * Uses the standard two-proportion sample size formula:
 *
 *   n = ((z_(α/2) + z_β)² * (p1(1-p1) + p2(1-p2))) / (p2 - p1)²
 *
 * where:
 *   - p1 = baseline conversion rate (control)
 *   - p2 = expected conversion rate (treatment) = p1 + delta
 *   - α = 1 - confidenceLevel (two-sided)
 *   - β = 1 - power
 *
 * Returns the ceiling of n (a positive integer).
 *
 * Throws when p1 or p2 is outside (0, 1), or when delta is 0.
 */
export function minimumSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  confidenceLevel: number = 0.95,
  power: number = 0.8,
): number {
  if (baselineRate <= 0 || baselineRate >= 1) {
    throw new Error(
      `baselineRate must be in (0, 1), got ${baselineRate}`,
    );
  }
  if (minimumDetectableEffect === 0) {
    throw new Error('minimumDetectableEffect must be non-zero');
  }
  if (confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new Error(`confidenceLevel must be in (0, 1), got ${confidenceLevel}`);
  }
  if (power <= 0 || power >= 1) {
    throw new Error(`power must be in (0, 1), got ${power}`);
  }

  const p1 = baselineRate;
  const p2 = baselineRate + minimumDetectableEffect;
  if (p2 <= 0 || p2 >= 1) {
    throw new Error(
      `baselineRate + minimumDetectableEffect must be in (0, 1), got ${p2}`,
    );
  }

  const alpha = 1 - confidenceLevel;
  const zAlphaHalf = inverseNormalCdf(1 - alpha / 2);
  const zBeta = inverseNormalCdf(power);

  const numerator =
    Math.pow(zAlphaHalf + zBeta, 2) *
    (p1 * (1 - p1) + p2 * (1 - p2));
  const denominator = Math.pow(p2 - p1, 2);

  return Math.ceil(numerator / denominator);
}

// ---------------------------------------------------------------------------
// Experiment-level result aggregation
// ---------------------------------------------------------------------------

export interface VariantResultRow {
  readonly variant: ExperimentVariant;
  readonly trials: number;
  readonly successes: number;
  readonly conversionRate: number;
}

export interface ExperimentStatisticalResult {
  readonly experimentId: string;
  readonly control: VariantResultRow;
  readonly treatments: readonly {
    readonly variant: ExperimentVariant;
    readonly trials: number;
    readonly successes: number;
    readonly conversionRate: number;
    readonly zScore: number;
    readonly pValue: number;
    readonly significant: boolean;
    readonly confidenceInterval: {
      readonly lower: number;
      readonly upper: number;
      readonly confidenceLevel: number;
    };
    readonly lift: number;
  }[];
  readonly totalTrials: number;
  readonly meetsMinimumSampleSize: boolean;
}

/**
 * Computes per-variant results for an experiment given raw per-variant
 * counts. The first variant in the array is treated as control.
 *
 * Pure function.
 */
export function computeExperimentResults(
  experimentId: string,
  stats: readonly VariantConversionStats[],
  minimumPerVariant: number = 30,
): ExperimentStatisticalResult {
  if (stats.length < 2) {
    throw new Error('Need at least 2 variants to compute results');
  }

  const controlStats = stats[0]!;
  const controlRate =
    controlStats.trials > 0
      ? controlStats.successes / controlStats.trials
      : 0;

  const controlRow: VariantResultRow = {
    variant: controlStats.variant,
    trials: controlStats.trials,
    successes: controlStats.successes,
    conversionRate: controlRate,
  };

  const treatments = stats.slice(1).map((t) => {
    const treatmentRate = t.trials > 0 ? t.successes / t.trials : 0;
    const z = twoProportionZTest(controlStats, t);
    const ci = differenceConfidenceInterval(controlStats, t, 0.95);
    const lift =
      controlRate > 0 ? (treatmentRate - controlRate) / controlRate : 0;
    return {
      variant: t.variant,
      trials: t.trials,
      successes: t.successes,
      conversionRate: treatmentRate,
      zScore: z.z,
      pValue: z.pValue,
      significant: z.significant,
      confidenceInterval: {
        lower: ci.lower,
        upper: ci.upper,
        confidenceLevel: ci.confidenceLevel,
      },
      lift,
    };
  });

  const totalTrials = stats.reduce((sum, s) => sum + s.trials, 0);
  const meetsMinimumSampleSize = stats.every((s) => s.trials >= minimumPerVariant);

  return {
    experimentId,
    control: controlRow,
    treatments,
    totalTrials,
    meetsMinimumSampleSize,
  };
}
