/**
 * Roadmap planner — creates a quarterly roadmap from validated
 * features.
 *
 * Given a set of `FeatureValidationResult`s, the planner:
 *   1. Filters to results with `shouldImplement=true`.
 *   2. Sorts by recommended priority (`now` < `next` < `later`) then
 *      by user demand score (descending).
 *   3. Distributes them across N quarters (default 4) respecting:
 *        - Prerequisites ship in an earlier quarter than the feature
 *          that depends on them.
 *        - Capacity per quarter (default 60 dev-days).
 *        - Risk level (high-risk features need an extra review
 *          quarter — they ship one quarter later than they would
 *          otherwise).
 *
 * The planner is a PURE function — no I/O, no globals.
 *
 * See `docs/product-roadmap.md`.
 */

import type { FeatureCandidate, FeatureKey } from './feature-candidate';
import type { FeatureValidationResult, RecommendedPriority } from './feature-validator';

// ---------------------------------------------------------------------------
// Inputs + outputs
// ---------------------------------------------------------------------------

export interface RoadmapEntry {
  readonly featureKey: FeatureKey;
  readonly featureName: string;
  readonly quarter: number; // 1-indexed
  readonly priority: RecommendedPriority;
  readonly estimatedDevDays: number;
  readonly userDemandScore: number;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly prerequisites: readonly FeatureKey[];
  readonly confidenceLevel: 'low' | 'medium' | 'high';
}

export interface QuarterlyRoadmap {
  readonly quarters: readonly QuarterPlan[];
  readonly totalFeatures: number;
  readonly totalDevDays: number;
  readonly deferredFeatures: readonly FeatureKey[]; // features that didn't fit
}

export interface QuarterPlan {
  readonly quarter: number; // 1-indexed
  readonly label: string;
  readonly entries: readonly RoadmapEntry[];
  readonly plannedDevDays: number;
  readonly capacityDevDays: number;
  readonly isOverCapacity: boolean;
}

