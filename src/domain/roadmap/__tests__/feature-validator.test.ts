import { describe, expect, it } from '@jest/globals';

import {
  FEATURE_CANDIDATES,
  createFeatureCandidate,
  type FeatureCandidate,
} from '../feature-candidate';
import {
  ALLOWED_ANALYTICS_SOURCES,
  MAX_COST_PER_VALUE_POINT_DEV_DAYS,
  MIN_ESTIMATED_USERS_IMPACTED,
  MIN_FEEDBACK_COUNT,
  MIN_RELATED_FEATURE_ADOPTION,
  MIN_USER_DEMAND_SCORE,
  isCostValueAcceptable,
  validateFeature,
  validateFeatures,
  validateFeatureInput,
  type FeatureValidationInput,
} from '../feature-validator';

function makeCandidate(overrides: Partial<FeatureCandidate> = {}): FeatureCandidate {
  return createFeatureCandidate({
    key: 'recurring_expenses',
    name: 'Recurring Expenses',
    description: 'Auto-create expenses on a schedule.',
    userDemandScore: 70,
    implementationEffort: 'medium',
    estimatedValue: 4,
    riskLevel: 'low',
    prerequisites: [],
    ...overrides,
  });
}

function makeValidationInput(
  overrides: Partial<FeatureValidationInput> = {},
): FeatureValidationInput {
  return {
    feature: makeCandidate(),
    feedbackCount: 30,
    relatedFeatureAdoption: 0.4,
    userDemandScore: 70,
    implementationCost: 10,
    estimatedUsersImpacted: 0.3,
    analyticsSource: 'privacy_safe_analytics',
    ...overrides,
  };
}

