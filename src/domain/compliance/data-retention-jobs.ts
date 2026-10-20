/**
 * Data retention job model — automated deletion of data for deleted accounts,
 * receipts, and other entities past their retention period.
 *
 * CRITICAL: BillLens MUST have automated retention jobs that purge data
 * for deleted accounts, expired receipts, and stale temporary files. The
 * jobs are idempotent, audited, and respect legal-hold overrides.
 *
 * Retention periods (from docs/data-retention-policy.md):
 *   - Deleted account cloud data: 30 days (recovery period) then purge
 *   - Deleted account local data: immediate (user choice)
 *   - Receipt images (local_only): until user deletes or account deletion
 *   - Receipt images (cloud_private): until user deletes or account deletion
 *   - Receipt images (delete_after_extraction): immediately after OCR
 *   - OCR text: 90 days after extraction
 *   - Audit log entries: 7 years (fraud prevention — NOT purged by these jobs)
 *   - Analytics events: 90 days
 *   - Crash reports: 90 days
 *   - Diagnostic reports: 30 days
 *   - Temporary files: 24 hours
 *   - Sync operations (completed): 7 days
 *   - Sync conflicts (resolved): 30 days
 *   - Webhook deliveries (delivered): 30 days
 *   - API analytics: 90 days
 *
 * Pure functions — no I/O. The application layer schedules these jobs
 * via a background task scheduler.
 */

// ---------------------------------------------------------------------------
// Retention job types
// ---------------------------------------------------------------------------

export type RetentionJobType =
  | 'deleted_account_purge'
  | 'receipt_image_cleanup'
  | 'ocr_text_expiry'
  | 'analytics_expiry'
  | 'crash_report_expiry'
  | 'diagnostic_report_expiry'
  | 'temp_file_cleanup'
  | 'completed_sync_op_cleanup'
  | 'resolved_conflict_cleanup'
  | 'webhook_delivery_cleanup'
  | 'api_analytics_expiry'
  | 'delete_after_extraction_cleanup';

