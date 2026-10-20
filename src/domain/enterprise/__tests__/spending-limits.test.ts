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
    it('returns start-of-day for daily', () => {
      const now = new Date('2026-03-15T14:23:11.000Z');
      const start = getPeriodStart('daily', now);
      const d = new Date(start);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
    });
    it('returns start-of-month for monthly', () => {
      const now = new Date('2026-03-15T14:23:11.000Z');
      const start = getPeriodStart('monthly', now);
      const d = new Date(start);
      expect(d.getUTCDate()).toBe(1);
    });
    it('returns start-of-quarter for quarterly', () => {
      // 2026-05-15 is in Q2 → start = 2026-04-01
      const now = new Date('2026-05-15T14:23:11.000Z');
      const start = getPeriodStart('quarterly', now);
      const d = new Date(start);
      expect(d.getUTCMonth()).toBe(3); // April (0-indexed)
      expect(d.getUTCDate()).toBe(1);
    });
    it('returns start-of-year for yearly', () => {
      const now = new Date('2026-07-15T14:23:11.000Z');
      const start = getPeriodStart('yearly', now);
      const d = new Date(start);
      expect(d.getUTCMonth()).toBe(0);
      expect(d.getUTCDate()).toBe(1);
    });
  });
});
