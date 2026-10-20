/**
 * Performance optimization targets.
 *
 * 18 targets across 8 areas. Each target has:
 *   - A name (stable identifier).
 *   - A metric description.
 *   - A target value (the value the team aims for).
 *   - A unit (ms, MB, %, count, ratio).
 *   - A direction (higher_is_better or lower_is_better).
 *
 * CRITICAL: performance optimizations MUST NOT violate financial
 * invariants. In particular:
 *   - Balance caching must invalidate on ANY financial mutation.
 *   - Floating-point math is NEVER used for amounts (always integer minor units).
 *
 * Pure data module — no I/O, no globals.
 */

// ---------------------------------------------------------------------------
// Target areas (8)
// ---------------------------------------------------------------------------

export type OptimizationArea =
  | 'startup'
  | 'search'
  | 'sync'
  | 'ocr'
  | 'memory'
  | 'battery'
  | 'database'
  | 'attachments';

export const OPTIMIZATION_AREAS: readonly OptimizationArea[] = [
  'startup',
  'search',
  'sync',
  'ocr',
  'memory',
  'battery',
  'database',
  'attachments',
] as const;

// ---------------------------------------------------------------------------
// Target unit + direction
// ---------------------------------------------------------------------------

export type TargetUnit = 'ms' | 'MB' | 'percent' | 'count' | 'ratio' | 'fps';

export type TargetDirection = 'higher_is_better' | 'lower_is_better';

// ---------------------------------------------------------------------------
// Target definition
// ---------------------------------------------------------------------------

export interface OptimizationTarget {
  /** Stable identifier (used in storage + dashboards). */
  readonly key: string;
  /** Optimization area. */
  readonly area: OptimizationArea;
  /** Human-readable label (no PII). */
  readonly label: string;
  /** What this target measures. */
  readonly description: string;
  /** Unit of measurement. */
  readonly unit: TargetUnit;
  /** Whether higher or lower values are better. */
  readonly direction: TargetDirection;
  /** Target value the team aims for. */
  readonly target: number;
  /** Value below/above which an alert fires. */
  readonly alertThreshold: number;
}

// ---------------------------------------------------------------------------
// The 18 targets
// ---------------------------------------------------------------------------