describe('feature-validator', () => {
  describe('ALLOWED_ANALYTICS_SOURCES', () => {
    it('exposes only privacy_safe_analytics', () => {
      expect(ALLOWED_ANALYTICS_SOURCES).toEqual(['privacy_safe_analytics']);
    });
  });

  describe('thresholds', () => {
    it('MIN_USER_DEMAND_SCORE is 50', () => {
      expect(MIN_USER_DEMAND_SCORE).toBe(50);
    });

    it('MIN_FEEDBACK_COUNT is 20', () => {
      expect(MIN_FEEDBACK_COUNT).toBe(20);
    });

    it('MIN_RELATED_FEATURE_ADOPTION is 0.3', () => {
      expect(MIN_RELATED_FEATURE_ADOPTION).toBe(0.3);
    });

    it('MIN_ESTIMATED_USERS_IMPACTED is 0.1', () => {
      expect(MIN_ESTIMATED_USERS_IMPACTED).toBe(0.1);
    });

    it('MAX_COST_PER_VALUE_POINT_DEV_DAYS is 10', () => {
      expect(MAX_COST_PER_VALUE_POINT_DEV_DAYS).toBe(10);
    });
  });

  describe('validateFeatureInput', () => {
    it('accepts a well-formed input', () => {
      expect(() => validateFeatureInput(makeValidationInput())).not.toThrow();
    });

    it('rejects a non-object input', () => {
      expect(() => validateFeatureInput(null as unknown as FeatureValidationInput)).toThrow();
    });

    it('rejects a missing feature', () => {
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), feature: undefined as never }),
      ).toThrow();
    });

    it('rejects a negative feedbackCount', () => {
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), feedbackCount: -1 }),
      ).toThrow();
    });

    it('rejects a non-integer feedbackCount', () => {
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), feedbackCount: 1.5 }),
      ).toThrow();
    });

    it('rejects an out-of-range relatedFeatureAdoption', () => {
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), relatedFeatureAdoption: 1.5 }),
      ).toThrow();
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), relatedFeatureAdoption: -0.1 }),
      ).toThrow();
    });

    it('rejects an out-of-range userDemandScore', () => {
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), userDemandScore: 101 }),
      ).toThrow();
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), userDemandScore: -1 }),
      ).toThrow();
    });

    it('rejects a non-positive implementationCost', () => {
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), implementationCost: 0 }),
      ).toThrow();
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), implementationCost: -1 }),
      ).toThrow();
    });

    it('rejects an out-of-range estimatedUsersImpacted', () => {
      expect(() =>
        validateFeatureInput({ ...makeValidationInput(), estimatedUsersImpacted: 1.5 }),
      ).toThrow();
    });

    it('CRITICAL — rejects a non-privacy-safe analytics source', () => {
      expect(() =>
        validateFeatureInput({
          ...makeValidationInput(),
          analyticsSource: 'raw_analytics' as never,
        }),
      ).toThrow();
      expect(() =>
        validateFeatureInput({
          ...makeValidationInput(),
          analyticsSource: 'manual_estimate' as never,
        }),
      ).toThrow();
    });
  });

  describe('validateFeature — shouldImplement = true', () => {
    it('returns shouldImplement=true when ALL thresholds met', () => {
      const result = validateFeature(makeValidationInput());
      expect(result.shouldImplement).toBe(true);
    });

    it('returns confidenceLevel=high when all 5 thresholds met', () => {
      const result = validateFeature(makeValidationInput());
      expect(result.confidenceLevel).toBe('high');
    });

    it('returns recommendedPriority=now when shouldImplement=true AND confidence=high', () => {
      const result = validateFeature(makeValidationInput());
      expect(result.recommendedPriority).toBe('now');
    });

    it('records evidence sources (privacy_safe_analytics)', () => {
      const result = validateFeature(makeValidationInput());
      expect(result.evidenceSources).toContain('privacy_safe_analytics:feedback_count');
      expect(result.evidenceSources).toContain('privacy_safe_analytics:related_feature_adoption');
      expect(result.evidenceSources).toContain('privacy_safe_analytics:user_demand_score');
    });

    it('records conditions for implementation', () => {
      const result = validateFeature(makeValidationInput());
      expect(result.conditions.length).toBeGreaterThan(0);
      // The conditions reference the quarterly re-validation.
      expect(result.conditions.some((c) => c.includes('privacy_safe_analytics'))).toBe(true);
    });

    it('returns a frozen result', () => {
      const result = validateFeature(makeValidationInput());
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.conditions)).toBe(true);
      expect(Object.isFrozen(result.evidenceSources)).toBe(true);
    });
  });

  describe('validateFeature — shouldImplement = false (CRITICAL)', () => {
    it('CRITICAL — returns shouldImplement=false when userDemandScore < 50', () => {
      const result = validateFeature(
        makeValidationInput({ userDemandScore: 49 }),
      );
      expect(result.shouldImplement).toBe(false);
    });

    it('CRITICAL — returns shouldImplement=false when feedbackCount < 20', () => {
      const result = validateFeature(
        makeValidationInput({ feedbackCount: 19 }),
      );
      expect(result.shouldImplement).toBe(false);
    });

    it('CRITICAL — returns shouldImplement=false when relatedFeatureAdoption < 0.3', () => {
      const result = validateFeature(
        makeValidationInput({ relatedFeatureAdoption: 0.29 }),
      );
      expect(result.shouldImplement).toBe(false);
    });

    it('CRITICAL — returns shouldImplement=false when cost/value tradeoff is bad', () => {
      // cost=60, value=4 → ratio 15 > 10 → bad tradeoff.
      const result = validateFeature(
        makeValidationInput({ implementationCost: 60 }),
      );
      expect(result.shouldImplement).toBe(false);
    });

    it('CRITICAL — returns shouldImplement=false when ALL thresholds fail', () => {
      const result = validateFeature(
        makeValidationInput({
          userDemandScore: 10,
          feedbackCount: 1,
          relatedFeatureAdoption: 0.05,
          implementationCost: 200,
          estimatedUsersImpacted: 0.01,
        }),
      );
      expect(result.shouldImplement).toBe(false);
      expect(result.confidenceLevel).toBe('low');
      expect(result.recommendedPriority).toBe('never');
    });

    it('records conditions for re-validation when shouldImplement=false', () => {
      const result = validateFeature(
        makeValidationInput({ userDemandScore: 30, feedbackCount: 5 }),
      );
      expect(result.conditions.some((c) => c.includes('user demand score'))).toBe(true);
      expect(result.conditions.some((c) => c.includes('feedback entries'))).toBe(true);
    });

    it('returns recommendedPriority=later when at least one threshold is met', () => {
      const result = validateFeature(
        makeValidationInput({ userDemandScore: 30, feedbackCount: 5, relatedFeatureAdoption: 0.4 }),
      );
      // relatedFeatureAdoption met (>=0.3) → at least 1 threshold → later.
      expect(result.shouldImplement).toBe(false);
      expect(result.recommendedPriority).toBe('later');
    });
  });

  describe('isCostValueAcceptable', () => {
    it('returns true when cost/value ratio <= 10', () => {
      expect(
        isCostValueAcceptable(makeValidationInput({ implementationCost: 10 })),
      ).toBe(true);
      expect(
        isCostValueAcceptable(makeValidationInput({ implementationCost: 40 })),
      ).toBe(true); // 40/4 = 10 — boundary
    });

    it('returns false when cost/value ratio > 10', () => {
      expect(
        isCostValueAcceptable(makeValidationInput({ implementationCost: 41 })),
      ).toBe(false); // 41/4 = 10.25
      expect(
        isCostValueAcceptable(makeValidationInput({ implementationCost: 100 })),
      ).toBe(false);
    });

    it('handles low-value features strictly', () => {
      // value=1 → 10 dev-days is the boundary.
      const candidate = makeCandidate({ estimatedValue: 1 });
      expect(
        isCostValueAcceptable({
          ...makeValidationInput(),
          feature: candidate,
          implementationCost: 10,
        }),
      ).toBe(true);
      expect(
        isCostValueAcceptable({
          ...makeValidationInput(),
          feature: candidate,
          implementationCost: 11,
        }),
      ).toBe(false);
    });
  });

  describe('validateFeatures (aggregate)', () => {
    it('aggregates per-candidate results', () => {
      const inputs = [
        makeValidationInput({ feature: makeCandidate({ key: 'recurring_expenses' }) }),
        makeValidationInput({
          feature: makeCandidate({ key: 'budget_tracking', name: 'Budget' }),
          userDemandScore: 20,
          feedbackCount: 5,
        }),
        makeValidationInput({
          feature: makeCandidate({ key: 'accounting_exports', name: 'Accounting' }),
          userDemandScore: 80,
          feedbackCount: 50,
          relatedFeatureAdoption: 0.6,
        }),
      ];
      const summary = validateFeatures(inputs);
      expect(summary.totalCandidates).toBe(3);
      expect(summary.shouldImplementCount).toBe(2);
      expect(summary.nowCount).toBe(2);
      expect(summary.laterCount).toBe(1);
      expect(summary.neverCount).toBe(0);
    });

    it('returns a frozen summary', () => {
      const summary = validateFeatures([makeValidationInput()]);
      expect(Object.isFrozen(summary)).toBe(true);
      expect(Object.isFrozen(summary.results)).toBe(true);
    });
  });

  describe('CRITICAL — every feature must be validated against user demand', () => {
    it('no feature is shouldImplement=true when userDemandScore is 0', () => {
      for (const candidate of FEATURE_CANDIDATES) {
        const result = validateFeature(
          makeValidationInput({
            feature: candidate,
            userDemandScore: 0,
            feedbackCount: 0,
            relatedFeatureAdoption: 0,
          }),
        );
        expect(result.shouldImplement).toBe(false);
      }
    });

    it('every feature has evidenceSources referencing privacy_safe_analytics', () => {
      for (const candidate of FEATURE_CANDIDATES) {
        const result = validateFeature(makeValidationInput({ feature: candidate }));
        for (const source of result.evidenceSources) {
          expect(source.startsWith('privacy_safe_analytics:')).toBe(true);
        }
      }
    });

    it('shouldImplement=true REQUIRES userDemandScore >= 50', () => {
      // Test the boundary: demand=50 (at threshold) is allowed; demand=49 is not.
      const at = validateFeature(makeValidationInput({ userDemandScore: 50 }));
      const below = validateFeature(makeValidationInput({ userDemandScore: 49 }));
      expect(at.shouldImplement).toBe(true);
      expect(below.shouldImplement).toBe(false);
    });

    it('shouldImplement=true REQUIRES feedbackCount >= 20', () => {
      const at = validateFeature(makeValidationInput({ feedbackCount: 20 }));
      const below = validateFeature(makeValidationInput({ feedbackCount: 19 }));
      expect(at.shouldImplement).toBe(true);
      expect(below.shouldImplement).toBe(false);
    });

    it('shouldImplement=true REQUIRES relatedFeatureAdoption >= 0.3', () => {
      const at = validateFeature(makeValidationInput({ relatedFeatureAdoption: 0.3 }));
      const below = validateFeature(makeValidationInput({ relatedFeatureAdoption: 0.299 }));
      expect(at.shouldImplement).toBe(true);
      expect(below.shouldImplement).toBe(false);
    });

    it('every feature in FEATURE_CANDIDATES is well-formed (10 candidates)', () => {
      expect(FEATURE_CANDIDATES.length).toBe(10);
      for (const c of FEATURE_CANDIDATES) {
        expect(c.userDemandScore).toBeGreaterThanOrEqual(0);
        expect(c.userDemandScore).toBeLessThanOrEqual(100);
      }
    });

    it('CRITICAL — privacy-safe analytics source is the ONLY accepted source', () => {
      // Sanity check: the allowed sources list is exactly the singleton.
      expect(ALLOWED_ANALYTICS_SOURCES.length).toBe(1);
      expect(ALLOWED_ANALYTICS_SOURCES[0]).toBe('privacy_safe_analytics');
    });
  });
});
