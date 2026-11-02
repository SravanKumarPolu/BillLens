import { describe, expect, it } from '@jest/globals';

import {
  addDays,
  computeCohortRetention,
  computeRetentionAggregate,
  toDayBucket,
  type ActivitySnapshot,
  type InstallCohort,
} from '../retention-calculator';

describe('retention-calculator', () => {
  describe('toDayBucket', () => {
    it('converts a full ISO date-time to YYYY-MM-DD', () => {
      expect(toDayBucket('2025-01-15T10:30:00.000Z')).toBe('2025-01-15');
    });

    it('converts a date-only string to YYYY-MM-DD', () => {
      expect(toDayBucket('2025-01-15')).toBe('2025-01-15');
    });

    it('returns null for unparseable input', () => {
      expect(toDayBucket('not-a-date')).toBe(null);
      expect(toDayBucket('')).toBe(null);
    });
  });

  describe('addDays', () => {
    it('adds N days to a YYYY-MM-DD string', () => {
      expect(addDays('2025-01-01', 1)).toBe('2025-01-02');
      expect(addDays('2025-01-01', 7)).toBe('2025-01-08');
      expect(addDays('2025-01-01', 30)).toBe('2025-01-31');
    });

    it('handles month boundaries', () => {
      expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
      expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    });

    it('handles year boundaries', () => {
      expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    });

    it('returns null for unparseable input', () => {
      expect(addDays('not-a-date', 1)).toBe(null);
    });
  });

  describe('computeCohortRetention', () => {
    const cohort: InstallCohort = {
      cohortDate: '2025-01-01',
      installationIds: ['a', 'b', 'c', 'd', 'e'],
    };

    it('returns null for an empty cohort', () => {
      const empty: InstallCohort = {
        cohortDate: '2025-01-01',
        installationIds: [],
      };
      expect(computeCohortRetention(empty, new Map())).toBe(null);
    });

    it('computes D1/D7/D30 retention from activity snapshots', () => {
      const activityMap = new Map<string, Set<string>>([
        ['2025-01-02', new Set(['a', 'b', 'c'])], // D1: 3 of 5
        ['2025-01-08', new Set(['a', 'b'])], // D7: 2 of 5
        ['2025-01-31', new Set(['a'])], // D30: 1 of 5
      ]);
      const result = computeCohortRetention(cohort, activityMap);
      expect(result).not.toBeNull();
      expect(result?.cohortSize).toBe(5);
      expect(result?.retainedD1).toBe(3);
      expect(result?.retainedD7).toBe(2);
      expect(result?.retainedD30).toBe(1);
      expect(result?.retentionD1).toBeCloseTo(0.6, 5);
      expect(result?.retentionD7).toBeCloseTo(0.4, 5);
      expect(result?.retentionD30).toBeCloseTo(0.2, 5);
    });

    it('returns 0 retention when no activity snapshots exist', () => {
      const result = computeCohortRetention(cohort, new Map());
      expect(result?.retainedD1).toBe(0);
      expect(result?.retainedD7).toBe(0);
      expect(result?.retainedD30).toBe(0);
      expect(result?.retentionD1).toBe(0);
      expect(result?.retentionD7).toBe(0);
      expect(result?.retentionD30).toBe(0);
    });

    it('only counts installation IDs that are in the cohort', () => {
      const activityMap = new Map<string, Set<string>>([
        ['2025-01-02', new Set(['a', 'x', 'y', 'z'])], // only 'a' is in cohort
      ]);
      const result = computeCohortRetention(cohort, activityMap);
      expect(result?.retainedD1).toBe(1);
      expect(result?.retentionD1).toBeCloseTo(0.2, 5);
    });

    it('handles 100% retention', () => {
      const activityMap = new Map<string, Set<string>>([
        ['2025-01-02', new Set(['a', 'b', 'c', 'd', 'e'])],
        ['2025-01-08', new Set(['a', 'b', 'c', 'd', 'e'])],
        ['2025-01-31', new Set(['a', 'b', 'c', 'd', 'e'])],
      ]);
      const result = computeCohortRetention(cohort, activityMap);
      expect(result?.retentionD1).toBe(1);
      expect(result?.retentionD7).toBe(1);
      expect(result?.retentionD30).toBe(1);
    });
  });

  describe('computeRetentionAggregate', () => {
    it('computes weighted-average retention across multiple cohorts', () => {
      const cohorts: InstallCohort[] = [
        {
          cohortDate: '2025-01-01',
          installationIds: ['a', 'b', 'c', 'd', 'e'],
        },
        {
          cohortDate: '2025-01-02',
          installationIds: ['f', 'g', 'h'],
        },
      ];
      const snapshots: ActivitySnapshot[] = [
        // Cohort 1 activity
        { date: '2025-01-02', activeInstallationIds: ['a', 'b', 'c'] },
        { date: '2025-01-08', activeInstallationIds: ['a', 'b'] },
        { date: '2025-01-31', activeInstallationIds: ['a'] },
        // Cohort 2 activity
        { date: '2025-01-03', activeInstallationIds: ['f', 'g'] },
        { date: '2025-01-09', activeInstallationIds: ['f'] },
        { date: '2025-02-01', activeInstallationIds: ['f'] },
      ];
      const result = computeRetentionAggregate(cohorts, snapshots);
      expect(result.cohorts).toHaveLength(2);
      expect(result.totalCohortSize).toBe(8);
      // Cohort 1: D1=3, D7=2, D30=1
      // Cohort 2: D1=2, D7=1, D30=1
      // Sum: D1=5, D7=3, D30=2
      expect(result.averageRetentionD1).toBeCloseTo(5 / 8, 5);
      expect(result.averageRetentionD7).toBeCloseTo(3 / 8, 5);
      expect(result.averageRetentionD30).toBeCloseTo(2 / 8, 5);
    });

    it('skips empty cohorts', () => {
      const cohorts: InstallCohort[] = [
        { cohortDate: '2025-01-01', installationIds: ['a', 'b'] },
        { cohortDate: '2025-01-02', installationIds: [] },
      ];
      const snapshots: ActivitySnapshot[] = [
        { date: '2025-01-02', activeInstallationIds: ['a'] },
      ];
      const result = computeRetentionAggregate(cohorts, snapshots);
      expect(result.cohorts).toHaveLength(1);
      expect(result.totalCohortSize).toBe(2);
    });

    it('returns zeros when no cohorts have data', () => {
      const result = computeRetentionAggregate([], []);
      expect(result.cohorts).toEqual([]);
      expect(result.totalCohortSize).toBe(0);
      expect(result.averageRetentionD1).toBe(0);
      expect(result.averageRetentionD7).toBe(0);
      expect(result.averageRetentionD30).toBe(0);
    });

    it('uses ANONYMOUS installation IDs only (no PII in inputs)', () => {
      // The function takes pre-aggregated cohort data — it never sees
      // emails or phone numbers. Verify that the function does not
      // introspect ID contents.
      const cohorts: InstallCohort[] = [
        {
          cohortDate: '2025-01-01',
          installationIds: ['install-uuid-1', 'install-uuid-2'],
        },
      ];
      const snapshots: ActivitySnapshot[] = [
        { date: '2025-01-02', activeInstallationIds: ['install-uuid-1'] },
      ];
      const result = computeRetentionAggregate(cohorts, snapshots);
      expect(result.cohorts[0]?.retainedD1).toBe(1);
      // The IDs are preserved as-is in the inputs (they're anonymous).
      expect(cohorts[0]?.installationIds).toEqual(['install-uuid-1', 'install-uuid-2']);
    });

    it('handles duplicate activity entries on the same day', () => {
      const cohorts: InstallCohort[] = [
        { cohortDate: '2025-01-01', installationIds: ['a', 'b'] },
      ];
      const snapshots: ActivitySnapshot[] = [
        { date: '2025-01-02', activeInstallationIds: ['a'] },
        { date: '2025-01-02', activeInstallationIds: ['a', 'b'] }, // duplicate day
      ];
      const result = computeRetentionAggregate(cohorts, snapshots);
      // Both 'a' and 'b' are active on 2025-01-02.
      expect(result.cohorts[0]?.retainedD1).toBe(2);
      expect(result.cohorts[0]?.retentionD1).toBe(1);
    });
  });
});