export const OPTIMIZATION_TARGETS: readonly OptimizationTarget[] = Object.freeze([
  // --- startup (3) ---
  {
    key: 'cold_start_ms',
    area: 'startup',
    label: 'Cold Start (ms)',
    description: 'Time from app launch to first interactive frame on cold start.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 2000,
    alertThreshold: 4000,
  },
  {
    key: 'warm_start_ms',
    area: 'startup',
    label: 'Warm Start (ms)',
    description: 'Time from app launch to first interactive frame on warm start.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 800,
    alertThreshold: 1500,
  },
  {
    key: 'time_to_first_expense_ms',
    area: 'startup',
    label: 'Time to First Expense (ms)',
    description: 'Time from app launch to the user being able to create an expense.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 3000,
    alertThreshold: 6000,
  },

  // --- search (2) ---
  {
    key: 'expense_search_p95_ms',
    area: 'search',
    label: 'Expense Search p95 (ms)',
    description: '95th percentile latency of expense search queries.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 100,
    alertThreshold: 500,
  },
  {
    key: 'group_search_p95_ms',
    area: 'search',
    label: 'Group Search p95 (ms)',
    description: '95th percentile latency of group search queries.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 50,
    alertThreshold: 250,
  },

  // --- sync (3) ---
  {
    key: 'sync_duration_p95_ms',
    area: 'sync',
    label: 'Sync Duration p95 (ms)',
    description: '95th percentile duration of a sync cycle.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 2000,
    alertThreshold: 10000,
  },
  {
    key: 'sync_conflict_rate',
    area: 'sync',
    label: 'Sync Conflict Rate',
    description: 'Fraction of sync cycles that produce a conflict.',
    unit: 'ratio',
    direction: 'lower_is_better',
    target: 0.01,
    alertThreshold: 0.05,
  },
  {
    key: 'sync_retry_count_p95',
    area: 'sync',
    label: 'Sync Retry Count p95',
    description: '95th percentile number of retries per sync cycle.',
    unit: 'count',
    direction: 'lower_is_better',
    target: 1,
    alertThreshold: 5,
  },

  // --- ocr (2) ---
  {
    key: 'ocr_extraction_p95_ms',
    area: 'ocr',
    label: 'OCR Extraction p95 (ms)',
    description: '95th percentile latency of OCR extraction.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 3000,
    alertThreshold: 8000,
  },
  {
    key: 'ocr_accuracy_rate',
    area: 'ocr',
    label: 'OCR Accuracy Rate',
    description: 'Fraction of OCR extractions accepted without correction.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.9,
    alertThreshold: 0.8,
  },

  // --- memory (3) ---
  {
    key: 'peak_memory_mb',
    area: 'memory',
    label: 'Peak Memory (MB)',
    description: 'Peak heap memory usage during normal operation.',
    unit: 'MB',
    direction: 'lower_is_better',
    target: 150,
    alertThreshold: 300,
  },
  {
    key: 'memory_leak_growth_mb_per_hour',
    area: 'memory',
    label: 'Memory Leak Growth (MB/hour)',
    description: 'Sustained memory growth per hour (a proxy for leaks).',
    unit: 'MB',
    direction: 'lower_is_better',
    target: 0,
    alertThreshold: 10,
  },
  {
    key: 'gc_pause_p95_ms',
    area: 'memory',
    label: 'GC Pause p95 (ms)',
    description: '95th percentile garbage-collection pause duration.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 50,
    alertThreshold: 200,
  },

  // --- battery (1) ---
  {
    key: 'battery_drain_percent_per_hour',
    area: 'battery',
    label: 'Battery Drain (%/hour)',
    description: 'Battery percentage drained per hour of normal usage.',
    unit: 'percent',
    direction: 'lower_is_better',
    target: 2,
    alertThreshold: 8,
  },

  // --- database (2) ---
  {
    key: 'db_query_p95_ms',
    area: 'database',
    label: 'DB Query p95 (ms)',
    description: '95th percentile latency of local SQLite queries.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 50,
    alertThreshold: 250,
  },
  {
    key: 'db_n_plus_one_query_count',
    area: 'database',
    label: 'DB N+1 Query Count',
    description: 'Number of N+1 query patterns detected per session.',
    unit: 'count',
    direction: 'lower_is_better',
    target: 0,
    alertThreshold: 5,
  },

  // --- attachments (2) ---
  {
    key: 'image_load_p95_ms',
    area: 'attachments',
    label: 'Image Load p95 (ms)',
    description: '95th percentile latency of loading a receipt thumbnail.',
    unit: 'ms',
    direction: 'lower_is_better',
    target: 200,
    alertThreshold: 1000,
  },
  {
    key: 'image_cache_hit_rate',
    area: 'attachments',
    label: 'Image Cache Hit Rate',
    description: 'Fraction of image loads served from cache.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.9,
    alertThreshold: 0.7,
  },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the given observed value crosses the alert threshold.
 *
 * For `higher_is_better` targets, an alert fires when the observed value
 * drops BELOW the threshold.
 *
 * For `lower_is_better` targets, an alert fires when the observed value
 * rises ABOVE the threshold.
 */
export function shouldAlertForTarget(
  target: OptimizationTarget,
  observedValue: number,
): boolean {
  if (target.direction === 'higher_is_better') {
    return observedValue < target.alertThreshold;
  }
  return observedValue > target.alertThreshold;
}

/**
 * Returns true when the observed value meets or exceeds the target.
 */
export function meetsTargetValue(
  target: OptimizationTarget,
  observedValue: number,
): boolean {
  if (target.direction === 'higher_is_better') {
    return observedValue >= target.target;
  }
  return observedValue <= target.target;
}

/**
 * Returns all targets in the given area.
 */
export function getTargetsByArea(area: OptimizationArea): readonly OptimizationTarget[] {
  return OPTIMIZATION_TARGETS.filter((t) => t.area === area);
}

/**
 * Returns the count of targets per area (for verification).
 */
export function getTargetCountByArea(): Readonly<Record<OptimizationArea, number>> {
  const counts: Record<OptimizationArea, number> = {
    startup: 0,
    search: 0,
    sync: 0,
    ocr: 0,
    memory: 0,
    battery: 0,
    database: 0,
    attachments: 0,
  };
  for (const t of OPTIMIZATION_TARGETS) {
    counts[t.area] = (counts[t.area] ?? 0) + 1;
  }
  return Object.freeze(counts);
}

/**
 * Returns a target by its key, or null if not found.
 */
export function getTargetByKey(key: string): OptimizationTarget | null {
  return OPTIMIZATION_TARGETS.find((t) => t.key === key) ?? null;
}
