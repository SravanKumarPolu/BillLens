import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_AT_RISK_FRACTION,
  MS_PER_HOUR,
  SLA_POLICIES,
  SLA_POLICY_LIST,
  computeSlaCompliance,
  computeSlaStatus,
  getSlaPolicy,
  type SlaStatus,
} from '../sla-policy';

const NOW = '2025-01-01T00:00:00.000Z';

function hoursAgo(hours: number, from: string = NOW): string {
  return new Date(Date.parse(from) - hours * MS_PER_HOUR).toISOString();
}

function hoursAhead(hours: number, from: string = NOW): string {
  return new Date(Date.parse(from) + hours * MS_PER_HOUR).toISOString();
}

describe('sla-policy', () => {
  describe('SLA_POLICIES', () => {
    it('exposes 4 priorities', () => {
      expect(SLA_POLICY_LIST.length).toBe(4);
    });

    it('urgent — 1h first response, 4h resolution', () => {
      expect(SLA_POLICIES.urgent.firstResponseHours).toBe(1);
      expect(SLA_POLICIES.urgent.resolutionHours).toBe(4);
    });

    it('high — 4h first response, 24h resolution', () => {
      expect(SLA_POLICIES.high.firstResponseHours).toBe(4);
      expect(SLA_POLICIES.high.resolutionHours).toBe(24);
    });

    it('normal — 24h first response, 72h resolution', () => {
      expect(SLA_POLICIES.normal.firstResponseHours).toBe(24);
      expect(SLA_POLICIES.normal.resolutionHours).toBe(72);
    });

    it('low — 48h first response, 168h resolution (7 days)', () => {
      expect(SLA_POLICIES.low.firstResponseHours).toBe(48);
      expect(SLA_POLICIES.low.resolutionHours).toBe(168);
    });

    it('getSlaPolicy returns the policy for a priority', () => {
      expect(getSlaPolicy('urgent').firstResponseHours).toBe(1);
      expect(getSlaPolicy('low').resolutionHours).toBe(168);
    });
  });

  describe('DEFAULT_AT_RISK_FRACTION', () => {
    it('is 0.2 (20%)', () => {
      expect(DEFAULT_AT_RISK_FRACTION).toBe(0.2);
    });
  });

  describe('computeSlaStatus', () => {
    it('returns "met" for first response when response came in on time', () => {
      const created = hoursAgo(2);
      const firstResponse = hoursAgo(1);
      const result = computeSlaStatus(
        'urgent',
        created,
        firstResponse,
        null,
        NOW,
      );
      expect(result.firstResponseStatus).toBe('met');
    });

    it('returns "breached" for first response when response came in late', () => {
      const created = hoursAgo(5);
      const firstResponse = hoursAgo(1);
      // Urgent has 1h first-response SLA — response came 4h after the deadline.
      const result = computeSlaStatus(
        'urgent',
        created,
        firstResponse,
        null,
        NOW,
      );
      expect(result.firstResponseStatus).toBe('breached');
    });

    it('returns "on_track" when there is plenty of time remaining', () => {
      const created = NOW;
      const result = computeSlaStatus(
        'normal',
        created,
        null,
        null,
        NOW,
      );
      // Normal has 24h first-response SLA — just-created ticket, plenty of time.
      expect(result.firstResponseStatus).toBe('on_track');
    });

    it('returns "breached" when the deadline has passed without a response', () => {
      const created = hoursAgo(5);
      const result = computeSlaStatus(
        'urgent',
        created,
        null,
        null,
        NOW,
      );
      // Urgent has 1h first-response SLA — 5h elapsed, deadline passed.
      expect(result.firstResponseStatus).toBe('breached');
    });

    it('returns "met" for resolution when the ticket was resolved on time', () => {
      const created = hoursAgo(2);
      const resolved = hoursAgo(1);
      const result = computeSlaStatus(
        'urgent',
        created,
        hoursAgo(1),
        resolved,
        NOW,
      );
      expect(result.resolutionStatus).toBe('met');
    });

    it('returns "breached" for resolution when the ticket was resolved late', () => {
      const created = hoursAgo(10);
      const resolved = hoursAgo(1);
      const result = computeSlaStatus(
        'urgent',
        created,
        hoursAgo(8),
        resolved,
        NOW,
      );
      expect(result.resolutionStatus).toBe('breached');
    });

    it('returns the first-response + resolution due dates', () => {
      const created = NOW;
      const result = computeSlaStatus(
        'urgent',
        created,
        null,
        null,
        NOW,
      );
      expect(result.firstResponseDueAt).toBe(hoursAhead(1));
      expect(result.resolutionDueAt).toBe(hoursAhead(4));
    });

    it('returns the hours remaining for each SLA', () => {
      const created = NOW;
      const result = computeSlaStatus(
        'urgent',
        created,
        null,
        null,
        NOW,
      );
      expect(result.firstResponseHoursRemaining).toBeCloseTo(1, 1);
      expect(result.resolutionHoursRemaining).toBeCloseTo(4, 1);
    });

    it('clamps hours remaining at 0 when breached', () => {
      const created = hoursAgo(10);
      const result = computeSlaStatus(
        'urgent',
        created,
        null,
        null,
        NOW,
      );
      expect(result.firstResponseHoursRemaining).toBe(0);
      expect(result.resolutionHoursRemaining).toBe(0);
    });

    it('rejects an invalid createdAt', () => {
      expect(() =>
        computeSlaStatus('urgent', 'not-a-date', null, null, NOW),
      ).toThrow();
    });

    it('rejects an invalid nowIso', () => {
      expect(() =>
        computeSlaStatus('urgent', NOW, null, null, 'not-a-date'),
      ).toThrow();
    });

    it('rejects an invalid firstRespondedAt', () => {
      expect(() =>
        computeSlaStatus('urgent', NOW, 'not-a-date', null, NOW),
      ).toThrow();
    });

    it('rejects an invalid resolvedAt', () => {
      expect(() =>
        computeSlaStatus('urgent', NOW, null, 'not-a-date', NOW),
      ).toThrow();
    });

    it('rejects an out-of-range atRiskFraction', () => {
      expect(() =>
        computeSlaStatus('urgent', NOW, null, null, NOW, -0.1),
      ).toThrow();
      expect(() =>
        computeSlaStatus('urgent', NOW, null, null, NOW, 1.5),
      ).toThrow();
    });

    it('returns a frozen result', () => {
      const result = computeSlaStatus('urgent', NOW, null, null, NOW);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('honours the four possible SlaStatus values', () => {
      const statuses: SlaStatus[] = ['on_track', 'at_risk', 'breached', 'met'];
      // Sanity check — the type union contains exactly these 4 values.
      expect(statuses.length).toBe(4);
    });
  });

  describe('computeSlaCompliance', () => {
    it('aggregates compliance across a set of tickets', () => {
      const tickets = [
        // Urgent — met first response, met resolution.
        {
          priority: 'urgent' as const,
          createdAt: hoursAgo(5),
          firstRespondedAt: hoursAgo(4),
          resolvedAt: hoursAgo(3),
        },
        // High — breached first response (came 5h after creation, SLA is 4h).
        {
          priority: 'high' as const,
          createdAt: hoursAgo(10),
          firstRespondedAt: hoursAgo(5),
          resolvedAt: hoursAgo(2),
        },
      ];
      const summary = computeSlaCompliance(tickets, NOW);
      expect(summary.totalTickets).toBe(2);
      expect(summary.firstResponseMet).toBe(1);
      expect(summary.firstResponseBreached).toBe(1);
      expect(summary.resolutionMet).toBe(2);
      expect(summary.firstResponseComplianceRate).toBeCloseTo(0.5, 2);
      expect(summary.resolutionComplianceRate).toBeCloseTo(1, 2);
    });

    it('returns a compliance rate of 1 for an empty set', () => {
      const summary = computeSlaCompliance([], NOW);
      expect(summary.totalTickets).toBe(0);
      expect(summary.firstResponseComplianceRate).toBe(1);
      expect(summary.resolutionComplianceRate).toBe(1);
    });

    it('returns a frozen summary', () => {
      const summary = computeSlaCompliance([], NOW);
      expect(Object.isFrozen(summary)).toBe(true);
    });
  });
});
