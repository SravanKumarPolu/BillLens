/**
 * Use case: Assign a variant to a participant.
 *
 * Steps:
 *   1. Load the experiment definition.
 *   2. If the experiment is not running or out of date window, return
 *      `variant: null` (no assignment).
 *   3. Check for an existing assignment — if one exists, return it
 *      (assignments are immutable once made).
 *   4. Validate the experiment is safe (does not touch financial areas).
 *      If unsafe, refuse to assign and return an error result.
 *   5. Compute the deterministic variant assignment.
 *   6. Persist the new assignment.
 *
 * CRITICAL: the use case NEVER assigns a participant to an experiment
 * that touches a financial area. The safety guard is consulted before
 * any assignment is made — even if a malformed experiment definition
 * somehow reaches the repository.
 */

import {
  assignVariant,
  isExperimentActive,
  validateExperimentDoesNotAffectFinance,
  type ExperimentVariant,
} from '@domain/experiments';

import type {
  ExperimentAssignment,
  ExperimentRepository,
} from './experiment-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface AssignVariantInput {
  readonly experimentId: string;
  readonly participantId: string;
  readonly nowIso: string;
}

export interface AssignVariantOutput {
  readonly variant: ExperimentVariant | null;
  readonly reason:
    | 'assigned'
    | 'already_assigned'
    | 'experiment_not_found'
    | 'experiment_not_active'
    | 'experiment_unsafe'
    | 'excluded_from_traffic';
  readonly assignmentId: string | null;
  readonly assignedAt: string | null;
  readonly violations?: readonly string[];
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class AssignVariantUseCase {
  constructor(private readonly repo: ExperimentRepository) {}

  async execute(input: AssignVariantInput): Promise<AssignVariantOutput> {
    // 1. Load experiment.
    const experiment = await this.repo.findExperimentById(input.experimentId);
    if (experiment === null) {
      return {
        variant: null,
        reason: 'experiment_not_found',
        assignmentId: null,
        assignedAt: null,
      };
    }

    // 2. Check for existing assignment — assignments are immutable.
    const existing = await this.repo.findAssignment(
      input.experimentId,
      input.participantId,
    );
    if (existing !== null) {
      return {
        variant: existing.variant,
        reason: 'already_assigned',
        assignmentId: existing.id,
        assignedAt: existing.assignedAt,
      };
    }

    // 3. Validate experiment safety BEFORE any assignment logic.
    const safety = validateExperimentDoesNotAffectFinance(experiment);
    if (!safety.safe) {
      return {
        variant: null,
        reason: 'experiment_unsafe',
        assignmentId: null,
        assignedAt: null,
        violations: safety.violations,
      };
    }

    // 4. Check experiment is currently active.
    if (!isExperimentActive(experiment, input.nowIso)) {
      return {
        variant: null,
        reason: 'experiment_not_active',
        assignmentId: null,
        assignedAt: null,
      };
    }

    // 5. Deterministic assignment.
    const variant = assignVariant(experiment, input.participantId);
    if (variant === null) {
      // Participant falls outside the traffic allocation bucket.
      return {
        variant: null,
        reason: 'excluded_from_traffic',
        assignmentId: null,
        assignedAt: null,
      };
    }

    // 6. Persist assignment.
    const assignmentId = `${experiment.id}:${input.participantId}`;
    const assignment: ExperimentAssignment = {
      id: assignmentId,
      experimentId: experiment.id,
      participantId: input.participantId,
      variant,
      assignedAt: input.nowIso,
    };
    await this.repo.saveAssignment(assignment);

    return {
      variant,
      reason: 'assigned',
      assignmentId: assignment.id,
      assignedAt: assignment.assignedAt,
    };
  }
}
