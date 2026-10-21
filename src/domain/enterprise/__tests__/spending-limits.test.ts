import {
  checkSpendingLimit,
  getMostExceededLimit,
  getPeriodStart,
  type SpendingLimit,
} from '../spending-limits';

const baseLimit: SpendingLimit = {
  orgId: 'org_1',
  scope: 'user',
  scopeId: 'u_1',
  period: 'monthly',
  limitMinor: 50_000,
  currencyCode: 'USD',
  action: 'block',
};

describe('enterprise / spending-limits', () => {
  describe('checkSpendingLimit', () => {
    it('returns exceeded=false when under limit', () => {
      const r = checkSpendingLimit(30_000, baseLimit);
      expect(r.exceeded).toBe(false);
      expect(r.remaining).toBe(20_000);
      expect(r.utilisationPercent).toBe(60);
      expect(r.action).toBe('block');
    });
    it('returns exceeded=false when exactly at limit', () => {
      const r = checkSpendingLimit(50_000, baseLimit);
      expect(r.exceeded).toBe(false);
      expect(r.remaining).toBe(0);
      expect(r.utilisationPercent).toBe(100);
    });
    it('returns exceeded=true when over limit', () => {
      const r = checkSpendingLimit(60_000, baseLimit);
      expect(r.exceeded).toBe(true);
      expect(r.remaining).toBe(-10_000);
      expect(r.utilisationPercent).toBeGreaterThan(100);
    });
    it('returns non-exceeded when currentSpend is 0', () => {
      const r = checkSpendingLimit(0, baseLimit);
      expect(r.exceeded).toBe(false);
      expect(r.remaining).toBe(50_000);
      expect(r.utilisationPercent).toBe(0);
    });
    it('handles negative currentSpend as 0', () => {
      const r = checkSpendingLimit(-100, baseLimit);
      expect(r.exceeded).toBe(false);
      expect(r.remaining).toBe(50_000);
      expect(r.utilisationPercent).toBe(0);
    });
    it('handles zero limit gracefully', () => {
      const zeroLimit: SpendingLimit = { ...baseLimit, limitMinor: 0 };
      const r = checkSpendingLimit(0, zeroLimit);
      expect(r.exceeded).toBe(false);
      expect(r.utilisationPercent).toBe(0);
      const r2 = checkSpendingLimit(100, zeroLimit);
      expect(r2.exceeded).toBe(true);
      expect(r2.utilisationPercent).toBe(100);
    });
    it('returns non-exceeded for non-finite inputs', () => {
      const r = checkSpendingLimit(Number.NaN, baseLimit);
      expect(r.exceeded).toBe(false);
      expect(r.remaining).toBe(50_000);
    });
    it('truncates floating-point inputs to integers (no float leakage)', () => {
      const r = checkSpendingLimit(30_999.99, baseLimit);
      // 30999.99 truncated to 30999 — financial safety.
      expect(r.remaining).toBe(50_000 - 30_999);
    });
  });

  describe('getMostExceededLimit', () => {
    it('returns null when list is empty', () => {
      expect(getMostExceededLimit(100, [])).toBeNull();
    });
    it('returns the single limit when only one', () => {
      const r = getMostExceededLimit(100, [baseLimit]);
      expect(r).not.toBeNull();
      expect(r!.action).toBe('block');
    });
    it('returns the most exceeded limit (highest utilisation)', () => {
      const lower: SpendingLimit = { ...baseLimit, limitMinor: 100_000, action: 'warn' };
      const higher: SpendingLimit = { ...baseLimit, limitMinor: 30_000, action: 'block' };
      const r = getMostExceededLimit(25_000, [lower, higher]);
      expect(r).not.toBeNull();
      // higher is at 83% utilisation; lower is at 25%. higher wins.
      expect(r!.utilisationPercent).toBeGreaterThan(80);
    });
    it('breaks ties by action severity (block > require_approval > warn)', () => {
      const same1: SpendingLimit = { ...baseLimit, limitMinor: 100_000, action: 'warn' };
      const same2: SpendingLimit = { ...baseLimit, limitMinor: 100_000, action: 'block' };
      const r = getMostExceededLimit(50_000, [same1, same2]);
      expect(r).not.toBeNull();
      expect(r!.action).toBe('block');
    });
  });

  describe('getPeriodStart', () => {
    // Boundaries are calendar boundaries in a named timezone, so every
    // assertion pins the zone. Without that the suite passes in UTC CI
    // and fails on any device east or west of Greenwich.
    it('returns local midnight for daily', () => {
      const now = new Date('2026-03-15T14:23:11.000Z');
      // 14:23Z is 19:53 in Kolkata → local day is 15 March.
      expect(getPeriodStart('daily', now, 'Asia/Kolkata')).toBe(
        '2026-03-14T18:30:00.000Z',
      );
      expect(getPeriodStart('daily', now, 'UTC')).toBe('2026-03-15T00:00:00.000Z');
    });

    it('returns start-of-week (Sunday) for weekly', () => {
      // 2026-03-15 is a Sunday, so the week starts on that same day.
      const sunday = new Date('2026-03-15T14:23:11.000Z');
      expect(getPeriodStart('weekly', sunday, 'UTC')).toBe('2026-03-15T00:00:00.000Z');
      // 2026-03-18 is a Wednesday → week starts Sunday 15 March.
      const wednesday = new Date('2026-03-18T09:00:00.000Z');
      expect(getPeriodStart('weekly', wednesday, 'UTC')).toBe(
        '2026-03-15T00:00:00.000Z',
      );
    });

    it('returns start-of-month for monthly', () => {
      const now = new Date('2026-03-15T14:23:11.000Z');
      expect(getPeriodStart('monthly', now, 'Asia/Kolkata')).toBe(
        '2026-02-28T18:30:00.000Z',
      );
      expect(getPeriodStart('monthly', now, 'UTC')).toBe('2026-03-01T00:00:00.000Z');
    });

    it('returns start-of-quarter for quarterly', () => {
      // 2026-05-15 is in Q2 → start = 2026-04-01 local.
      const now = new Date('2026-05-15T14:23:11.000Z');
      expect(getPeriodStart('quarterly', now, 'Asia/Kolkata')).toBe(
        '2026-03-31T18:30:00.000Z',
      );
      expect(getPeriodStart('quarterly', now, 'UTC')).toBe('2026-04-01T00:00:00.000Z');
    });

    it('returns start-of-year for yearly', () => {
      const now = new Date('2026-07-15T14:23:11.000Z');
      expect(getPeriodStart('yearly', now, 'Asia/Kolkata')).toBe(
        '2025-12-31T18:30:00.000Z',
      );
      expect(getPeriodStart('yearly', now, 'UTC')).toBe('2026-01-01T00:00:00.000Z');
    });

    it('uses the zone offset in force on the boundary day across DST', () => {
      // US DST starts 2026-03-08. The day before is EST (UTC-5) and the
      // month start is EST too, while 15 March is EDT (UTC-4).
      expect(
        getPeriodStart('daily', new Date('2026-03-08T12:00:00.000Z'), 'America/New_York'),
      ).toBe('2026-03-08T05:00:00.000Z');
      expect(
        getPeriodStart('daily', new Date('2026-03-09T12:00:00.000Z'), 'America/New_York'),
      ).toBe('2026-03-09T04:00:00.000Z');
      expect(
        getPeriodStart('monthly', new Date('2026-03-15T12:00:00.000Z'), 'America/New_York'),
      ).toBe('2026-03-01T05:00:00.000Z');
    });

    it('respects half-hour offsets', () => {
      // Kolkata is UTC+5:30 — a monthly boundary is not on a whole hour.
      const start = getPeriodStart('monthly', new Date('2026-01-05T00:00:00.000Z'), 'Asia/Kolkata');
      expect(start).toBe('2025-12-31T18:30:00.000Z');
      // The boundary itself is inside the month it opens.
      expect(new Date(start).getUTCMonth()).toBe(11);
    });

    it('falls back to UTC for an unknown timezone instead of throwing', () => {
      const now = new Date('2026-03-15T14:23:11.000Z');
      expect(getPeriodStart('daily', now, 'Not/AZone')).toBe('2026-03-15T00:00:00.000Z');
    });
  });
});