export interface RetentionJobConfig {
  readonly jobType: RetentionJobType;
  readonly retentionDays: number;
  readonly cadence: 'hourly' | 'daily' | 'weekly' | 'monthly';
  readonly batchSize: number;
  readonly legalHoldExempt: boolean; // if true, never purge items under legal hold
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Retention job registry
// ---------------------------------------------------------------------------

export const RETENTION_JOB_CONFIGS: readonly RetentionJobConfig[] = Object.freeze([
  {
    jobType: 'deleted_account_purge',
    retentionDays: 30,
    cadence: 'daily',
    batchSize: 100,
    legalHoldExempt: true,
    description: 'Purges cloud data for accounts deleted >30 days ago (post-recovery period). Audit logs are preserved for 7 years.',
  },
  {
    jobType: 'receipt_image_cleanup',
    retentionDays: 0, // immediate — only purges images explicitly marked for deletion
    cadence: 'hourly',
    batchSize: 50,
    legalHoldExempt: true,
    description: 'Purges receipt images that the user has explicitly deleted. Local-only images are deleted from the device; cloud images are deleted from storage.',
  },
  {
    jobType: 'ocr_text_expiry',
    retentionDays: 90,
    cadence: 'daily',
    batchSize: 500,
    legalHoldExempt: false,
    description: 'Purges raw OCR text 90 days after extraction. Anonymized correction statistics are preserved indefinitely.',
  },
  {
    jobType: 'analytics_expiry',
    retentionDays: 90,
    cadence: 'daily',
    batchSize: 1000,
    legalHoldExempt: false,
    description: 'Purges individual analytics events after 90 days. Aggregated metrics are preserved.',
  },
  {
    jobType: 'crash_report_expiry',
    retentionDays: 90,
    cadence: 'daily',
    batchSize: 200,
    legalHoldExempt: false,
    description: 'Purges crash reports after 90 days.',
  },
  {
    jobType: 'diagnostic_report_expiry',
    retentionDays: 30,
    cadence: 'daily',
    batchSize: 100,
    legalHoldExempt: false,
    description: 'Purges diagnostic reports after 30 days.',
  },
  {
    jobType: 'temp_file_cleanup',
    retentionDays: 1, // 24 hours
    cadence: 'hourly',
    batchSize: 500,
    legalHoldExempt: false,
    description: 'Purges temporary files (compressed images, OCR intermediates, export files) after 24 hours.',
  },
  {
    jobType: 'completed_sync_op_cleanup',
    retentionDays: 7,
    cadence: 'daily',
    batchSize: 1000,
    legalHoldExempt: false,
    description: 'Purges completed sync operations after 7 days. Failed operations are retained for debugging.',
  },
  {
    jobType: 'resolved_conflict_cleanup',
    retentionDays: 30,
    cadence: 'weekly',
    batchSize: 200,
    legalHoldExempt: true,
    description: 'Purges resolved sync conflict records after 30 days. Audit trail entries for the resolution are preserved for 7 years.',
  },
  {
    jobType: 'webhook_delivery_cleanup',
    retentionDays: 30,
    cadence: 'daily',
    batchSize: 500,
    legalHoldExempt: false,
    description: 'Purges delivered webhook records after 30 days. Failed deliveries are retained for 90 days.',
  },
  {
    jobType: 'api_analytics_expiry',
    retentionDays: 90,
    cadence: 'daily',
    batchSize: 1000,
    legalHoldExempt: false,
    description: 'Purges API usage analytics after 90 days. Aggregated summaries are preserved.',
  },
  {
    jobType: 'delete_after_extraction_cleanup',
    retentionDays: 0, // immediate
    cadence: 'hourly',
    batchSize: 100,
    legalHoldExempt: false,
    description: 'Purges receipt images with storageMode=delete_after_extraction immediately after OCR extraction is complete.',
  },
]);

// ---------------------------------------------------------------------------
// Job execution model
// ---------------------------------------------------------------------------

export interface RetentionJobExecution {
  readonly jobType: RetentionJobType;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly itemsExamined: number;
  readonly itemsPurged: number;
  readonly itemsSkipped: number; // legal hold, pending recovery, etc.
  readonly status: 'running' | 'completed' | 'failed';
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getRetentionJobConfig(jobType: RetentionJobType): RetentionJobConfig | null {
  return RETENTION_JOB_CONFIGS.find((c) => c.jobType === jobType) ?? null;
}

export function isLegalHoldExempt(jobType: RetentionJobType): boolean {
  const config = getRetentionJobConfig(jobType);
  return config?.legalHoldExempt ?? true; // fail safe — assume exempt
}

export function shouldPurgeItem(
  jobType: RetentionJobType,
  itemCreatedAt: string,
  now: string,
  hasLegalHold: boolean,
): boolean {
  const config = getRetentionJobConfig(jobType);
  if (config === null) return false;

  // Legal hold check — if the job is legal-hold-exempt and the item has a
  // legal hold, NEVER purge it.
  if (config.legalHoldExempt && hasLegalHold) {
    return false;
  }

  // Retention period 0 means "immediate purge" (items are already marked
  // for deletion by the user or a prior process).
  if (config.retentionDays === 0) {
    return true;
  }

  const itemMs = Date.parse(itemCreatedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(itemMs) || !Number.isFinite(nowMs)) {
    return false; // fail safe — don't purge items with unparseable dates
  }

  const ageMs = nowMs - itemMs;
  const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
  return ageMs >= retentionMs;
}

export function computeNextRunTime(
  cadence: RetentionJobConfig['cadence'],
  lastRunAt: string,
): string {
  const lastMs = Date.parse(lastRunAt);
  if (!Number.isFinite(lastMs)) {
    return new Date().toISOString();
  }

  const intervals: Readonly<Record<RetentionJobConfig['cadence'], number>> = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000, // approximate
  };

  const nextMs = lastMs + (intervals[cadence] ?? intervals.daily);
  return new Date(nextMs).toISOString();
}

export function getOverdueJobs(
  lastRunByJob: Readonly<Record<string, string>>,
  now: string,
): readonly RetentionJobType[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return [];

  const overdue: RetentionJobType[] = [];
  for (const config of RETENTION_JOB_CONFIGS) {
    const lastRun = lastRunByJob[config.jobType];
    if (lastRun === undefined) {
      // Never run — overdue
      overdue.push(config.jobType);
      continue;
    }
    const nextRun = computeNextRunTime(config.cadence, lastRun);
    const nextMs = Date.parse(nextRun);
    if (Number.isFinite(nextMs) && nowMs >= nextMs) {
      overdue.push(config.jobType);
    }
  }
  return overdue;
}
