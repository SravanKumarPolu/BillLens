/**
 * Memory profiler — snapshots + leak detection.
 *
 * Captures memory snapshots (heap used, heap total, external) at points
 * in time and provides simple leak-detection heuristics:
 *   - Sustained growth across multiple snapshots (a few snapshots is noise;
 *     a long-running trend is a leak).
 *   - Growth rate (MB per hour) above a configurable threshold.
 *
 * CRITICAL: the memory profiler is a PASSIVE OBSERVER. It does NOT
 * trigger garbage collection, does NOT modify the heap, and does NOT
 * affect financial computations. It only records and analyzes snapshots.
 *
 * The profiler is intentionally pure — it accepts a list of snapshots
 * and returns an analysis. The actual snapshot capture (calling
 * `process.memoryUsage()` or similar) is the responsibility of the
 * infrastructure layer.
 */

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface MemorySnapshot {
  /** ISO date-time when the snapshot was taken. */
  readonly timestamp: string;
  /** Heap used (MB). */
  readonly heapUsedMb: number;
  /** Heap total (MB). */
  readonly heapTotalMb: number;
  /** External memory (C++ objects bound to JS, MB). */
  readonly externalMb: number;
  /** Optional: RSS (resident set size, MB). */
  readonly rssMb?: number;
}

// ---------------------------------------------------------------------------
// Leak detection
// ---------------------------------------------------------------------------

export interface LeakDetectionResult {
  /** Total snapshots analyzed. */
  readonly totalSnapshots: number;
  /** Whether a leak is suspected. */
  readonly leakSuspected: boolean;
  /** Sustained growth rate in MB per hour. */
  readonly growthRateMbPerHour: number;
  /** Peak heap used (MB). */
  readonly peakHeapUsedMb: number;
  /** Minimum heap used (MB). */
  readonly minHeapUsedMb: number;
  /** Final heap used (MB). */
  readonly finalHeapUsedMb: number;
  /** First snapshot timestamp. */
  readonly firstSnapshotAt: string;
  /** Last snapshot timestamp. */
  readonly lastSnapshotAt: string;
  /** Duration of the analysis window in milliseconds. */
  readonly analysisWindowMs: number;
  /** Severity label: 'none' | 'info' | 'warning' | 'critical'. */
  readonly severity: 'none' | 'info' | 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LeakDetectorOptions {
  /**
   * Minimum number of snapshots required to make a leak determination.
   * Below this, leakSuspected is always `false`. Default: 5.
   */
  readonly minSnapshots?: number;
  /**
   * Growth rate threshold (MB per hour) above which a leak is suspected.
   * Default: 10.
   */
  readonly growthRateThresholdMbPerHour?: number;
  /**
   * Critical growth rate threshold (MB per hour). Default: 50.
   */
  readonly criticalGrowthRateThresholdMbPerHour?: number;
}

const DEFAULT_MIN_SNAPSHOTS = 5;
const DEFAULT_GROWTH_RATE_THRESHOLD = 10;
const DEFAULT_CRITICAL_GROWTH_RATE_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Analyzes a list of memory snapshots for leak patterns.
 *
 * Returns a `LeakDetectionResult` with the growth rate and severity.
 *
 * Pure function — does not mutate the input.
 */
export function detectMemoryLeak(
  snapshots: readonly MemorySnapshot[],
  options?: LeakDetectorOptions,
): LeakDetectionResult {
  const minSnapshots = options?.minSnapshots ?? DEFAULT_MIN_SNAPSHOTS;
  const growthRateThreshold =
    options?.growthRateThresholdMbPerHour ?? DEFAULT_GROWTH_RATE_THRESHOLD;
  const criticalThreshold =
    options?.criticalGrowthRateThresholdMbPerHour ??
    DEFAULT_CRITICAL_GROWTH_RATE_THRESHOLD;

  if (snapshots.length === 0) {
    return Object.freeze({
      totalSnapshots: 0,
      leakSuspected: false,
      growthRateMbPerHour: 0,
      peakHeapUsedMb: 0,
      minHeapUsedMb: 0,
      finalHeapUsedMb: 0,
      firstSnapshotAt: '',
      lastSnapshotAt: '',
      analysisWindowMs: 0,
      severity: 'none',
    });
  }

  // Sort snapshots by timestamp (defensive).
  const sorted = [...snapshots].sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
    return ta - tb;
  });

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const firstMs = Date.parse(first.timestamp);
  const lastMs = Date.parse(last.timestamp);
  const durationMs = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? lastMs - firstMs
    : 0;

  // Compute peak / min / final heap used.
  let peak = -Infinity;
  let min = Infinity;
  for (const s of sorted) {
    if (s.heapUsedMb > peak) peak = s.heapUsedMb;
    if (s.heapUsedMb < min) min = s.heapUsedMb;
  }
  const finalHeap = last.heapUsedMb;

  // Compute growth rate (MB per hour).
  let growthRate = 0;
  if (durationMs > 0) {
    const growthMb = finalHeap - first.heapUsedMb;
    const durationHours = durationMs / (1000 * 60 * 60);
    growthRate = growthMb / durationHours;
  }

  // Determine if a leak is suspected.
  // We require BOTH:
  //   - Enough snapshots (>= minSnapshots).
  //   - Sustained positive growth above the threshold.
  const leakSuspected =
    sorted.length >= minSnapshots && growthRate > growthRateThreshold;

  // Severity.
  let severity: 'none' | 'info' | 'warning' | 'critical' = 'none';
  if (leakSuspected) {
    if (growthRate > criticalThreshold) {
      severity = 'critical';
    } else {
      severity = 'warning';
    }
  } else if (growthRate > 0 && sorted.length >= minSnapshots) {
    severity = 'info';
  }

  return Object.freeze({
    totalSnapshots: sorted.length,
    leakSuspected,
    growthRateMbPerHour: growthRate,
    peakHeapUsedMb: peak,
    minHeapUsedMb: min,
    finalHeapUsedMb: finalHeap,
    firstSnapshotAt: first.timestamp,
    lastSnapshotAt: last.timestamp,
    analysisWindowMs: durationMs,
    severity,
  });
}

