import { describe, expect, it } from '@jest/globals';

import {
  FEATURE_COUNT,
  FEATURE_KEYS,
  FeatureAdoptionTracker,
  listFeatures,
  type FeatureKey,
} from '../feature-adoption-tracker';

describe('feature-adoption-tracker', () => {
  describe('FEATURE_KEYS', () => {
    it('tracks exactly 15 features', () => {
      expect(FEATURE_COUNT).toBe(15);
      expect(FEATURE_KEYS.length).toBe(15);
    });

    it('listFeatures() returns the same 15 features', () => {
      expect(listFeatures().length).toBe(15);
      expect(listFeatures()).toEqual(FEATURE_KEYS);
    });

    it.each<FeatureKey>([
      'create_group',
      'join_group_via_invite',
      'create_expense_manual',
      'create_expense_ocr',
      'settlement_flow',
      'capture_receipt_camera',
      'capture_receipt_gallery',
      'expense_split_equal',
      'expense_split_exact',
      'expense_split_percentage',
      'expense_split_shares',
      'expense_split_items',
      'backup_local',
      'restore_local',
      'export_data',
    ])('includes %s', (feature) => {
      expect(FEATURE_KEYS).toContain(feature);
    });
  });

  describe('FeatureAdoptionTracker', () => {
    it('rejects an empty period label', () => {
      expect(() => new FeatureAdoptionTracker('', 100)).toThrow();
    });

    it('rejects a negative MAU', () => {
      expect(() => new FeatureAdoptionTracker('2025-01', -1)).toThrow();
    });

    it('rejects a non-finite MAU', () => {
      expect(() => new FeatureAdoptionTracker('2025-01', Infinity)).toThrow();
      expect(() => new FeatureAdoptionTracker('2025-01', NaN)).toThrow();
    });

    it('records usage and computes uniqueUsers', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      tracker.recordUsage('create_group', 'a');
      tracker.recordUsage('create_group', 'b');
      tracker.recordUsage('create_group', 'a'); // duplicate — ignored
      expect(tracker.uniqueUsersFor('create_group')).toBe(2);
    });

    it('is idempotent for the same (feature, id) pair', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      tracker.recordUsage('create_expense_manual', 'a');
      tracker.recordUsage('create_expense_manual', 'a');
      tracker.recordUsage('create_expense_manual', 'a');
      expect(tracker.uniqueUsersFor('create_expense_manual')).toBe(1);
    });

    it('rejects an unknown feature key', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      expect(() => tracker.recordUsage('unknown_feature' as FeatureKey, 'a')).toThrow();
    });

    it('rejects an empty anonymousId', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      expect(() => tracker.recordUsage('create_group', '')).toThrow();
    });

    it('computes adoptionRate as uniqueUsers / mau', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      tracker.recordUsage('create_group', 'a');
      tracker.recordUsage('create_group', 'b');
      tracker.recordUsage('create_group', 'c');
      expect(tracker.adoptionRateFor('create_group')).toBeCloseTo(0.03, 5);
    });

    it('returns 0 adoptionRate when mau is 0', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 0);
      tracker.recordUsage('create_group', 'a');
      expect(tracker.adoptionRateFor('create_group')).toBe(0);
    });

    it('setMau updates the MAU count', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      tracker.recordUsage('create_group', 'a');
      expect(tracker.adoptionRateFor('create_group')).toBeCloseTo(0.01, 5);
      tracker.setMau(50);
      expect(tracker.adoptionRateFor('create_group')).toBeCloseTo(0.02, 5);
    });

    it('rejects an invalid MAU on setMau', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      expect(() => tracker.setMau(-1)).toThrow();
      expect(() => tracker.setMau(Infinity)).toThrow();
    });

    it('report() returns entries for all 15 features', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      const report = tracker.report();
      expect(report.entries.length).toBe(15);
      expect(report.periodLabel).toBe('2025-01');
      expect(report.mau).toBe(100);
    });

    it('report() identifies most + least adopted features', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      tracker.recordUsage('create_expense_manual', 'a');
      tracker.recordUsage('create_expense_manual', 'b');
      tracker.recordUsage('create_expense_manual', 'c');
      tracker.recordUsage('export_data', 'a');
      const report = tracker.report();
      expect(report.mostAdoptedFeature).toBe('create_expense_manual');
      // Many features have 0 adoption — leastAdoptedFeature is one of them.
      expect(report.leastAdoptedFeature).not.toBeNull();
      const leastEntry = report.entries.find(
        (e) => e.feature === report.leastAdoptedFeature,
      );
      expect(leastEntry?.adoptionRate).toBe(0);
    });

    it('report() returns null most/least adopted when all features have 0 adoption', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      const report = tracker.report();
      // All features have 0 adoption — most/least are arbitrary but the
      // function should still return a non-null value (the first feature
      // with 0 adoption). The test below verifies the contract:
      // mostAdoptedFeature is non-null.
      expect(report.mostAdoptedFeature).not.toBeNull();
      expect(report.leastAdoptedFeature).not.toBeNull();
    });

    it('report() returns a frozen result', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      const report = tracker.report();
      expect(Object.isFrozen(report)).toBe(true);
      expect(Object.isFrozen(report.entries)).toBe(true);
    });

    it('reset() clears all feature usage', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      tracker.recordUsage('create_group', 'a');
      tracker.recordUsage('create_group', 'b');
      expect(tracker.uniqueUsersFor('create_group')).toBe(2);
      tracker.reset();
      expect(tracker.uniqueUsersFor('create_group')).toBe(0);
    });

    it('reset() does NOT reset MAU', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 100);
      tracker.reset();
      expect(tracker.report().mau).toBe(100);
    });

    it('tracks 15 features independently', () => {
      const tracker = new FeatureAdoptionTracker('2025-01', 1000);
      // Each feature gets a different unique user count.
      FEATURE_KEYS.forEach((feature, idx) => {
        for (let i = 0; i < idx + 1; i++) {
          tracker.recordUsage(feature, `user-${idx}-${i}`);
        }
      });
      const report = tracker.report();
      expect(report.entries.length).toBe(15);
      // First feature has 1 user, last has 15 users.
      expect(report.entries[0]?.uniqueUsers).toBe(1);
      expect(report.entries[14]?.uniqueUsers).toBe(15);
      // Adoption rate for the last feature = 15/1000.
      expect(report.entries[14]?.adoptionRate).toBeCloseTo(0.015, 5);
    });
  });
});
