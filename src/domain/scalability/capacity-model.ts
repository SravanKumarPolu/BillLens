/**
 * Capacity planning model — read-only projections and scaling actions.
 *
 * Phase 10 Prompt 91: Scalability Architecture.
 *
 * This module is PURE and READ-ONLY. It never mutates external state.
 * It computes utilisation, projects growth, and recommends an action
 * ('none' | 'monitor' | 'plan' | 'scale_now') based on current load
 * against configured limits.
 *
 * 12 capacity metrics cover: database connections, database storage,
 * API RPS, sync queue depth, OCR queue depth, attachment storage,
 * search index size, cache hit rate, background workers, push
 * notification throughput, webhook delivery, and analytics event
 * volume.
 *
 * See `docs/scalability-architecture.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScalingAction = 'none' | 'monitor' | 'plan' | 'scale_now';

export interface CapacityMetric {
  /** Stable identifier (e.g. 'db_connections'). */
  readonly name: string;
  /** Current observed value. */
  readonly currentValue: number;
  /** Projected value 12 months out at the configured growth rate. */
  readonly projectedValue: number;
  /** Hard capacity ceiling for this metric. */
  readonly capacityLimit: number;
  /** Current utilisation expressed as a percentage in [0, ∞). */
  readonly utilizationPercent: number;
  /** Percentage at which the team must begin scaling (e.g. 70). */
  readonly scalingThreshold: number;
  /** Recommended action based on current + projected utilisation. */
  readonly actionRequired: ScalingAction;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Computes utilisation as a percentage in the range [0, ∞).
 *
 * A value over 100 indicates the system is over capacity. We deliberately
 * return a non-clamped number so callers can detect over-capacity states.
 *
 * `limit` MUST be a positive, finite number. We do not throw on bad input
 * to keep this read-only and side-effect-free; instead we return 0 when
 * the limit is not usable.
 */
export function computeUtilization(current: number, limit: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(limit)) {
    return 0;
  }
  if (limit <= 0) {
    return 0;
  }
  if (current < 0) {
    return 0;
  }
  return (current / limit) * 100;
}

/**
 * Projects growth from a current value over `months` months at a
 * monthly growth rate expressed as a fraction (e.g. 0.05 = 5%).
 *
 * Uses compound growth: `current * (1 + rate)^months`. Returns the
 * current value unchanged when months is 0 or the rate is 0.
 *
 * Returns 0 for invalid inputs (negative current, non-finite rate).
 */
export function projectGrowth(
  current: number,
  monthlyGrowthRate: number,
  months: number,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(monthlyGrowthRate)) {
    return 0;
  }
  if (current < 0) {
    return 0;
  }
  if (months <= 0 || monthlyGrowthRate === 0) {
    return current;
  }
  // Guard against runaway exponents.
  if (months > 600) {
    months = 600;
  }
  const factor = Math.pow(1 + monthlyGrowthRate, months);
  if (!Number.isFinite(factor)) {
    return Number.POSITIVE_INFINITY;
  }
  return current * factor;
}

/**
 * Returns the recommended scaling action for a given utilisation
 * percentage and threshold.
 *
 * - < 50% of threshold → 'none'
 * - 50%..threshold → 'monitor'
 * - threshold..(threshold + 20) → 'plan'
 * - above (threshold + 20) OR >= 100% → 'scale_now'
 *
 * `threshold` is expressed as a percentage (e.g. 70). We clamp negative
 * thresholds to 0 to avoid nonsensical results.
 */
export function getScalingAction(
  utilization: number,
  threshold: number,
): ScalingAction {
  if (!Number.isFinite(utilization) || !Number.isFinite(threshold)) {
    return 'none';
  }
  const safeThreshold = threshold < 0 ? 0 : threshold;
  if (utilization < 0) {
    return 'none';
  }
  if (utilization >= 100) {
    return 'scale_now';
  }
  if (utilization >= safeThreshold + 20) {
    return 'scale_now';
  }
  if (utilization >= safeThreshold) {
    return 'plan';
  }
  if (utilization >= safeThreshold * 0.5) {
    return 'monitor';
  }
  return 'none';
}

// ---------------------------------------------------------------------------
// Capacity metrics registry — 12 metrics
// ---------------------------------------------------------------------------

interface CapacityMetricSeed {
  readonly name: string;
  readonly currentValue: number;
  readonly capacityLimit: number;
  readonly monthlyGrowthRate: number;
  readonly scalingThreshold: number;
}

/**
 * Seed data for the 12 capacity metrics. These are illustrative defaults
 * that a production deployment would override with values pulled from
 * the observability stack. The 12-month projection is computed via
 * `projectGrowth`.
 */
