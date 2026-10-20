# Growth Experiments

This document describes the BillLens growth-experimentation system
(Phase 9 Prompt 84). The system supports A/B testing for onboarding,
notifications, and reminder timing.

## CRITICAL contracts

1. **Experiments NEVER touch financial areas.** The 7 blocked financial
   areas are: `split_calculation`, `settlement_confirmation`,
   `balance_computation`, `reversal_processing`, `debt_simplification`,
   `currency_conversion`, `payment_verification`. The
   `experiment-safety-guard.ts` module rejects any experiment that
   attempts to influence one of these areas.
2. **Feature flags are decoupled from financial logic.** The 5 financial
   flags (`split_method`, `settlement_status`, `balance_computation`,
   `currency_handling`, `reversal_logic`) are NEVER overridable by an
   experiment. Even if an experiment definition were to (incorrectly)
   declare an override of a financial flag, the
   `feature-flag-decoupler.ts` module silently drops the override and
   preserves the base flag value.
3. **Experiments must NOT cause sync conflicts or alter split
   calculations.** Experiments only affect UI/UX surfaces and UI/UX
   flags. No experiment is permitted to change how money is computed,
   divided, settled, reversed, simplified, converted, or verified.
4. **Assignment is deterministic.** The same `(experimentId,
   participantId)` pair always yields the same variant (or null). This
   is essential for reproducibility — a user sees the same variant on
   every app launch, every sync, every device.

## Domain model

### Variants

```
control | treatment_a | treatment_b | treatment_c
```

A small, fixed enum so the safety guard can reason about every possible
variant a user might be assigned to.

### Surfaces

Experiments target one of 7 UI/UX surfaces:

```
onboarding_flow | notification_content | notification_timing
reminder_cadence | home_dashboard_layout | capture_entry_point
group_join_prompt
```

### Lifecycle

```
draft → running → (paused | completed | cancelled)
paused → (running | cancelled)
completed → (terminal)
cancelled → (terminal)
```

`isExperimentActive(experiment, nowIso)` returns `true` only when the
experiment is `running` AND the current time is within the
`[startsAt, endsAt]` window.

### Variant weights

Each variant carries a non-negative integer weight. The assignment
engine normalises weights, so only the ratios between variants matter.
A variant with weight 0 is never assigned.

## Safety guard

```ts
function isExperimentSafeForFinancialArea(
  experiment: Experiment,
  area: FinancialArea,
): boolean;

function getBlockedExperimentAreas(): readonly FinancialArea[];

function validateExperimentDoesNotAffectFinance(
  experiment: Experiment,
): { safe: boolean; violations: readonly string[] };
```

`validateExperimentDoesNotAffectFinance` is the comprehensive check
called by the `AssignVariantUseCase` before any participant is
enrolled. The `violations` array explains every financial touchpoint
the experiment makes, with one message per offending flag.

## Feature flag decoupler

```ts
const FINANCIAL_FLAGS: readonly string[] = [
  'split_method',
  'settlement_status',
  'balance_computation',
  'currency_handling',
  'reversal_logic',
];

function isFlagFinancial(flagName: string): boolean;

function getEffectiveFeatureFlags(
  experiment: Experiment,
  variant: ExperimentVariant,
  baseFlags: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>>;
```

For the `control` variant, the effective flags equal the base flags
(no overrides). For treatment variants, the decoupler overrides ONLY
the non-financial (UI/UX) flags declared by the experiment. Financial
flags are silently preserved at their base value.

## Assignment engine

A pure, deterministic FNV-1a 32-bit hash converts
`${experimentId}:${participantId}` into a float in `[0, 1)`:

1. If the float is greater than or equal to
   `trafficAllocationPercent / 100`, the participant is excluded from
   the experiment (returns `null`).
2. Otherwise, a second hash `${experimentId}:${participantId}:variant`
   is mapped onto the cumulative variant-weight distribution to pick a
   variant.

Because the hash is deterministic, the same participant always lands in
the same bucket, on every device, on every app launch, before and after
sync.

## Statistical significance

Two-proportion Z-test (the standard test for comparing conversion rates
between two variants):

```ts
function twoProportionZTest(
  control: VariantConversionStats,
  treatment: VariantConversionStats,
): { z: number; pValue: number; significant: boolean; alpha: number };

function differenceConfidenceInterval(
  control: VariantConversionStats,
  treatment: VariantConversionStats,
  confidenceLevel?: number,
): { lower, upper, pointEstimate, confidenceLevel };

function minimumSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  confidenceLevel?: number,
  power?: number,
): number;
```

- `normalCdf` (A&S 7.1.26 erf approximation) backs the p-value
  computation.
- `inverseNormalCdf` (Acklam rational approximation) backs confidence
  intervals and sample-size estimation.
- `computeExperimentResults` aggregates per-variant counts into a single
  result object with per-treatment lift, p-value, and confidence
  interval.

## Use cases

### AssignVariantUseCase

Loads the experiment, checks for an existing assignment (immutable),
runs the safety guard, checks the experiment is active, and finally
computes and persists the deterministic variant.

### GetExperimentResultsUseCase

Loads the experiment, fetches per-variant counts from the repository,
and runs `computeExperimentResults` to produce the statistical
result object.

## Privacy

- Participant IDs are anonymous (never emails, phones, or user PII).
- Result outputs carry only aggregate counts and derived statistics —
  no participant IDs, no raw event payloads, no PII.

## Test coverage

| Suite | Tests | What it verifies |
|---|---|---|
| `experiment-safety-guard.test.ts` | 30+ | All 7 financial areas blocked; financial flags rejected; clear violation messages |
| `assignment-engine.test.ts` | 35+ | Deterministic assignment; traffic allocation; variant weights; distribution |
| `statistical-significance.test.ts` | 35+ | Z-test; p-value; confidence interval; sample size; aggregation |
| `feature-flag-decoupler.test.ts` | 30+ | Financial flags never overridden; UI/UX flags override correctly |

## Critical invariants (test-enforced)

1. `getBlockedExperimentAreas().length === 7`
2. `FINANCIAL_FLAGS.length === 5`
3. `isExperimentSafe(exp)` returns `false` for any experiment whose
   `overriddenFlags` contains a financial flag.
4. `getEffectiveFeatureFlags(exp, variant, base)` NEVER mutates base
   flags for any financial flag — across all 3 treatment variants and
   all 5 financial flags.
5. `assignVariant(exp, participantId)` is deterministic: same input
   always yields the same output.
