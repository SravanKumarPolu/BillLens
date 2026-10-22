/**
 * Retention policy tests (pure).
 *
 * These pin the safety rules that must hold before any destructive UI is
 * enabled: never eligible while money is outstanding, while a settlement
 * awaits confirmation, or while local changes are unsynced.
 */

import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_RETENTION_CONFIG,
  assessRetention,
  type RetentionSnapshot,
} from '@domain/retention/retention-policy';

const NOW = new Date('2026-10-21T10:00:00.000Z');

function snapshot(overrides: Partial<RetentionSnapshot> = {}): RetentionSnapshot {
  return {
    groupId: 'g1',
    groupName: 'Goa trip',
    lastActivityAt: '2024-01-01T10:00:00.000Z', // > 1 year before NOW
    hasOutstandingBalance: false,
    pendingConfirmations: 0,
    pendingLocalChanges: 0,
    ...overrides,
  };
}

describe('assessRetention', () => {
  it('marks a clean, long-inactive group eligible', () => {
    const result = assessRetention(snapshot(), NOW);
    expect(result.state).toBe('eligible');
    expect(result.daysUntilEligible).toBe(0);
    expect(result.reasons[0]).toContain('365 days');
  });

  it('protects a group with outstanding balances', () => {
    const result = assessRetention(snapshot({ hasOutstandingBalance: true }), NOW);
    expect(result.state).toBe('protected');
    expect(result.eligibleAt).toBeNull();
    expect(result.reasons.join(' ')).toContain('Unsettled balances');
  });

  it('protects a group with settlements awaiting confirmation', () => {
    const one = assessRetention(snapshot({ pendingConfirmations: 1 }), NOW);
    expect(one.state).toBe('protected');
    expect(one.reasons[0]).toContain('1 settlement');

    const many = assessRetention(snapshot({ pendingConfirmations: 3 }), NOW);
    expect(many.reasons[0]).toContain('3 settlements');
  });

  it('protects a group with unsynced local changes', () => {
    const result = assessRetention(snapshot({ pendingLocalChanges: 2 }), NOW);
    expect(result.state).toBe('protected');
    expect(result.reasons[0]).toContain('2 local changes');
  });

  it('keeps a recently active group in the waiting period', () => {
    const result = assessRetention(snapshot({ lastActivityAt: '2026-09-01T00:00:00.000Z' }), NOW);
    expect(result.state).toBe('too_recent');
    expect(result.daysUntilEligible).toBeGreaterThan(0);
    expect(result.eligibleAt).not.toBeNull();
  });

  it('becomes eligible exactly at the retention boundary', () => {
    const lastActivity = '2025-10-21T10:00:00.000Z';
    const result = assessRetention(snapshot({ lastActivityAt: lastActivity }), NOW);
    expect(result.state).toBe('eligible');
  });

  it('uses the UTC instant so time-zone changes do not shift eligibility', () => {
    // 365 days after 2025-10-21T23:30Z is 2026-10-21T23:30Z.
    const before = assessRetention(
      snapshot({ lastActivityAt: '2025-10-21T23:30:00.000Z' }),
      new Date('2026-10-21T23:29:59.999Z'),
    );
    expect(before.state).toBe('too_recent');

    const atBoundary = assessRetention(
      snapshot({ lastActivityAt: '2025-10-21T23:30:00.000Z' }),
      new Date('2026-10-21T23:30:00.000Z'),
    );
    expect(atBoundary.state).toBe('eligible');
  });

  it('counts leap days as real elapsed time', () => {
    // 29 Feb 2024 + 365 days = 28 Feb 2025 (2024 is a leap year).
    const result = assessRetention(
      snapshot({ lastActivityAt: '2024-02-29T00:00:00.000Z' }),
      new Date('2025-02-27T23:59:59.999Z'),
    );
    expect(result.state).toBe('too_recent');

    const boundary = assessRetention(
      snapshot({ lastActivityAt: '2024-02-29T00:00:00.000Z' }),
      new Date('2025-02-28T00:00:00.000Z'),
    );
    expect(boundary.state).toBe('eligible');
  });

  it('honours a custom retention period', () => {
    const sixtyDays = { retentionDays: 60 };
    const recent = assessRetention(
      snapshot({ lastActivityAt: '2026-09-01T00:00:00.000Z' }),
      NOW,
      sixtyDays,
    );
    // 50 days of inactivity < 60 day period.
    expect(recent.state).toBe('too_recent');

    const old = assessRetention(
      snapshot({ lastActivityAt: '2026-07-01T00:00:00.000Z' }),
      NOW,
      sixtyDays,
    );
    expect(old.state).toBe('eligible');
  });

  it('treats an unparseable activity date conservatively', () => {
    const result = assessRetention(snapshot({ lastActivityAt: 'not-a-date' }), NOW);
    expect(result.state).toBe('too_recent');
    expect(result.daysUntilEligible).toBe(DEFAULT_RETENTION_CONFIG.retentionDays);
  });
});
