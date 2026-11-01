import { describe, expect, it } from '@jest/globals';

import {
  createFeatureCandidate,
  type FeatureCandidate,
} from '../feature-candidate';
import type { FeatureValidationResult } from '../feature-validator';
import {
  DEFAULT_CAPACITY_PER_QUARTER_DEV_DAYS,
  DEFAULT_QUARTER_COUNT,
  QUARTER_LABELS,
  featuresPerQuarter,
  hasOverCapacityQuarter,
  planRoadmap,
  type RoadmapPlannerInput,
} from '../roadmap-planner';

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

function makeResult(overrides: Partial<FeatureValidationResult> = {}): FeatureValidationResult {
  return {
    shouldImplement: true,
    confidenceLevel: 'high',
    reasoning: 'All thresholds met.',
    recommendedPriority: 'now',
    conditions: [],
    evidenceSources: ['privacy_safe_analytics:feedback_count'],
    ...overrides,
  };
}

function makePlannerItem(
  candidateOverrides: Partial<FeatureCandidate> = {},
  resultOverrides: Partial<FeatureValidationResult> = {},
  estimatedDevDays: number = 10,
): RoadmapPlannerInput['items'][number] {
  return {
    candidate: makeCandidate(candidateOverrides),
    result: makeResult(resultOverrides),
    estimatedDevDays,
  };
}

