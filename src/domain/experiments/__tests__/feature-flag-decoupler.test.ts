import { describe, expect, it } from '@jest/globals';

import { createExperiment } from '../experiment-model';
import type { Experiment } from '../experiment-model';
import {
  FINANCIAL_FLAGS,
  getAllowedOverrides,
  getDisallowedOverrides,
  getEffectiveFeatureFlags,
  isFlagFinancial,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return createExperiment({
    id: overrides.id ?? 'exp-onboarding-001',
    name: overrides.name ?? 'Onboarding A/B',
    description: overrides.description ?? 'Test onboarding flow variants.',
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

describe('feature-flag-decoupler', () => {
  describe('FINANCIAL_FLAGS', () => {
    it('contains exactly 5 financial flags', () => {
      expect(FINANCIAL_FLAGS.length).toBe(5);
    });

    it.each([
      'split_method',
      'settlement_status',
      'balance_computation',
      'currency_handling',
      'reversal_logic',
    ])('includes %s', (flag) => {
      expect(FINANCIAL_FLAGS).toContain(flag);
    });

    it('is a readonly list', () => {
      expect(Object.isFrozen(FINANCIAL_FLAGS)).toBe(true);
    });
  });

  describe('isFlagFinancial', () => {
    it.each(FINANCIAL_FLAGS)('returns true for %s', (flag) => {
      expect(isFlagFinancial(flag)).toBe(true);
    });

    it('returns false for UI/UX flags', () => {
      expect(isFlagFinancial('onboarding_step_count')).toBe(false);
      expect(isFlagFinancial('notification_timing')).toBe(false);
      expect(isFlagFinancial('reminder_delay_minutes')).toBe(false);
      expect(isFlagFinancial('home_dashboard_layout')).toBe(false);
    });

    it('returns false for unknown flags', () => {
      expect(isFlagFinancial('random_unknown_flag')).toBe(false);
      expect(isFlagFinancial('')).toBe(false);
    });

    it('is case-sensitive (canonical snake_case only)', () => {
      expect(isFlagFinancial('Split_Method')).toBe(false);
      expect(isFlagFinancial('SPLIT_METHOD')).toBe(false);
      expect(isFlagFinancial('splitMethod')).toBe(false);
    });
  });

  describe('getEffectiveFeatureFlags', () => {
    const baseFlags: Readonly<Record<string, boolean>> = {
      onboarding_step_count: false,
      reminder_delay_minutes: false,
      notification_sound: true,
      // Financial flags (should NEVER be overridden).
      split_method: false,
      settlement_status: false,
      balance_computation: false,
      currency_handling: false,
      reversal_logic: false,
    };

    it('returns base flags unchanged for control variant', () => {
      const exp = makeExperiment({
        overriddenFlags: ['onboarding_step_count'],
      });
      const effective = getEffectiveFeatureFlags(exp, 'control', baseFlags);
      expect(effective.onboarding_step_count).toBe(false);
      expect(effective.notification_sound).toBe(true);
    });

    it('overrides UI/UX flags for treatment_a variant', () => {
      const exp = makeExperiment({
        overriddenFlags: ['onboarding_step_count', 'reminder_delay_minutes'],
      });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_a', baseFlags);
      expect(effective.onboarding_step_count).toBe(true);
      expect(effective.reminder_delay_minutes).toBe(true);
    });

    it('NEVER overrides financial flags (split_method)', () => {
      const exp = makeExperiment({
        // This experiment tries to override split_method — defense-in-depth,
        // the safety guard should have rejected the experiment upstream.
        // But the decoupler STILL must not apply the override.
        overriddenFlags: ['split_method', 'onboarding_step_count'],
      });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_a', baseFlags);
      // Financial flag preserved.
      expect(effective.split_method).toBe(false);
      // UI/UX flag overridden.
      expect(effective.onboarding_step_count).toBe(true);
    });

    it('NEVER overrides financial flags (settlement_status)', () => {
      const exp = makeExperiment({
        overriddenFlags: ['settlement_status'],
      });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_b', baseFlags);
      expect(effective.settlement_status).toBe(false);
    });

    it('NEVER overrides financial flags (balance_computation)', () => {
      const exp = makeExperiment({
        overriddenFlags: ['balance_computation'],
      });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_c', baseFlags);
      expect(effective.balance_computation).toBe(false);
    });

    it('NEVER overrides financial flags (currency_handling)', () => {
      const exp = makeExperiment({
        overriddenFlags: ['currency_handling'],
      });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_a', baseFlags);
      expect(effective.currency_handling).toBe(false);
    });

    it('NEVER overrides financial flags (reversal_logic)', () => {
      const exp = makeExperiment({
        overriddenFlags: ['reversal_logic'],
      });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_b', baseFlags);
      expect(effective.reversal_logic).toBe(false);
    });

    it('returns a frozen object', () => {
      const exp = makeExperiment({ overriddenFlags: ['onboarding_step_count'] });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_a', baseFlags);
      expect(Object.isFrozen(effective)).toBe(true);
    });

    it('does NOT mutate the base flags input', () => {
      const baseCopy: Record<string, boolean> = { ...baseFlags };
      const exp = makeExperiment({ overriddenFlags: ['onboarding_step_count'] });
      getEffectiveFeatureFlags(exp, 'treatment_a', baseFlags);
      // Original base flags object should be unchanged.
      expect(baseFlags).toEqual(baseCopy);
    });

    it('overrides flags for treatment_b and treatment_c too', () => {
      const exp = makeExperiment({ overriddenFlags: ['notification_sound'] });
      expect(
        getEffectiveFeatureFlags(exp, 'treatment_b', baseFlags).notification_sound,
      ).toBe(true);
      expect(
        getEffectiveFeatureFlags(exp, 'treatment_c', baseFlags).notification_sound,
      ).toBe(true);
    });

    it('handles an experiment with no overridden flags', () => {
      const exp = makeExperiment({ overriddenFlags: [] });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_a', baseFlags);
      // No overrides — effective equals base.
      expect(effective).toEqual(baseFlags);
    });

    it('preserves base flags not listed in overriddenFlags', () => {
      const exp = makeExperiment({ overriddenFlags: ['onboarding_step_count'] });
      const effective = getEffectiveFeatureFlags(exp, 'treatment_a', baseFlags);
      // notification_sound is NOT in overriddenFlags — should preserve base.
      expect(effective.notification_sound).toBe(true);
    });

    it('CRITICAL: NONE of the 5 financial flags are overridable by any variant', () => {
      // Try all 5 financial flags × all 3 treatment variants.
      for (const flag of FINANCIAL_FLAGS) {
        const exp = makeExperiment({ overriddenFlags: [flag] });
        for (const variant of ['treatment_a', 'treatment_b', 'treatment_c'] as const) {
          const effective = getEffectiveFeatureFlags(exp, variant, baseFlags);
          // Financial flag MUST retain its base value (false).
          expect(effective[flag]).toBe(baseFlags[flag]);
          expect(effective[flag]).toBe(false);
        }
      }
    });
  });

  describe('getAllowedOverrides', () => {
    it('returns only non-financial overridden flags', () => {
      const exp = makeExperiment({
        overriddenFlags: ['onboarding_step_count', 'split_method', 'reminder_delay_minutes'],
      });
      const allowed = getAllowedOverrides(exp);
      expect(allowed).toContain('onboarding_step_count');
      expect(allowed).toContain('reminder_delay_minutes');
      expect(allowed).not.toContain('split_method');
    });

    it('returns empty list when only financial flags are overridden', () => {
      const exp = makeExperiment({
        overriddenFlags: ['split_method', 'settlement_status'],
      });
      expect(getAllowedOverrides(exp)).toEqual([]);
    });
  });

  describe('getDisallowedOverrides', () => {
    it('returns only financial overridden flags', () => {
      const exp = makeExperiment({
        overriddenFlags: ['onboarding_step_count', 'split_method', 'settlement_status'],
      });
      const disallowed = getDisallowedOverrides(exp);
      expect(disallowed).toContain('split_method');
      expect(disallowed).toContain('settlement_status');
      expect(disallowed).not.toContain('onboarding_step_count');
    });

    it('returns empty list when no financial flags are overridden', () => {
      const exp = makeExperiment({
        overriddenFlags: ['onboarding_step_count', 'reminder_delay_minutes'],
      });
      expect(getDisallowedOverrides(exp)).toEqual([]);
    });
  });
});
