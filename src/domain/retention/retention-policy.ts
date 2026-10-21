/**
 * Local retention policy (pure).
 *
 * BillLens never deletes financial records automatically. This module only
 * answers one question: *is this local group copy eligible for the user to
 * clean up?* The UI surfaces the answer; a human makes the decision.
 *
 * Safety rules, in order:
 *   1. Never eligible while money is outstanding.
 *   2. Never eligible while a settlement is awaiting confirmation.
 *   3. Never eligible while local changes have not reached the sync queue
 *      drain (deleting them would destroy the only copy).
 *   4. Otherwise eligible once the group has been inactive for the
 *      configured retention period (default 365 days).
 *
 * "Inactive" is measured from the most recent local financial activity
 * (expense/settlement/group update), not from creation.
 */

export const DEFAULT_RETENTION_DAYS = 365;

const MS_PER_DAY = 86_400_000;

export interface RetentionConfig {
  /** Days of inactivity before a clean group becomes eligible. */
  readonly retentionDays: number;
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  retentionDays: DEFAULT_RETENTION_DAYS,
};

export interface RetentionSnapshot {
  readonly groupId: string;
  readonly groupName: string;
  /** Most recent local activity (ISO-8601, UTC). */
  readonly lastActivityAt: string;
  /** True when any currency has a non-zero net balance for any member. */
  readonly hasOutstandingBalance: boolean;
  /** Settlements in `pending_confirmation` for this group. */
  readonly pendingConfirmations: number;
  /** Local changes still queued (not yet acknowledged by a sync peer). */
  readonly pendingLocalChanges: number;
}

export type RetentionState = 'eligible' | 'too_recent' | 'protected';

export interface RetentionAssessment {
  readonly groupId: string;
  readonly groupName: string;
  readonly state: RetentionState;
  /** When the group becomes eligible (null while protected). */
  readonly eligibleAt: string | null;
  /** Whole days until eligible (0 when already eligible; null when protected). */
  readonly daysUntilEligible: number | null;
  /** Human-readable reasons, for the UI and the audit trail. */
  readonly reasons: readonly string[];
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Assess one group. Pure: no clock reads, no I/O — pass `now`.
 *
 * An unparseable `lastActivityAt` is treated as "now" (the conservative
 * choice: it delays eligibility rather than deleting on bad data).
 */
export function assessRetention(
  snapshot: RetentionSnapshot,
  now: Date,
  config: RetentionConfig = DEFAULT_RETENTION_CONFIG,
): RetentionAssessment {
  const reasons: string[] = [];

  if (snapshot.hasOutstandingBalance) {
    reasons.push('Unsettled balances remain in this group.');
  }
  if (snapshot.pendingConfirmations > 0) {
    reasons.push(
      snapshot.pendingConfirmations === 1
        ? '1 settlement is awaiting confirmation.'
        : `${snapshot.pendingConfirmations} settlements are awaiting confirmation.`,
    );
  }
  if (snapshot.pendingLocalChanges > 0) {
    reasons.push(
      snapshot.pendingLocalChanges === 1
        ? '1 local change has not synced yet.'
        : `${snapshot.pendingLocalChanges} local changes have not synced yet.`,
    );
  }

  if (reasons.length > 0) {
    return {
      groupId: snapshot.groupId,
      groupName: snapshot.groupName,
      state: 'protected',
      eligibleAt: null,
      daysUntilEligible: null,
      reasons,
    };
  }

  const activity = parseDate(snapshot.lastActivityAt) ?? now;
  const retentionDays = Math.max(1, Math.floor(config.retentionDays));
  const eligibleAtMs = activity.getTime() + retentionDays * MS_PER_DAY;
  const eligibleAt = new Date(eligibleAtMs);

  if (now.getTime() < eligibleAtMs) {
    const daysUntilEligible = Math.ceil((eligibleAtMs - now.getTime()) / MS_PER_DAY);
    return {
      groupId: snapshot.groupId,
      groupName: snapshot.groupName,
      state: 'too_recent',
      eligibleAt: eligibleAt.toISOString(),
      daysUntilEligible,
      reasons: [
        `Last activity was ${snapshot.lastActivityAt.slice(0, 10)}; the retention period is ${retentionDays} days.`,
      ],
    };
  }

  return {
    groupId: snapshot.groupId,
    groupName: snapshot.groupName,
    state: 'eligible',
    eligibleAt: eligibleAt.toISOString(),
    daysUntilEligible: 0,
    reasons: [
      `No activity for at least ${retentionDays} days and no unsettled records.`,
    ],
  };
}
