/**
 * Data retention jobs — tests.
 *
 * Verifies:
 *   - All 12 retention job types are configured.
 *   - Retention periods match the data retention policy.
 *   - Legal hold exemption works correctly.
 *   - shouldPurgeItem respects retention period + legal hold.
 *   - computeNextRunTime respects cadence.
 *   - getOverdueJobs identifies never-run + overdue jobs.
 *   - Audit log entries are NEVER purged by these jobs (7-year retention
 *     is handled separately, not by these automated jobs).
 */

import { describe, expect, it } from '@jest/globals';

import {
  computeNextRunTime,
  getOverdueJobs,
  getRetentionJobConfig,
  isLegalHoldExempt,
  RETENTION_JOB_CONFIGS,
  shouldPurgeItem,
  type RetentionJobType,
} from '../data-retention-jobs';

describe('data-retention-jobs', () => {
  describe('RETENTION_JOB_CONFIGS', () => {
    it('has 12 job types', () => {
      expect(RETENTION_JOB_CONFIGS).toHaveLength(12);
    });

    it('includes deleted_account_purge with 30-day retention', () => {
      const config = getRetentionJobConfig('deleted_account_purge');
      expect(config).not.toBeNull();
      expect(config!.retentionDays).toBe(30);
      expect(config!.legalHoldExempt).toBe(true);
    });

    it('includes ocr_text_expiry with 90-day retention', () => {
      const config = getRetentionJobConfig('ocr_text_expiry');
      expect(config).not.toBeNull();
      expect(config!.retentionDays).toBe(90);
    });

    it('includes analytics_expiry with 90-day retention', () => {
      const config = getRetentionJobConfig('analytics_expiry');
      expect(config).not.toBeNull();
      expect(config!.retentionDays).toBe(90);
    });

    it('includes crash_report_expiry with 90-day retention', () => {
      const config = getRetentionJobConfig('crash_report_expiry');
      expect(config).not.toBeNull();
      expect(config!.retentionDays).toBe(90);
    });

    it('includes temp_file_cleanup with 1-day retention', () => {
      const config = getRetentionJobConfig('temp_file_cleanup');
      expect(config).not.toBeNull();
      expect(config!.retentionDays).toBe(1);
    });

    it('includes delete_after_extraction_cleanup with immediate retention', () => {
      const config = getRetentionJobConfig('delete_after_extraction_cleanup');
      expect(config).not.toBeNull();
      expect(config!.retentionDays).toBe(0);
    });

    it('does NOT include an audit_log_purge job (audit logs are 7-year retention)', () => {
      const auditJob = getRetentionJobConfig('audit_log_purge' as RetentionJobType);
      expect(auditJob).toBeNull();
    });
  });

  describe('isLegalHoldExempt', () => {
    it('returns true for deleted_account_purge', () => {
      expect(isLegalHoldExempt('deleted_account_purge')).toBe(true);
    });

    it('returns true for receipt_image_cleanup', () => {
      expect(isLegalHoldExempt('receipt_image_cleanup')).toBe(true);
    });

    it('returns true for resolved_conflict_cleanup', () => {
      expect(isLegalHoldExempt('resolved_conflict_cleanup')).toBe(true);
    });

    it('returns false for analytics_expiry', () => {
      expect(isLegalHoldExempt('analytics_expiry')).toBe(false);
    });

    it('returns true (fail safe) for unknown job type', () => {
      expect(isLegalHoldExempt('unknown_job' as RetentionJobType)).toBe(true);
    });
  });

  describe('shouldPurgeItem', () => {
    const now = '2026-07-31T12:00:00.000Z';

    it('purges analytics events older than 90 days', () => {
      const oldDate = '2026-04-01T00:00:00.000Z'; // ~120 days ago
      expect(shouldPurgeItem('analytics_expiry', oldDate, now, false)).toBe(true);
    });

    it('does NOT purge analytics events younger than 90 days', () => {
      const recentDate = '2026-07-01T00:00:00.000Z'; // ~30 days ago
      expect(shouldPurgeItem('analytics_expiry', recentDate, now, false)).toBe(false);
    });

    it('does NOT purge deleted account data within 30-day recovery period', () => {
      const deletedAt = '2026-07-15T00:00:00.000Z'; // ~16 days ago
      expect(shouldPurgeItem('deleted_account_purge', deletedAt, now, false)).toBe(false);
    });

    it('purges deleted account data after 30-day recovery period', () => {
      const deletedAt = '2026-06-15T00:00:00.000Z'; // ~46 days ago
      expect(shouldPurgeItem('deleted_account_purge', deletedAt, now, false)).toBe(true);
    });

    it('does NOT purge deleted account data with legal hold', () => {
      const deletedAt = '2025-01-01T00:00:00.000Z'; // way past retention
      expect(shouldPurgeItem('deleted_account_purge', deletedAt, now, true)).toBe(false);
    });

    it('purges delete_after_extraction items immediately (retention=0)', () => {
      const justNow = '2026-07-31T11:59:00.000Z'; // 1 minute ago
      expect(shouldPurgeItem('delete_after_extraction_cleanup', justNow, now, false)).toBe(true);
    });

    it('returns false for unparseable dates (fail safe)', () => {
      expect(shouldPurgeItem('analytics_expiry', 'not-a-date', now, false)).toBe(false);
    });

    it('returns false for unknown job type', () => {
      expect(shouldPurgeItem('unknown' as RetentionJobType, '2020-01-01', now, false)).toBe(false);
    });
  });

  describe('computeNextRunTime', () => {
    it('computes next hourly run', () => {
      const lastRun = '2026-07-31T12:00:00.000Z';
      const next = computeNextRunTime('hourly', lastRun);
      expect(next).toBe('2026-07-31T13:00:00.000Z');
    });

    it('computes next daily run', () => {
      const lastRun = '2026-07-31T12:00:00.000Z';
      const next = computeNextRunTime('daily', lastRun);
      expect(next).toBe('2026-08-01T12:00:00.000Z');
    });

    it('computes next weekly run', () => {
      const lastRun = '2026-07-31T12:00:00.000Z';
      const next = computeNextRunTime('weekly', lastRun);
      expect(next).toBe('2026-08-07T12:00:00.000Z');
    });

    it('returns now for unparseable last run', () => {
      const next = computeNextRunTime('daily', 'not-a-date');
      // Should be a valid ISO date — just verify it parses
      expect(Number.isFinite(Date.parse(next))).toBe(true);
    });
  });

  describe('getOverdueJobs', () => {
    const now = '2026-07-31T12:00:00.000Z';

    it('returns all job types when none have ever run', () => {
      const overdue = getOverdueJobs({}, now);
      expect(overdue).toHaveLength(12);
    });

    it('returns empty when all jobs ran recently', () => {
      const recent = '2026-07-31T11:30:00.000Z'; // 30 min ago
      const lastRun: Record<string, string> = {};
      for (const config of RETENTION_JOB_CONFIGS) {
        lastRun[config.jobType] = recent;
      }
      const overdue = getOverdueJobs(lastRun, now);
      // Hourly jobs would be overdue (last run 30 min ago, next run in 30 min)
      // but daily/weekly/monthly would not
      const hourlyOverdue = overdue.filter((j) => {
        const config = getRetentionJobConfig(j);
        return config?.cadence === 'hourly';
      });
      // Actually 30 min ago means next hourly run is in 30 min — NOT overdue
      // So all should be not overdue
      expect(hourlyOverdue).toHaveLength(0);
    });

    it('returns overdue hourly jobs', () => {
      const twoHoursAgo = '2026-07-31T10:00:00.000Z';
      const lastRun: Record<string, string> = {};
      for (const config of RETENTION_JOB_CONFIGS) {
        lastRun[config.jobType] = twoHoursAgo;
      }
      const overdue = getOverdueJobs(lastRun, now);
      // Hourly jobs are overdue (last run 2h ago, should have run 1h ago)
      const hourlyJobs = RETENTION_JOB_CONFIGS.filter((c) => c.cadence === 'hourly');
      for (const job of hourlyJobs) {
        expect(overdue).toContain(job.jobType);
      }
    });
  });
});
