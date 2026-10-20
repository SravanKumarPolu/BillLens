/**
 * Growth funnel analytics — stage-by-stage conversion + bottleneck detection.
 *
 * Phase 10 Prompt 95: Business Intelligence.
 *
 * CRITICAL PRIVACY CONSTRAINTS:
 *   - Funnel data uses AGGREGATED counts only. The `FunnelData.users`
 *     field is a COUNT of users at each stage — never a list of user ids.
 *   - `identifyBottleneck` returns the stage NAME, not a list of users
 *     who dropped off.
 *
 * The funnel stages are ordered (download → signup → first action → ...).
 * The order is enforced: a stage with fewer users than its predecessor
 * indicates drop-off; a stage with MORE users than its predecessor
 * indicates data corruption (and is treated as a 0% drop-off for that
 * stage).
 *
 * This module is PURE: it computes funnel data from inputs; no I/O.
 *
 * See `docs/business-intelligence.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FunnelStage =
  | 'app_download'
  | 'guest_signup'
  | 'first_group'
  | 'first_expense'
  | 'first_receipt_scan'
  | 'first_settlement'
  | 'account_created'
  | 'returning_user'
  | 'power_user';

export interface FunnelStageInput {
  readonly stage: FunnelStage;
  readonly users: number;
}

export interface FunnelData {
  readonly stage: FunnelStage;
  readonly users: number;
  /**
   * Conversion rate from the PREVIOUS stage to this stage.
   * For the first stage (`app_download`), this is always 1 (100%).
   */
  readonly conversionRate: number;
  /**
   * Drop-off rate from the previous stage to this stage.
   *   dropoffRate = 1 - conversionRate
   */
  readonly dropoffRate: number;
}

// ---------------------------------------------------------------------------
// Funnel computation
// ---------------------------------------------------------------------------

/**
 * Computes the funnel data for a list of stages.
 *
 * Stages MUST be in canonical order (see `FUNNEL_STAGE_ORDER`). The
 * function throws if the input stages are out of order or if any stage
 * is missing.
 *
 *   conversionRate[i] = users[i] / users[i-1]   (1.0 for i=0)
 *   dropoffRate[i]   = 1 - conversionRate[i]
 *
 * If `users[i] > users[i-1]` (impossible in a real funnel), the function
 * clamps conversionRate to 1.0 and reports dropoffRate as 0 — this
 * indicates a data-quality issue worth investigating.
 */
export function computeFunnel(
  stages: readonly FunnelStageInput[],
): readonly FunnelData[] {
  if (!Array.isArray(stages)) {
    throw new Error('stages must be an array');
  }
  if (stages.length === 0) {
    return Object.freeze([]);
  }
  // Validate order against canonical order.
  const expected = FUNNEL_STAGE_ORDER;
  if (stages.length !== expected.length) {
    throw new Error(
      `stages must contain all ${expected.length} stages in canonical order, got ${stages.length}`,
    );
  }
  for (let i = 0; i < expected.length; i++) {
    const input = stages[i];
    if (!input) {
      throw new Error(`missing stage at index ${i}`);
    }
    if (input.stage !== expected[i]) {
      throw new Error(
        `stage at index ${i} must be "${expected[i]}", got "${input.stage}"`,
      );
    }
    if (!Number.isInteger(input.users) || input.users < 0) {
      throw new Error(
        `users for stage "${input.stage}" must be a non-negative integer, got ${input.users}`,
      );
    }
  }

  const out: FunnelData[] = [];
  for (let i = 0; i < stages.length; i++) {
    const current = stages[i];
    if (!current) continue;
    const previous = i > 0 ? stages[i - 1] : null;
    let conversionRate: number;
    if (previous === null) {
      conversionRate = 1;
    } else if (previous.users === 0) {
      conversionRate = 0;
    } else {
      conversionRate = Math.min(current.users / previous.users, 1);
    }
    const dropoffRate = 1 - conversionRate;
    out.push(
      Object.freeze({
        stage: current.stage,
        users: current.users,
        conversionRate,
        dropoffRate,
      }),
    );
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Bottleneck identification
// ---------------------------------------------------------------------------

/**
 * Identifies the funnel stage with the highest drop-off.
 *
 * Returns the stage NAME (e.g. `'first_receipt_scan'`), or `null` when
 * the funnel has no drop-off (every stage has conversionRate=1).
 *
 * The function looks at the `dropoffRate` field — NOT the absolute user
 * count. A stage with 1,000 users and 50% drop-off is a bigger bottleneck
 * than a stage with 100 users and 60% drop-off, because the former loses
 * 500 users while the latter loses 60. However, this function intentionally
 * returns the STAGE NAME only (not the lost-user count) so the BI team
 * can prioritise which stage to improve first.
 *
 * Tie-breaking: the earliest stage wins (a bottleneck earlier in the
 * funnel is more impactful to fix).
 */
export function identifyBottleneck(
  funnel: readonly FunnelData[],
): FunnelStage | null {
  if (funnel.length === 0) return null;
  let worst: FunnelStage | null = null;
  let worstDropoff = -1;
  for (const stage of funnel) {
    // Skip the first stage — its dropoffRate is always 0 (no predecessor).
    if (stage.stage === FUNNEL_STAGE_ORDER[0]) continue;
    if (stage.dropoffRate > worstDropoff) {
      worstDropoff = stage.dropoffRate;
      worst = stage.stage;
    }
  }
  if (worstDropoff <= 0) return null;
  return worst;
}

// ---------------------------------------------------------------------------
// Canonical stage order
// ---------------------------------------------------------------------------

/**
 * Canonical funnel stage order.
 *
 * The order mirrors the user journey from first app download to power user.
 * Each stage builds on the previous one — a user cannot reach `first_group`
 * without first reaching `guest_signup`.
 */
export const FUNNEL_STAGE_ORDER: readonly FunnelStage[] = Object.freeze([
  'app_download',
  'guest_signup',
  'first_group',
  'first_expense',
  'first_receipt_scan',
  'first_settlement',
  'account_created',
  'returning_user',
  'power_user',
]);

/**
 * Returns the index of a stage in the canonical funnel order.
 * Returns -1 for an unknown stage.
 */
export function getStageIndex(stage: FunnelStage): number {
  return FUNNEL_STAGE_ORDER.indexOf(stage);
}

/**
 * Returns true when `stage` is at or past `target` in the funnel.
 *
 * Useful for "show me users who have reached first_settlement".
 */
export function hasReachedStage(
  stage: FunnelStage,
  target: FunnelStage,
): boolean {
  return getStageIndex(stage) >= getStageIndex(target);
}