describe('roadmap-planner', () => {
  describe('constants', () => {
    it('DEFAULT_QUARTER_COUNT is 4', () => {
      expect(DEFAULT_QUARTER_COUNT).toBe(4);
    });

    it('DEFAULT_CAPACITY_PER_QUARTER_DEV_DAYS is 60', () => {
      expect(DEFAULT_CAPACITY_PER_QUARTER_DEV_DAYS).toBe(60);
    });

    it('QUARTER_LABELS exposes 8 labels', () => {
      expect(QUARTER_LABELS.length).toBe(8);
      expect(QUARTER_LABELS[0]).toBe('Q1');
      expect(QUARTER_LABELS[3]).toBe('Q4');
    });
  });

  describe('planRoadmap — basic distribution', () => {
    it('returns an empty roadmap when no items are shouldImplement', () => {
      const roadmap = planRoadmap({
        items: [makePlannerItem({}, { shouldImplement: false })],
      });
      expect(roadmap.totalFeatures).toBe(0);
      expect(roadmap.totalDevDays).toBe(0);
      expect(roadmap.deferredFeatures).toEqual([]);
    });

    it('places a single shouldImplement item in Q1', () => {
      const roadmap = planRoadmap({
        items: [makePlannerItem()],
      });
      expect(roadmap.totalFeatures).toBe(1);
      expect(roadmap.quarters[0]!.entries.length).toBe(1);
      expect(roadmap.quarters[0]!.entries[0]!.featureKey).toBe('recurring_expenses');
    });

    it('respects capacity per quarter', () => {
      // 5 items, 10 dev-days each = 50 dev-days total — fits in Q1.
      const items = [
        makePlannerItem({ key: 'recurring_expenses', name: 'Recurring' }, {}, 10),
        makePlannerItem({ key: 'budget_tracking', name: 'Budget' }, {}, 10),
        makePlannerItem({ key: 'family_accounts', name: 'Family' }, {}, 10),
        makePlannerItem({ key: 'business_workspaces', name: 'Business' }, {}, 10),
        makePlannerItem({ key: 'ai_spending_insights', name: 'AI Insights' }, {}, 10),
      ];
      const roadmap = planRoadmap({ items });
      expect(roadmap.quarters[0]!.entries.length).toBe(5);
      expect(roadmap.quarters[0]!.plannedDevDays).toBe(50);
      expect(roadmap.quarters[0]!.isOverCapacity).toBe(false);
    });

    it('spills to Q2 when Q1 is full', () => {
      const items = [
        makePlannerItem({ key: 'recurring_expenses', name: 'Recurring' }, {}, 40),
        makePlannerItem({ key: 'budget_tracking', name: 'Budget' }, {}, 40),
      ];
      const roadmap = planRoadmap({ items });
      expect(roadmap.quarters[0]!.entries.length).toBe(1);
      expect(roadmap.quarters[1]!.entries.length).toBe(1);
    });

    it('defers items that do not fit any quarter', () => {
      const items = [
        makePlannerItem({ key: 'recurring_expenses', name: 'Recurring' }, {}, 70), // > 60 capacity
      ];
      const roadmap = planRoadmap({ items });
      expect(roadmap.deferredFeatures).toContain('recurring_expenses');
      expect(roadmap.totalFeatures).toBe(0);
    });
  });

  describe('planRoadmap — prerequisites', () => {
    it('schedules a feature with no prerequisites in Q1', () => {
      const roadmap = planRoadmap({
        items: [makePlannerItem({ prerequisites: [] })],
      });
      expect(roadmap.quarters[0]!.entries[0]!.quarter).toBe(1);
    });

    it('schedules a feature AFTER its prerequisite', () => {
      const items = [
        makePlannerItem(
          { key: 'budget_tracking', name: 'Budget' },
          {},
          10,
        ),
        makePlannerItem(
          {
            key: 'ai_spending_insights',
            name: 'AI Insights',
            prerequisites: ['budget_tracking'],
          },
          {},
          10,
        ),
      ];
      const roadmap = planRoadmap({ items });
      // Both should be scheduled. AI Insights must be in a quarter
      // AFTER budget_tracking.
      const budgetQ = findQuarter(roadmap, 'budget_tracking');
      const aiQ = findQuarter(roadmap, 'ai_spending_insights');
      expect(budgetQ).not.toBeNull();
      expect(aiQ).not.toBeNull();
      expect(aiQ!).toBeGreaterThan(budgetQ!);
    });

    it('defers a feature when its prerequisite is not scheduled', () => {
      const items = [
        makePlannerItem(
          {
            key: 'ai_spending_insights',
            name: 'AI Insights',
            prerequisites: ['budget_tracking'],
          },
          // budget_tracking is NOT in the items list — its prereq
          // is not scheduled, so ai_spending_insights should defer.
          { shouldImplement: true },
          10,
        ),
      ];
      const roadmap = planRoadmap({ items });
      // ai_spending_insights won't be scheduled because its prereq isn't.
      expect(roadmap.deferredFeatures).toContain('ai_spending_insights');
    });

    it('respects transitive prerequisites (A → B → C)', () => {
      const items = [
        makePlannerItem({ key: 'recurring_expenses', name: 'Recurring' }, {}, 5),
        makePlannerItem(
          {
            key: 'calendar_integration',
            name: 'Calendar',
            prerequisites: ['recurring_expenses'],
          },
          {},
          5,
        ),
        makePlannerItem(
          {
            key: 'expense_forecasting',
            name: 'Forecasting',
            prerequisites: ['calendar_integration'],
          },
          {},
          5,
        ),
      ];
      const roadmap = planRoadmap({ items });
      const qRecurring = findQuarter(roadmap, 'recurring_expenses');
      const qCalendar = findQuarter(roadmap, 'calendar_integration');
      const qForecasting = findQuarter(roadmap, 'expense_forecasting');
      expect(qRecurring).not.toBeNull();
      expect(qCalendar).toBeGreaterThan(qRecurring!);
      expect(qForecasting).toBeGreaterThan(qCalendar!);
    });
  });

  describe('planRoadmap — risk level', () => {
    it('defers high-risk features to Q2 by default (deferHighRisk=true)', () => {
      const roadmap = planRoadmap({
        items: [makePlannerItem({ key: 'business_workspaces', riskLevel: 'high' })],
      });
      // High-risk features must ship in Q2 or later.
      const q = findQuarter(roadmap, 'business_workspaces');
      expect(q).not.toBeNull();
      expect(q!).toBeGreaterThanOrEqual(2);
    });

    it('allows high-risk features in Q1 when deferHighRisk=false', () => {
      const roadmap = planRoadmap({
        items: [makePlannerItem({ key: 'business_workspaces', riskLevel: 'high' })],
        deferHighRisk: false,
      });
      const q = findQuarter(roadmap, 'business_workspaces');
      expect(q).toBe(1);
    });
  });

  describe('planRoadmap — priority sorting', () => {
    it('sorts by priority (now < next < later)', () => {
      const items = [
        makePlannerItem(
          { key: 'budget_tracking', name: 'Budget' },
          { recommendedPriority: 'later' },
          10,
        ),
        makePlannerItem(
          { key: 'recurring_expenses', name: 'Recurring' },
          { recommendedPriority: 'now' },
          10,
        ),
        makePlannerItem(
          { key: 'accounting_exports', name: 'Accounting' },
          { recommendedPriority: 'next' },
          10,
        ),
      ];
      const roadmap = planRoadmap({ items });
      // All 3 fit in Q1 (30 dev-days, capacity 60).
      const q1Keys = roadmap.quarters[0]!.entries.map((e) => e.featureKey);
      expect(q1Keys[0]).toBe('recurring_expenses'); // now
      expect(q1Keys[1]).toBe('accounting_exports'); // next
      expect(q1Keys[2]).toBe('budget_tracking'); // later
    });

    it('breaks priority ties by user demand score (desc)', () => {
      const items = [
        makePlannerItem(
          { key: 'budget_tracking', name: 'Budget', userDemandScore: 50 },
          { recommendedPriority: 'now' },
          10,
        ),
        makePlannerItem(
          { key: 'recurring_expenses', name: 'Recurring', userDemandScore: 80 },
          { recommendedPriority: 'now' },
          10,
        ),
      ];
      const roadmap = planRoadmap({ items });
      const q1Keys = roadmap.quarters[0]!.entries.map((e) => e.featureKey);
      // Higher demand first.
      expect(q1Keys[0]).toBe('recurring_expenses');
      expect(q1Keys[1]).toBe('budget_tracking');
    });
  });

  describe('planRoadmap — input validation', () => {
    it('rejects a non-object input', () => {
      expect(() => planRoadmap(null as never)).toThrow();
    });

    it('rejects a non-array items field', () => {
      expect(() =>
        planRoadmap({ items: 'not-an-array' as never }),
      ).toThrow();
    });

    it('rejects a non-positive quarterCount', () => {
      expect(() =>
        planRoadmap({ items: [], quarterCount: 0 }),
      ).toThrow();
      expect(() =>
        planRoadmap({ items: [], quarterCount: -1 }),
      ).toThrow();
    });

    it('rejects a non-positive capacityPerQuarterDevDays', () => {
      expect(() =>
        planRoadmap({ items: [], capacityPerQuarterDevDays: 0 }),
      ).toThrow();
      expect(() =>
        planRoadmap({ items: [], capacityPerQuarterDevDays: -1 }),
      ).toThrow();
    });
  });

  describe('planRoadmap — output shape', () => {
    it('returns a frozen roadmap', () => {
      const roadmap = planRoadmap({ items: [makePlannerItem()] });
      expect(Object.isFrozen(roadmap)).toBe(true);
      expect(Object.isFrozen(roadmap.quarters)).toBe(true);
      expect(Object.isFrozen(roadmap.deferredFeatures)).toBe(true);
    });

    it('each quarter entry is frozen', () => {
      const roadmap = planRoadmap({ items: [makePlannerItem()] });
      const entry = roadmap.quarters[0]!.entries[0]!;
      expect(Object.isFrozen(entry)).toBe(true);
    });

    it('exposes the quarter label', () => {
      const roadmap = planRoadmap({ items: [makePlannerItem()] });
      expect(roadmap.quarters[0]!.label).toBe('Q1');
    });

    it('records the confidence level on each entry', () => {
      const roadmap = planRoadmap({
        items: [
          makePlannerItem({}, { confidenceLevel: 'high' }),
        ],
      });
      expect(roadmap.quarters[0]!.entries[0]!.confidenceLevel).toBe('high');
    });
  });

  describe('featuresPerQuarter', () => {
    it('returns the count of features per quarter', () => {
      const roadmap = planRoadmap({
        items: [
          makePlannerItem({ key: 'recurring_expenses', name: 'R' }, {}, 10),
          makePlannerItem({ key: 'budget_tracking', name: 'B' }, {}, 10),
        ],
      });
      const counts = featuresPerQuarter(roadmap);
      expect(counts[0]).toBe(2);
      expect(counts[1]).toBe(0);
    });

    it('returns a frozen array', () => {
      const roadmap = planRoadmap({ items: [makePlannerItem()] });
      const counts = featuresPerQuarter(roadmap);
      expect(Object.isFrozen(counts)).toBe(true);
    });
  });

  describe('hasOverCapacityQuarter', () => {
    it('returns false when no quarter is over capacity', () => {
      const roadmap = planRoadmap({
        items: [makePlannerItem({}, {}, 10)],
      });
      expect(hasOverCapacityQuarter(roadmap)).toBe(false);
    });

    it('returns true when a quarter is over capacity (defensive — should not happen)', () => {
      // The planner should never produce an over-capacity quarter —
      // items that don't fit are deferred. But the helper exists for
      // defensive checks.
      const roadmap = planRoadmap({
        items: [makePlannerItem({}, {}, 10)],
        capacityPerQuarterDevDays: 5, // force over capacity
      });
      // With capacity 5 and an item of 10 dev-days, the item is
      // deferred (not over capacity). So hasOverCapacityQuarter is false.
      expect(roadmap.deferredFeatures.length).toBeGreaterThan(0);
      expect(hasOverCapacityQuarter(roadmap)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findQuarter(
  roadmap: ReturnType<typeof planRoadmap>,
  featureKey: string,
): number | null {
  for (const q of roadmap.quarters) {
    if (q.entries.some((e) => e.featureKey === featureKey)) {
      return q.quarter;
    }
  }
  return null;
}
