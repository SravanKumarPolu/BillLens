/**
 * Repository port for experiment persistence.
 *
 * Implementations MUST persist experiment definitions and assignment
 * records. Assignment records are write-once — once a participant is
 * assigned to a variant, that assignment is immutable.
 */

import type { Experiment, ExperimentVariant } from '@domain/experiments';

// ---------------------------------------------------------------------------
// Assignment record
// ---------------------------------------------------------------------------

export interface ExperimentAssignment {
  /** Stable identifier (UUID). */
  readonly id: string;
  readonly experimentId: string;
  /** Anonymous participant ID (never an email, phone, or user PII). */
  readonly participantId: string;
  readonly variant: ExperimentVariant;
  /** ISO date-time when the assignment was made. */
  readonly assignedAt: string;
}

// ---------------------------------------------------------------------------
// Variant counts (for result aggregation)
// ---------------------------------------------------------------------------

export interface VariantCount {
  readonly variant: ExperimentVariant;
  readonly trials: number;
  readonly successes: number;
}

// ---------------------------------------------------------------------------
// Repository port
// ---------------------------------------------------------------------------

export interface ExperimentRepository {
  /** Persist an experiment definition. Idempotent by `id`. */
  saveExperiment(experiment: Experiment): Promise<void>;

  /** Fetch an experiment definition by id. Returns null if not found. */
  findExperimentById(id: string): Promise<Experiment | null>;

  /** Return all currently-running experiments. */
  findRunningExperiments(nowIso: string): Promise<readonly Experiment[]>;

  /** Persist an assignment record. Idempotent by `id`. */
  saveAssignment(assignment: ExperimentAssignment): Promise<void>;

  /** Look up the existing assignment for a participant, if any. */
  findAssignment(
    experimentId: string,
    participantId: string,
  ): Promise<ExperimentAssignment | null>;

  /** Return aggregated variant counts for an experiment. */
  countVariantResults(experimentId: string): Promise<readonly VariantCount[]>;
}
