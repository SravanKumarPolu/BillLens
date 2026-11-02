import {
  RECOVERY_PLANS,
  getRecoveryPlan,
  meetsRto,
  meetsRpo,
  type DisasterScenario,
} from '../disaster-recovery';

describe('scalability / disaster-recovery', () => {
  const ALL_SCENARIOS: DisasterScenario[] = [
    'region_failure',
    'database_failure',
    'storage_failure',
    'api_outage',
    'data_corruption',
    'ransomware',
    'cdns_failure',
  ];

  describe('RECOVERY_PLANS', () => {
    it('defines a plan for every scenario', () => {
      for (const s of ALL_SCENARIOS) {
        expect(RECOVERY_PLANS[s]).toBeDefined();
      }
      expect(Object.keys(RECOVERY_PLANS).sort()).toEqual(
        [...ALL_SCENARIOS].sort(),
      );
    });
    it('every plan is frozen', () => {
      for (const s of ALL_SCENARIOS) {
        expect(Object.isFrozen(RECOVERY_PLANS[s])).toBe(true);
      }
    });
    it('every plan has positive RTO and RPO', () => {
      for (const s of ALL_SCENARIOS) {
        const plan = RECOVERY_PLANS[s];
        expect(plan.rtoMinutes).toBeGreaterThan(0);
        expect(plan.rpoMinutes).toBeGreaterThanOrEqual(0);
      }
    });
    it('every plan has at least 4 ordered steps', () => {
      for (const s of ALL_SCENARIOS) {
        const plan = RECOVERY_PLANS[s];
        expect(plan.steps.length).toBeGreaterThanOrEqual(4);
      }
    });
    it('every plan has non-empty backup + failover + cadence', () => {
      for (const s of ALL_SCENARIOS) {
        const plan = RECOVERY_PLANS[s];
        expect(plan.backupStrategy.length).toBeGreaterThan(0);
        expect(plan.failoverStrategy.length).toBeGreaterThan(0);
        expect(plan.testingCadence.length).toBeGreaterThan(0);
      }
    });
    it('ransomware has the longest RTO (most severe)', () => {
      const ransomware = RECOVERY_PLANS.ransomware.rtoMinutes;
      for (const s of ALL_SCENARIOS) {
        if (s === 'ransomware') continue;
        expect(RECOVERY_PLANS[s].rtoMinutes).toBeLessThanOrEqual(ransomware);
      }
    });
    it('api_outage has RPO of 0 (no data loss for stateless tier)', () => {
      expect(RECOVERY_PLANS.api_outage.rpoMinutes).toBe(0);
    });
  });

  describe('getRecoveryPlan', () => {
    it('returns the plan for a known scenario', () => {
      const plan = getRecoveryPlan('region_failure');
      expect(plan.scenario).toBe('region_failure');
    });
    it('throws for an unknown scenario', () => {
      expect(() => getRecoveryPlan('unknown' as never)).toThrow();
    });
  });

  describe('meetsRto / meetsRpo', () => {
    it('meetsRto returns true when plan RTO is within target', () => {
      // api_outage has RTO 20; target 30 → meets.
      expect(meetsRto('api_outage', 30)).toBe(true);
      // api_outage has RTO 20; target 10 → does not meet.
      expect(meetsRto('api_outage', 10)).toBe(false);
    });
    it('meetsRpo returns true when plan RPO is within target', () => {
      expect(meetsRpo('region_failure', 10)).toBe(true); // rpo 5
      expect(meetsRpo('region_failure', 1)).toBe(false);
    });
  });
});