export interface RoadmapPlannerInput {
  /** Validated features (each carries the feature candidate + result). */
  readonly items: readonly {
    readonly candidate: FeatureCandidate;
    readonly result: FeatureValidationResult;
    readonly estimatedDevDays: number;
  }[];
  /** Number of quarters to plan (default 4). */
  readonly quarterCount?: number;
  /** Capacity per quarter in dev-days (default 60). */
  readonly capacityPerQuarterDevDays?: number;
  /** Whether high-risk features get an extra review quarter (default true). */
  readonly deferHighRisk?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_QUARTER_COUNT = 4;
export const DEFAULT_CAPACITY_PER_QUARTER_DEV_DAYS = 60;
export const QUARTER_LABELS: readonly string[] = [
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'Q5',
  'Q6',
  'Q7',
  'Q8',
] as const;

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Readonly<Record<RecommendedPriority, number>> = Object.freeze({
  now: 0,
  next: 1,
  later: 2,
  never: 3,
});

/**
 * Returns the rank of a recommended priority (lower = more urgent).
 * Used by the planner's sort comparator.
 */
function priorityRank(priority: RecommendedPriority): number {
  return PRIORITY_RANK[priority];
}

/**
 * Plan a quarterly roadmap.
 *
 * Algorithm:
 *   1. Filter to items with `shouldImplement=true`.
 *   2. Sort by priority (now < next < later) then by user demand
 *      score descending.
 *   3. For each item, find the earliest quarter where:
 *        - All prerequisites have been scheduled in an earlier
 *          quarter.
 *        - The quarter has remaining capacity (sum of planned dev-days
 *          + this item's dev-days <= capacity).
 *        - If `deferHighRisk` is true AND the item is high-risk, the
 *          quarter must be >= 2 (extra review quarter).
 *   4. Items that don't fit any quarter go into `deferredFeatures`.
 */
export function planRoadmap(input: RoadmapPlannerInput): QuarterlyRoadmap {
  if (!input || typeof input !== 'object') {
    throw new Error('input must be a RoadmapPlannerInput object');
  }
  if (!Array.isArray(input.items)) {
    throw new Error('input.items must be an array');
  }
  const quarterCount = input.quarterCount ?? DEFAULT_QUARTER_COUNT;
  if (!Number.isInteger(quarterCount) || quarterCount <= 0) {
    throw new Error(`quarterCount must be a positive integer, got ${quarterCount}`);
  }
  const capacityPerQuarter = input.capacityPerQuarterDevDays ?? DEFAULT_CAPACITY_PER_QUARTER_DEV_DAYS;
  if (!Number.isFinite(capacityPerQuarter) || capacityPerQuarter <= 0) {
    throw new Error(`capacityPerQuarterDevDays must be positive, got ${capacityPerQuarter}`);
  }
  const deferHighRisk = input.deferHighRisk ?? true;

  // 1. Filter to shouldImplement items.
  const actionable = input.items.filter((item) => item.result.shouldImplement);

  // 2. Sort by priority then user demand score.
  const sorted = actionable.slice().sort((a, b) => {
    const pa = priorityRank(a.result.recommendedPriority);
    const pb = priorityRank(b.result.recommendedPriority);
    if (pa !== pb) return pa - pb;
    return b.candidate.userDemandScore - a.candidate.userDemandScore;
  });

  // 3. Distribute across quarters.
  const quarters: QuarterPlanInternal[] = Array.from({ length: quarterCount }, (_, i) => ({
    quarter: i + 1,
    label: QUARTER_LABELS[i] ?? `Q${i + 1}`,
    entries: [],
    plannedDevDays: 0,
    capacityDevDays: capacityPerQuarter,
  }));

  const scheduled = new Map<FeatureKey, number>(); // featureKey → quarter
  const deferred: FeatureKey[] = [];

  for (const item of sorted) {
    const minQuarter = computeMinQuarter(item.candidate, scheduled, deferHighRisk);
    const scheduledQuarter = trySchedule(quarters, item, minQuarter);
    if (scheduledQuarter === null) {
      deferred.push(item.candidate.key);
    } else {
      scheduled.set(item.candidate.key, scheduledQuarter);
    }
  }

  // 4. Build the output shape.
  const quarterPlans: QuarterPlan[] = quarters.map((q) => ({
    quarter: q.quarter,
    label: q.label,
    entries: Object.freeze(q.entries),
    plannedDevDays: q.plannedDevDays,
    capacityDevDays: q.capacityDevDays,
    isOverCapacity: q.plannedDevDays > q.capacityDevDays,
  }));

  const totalFeatures = quarterPlans.reduce((sum, q) => sum + q.entries.length, 0);
  const totalDevDays = quarterPlans.reduce((sum, q) => sum + q.plannedDevDays, 0);

  return Object.freeze({
    quarters: Object.freeze(quarterPlans),
    totalFeatures,
    totalDevDays,
    deferredFeatures: Object.freeze(deferred),
  });
}

interface QuarterPlanInternal {
  readonly quarter: number;
  readonly label: string;
  entries: RoadmapEntry[];
  plannedDevDays: number;
  readonly capacityDevDays: number;
}

/**
 * Compute the earliest quarter this feature can ship in. Considers:
 *   - Prerequisites must ship in an earlier quarter.
 *   - High-risk features get +1 quarter delay (when deferHighRisk is
 *     true).
 */
function computeMinQuarter(
  candidate: FeatureCandidate,
  scheduled: ReadonlyMap<FeatureKey, number>,
  deferHighRisk: boolean,
): number {
  let min = 1;
  for (const pre of candidate.prerequisites) {
    const preQuarter = scheduled.get(pre);
    if (preQuarter === undefined) {
      // Prerequisite not yet scheduled — defer this feature past the
      // last quarter (i.e. it won't fit).
      min = Number.MAX_SAFE_INTEGER;
      break;
    }
    min = Math.max(min, preQuarter + 1);
  }
  if (deferHighRisk && candidate.riskLevel === 'high' && min !== Number.MAX_SAFE_INTEGER) {
    min = Math.max(min, 2);
  }
  return min;
}

/**
 * Try to schedule an item in the earliest quarter that has capacity.
 * Returns the quarter number, or null if no quarter can fit it.
 */
function trySchedule(
  quarters: QuarterPlanInternal[],
  item: { candidate: FeatureCandidate; result: FeatureValidationResult; estimatedDevDays: number },
  minQuarter: number,
): number | null {
  for (const q of quarters) {
    if (q.quarter < minQuarter) continue;
    if (q.plannedDevDays + item.estimatedDevDays <= q.capacityDevDays) {
      const entry: RoadmapEntry = Object.freeze({
        featureKey: item.candidate.key,
        featureName: item.candidate.name,
        quarter: q.quarter,
        priority: item.result.recommendedPriority,
        estimatedDevDays: item.estimatedDevDays,
        userDemandScore: item.candidate.userDemandScore,
        riskLevel: item.candidate.riskLevel,
        prerequisites: Object.freeze([...item.candidate.prerequisites]),
        confidenceLevel: item.result.confidenceLevel,
      });
      q.entries.push(entry);
      q.plannedDevDays += item.estimatedDevDays;
      return q.quarter;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the count of features per quarter. Useful for quick
 * dashboards.
 */
export function featuresPerQuarter(roadmap: QuarterlyRoadmap): readonly number[] {
  return Object.freeze(roadmap.quarters.map((q) => q.entries.length));
}

/**
 * Returns true when any quarter in the roadmap is over capacity.
 */
export function hasOverCapacityQuarter(roadmap: QuarterlyRoadmap): boolean {
  return roadmap.quarters.some((q) => q.isOverCapacity);
}
