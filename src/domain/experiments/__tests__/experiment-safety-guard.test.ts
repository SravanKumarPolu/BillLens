import { describe, expect, it } from '@jest/globals';

import { createExperiment } from '../experiment-model';
import {
  BLOCKED_FINANCIAL_AREAS,
  FINANCIAL_FLAGS,
  getBlockedExperimentAreas,
  isExperimentSafe,
  isExperimentSafeForFinancialArea,
  isFinancialArea,
  validateExperimentDoesNotAffectFinance,
  type Experiment,
  type FinancialArea,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExperiment(
  overrides: Partial<Experiment> = {},
): Experiment {
  return createExperiment({
    id: overrides.id ?? 'exp-onboarding-001',
    name: overrides.name ?? 'Onboarding flow A/B',
    description: overrides.description ?? 'Test 3-step vs 5-step onboarding.',
    surface: overrides.surface ?? 'onboarding_flow',
    status: overrides.status ?? 'running',
    variantWeights: overrides.variantWeights ?? [
      { variant: 'control', weight: 50 },
      { variant: 'treatment_a', weight: 50 },
    ],
    trafficAllocationPercent: overrides.trafficAllocationPercent ?? 100,
    overriddenFlags: overrides.overriddenFlags ?? [],
    startsAt: overrides.startsAt ?? '2025-01-01T00:00:00.000Z',
    endsAt: overrides.endsAt ?? '2025-12-31T23:59:59.000Z',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('experiment-safety-guard', () => {
  describe('getBlockedExperimentAreas', () => {
    it('returns exactly 7 blocked financial areas', () => {
      const areas = getBlockedExperimentAreas();
      expect(areas.length).toBe(7);
    });

    it.each([
      'split_calculation',
      'settlement_confirmation',
      'balance_computation',
      'reversal_processing',
      'debt_simplification',
      'currency_conversion',
      'payment_verification',
    ] as const)('includes %s', (area) => {
      expect(getBlockedExperimentAreas()).toContain(area);
    });

    it('returns a readonly list (cannot be mutated)', () => {
      const areas = getBlockedExperimentAreas();
      expect(Object.isFrozen(areas)).toBe(true);
    });

    it('BLOCKED_FINANCIAL_AREAS matches getBlockedExperimentAreas', () => {
      expect(BLOCKED_FINANCIAL_AREAS).toEqual(getBlockedExperimentAreas());
    });
  });

  describe('isFinancialArea', () => {
    it.each(getBlockedExperimentAreas())('returns true for %s', (area) => {
      expect(isFinancialArea(area)).toBe(true);
    });

    it('returns false for UI/UX areas', () => {
      expect(isFinancialArea('onboarding_flow')).toBe(false);
      expect(isFinancialArea('notification_timing')).toBe(false);
      expect(isFinancialArea('reminder_cadence')).toBe(false);
    });

    it('returns false for unknown strings', () => {
      expect(isFinancialArea('something_random')).toBe(false);
      expect(isFinancialArea('')).toBe(false);
    });
  });

  describe('isExperimentSafeForFinancialArea', () => {
    const exp = makeExperiment();

    it.each(getBlockedExperimentAreas())(
      'returns true for a UI/UX experiment asked about %s (the experiment does not touch this area)',
      (area: FinancialArea) => {
        // The experiment is UI/UX, so asking "is this safe for area X"
        // returns true because the experiment does not touch X.
        expect(isExperimentSafeForFinancialArea(exp, area)).toBe(true);
      },
    );

    it('returns true for a UI/UX experiment when the surface does NOT map to the financial area', () => {
      const uiExp = makeExperiment({ surface: 'notification_timing' });
      expect(
        isExperimentSafeForFinancialArea(uiExp, 'split_calculation'),
      ).toBe(true);
    });

    it('returns false when the experiment overrides a financial flag that maps to the asked-about area', () => {
      const unsafeExp = makeExperiment({
        overriddenFlags: ['split_method'],
      });
      expect(
        isExperimentSafeForFinancialArea(unsafeExp, 'split_calculation'),
      ).toBe(false);
    });

    it('returns true when the experiment overrides a DIFFERENT financial flag than the asked-about area', () => {
      const partlyUnsafeExp = makeExperiment({
        overriddenFlags: ['currency_handling'],
      });
      // Asking about split_calculation — currency_handling maps to currency_conversion,
      // not split_calculation, so the experiment is safe for split_calculation
      // (but would be unsafe for currency_conversion — covered by validateExperimentDoesNotAffectFinance).
      expect(
        isExperimentSafeForFinancialArea(partlyUnsafeExp, 'split_calculation'),
      ).toBe(true);
    });

    it('returns false for currency_conversion when currency_handling flag is overridden', () => {
      const unsafeExp = makeExperiment({
        overriddenFlags: ['currency_handling'],
      });
      expect(
        isExperimentSafeForFinancialArea(unsafeExp, 'currency_conversion'),
      ).toBe(false);
    });

    it('returns false for settlement_confirmation when settlement_status flag is overridden', () => {
      const unsafeExp = makeExperiment({
        overriddenFlags: ['settlement_status'],
      });
      expect(
        isExperimentSafeForFinancialArea(unsafeExp, 'settlement_confirmation'),
      ).toBe(false);
    });

    it('returns false for balance_computation when balance_computation flag is overridden', () => {
      const unsafeExp = makeExperiment({
        overriddenFlags: ['balance_computation'],
      });
      expect(
        isExperimentSafeForFinancialArea(unsafeExp, 'balance_computation'),
      ).toBe(false);
    });

    it('returns false for reversal_processing when reversal_logic flag is overridden', () => {
      const unsafeExp = makeExperiment({
        overriddenFlags: ['reversal_logic'],
      });
      expect(
        isExperimentSafeForFinancialArea(unsafeExp, 'reversal_processing'),
      ).toBe(false);
    });
  });

  describe('validateExperimentDoesNotAffectFinance', () => {
    it('returns safe=true for a pure UI/UX experiment', () => {
      const exp = makeExperiment({
        surface: 'onboarding_flow',
        overriddenFlags: ['onboarding_step_count'],
      });
      const result = validateExperimentDoesNotAffectFinance(exp);
      expect(result.safe).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('returns safe=false with a clear violation when a financial flag is overridden', () => {
      const exp = makeExperiment({
        surface: 'onboarding_flow',
        overriddenFlags: ['split_method'],
      });
      const result = validateExperimentDoesNotAffectFinance(exp);
      expect(result.safe).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('split_method');
      expect(result.violations[0]).toContain('split_calculation');
    });

    it('lists ALL financial flags in the violation message', () => {
      const exp = makeExperiment({
        overriddenFlags: ['settlement_status'],
      });
      const result = validateExperimentDoesNotAffectFinance(exp);
      expect(result.safe).toBe(false);
      // The violation message lists all 5 financial flags so the experimenter
      // knows which flags are NEVER overridable.
      for (const flag of FINANCIAL_FLAGS) {
        expect(result.violations[0]).toContain(flag);
      }
    });

    it('reports one violation per overridden financial flag', () => {
      const exp = makeExperiment({
        overriddenFlags: ['split_method', 'settlement_status', 'currency_handling'],
      });
      const result = validateExperimentDoesNotAffectFinance(exp);
      expect(result.safe).toBe(false);
      expect(result.violations.length).toBe(3);
    });

    it.each([
      ['split_method', 'split_calculation'],
      ['settlement_status', 'settlement_confirmation'],
      ['balance_computation', 'balance_computation'],
      ['currency_handling', 'currency_conversion'],
      ['reversal_logic', 'reversal_processing'],
    ])(
      'rejects experiment overriding financial flag %s (maps to %s)',
      (flag: string, area: string) => {
        const exp = makeExperiment({ overriddenFlags: [flag] });
        const result = validateExperimentDoesNotAffectFinance(exp);
        expect(result.safe).toBe(false);
        expect(result.violations[0]).toContain(flag);
        expect(result.violations[0]).toContain(area);
      },
    );

    it('is safe when overridden flags are purely UI/UX', () => {
      const exp = makeExperiment({
        surface: 'notification_timing',
        overriddenFlags: ['reminder_delay_minutes', 'notification_sound'],
      });
      const result = validateExperimentDoesNotAffectFinance(exp);
      expect(result.safe).toBe(true);
    });

    it('returns safe=true for an experiment with no overridden flags', () => {
      const exp = makeExperiment({ overriddenFlags: [] });
      const result = validateExperimentDoesNotAffectFinance(exp);
      expect(result.safe).toBe(true);
    });

    it('returns a readonly violations array', () => {
      const exp = makeExperiment({ overriddenFlags: ['split_method'] });
      const result = validateExperimentDoesNotAffectFinance(exp);
      expect(Object.isFrozen(result.violations)).toBe(true);
    });
  });

  describe('isExperimentSafe (convenience wrapper)', () => {
    it('returns true for a pure UI/UX experiment', () => {
      const exp = makeExperiment({ overriddenFlags: ['onboarding_step_count'] });
      expect(isExperimentSafe(exp)).toBe(true);
    });

    it('returns false for an experiment touching a financial flag', () => {
      const exp = makeExperiment({ overriddenFlags: ['reversal_logic'] });
      expect(isExperimentSafe(exp)).toBe(false);
    });
  });

  describe('All 7 financial areas are blocked — exhaustive verification', () => {
    // CRITICAL: verify ALL 7 financial areas are blocked by checking
    // that an experiment overriding each financial flag is rejected.

    it.each([
      ['split_method', 'split_calculation'],
      ['settlement_status', 'settlement_confirmation'],
      ['balance_computation', 'balance_computation'],
      ['reversal_logic', 'reversal_processing'],
      ['currency_handling', 'currency_conversion'],
    ])(
      'experiment overriding %s is rejected (financial area: %s)',
      (flag: string, area: string) => {
        expect(isFinancialArea(area)).toBe(true);
        const exp = makeExperiment({ overriddenFlags: [flag] });
        expect(isExperimentSafe(exp)).toBe(false);
      },
    );

    it('all 7 financial areas appear in getBlockedExperimentAreas', () => {
      const expected: readonly FinancialArea[] = [
        'split_calculation',
        'settlement_confirmation',
        'balance_computation',
        'reversal_processing',
        'debt_simplification',
        'currency_conversion',
        'payment_verification',
      ];
      expect(getBlockedExperimentAreas()).toEqual(expected);
    });

    it('BLOCKED_FINANCIAL_AREAS contains exactly 7 entries', () => {
      expect(BLOCKED_FINANCIAL_AREAS.length).toBe(7);
    });
  });
});
