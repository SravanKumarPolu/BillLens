/**
 * Feature-flag decoupler.
 *
 * CRITICAL CONTRACT:
 *   - Feature flags CAN override UI/UX flags (onboarding flow, notification
 *     timing, reminder cadence, dashboard layout).
 *   - Feature flags can NEVER override FINANCIAL flags.
 *
 * The 5 financial flags are listed in `FINANCIAL_FLAGS`. Any attempt by
 * an experiment to override one of them is silently dropped (the base
 * flag value is preserved) AND the safety guard in
 * `experiment-safety-guard.ts` rejects the experiment definition itself.
 *
 * This module is a pure function — no I/O, no globals, no mutation of
 * the inputs. The returned flag set is a NEW frozen object.
 */

import type { Experiment, ExperimentVariant } from './experiment-model';

// ---------------------------------------------------------------------------
// Financial flags — NEVER overridable by experiments
// ---------------------------------------------------------------------------

export const FINANCIAL_FLAGS: readonly string[] = Object.freeze([
  'split_method',
  'settlement_status',
  'balance_computation',
  'currency_handling',
  'reversal_logic',
]);

const FINANCIAL_FLAGS_SET: ReadonlySet<string> = new Set(FINANCIAL_FLAGS);

/**
 * Returns `true` when the given flag name is a financial flag.
 * Case-sensitive — canonical snake_case only.
 *
 * Experiments MUST NOT override financial flags. The safety guard uses
 * this function to detect violations.
 */
export function isFlagFinancial(flagName: string): boolean {
  return FINANCIAL_FLAGS_SET.has(flagName);
}

// ---------------------------------------------------------------------------
// Effective flag resolution
// ---------------------------------------------------------------------------

/**
 * Effective flags produced by merging:
 *   - `baseFlags` (the app's default flag values)
 *   - per-variant overrides declared by the experiment
 *
 * CRITICAL RULES:
 *   1. Financial flags are NEVER overridden — they retain their base
 *      value, even if the experiment declares an override. The override
 *      is silently dropped (and the safety guard would have rejected
 *      the experiment definition upstream).
 *   2. Non-financial (UI/UX) flags ARE overridden by the experiment.
 *   3. The output is a NEW frozen object — the inputs are not mutated.
 *
 * Note: the experiment's `overriddenFlags` is a list of NAMES that the
 * experiment wants to override. The variant-specific values come from
 * a separate map — but for BillLens Phase 9, the experiment declares
 * only flag NAMES (boolean overrides) so we treat the variant's presence
 * as "set this flag to TRUE". Future iterations may extend the model
 * to per-variant value maps.
 */
export function getEffectiveFeatureFlags(
  experiment: Experiment,
  variant: ExperimentVariant,
  baseFlags: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  // Defensive copy of base flags — never mutate the input.
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(baseFlags)) {
    const value = baseFlags[key];
    if (typeof value === 'boolean') {
      out[key] = value;
    }
  }

  // Control variant — no overrides, ever. Control is the baseline.
  if (variant === 'control') {
    return Object.freeze(out);
  }

  // Treatment variants — override ONLY non-financial flags declared by
  // the experiment. Financial flags are skipped (defense-in-depth even
  // though the safety guard should have rejected the experiment upstream).
  for (const flagName of experiment.overriddenFlags) {
    if (isFlagFinancial(flagName)) {
      // CRITICAL: never override a financial flag. Skip silently.
      continue;
    }
    // For Phase 9, treatment variants set their declared flags to `true`.
    // This is the simplest sound semantics — the experiment declares
    // "I want feature X enabled for treatment B" and the decoupler
    // honours that, EXCEPT for financial flags.
    out[flagName] = true;
  }

  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

/**
 * Returns the list of UI/UX flags the experiment is allowed to override
 * (i.e. all declared flags that are NOT financial).
 *
 * Used by the safety guard and tests to verify the experiment's effective
 * override set.
 */
export function getAllowedOverrides(
  experiment: Experiment,
): readonly string[] {
  return experiment.overriddenFlags.filter((f) => !isFlagFinancial(f));
}

/**
 * Returns the list of financial flags the experiment is attempting to
 * override (which MUST be empty for a safe experiment).
 */
export function getDisallowedOverrides(
  experiment: Experiment,
): readonly string[] {
  return experiment.overriddenFlags.filter((f) => isFlagFinancial(f));
}