const CAPACITY_METRIC_SEEDS: readonly CapacityMetricSeed[] = [
  {
    name: 'db_connections',
    currentValue: 120,
    capacityLimit: 500,
    monthlyGrowthRate: 0.03,
    scalingThreshold: 70,
  },
  {
    name: 'db_storage_gb',
    currentValue: 80,
    capacityLimit: 500,
    monthlyGrowthRate: 0.05,
    scalingThreshold: 75,
  },
  {
    name: 'api_rps',
    currentValue: 850,
    capacityLimit: 5000,
    monthlyGrowthRate: 0.08,
    scalingThreshold: 70,
  },
  {
    name: 'sync_queue_depth',
    currentValue: 1200,
    capacityLimit: 20000,
    monthlyGrowthRate: 0.06,
    scalingThreshold: 65,
  },
  {
    name: 'ocr_queue_depth',
    currentValue: 400,
    capacityLimit: 10000,
    monthlyGrowthRate: 0.07,
    scalingThreshold: 65,
  },
  {
    name: 'attachment_storage_gb',
    currentValue: 220,
    capacityLimit: 2000,
    monthlyGrowthRate: 0.09,
    scalingThreshold: 75,
  },
  {
    name: 'search_index_size_gb',
    currentValue: 35,
    capacityLimit: 500,
    monthlyGrowthRate: 0.04,
    scalingThreshold: 70,
  },
  {
    name: 'cache_hit_rate_percent',
    currentValue: 92,
    capacityLimit: 100,
    monthlyGrowthRate: -0.005,
    scalingThreshold: 80,
  },
  {
    name: 'background_workers',
    currentValue: 8,
    capacityLimit: 64,
    monthlyGrowthRate: 0.04,
    scalingThreshold: 70,
  },
  {
    name: 'push_notification_throughput_per_min',
    currentValue: 1500,
    capacityLimit: 20000,
    monthlyGrowthRate: 0.05,
    scalingThreshold: 70,
  },
  {
    name: 'webhook_delivery_per_min',
    currentValue: 350,
    capacityLimit: 5000,
    monthlyGrowthRate: 0.06,
    scalingThreshold: 70,
  },
  {
    name: 'analytics_event_volume_per_day',
    currentValue: 4_500_000,
    capacityLimit: 50_000_000,
    monthlyGrowthRate: 0.1,
    scalingThreshold: 75,
  },
];

const PROJECTED_MONTHS = 12;

/**
 * Materialised capacity metrics with computed utilisation, 12-month
 * projection, and recommended action.
 *
 * Frozen for read-only safety.
 */
export const CAPACITY_METRICS: readonly CapacityMetric[] =
  CAPACITY_METRIC_SEEDS.map((seed): CapacityMetric => {
    const projected = projectGrowth(
      seed.currentValue,
      seed.monthlyGrowthRate,
      PROJECTED_MONTHS,
    );
    // For cache_hit_rate, utilisation is "distance below threshold":
    // we invert so a low hit rate looks like high utilisation.
    const utilisation =
      seed.name === 'cache_hit_rate_percent'
        ? computeUtilization(
            seed.capacityLimit - seed.currentValue,
            seed.capacityLimit - seed.scalingThreshold,
          )
        : computeUtilization(seed.currentValue, seed.capacityLimit);

    // The action is based on the WORST of current and projected.
    const projectedUtilisation =
      seed.name === 'cache_hit_rate_percent'
        ? computeUtilization(
            seed.capacityLimit - projected,
            seed.capacityLimit - seed.scalingThreshold,
          )
        : computeUtilization(projected, seed.capacityLimit);

    const action = ((): ScalingAction => {
      const order: readonly ScalingAction[] = [
        'none',
        'monitor',
        'plan',
        'scale_now',
      ];
      const currentAction = getScalingAction(utilisation, seed.scalingThreshold);
      const projectedAction = getScalingAction(
        projectedUtilisation,
        seed.scalingThreshold,
      );
      return order.indexOf(projectedAction) > order.indexOf(currentAction)
        ? projectedAction
        : currentAction;
    })();

    return Object.freeze({
      name: seed.name,
      currentValue: seed.currentValue,
      projectedValue: projected,
      capacityLimit: seed.capacityLimit,
      utilizationPercent: Math.round(utilisation * 100) / 100,
      scalingThreshold: seed.scalingThreshold,
      actionRequired: action,
    });
  });

/**
 * Returns the capacity metric for a given name, or null when unknown.
 */
export function getCapacityMetric(name: string): CapacityMetric | null {
  return CAPACITY_METRICS.find((m) => m.name === name) ?? null;
}

/**
 * Returns the list of metrics that currently require action beyond
 * 'none'. Useful for dashboards.
 */
export function getMetricsRequiringAction(): readonly CapacityMetric[] {
  return CAPACITY_METRICS.filter((m) => m.actionRequired !== 'none');
}
