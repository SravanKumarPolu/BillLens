/**
 * Repository port for performance benchmark persistence.
 *
 * Implementations persist benchmark runs (a snapshot of all optimization
 * targets + observed values) and retrieve historical runs for trend
 * analysis.
 */

import type { OptimizationTarget } from '@domain/performance';

// ---------------------------------------------------------------------------
// Benchmark result
// ---------------------------------------------------------------------------

export interface BenchmarkMeasurement {
  /** Target key (matches `OptimizationTarget.key`). */
  readonly targetKey: string;
  /** Observed value. */
  readonly observedValue: number;
  /** Whether the observed value meets the target. */
  readonly meetsTarget: boolean;
  /** Whether the observed value crossed the alert threshold. */
  readonly shouldAlert: boolean;
}

export interface BenchmarkRun {
  /** Stable identifier (UUID). */
  readonly id: string;
  /** ISO date-time when the run was executed. */
  readonly executedAt: string;
  /** App version that produced the run. */
  readonly appVersion: string;
  /** Platform that produced the run. */
  readonly platform: 'ios' | 'android' | 'web';
  /** Per-target measurements. */
  readonly measurements: readonly BenchmarkMeasurement[];
}

// ---------------------------------------------------------------------------
// Repository port
// ---------------------------------------------------------------------------

export interface PerformanceBenchmarkRepository {
  /** Persist a benchmark run. Idempotent by `id`. */
  saveRun(run: BenchmarkRun): Promise<void>;

  /** Fetch a benchmark run by id. Returns null if not found. */
  findRunById(id: string): Promise<BenchmarkRun | null>;

  /** Return the most recent N runs (most-recent first). */
  findRecentRuns(limit: number): Promise<readonly BenchmarkRun[]>;

  /** Return all runs in the given time window. */
  findRunsInWindow(fromIso: string, toIso: string): Promise<readonly BenchmarkRun[]>;
}

// ---------------------------------------------------------------------------
// Benchmark collector port
// ---------------------------------------------------------------------------

/**
 * Port for collecting live performance measurements.
 *
 * Implementations measure the actual values for each optimization target.
 * The use case orchestrates: collect → measure → compare against targets
 * → persist.
 */
export interface PerformanceBenchmarkCollector {
  /** Returns the observed value for the given target key, or null. */
  measure(target: OptimizationTarget): Promise<number | null>;
}
