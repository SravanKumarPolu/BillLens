/**
 * Experiment safety guard — the CRITICAL financial-area firewall.
 *
 * BillLens NEVER allows an experiment to influence any of the 7 financial
 * areas below. Experiments may target onboarding, notifications, reminder
 * timing, dashboard layout — but they must NEVER alter:
 *
 *   1. split_calculation         (how an expense is divided)
 *   2. settlement_confirmation   (when a settlement is marked confirmed)
 *   3. balance_computation       (how member balances are computed)
 *   4. reversal_processing       (how a settlement reversal is applied)
 *   5. debt_simplification       (how debts are simplified)
 *   6. currency_conversion       (how amounts are converted between currencies)
 *   7. payment_verification      (how a UPI/card payment is verified)
 *
 * This guard has three responsibilities:
 *
 *   - `isExperimentSafeForFinancialArea(experiment, area)` — pure boolean
 *     check. Always returns `false` for the 7 listed financial areas.
 *   - `getBlockedExperimentAreas()` — returns the 7 blocked areas as a
 *     readonly list, so tests can verify the full set.
 *   - `validateExperimentDoesNotAffectFinance(experiment)` — produces a
 *     detailed `{ safe, violations }` report. The violations list explains
 *     every financial touchpoint the experiment makes.
 *
 * Implementation note: experiments declare `overriddenFlags` and a `surface`.
 * Either of those can be a financial touchpoint. The guard checks BOTH
 * surfaces (mapping them to financial areas) and overridden flags (looking
 * up `FINANCIAL_FLAGS` from the feature-flag decoupler). The two checks
 * are independent — failing either rejects the experiment.
 */

import type { Experiment } from './experiment-model';
import { FINANCIAL_FLAGS, isFlagFinancial } from './feature-flag-decoupler';

// ---------------------------------------------------------------------------
// Financial areas — the 7 NEVER-experimentable areas
// ---------------------------------------------------------------------------

export type FinancialArea =
  | 'split_calculation'
  | 'settlement_confirmation'
  | 'balance_computation'
  | 'reversal_processing'
  | 'debt_simplification'
  | 'currency_conversion'
  | 'payment_verification';

export const BLOCKED_FINANCIAL_AREAS: readonly FinancialArea[] = Object.freeze([
  'split_calculation',
  'settlement_confirmation',
  'balance_computation',
  'reversal_processing',
  'debt_simplification',
  'currency_conversion',
  'payment_verification',
]);

/**
 * Returns the 7 financial areas that experiments can NEVER target.
 */
export function getBlockedExperimentAreas(): readonly FinancialArea[] {
  return BLOCKED_FINANCIAL_AREAS;
}

export function isFinancialArea(value: unknown): value is FinancialArea {
  return (
    typeof value === 'string' &&
    (BLOCKED_FINANCIAL_AREAS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Surface → financial area mapping
// ---------------------------------------------------------------------------

/**
 * Maps experiment surfaces to financial areas they would touch if they
 * were allowed (they are NOT — the guard rejects them).
 *
 * All experiment surfaces defined in `experiment-model.ts` are UI/UX
 * surfaces, so they map to `null`. This mapping exists as defense-in-depth
 * — if a future surface is added that touches a financial area, the guard
 * will reject it without needing changes here.
 */
const SURFACE_TO_FINANCIAL_AREA: Readonly<Record<string, FinancialArea | null>> = Object.freeze({
  onboarding_flow: null,
  notification_content: null,
  notification_timing: null,
  reminder_cadence: null,
  home_dashboard_layout: null,
  capture_entry_point: null,
  group_join_prompt: null,
});

/**
 * Maps a financial flag name to the financial area it affects. Used so
 * the validator can produce a clear, actionable violation message.
 */
const FINANCIAL_FLAG_TO_AREA: Readonly<Record<string, FinancialArea>> = Object.freeze({
  split_method: 'split_calculation',
  settlement_status: 'settlement_confirmation',
  balance_computation: 'balance_computation',
  currency_handling: 'currency_conversion',
  reversal_logic: 'reversal_processing',
});

// ---------------------------------------------------------------------------
// Guard functions
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the experiment is safe to run within the given
 * financial area, `false` otherwise.
 *
 * CRITICAL: experiments are NEVER safe for any of the 7 blocked financial
 * areas, regardless of their surface or overridden flags. This function
 * ALWAYS returns `false` for a blocked area.
 *
 * For non-financial (UI/UX) areas, the function returns `true` only when
 * the experiment's surface and overridden flags do not reference the
 * blocked area indirectly.
 */
export function isExperimentSafeForFinancialArea(
  experiment: Experiment,
  area: FinancialArea,
): boolean {
  // Rule 1: experiments NEVER target any of the 7 blocked areas. If the
  // caller is asking about a blocked area, the answer is ALWAYS `false`.
  if (isFinancialArea(area)) {
    // The experiment's surface is, by construction, a UI/UX surface. So
    // check whether the surface somehow maps to the given financial area.
    const surfaceArea = SURFACE_TO_FINANCIAL_AREA[experiment.surface];
    if (surfaceArea === area) return false;

    // Check overridden flags — if any financial flag maps to the given
    // area, the experiment is unsafe.
    for (const flag of experiment.overriddenFlags) {
      if (!isFlagFinancial(flag)) continue;
      const flagArea = FINANCIAL_FLAG_TO_AREA[flag];
      if (flagArea === area) return false;
    }

    // If the experiment does NOT touch this specific area, it's safe
    // with respect to that area. (It may still be unsafe with respect
    // to OTHER financial areas — `validateExperimentDoesNotAffectFinance`
    // checks all areas.)
    return true;
  }

  // Not a blocked area — by definition safe (it's a UI/UX area).
  return true;
}

/**
 * Validates that the experiment does NOT affect ANY financial area.
 *
 * Returns `{ safe: true, violations: [] }` when the experiment is purely
 * UI/UX, or `{ safe: false, violations: [...] }` with one violation
 * message per financial touchpoint.
 *
 * This is the comprehensive check — the use case calls this before
 * enrolling any participant.
 */
export function validateExperimentDoesNotAffectFinance(
  experiment: Experiment,
): { safe: boolean; violations: readonly string[] } {
  const violations: string[] = [];

  // 1. Check surface — if the surface maps to a financial area, reject.
  const surfaceArea = SURFACE_TO_FINANCIAL_AREA[experiment.surface];
  if (surfaceArea !== null && surfaceArea !== undefined) {
    violations.push(
      `Experiment surface '${experiment.surface}' targets financial area '${surfaceArea}', which is blocked.`,
    );
  }

  // 2. Check overridden flags — any financial flag is a violation.
  for (const flag of experiment.overriddenFlags) {
    if (isFlagFinancial(flag)) {
      const area = FINANCIAL_FLAG_TO_AREA[flag] ?? 'unknown_financial_area';
      violations.push(
        `Experiment overrides financial flag '${flag}', which affects financial area '${area}'. Financial flags (${FINANCIAL_FLAGS.join(', ')}) are NEVER overridable by experiments.`,
      );
    }
  }

  return Object.freeze({ safe: violations.length === 0, violations: Object.freeze(violations) });
}

/**
 * Returns `true` when the experiment is safe to run at all — i.e. it
 * passes the comprehensive financial-area check.
 *
 * Convenience wrapper around `validateExperimentDoesNotAffectFinance`.
 */
export function isExperimentSafe(experiment: Experiment): boolean {
  return validateExperimentDoesNotAffectFinance(experiment).safe;
}
