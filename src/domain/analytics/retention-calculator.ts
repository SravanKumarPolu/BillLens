/**
 * D1 / D7 / D30 retention calculator.
 *
 * Computes the fraction of new installations that were active 1, 7, and
 * 30 days after their first launch. Uses ANONYMOUS installation IDs
 * only — never emails, phone numbers, or user IDs.
 *
 * Algorithm:
 *   - For each cohort (installations first seen on day D), count how
 *     many were active on day D+1, D+7, D+30.
 *   - Retention rate = (active on D+N) / (cohort size).
 *
 * Pure function — no I/O, no side effects. Takes pre-aggregated cohort
 * data as input.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A cohort of installations first seen on the same day.
 */
export interface InstallCohort {
  /** ISO date (YYYY-MM-DD) when the cohort first launched. */
  readonly cohortDate: string;
  /** Anonymous installation IDs in this cohort. */
  readonly installationIds: readonly string[];
}

/**
 * A record of which installations were active on a given day.
 */
export interface ActivitySnapshot {
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  /** Anonymous installation IDs active on this day. */
  readonly activeInstallationIds: readonly string[];
}

export interface RetentionResult {
  readonly cohortDate: string;
  readonly cohortSize: number;
  readonly retainedD1: number;
  readonly retainedD7: number;
  readonly retainedD30: number;
  readonly retentionD1: number;
  readonly retentionD7: number;
  readonly retentionD30: number;
}

export interface RetentionAggregate {
  readonly cohorts: readonly RetentionResult[];
  readonly averageRetentionD1: number;
  readonly averageRetentionD7: number;
  readonly averageRetentionD30: number;
  readonly totalCohortSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ISO date string (YYYY-MM-DD or full ISO) to a day-granular
 * YYYY-MM-DD string. Returns null for unparseable input.
 */
export function toDayBucket(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Add N days to a YYYY-MM-DD string. Returns the resulting YYYY-MM-DD,
 * or null if the input is unparseable.
 */
export function addDays(dayBucket: string, days: number): string | null {
  const ms = Date.parse(`${dayBucket}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Build a map of date → set of active installation IDs.
 */
function buildActivityMap(
  snapshots: readonly ActivitySnapshot[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const snap of snapshots) {
    const day = toDayBucket(snap.date);
    if (day === null) continue;
    let set = map.get(day);
    if (!set) {
      set = new Set<string>();
      map.set(day, set);
    }
    for (const id of snap.activeInstallationIds) {
      set.add(id);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Calculator
// ---------------------------------------------------------------------------

/**
 * Compute D1/D7/D30 retention for a single cohort.
 *
 * @param cohort           The install cohort.
 * @param activityMap     Map of YYYY-MM-DD → set of active installation IDs.
 *
 * Returns null if the cohort is empty.
 */
export function computeCohortRetention(
  cohort: InstallCohort,
  activityMap: Map<string, Set<string>>,
): RetentionResult | null {
  if (cohort.installationIds.length === 0) return null;

  const cohortSize = cohort.installationIds.length;
  const cohortSet = new Set(cohort.installationIds);

  const d1Day = addDays(cohort.cohortDate, 1);
  const d7Day = addDays(cohort.cohortDate, 7);
  const d30Day = addDays(cohort.cohortDate, 30);

  const retainedD1 = d1Day ? countIntersection(cohortSet, activityMap.get(d1Day)) : 0;
  const retainedD7 = d7Day ? countIntersection(cohortSet, activityMap.get(d7Day)) : 0;
  const retainedD30 = d30Day ? countIntersection(cohortSet, activityMap.get(d30Day)) : 0;

  return {
    cohortDate: cohort.cohortDate,
    cohortSize,
    retainedD1,
    retainedD7,
    retainedD30,
    retentionD1: retainedD1 / cohortSize,
    retentionD7: retainedD7 / cohortSize,
    retentionD30: retainedD30 / cohortSize,
  };
}

/**
 * Compute retention across multiple cohorts. Returns an aggregate with
 * average D1/D7/D30 retention weighted by cohort size.
 */
export function computeRetentionAggregate(
  cohorts: readonly InstallCohort[],
  snapshots: readonly ActivitySnapshot[],
): RetentionAggregate {
  const activityMap = buildActivityMap(snapshots);
  const results: RetentionResult[] = [];
  let totalCohortSize = 0;
  let sumD1 = 0;
  let sumD7 = 0;
  let sumD30 = 0;

  for (const cohort of cohorts) {
    const result = computeCohortRetention(cohort, activityMap);
    if (result === null) continue;
    results.push(result);
    totalCohortSize += result.cohortSize;
    sumD1 += result.retainedD1;
    sumD7 += result.retainedD7;
    sumD30 += result.retainedD30;
  }

  const averageRetentionD1 = totalCohortSize > 0 ? sumD1 / totalCohortSize : 0;
  const averageRetentionD7 = totalCohortSize > 0 ? sumD7 / totalCohortSize : 0;
  const averageRetentionD30 = totalCohortSize > 0 ? sumD30 / totalCohortSize : 0;

  return {
    cohorts: results,
    averageRetentionD1,
    averageRetentionD7,
    averageRetentionD30,
    totalCohortSize,
  };
}

/**
 * Count how many of `cohort` are also in `active`.
 */
function countIntersection(cohort: Set<string>, active: Set<string> | undefined): number {
  if (!active) return 0;
  let count = 0;
  for (const id of cohort) {
    if (active.has(id)) count += 1;
  }
  return count;
}
