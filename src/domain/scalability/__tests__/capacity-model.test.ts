import {
  CAPACITY_METRICS,
  computeUtilization,
  projectGrowth,
  getScalingAction,
  getCapacityMetric,
  getMetricsRequiringAction,
} from '../capacity-model';

describe('scalability / capacity-model', () => {
  describe('computeUtilization', () => {
    it('returns 0 when limit is 0 or negative', () => {
      expect(computeUtilization(100, 0)).toBe(0);
      expect(computeUtilization(100, -1)).toBe(0);
    });
    it('returns 0 for non-finite inputs', () => {
      expect(computeUtilization(Number.NaN, 100)).toBe(0);
      expect(computeUtilization(100, Number.NaN)).toBe(0);
      expect(computeUtilization(Number.POSITIVE_INFINITY, 100)).toBe(0);
    });
    it('returns 0 for negative current', () => {
      expect(computeUtilization(-50, 100)).toBe(0);
    });
    it('returns percentage for valid inputs', () => {
      expect(computeUtilization(50, 100)).toBe(50);
      expect(computeUtilization(75, 100)).toBe(75);
      expect(computeUtilization(120, 100)).toBe(120); // over-capacity
    });
    it('handles fractional values', () => {
      expect(computeUtilization(1, 3)).toBeCloseTo(33.33, 1);
    });
  });

  describe('projectGrowth', () => {
    it('returns current when months is 0', () => {
      expect(projectGrowth(1000, 0.05, 0)).toBe(1000);
    });
    it('returns current when rate is 0', () => {
      expect(projectGrowth(1000, 0, 12)).toBe(1000);
    });
    it('compounds correctly at 5% for 12 months', () => {
      const result = projectGrowth(1000, 0.05, 12);
      expect(result).toBeCloseTo(1000 * Math.pow(1.05, 12), 5);
    });
    it('handles negative growth (decline)', () => {
      const result = projectGrowth(1000, -0.1, 3);
      expect(result).toBeCloseTo(1000 * 0.9 * 0.9 * 0.9, 5);
    });
    it('returns 0 for negative current', () => {
      expect(projectGrowth(-100, 0.05, 12)).toBe(0);
    });
    it('returns 0 for non-finite inputs', () => {
      expect(projectGrowth(Number.NaN, 0.05, 12)).toBe(0);
      expect(projectGrowth(100, Number.NaN, 12)).toBe(0);
    });
    it('clamps absurd month counts to 600', () => {
      // 1000 months would overflow; clamp to 600.
      const result = projectGrowth(10, 0.01, 1000);
      const expected = 10 * Math.pow(1.01, 600);
      expect(result).toBeCloseTo(expected, 2);
    });
    it('returns Infinity for runaway growth', () => {
      // 1e250 * (1.9^600) overflows double precision.
      const result = projectGrowth(1e250, 0.9, 600);
      expect(result).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('getScalingAction', () => {
    it('returns none below 50% of threshold', () => {
      expect(getScalingAction(20, 70)).toBe('none');
      expect(getScalingAction(34, 70)).toBe('none');
    });
    it('returns monitor between 50% and threshold', () => {
      expect(getScalingAction(35, 70)).toBe('monitor');
      expect(getScalingAction(69, 70)).toBe('monitor');
    });
    it('returns plan between threshold and threshold+20', () => {
      expect(getScalingAction(70, 70)).toBe('plan');
      expect(getScalingAction(85, 70)).toBe('plan');
      expect(getScalingAction(89, 70)).toBe('plan');
    });
    it('returns scale_now at threshold+20 or above', () => {
      expect(getScalingAction(90, 70)).toBe('scale_now');
      expect(getScalingAction(95, 70)).toBe('scale_now');
    });
    it('returns scale_now at 100% or above', () => {
      expect(getScalingAction(100, 70)).toBe('scale_now');
      expect(getScalingAction(150, 70)).toBe('scale_now');
    });
    it('returns none for non-finite inputs', () => {
      expect(getScalingAction(Number.NaN, 70)).toBe('none');
      expect(getScalingAction(50, Number.NaN)).toBe('none');
    });
    it('returns none for negative utilisation', () => {
      expect(getScalingAction(-10, 70)).toBe('none');
    });
    it('treats negative threshold as 0', () => {
      // With safeThreshold clamped to 0, ANY positive utilisation
      // meets the threshold (>= 0). At util 0, the system is idle
      // so 'none' is correct. We treat the boundary as 'plan' (the
      // threshold itself is met) but the 'util 0' case is special.
      expect(getScalingAction(0, -10)).toBe('plan');
      expect(getScalingAction(5, -10)).toBe('plan');
      expect(getScalingAction(20, -10)).toBe('scale_now');
    });
  });

  describe('CAPACITY_METRICS registry', () => {
    it('has exactly 12 metrics', () => {
      expect(CAPACITY_METRICS).toHaveLength(12);
    });
    it('all metrics are frozen', () => {
      for (const m of CAPACITY_METRICS) {
        expect(Object.isFrozen(m)).toBe(true);
      }
    });
    it('includes all expected metric names', () => {
      const names = CAPACITY_METRICS.map((m) => m.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'db_connections',
          'db_storage_gb',
          'api_rps',
          'sync_queue_depth',
          'ocr_queue_depth',
          'attachment_storage_gb',
          'search_index_size_gb',
          'cache_hit_rate_percent',
          'background_workers',
          'push_notification_throughput_per_min',
          'webhook_delivery_per_min',
          'analytics_event_volume_per_day',
        ]),
      );
    });
    it('each metric has utilisation > 0 and projectedValue >= 0', () => {
      for (const m of CAPACITY_METRICS) {
        expect(m.utilizationPercent).toBeGreaterThanOrEqual(0);
        expect(m.projectedValue).toBeGreaterThanOrEqual(0);
      }
    });
    it('each metric action is one of the four allowed values', () => {
      const allowed = new Set(['none', 'monitor', 'plan', 'scale_now']);
      for (const m of CAPACITY_METRICS) {
        expect(allowed.has(m.actionRequired)).toBe(true);
      }
    });
  });

  describe('getCapacityMetric', () => {
    it('returns the metric for a known name', () => {
      const m = getCapacityMetric('db_connections');
      expect(m).not.toBeNull();
      expect(m?.name).toBe('db_connections');
    });
    it('returns null for an unknown name', () => {
      expect(getCapacityMetric('nonexistent')).toBeNull();
    });
  });

  describe('getMetricsRequiringAction', () => {
    it('returns only metrics whose action is not none', () => {
      const list = getMetricsRequiringAction();
      for (const m of list) {
        expect(m.actionRequired).not.toBe('none');
      }
    });
    it('returns a subset of CAPACITY_METRICS', () => {
      const list = getMetricsRequiringAction();
      expect(list.length).toBeLessThanOrEqual(CAPACITY_METRICS.length);
    });
  });
});
