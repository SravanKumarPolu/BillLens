/**
 * Use case: Run performance optimization benchmarks.
 *
 * Orchestrates:
 *   1. For each of the 18 optimization targets, collect a live measurement
 *      via the `PerformanceBenchmarkCollector`.
 *   2. Compare the observed value against the target (meets target? should
 *      alert?).
 *   3. Persist the benchmark run via the `PerformanceBenchmarkRepository`.
 *
 * CRITICAL: this use case is a PASSIVE OBSERVER. It does NOT modify the
 * app's behavior, does NOT trigger garbage collection, does NOT clear
 * caches, and does NOT affect financial computations.
 */

import {
  OPTIMIZATION_TARGETS,
  meetsTargetValue,
  shouldAlertForTarget,
} from '@domain/performance';

import type {
  PerformanceBenchmarkCollector,
  PerformanceBenchmarkRepository,
} from './performance-benchmark-repository.port';
import type {
  BenchmarkMeasurement,
  BenchmarkRun,
} from './performance-benchmark-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface RunOptimizationBenchmarksInput {
  /** Stable identifier (UUID) for this benchmark run. */
  readonly runId: string;
  /** ISO date-time when the run was executed. */
  readonly executedAt: string;
  /** App version that produced the run. */
  readonly appVersion: string;
  /** Platform that produced the run. */
  readonly platform: 'ios' | 'android' | 'web';
}

export interface RunOptimizationBenchmarksOutput {
  readonly runId: string;
  readonly executedAt: string;
  readonly measurementCount: number;
  readonly targetsMetCount: number;
  readonly alertsTriggeredCount: number;
  readonly measurements: readonly BenchmarkMeasurement[];
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class RunOptimizationBenchmarksUseCase {
  constructor(
    private readonly collector: PerformanceBenchmarkCollector,
    private readonly repo: PerformanceBenchmarkRepository,
  ) {}

  async execute(
    input: RunOptimizationBenchmarksInput,
  ): Promise<RunOptimizationBenchmarksOutput> {
    if (input.runId.trim().length === 0) {
      throw new Error('runId must not be empty');
    }
    if (Number.isNaN(Date.parse(input.executedAt))) {
      throw new Error('executedAt must be a valid ISO date-time');
    }
    if (input.appVersion.trim().length === 0) {
      throw new Error('appVersion must not be empty');
    }

    // Collect measurements for each target.
    const measurements: BenchmarkMeasurement[] = [];
    for (const target of OPTIMIZATION_TARGETS) {
      const observed = await this.collector.measure(target);
      if (observed === null || typeof observed !== 'number' || !Number.isFinite(observed)) {
        // Skip targets that couldn't be measured.
        continue;
      }
      measurements.push({
        targetKey: target.key,
        observedValue: observed,
        meetsTarget: meetsTargetValue(target, observed),
        shouldAlert: shouldAlertForTarget(target, observed),
      });
    }

    // Persist the run.
    const run: BenchmarkRun = {
      id: input.runId,
      executedAt: input.executedAt,
      appVersion: input.appVersion,
      platform: input.platform,
      measurements: Object.freeze(measurements),
    };
    await this.repo.saveRun(run);

    // Summarize.
    const targetsMetCount = measurements.filter((m) => m.meetsTarget).length;
    const alertsTriggeredCount = measurements.filter((m) => m.shouldAlert).length;

    return {
      runId: run.id,
      executedAt: run.executedAt,
      measurementCount: measurements.length,
      targetsMetCount,
      alertsTriggeredCount,
      measurements: run.measurements,
    };
  }
}