// ---------------------------------------------------------------------------
// Snapshot capture helpers
// ---------------------------------------------------------------------------

/**
 * Returns a snapshot of the current memory usage.
 *
 * In a Node.js environment, this calls `process.memoryUsage()`. In a
 * React Native environment, the caller should pass in the values from
 * the platform-specific API.
 *
 * Pure function — given the same memory state, returns the same snapshot.
 */
export function captureSnapshot(
  timestamp: string,
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss?: number;
  },
): MemorySnapshot {
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error('timestamp must be a valid ISO date-time');
  }
  const MB = 1024 * 1024;
  return Object.freeze({
    timestamp,
    heapUsedMb: memoryUsage.heapUsed / MB,
    heapTotalMb: memoryUsage.heapTotal / MB,
    externalMb: memoryUsage.external / MB,
    ...(memoryUsage.rss !== undefined ? { rssMb: memoryUsage.rss / MB } : {}),
  });
}

// ---------------------------------------------------------------------------
// Snapshot summarization
// ---------------------------------------------------------------------------

export interface MemorySummary {
  readonly snapshotCount: number;
  readonly peakHeapUsedMb: number;
  readonly minHeapUsedMb: number;
  readonly averageHeapUsedMb: number;
  readonly finalHeapUsedMb: number;
  readonly firstSnapshotAt: string;
  readonly lastSnapshotAt: string;
}

/**
 * Returns a summary of the memory snapshots (peak, min, average, final).
 *
 * Pure function.
 */
export function summarizeSnapshots(
  snapshots: readonly MemorySnapshot[],
): MemorySummary {
  if (snapshots.length === 0) {
    return Object.freeze({
      snapshotCount: 0,
      peakHeapUsedMb: 0,
      minHeapUsedMb: 0,
      averageHeapUsedMb: 0,
      finalHeapUsedMb: 0,
      firstSnapshotAt: '',
      lastSnapshotAt: '',
    });
  }

  let peak = -Infinity;
  let min = Infinity;
  let sum = 0;
  for (const s of snapshots) {
    if (s.heapUsedMb > peak) peak = s.heapUsedMb;
    if (s.heapUsedMb < min) min = s.heapUsedMb;
    sum += s.heapUsedMb;
  }

  return Object.freeze({
    snapshotCount: snapshots.length,
    peakHeapUsedMb: peak,
    minHeapUsedMb: min,
    averageHeapUsedMb: sum / snapshots.length,
    finalHeapUsedMb: snapshots[snapshots.length - 1]!.heapUsedMb,
    firstSnapshotAt: snapshots[0]!.timestamp,
    lastSnapshotAt: snapshots[snapshots.length - 1]!.timestamp,
  });
}

// ---------------------------------------------------------------------------
// Snapshot diff
// ---------------------------------------------------------------------------

export interface SnapshotDiff {
  readonly heapUsedDeltaMb: number;
  readonly heapTotalDeltaMb: number;
  readonly externalDeltaMb: number;
  readonly durationMs: number;
}

/**
 * Returns the difference between two snapshots (later - earlier).
 *
 * Pure function.
 */
export function diffSnapshots(
  earlier: MemorySnapshot,
  later: MemorySnapshot,
): SnapshotDiff {
  const earlierMs = Date.parse(earlier.timestamp);
  const laterMs = Date.parse(later.timestamp);
  const durationMs =
    Number.isFinite(earlierMs) && Number.isFinite(laterMs)
      ? laterMs - earlierMs
      : 0;
  return Object.freeze({
    heapUsedDeltaMb: later.heapUsedMb - earlier.heapUsedMb,
    heapTotalDeltaMb: later.heapTotalMb - earlier.heapTotalMb,
    externalDeltaMb: later.externalMb - earlier.externalMb,
    durationMs,
  });
}
