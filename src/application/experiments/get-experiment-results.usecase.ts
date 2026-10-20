/**
 * Use case: Get experiment results.
 *
 * Loads the experiment definition, fetches per-variant counts from the
 * repository, and computes statistical significance.
 *
 * Returns a structured `ExperimentResultOutput` that includes:
 *   - Per-variant trial / success / conversion-rate.
 *   - Z-test p-value + significance flag for each treatment vs. control.
 *   - 95% confidence interval for the lift.
 *   - Whether the experiment meets the minimum sample size threshold.
 *
 * CRITICAL: the result output NEVER contains participant IDs, raw event
 * payloads, or PII. Only aggregate counts and derived statistics.
 */

import {
  computeExperimentResults,
  type ExperimentStatisticalResult,
  type ExperimentVariant,
} from '@domain/experiments';

import type { ExperimentRepository } from './experiment-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface GetExperimentResultsInput {
  readonly experimentId: string;
  /** Minimum trials per variant for the experiment to be considered "ready". */
  readonly minimumPerVariant?: number;
}

export interface GetExperimentResultsOutput {
  readonly experimentId: string;
  readonly found: boolean;
  readonly result: ExperimentStatisticalResult | null;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class GetExperimentResultsUseCase {
  constructor(private readonly repo: ExperimentRepository) {}

  async execute(
    input: GetExperimentResultsInput,
  ): Promise<GetExperimentResultsOutput> {
    const experiment = await this.repo.findExperimentById(input.experimentId);
    if (experiment === null) {
      return { experimentId: input.experimentId, found: false, result: null };
    }

    const counts = await this.repo.countVariantResults(input.experimentId);

    // Build the per-variant stats array. Control is always first.
    const controlVariant: ExperimentVariant = 'control';
    const orderedVariants: ExperimentVariant[] = [
      controlVariant,
      ...counts
        .map((c) => c.variant)
        .filter((v) => v !== controlVariant),
    ];

    // Deduplicate — keep one entry per variant.
    const seen = new Set<ExperimentVariant>();
    const uniqueVariants = orderedVariants.filter((v) => {
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });

    if (uniqueVariants.length < 2) {
      // Not enough variants to compute results.
      return {
        experimentId: input.experimentId,
        found: true,
        result: null,
      };
    }

    const stats = uniqueVariants.map((v) => {
      const c = counts.find((x) => x.variant === v);
      return {
        variant: v,
        trials: c?.trials ?? 0,
        successes: c?.successes ?? 0,
      };
    });

    const minimumPerVariant = input.minimumPerVariant ?? 30;
    const result = computeExperimentResults(
      input.experimentId,
      stats,
      minimumPerVariant,
    );

    return {
      experimentId: input.experimentId,
      found: true,
      result,
    };
  }
}
