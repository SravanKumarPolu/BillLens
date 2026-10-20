import {
  RATE_LIMIT_RULES,
  shouldRateLimit,
  computeRetryAfter,
  getRateLimitRule,
  isCriticalOperation,
  CRITICAL_OPERATIONS,
} from '../rate-limiter';

describe('scalability / rate-limiter', () => {
  describe('RATE_LIMIT_RULES', () => {
    it('defines rules for all 5 tiers', () => {
      expect(Object.keys(RATE_LIMIT_RULES).sort()).toEqual(
        ['anonymous', 'authenticated', 'enterprise', 'internal', 'premium'].sort(),
      );
    });
    it('rules are frozen', () => {
      for (const tier of Object.keys(RATE_LIMIT_RULES) as (keyof typeof RATE_LIMIT_RULES)[]) {
        expect(Object.isFrozen(RATE_LIMIT_RULES[tier])).toBe(true);
      }
    });
    it('higher tiers have higher per-minute limits', () => {
      expect(RATE_LIMIT_RULES.anonymous.requestsPerMinute).toBeLessThan(
        RATE_LIMIT_RULES.authenticated.requestsPerMinute,
      );
      expect(RATE_LIMIT_RULES.authenticated.requestsPerMinute).toBeLessThan(
        RATE_LIMIT_RULES.premium.requestsPerMinute,
      );
      expect(RATE_LIMIT_RULES.premium.requestsPerMinute).toBeLessThan(
        RATE_LIMIT_RULES.enterprise.requestsPerMinute,
      );
    });
  });

  describe('shouldRateLimit', () => {
    it('returns not-limited when all counters below tier limits', () => {
      const decision = shouldRateLimit(10, 100, 500, 'authenticated');
      expect(decision.limited).toBe(false);
      expect(decision.retryAfterSeconds).toBeUndefined();
    });
    it('limits when per-minute limit exceeded', () => {
      const decision = shouldRateLimit(200, 100, 500, 'authenticated');
      expect(decision.limited).toBe(true);
      expect(decision.reason).toBe('minute_limit_exceeded');
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    });
    it('limits when per-hour limit exceeded (even if minute ok)', () => {
      const decision = shouldRateLimit(50, 10_000, 5_000, 'authenticated');
      expect(decision.limited).toBe(true);
      expect(decision.reason).toBe('hour_limit_exceeded');
    });
    it('limits when per-day limit exceeded (even if minute + hour ok)', () => {
      const decision = shouldRateLimit(10, 100, 100_000, 'authenticated');
      expect(decision.limited).toBe(true);
      expect(decision.reason).toBe('day_limit_exceeded');
    });
    it('never limits the internal tier', () => {
      const decision = shouldRateLimit(
        1_000_000,
        1_000_000,
        1_000_000,
        'internal',
      );
      expect(decision.limited).toBe(false);
    });
    it('respects anonymous limits', () => {
      // 30/min is the limit for anonymous
      const ok = shouldRateLimit(29, 100, 500, 'anonymous');
      expect(ok.limited).toBe(false);
      const limited = shouldRateLimit(30, 100, 500, 'anonymous');
      expect(limited.limited).toBe(true);
    });
    it('respects premium limits', () => {
      const ok = shouldRateLimit(299, 1000, 5000, 'premium');
      expect(ok.limited).toBe(false);
      const limited = shouldRateLimit(300, 1000, 5000, 'premium');
      expect(limited.limited).toBe(true);
    });
    it('respects enterprise limits', () => {
      const ok = shouldRateLimit(1199, 5000, 25000, 'enterprise');
      expect(ok.limited).toBe(false);
      const limited = shouldRateLimit(1200, 5000, 25000, 'enterprise');
      expect(limited.limited).toBe(true);
    });
  });

  describe('computeRetryAfter', () => {
    it('returns a positive integer', () => {
      const retry = computeRetryAfter(200, 'authenticated');
      expect(retry).toBeGreaterThan(0);
      expect(Number.isInteger(retry)).toBe(true);
    });
    it('is at least 1 second', () => {
      const retry = computeRetryAfter(120, 'authenticated');
      expect(retry).toBeGreaterThanOrEqual(1);
    });
    it('does not exceed the window for minute', () => {
      const retry = computeRetryAfter(200, 'authenticated', 'minute');
      expect(retry).toBeLessThanOrEqual(60);
    });
    it('does not exceed the window for hour', () => {
      const retry = computeRetryAfter(200, 'authenticated', 'hour');
      expect(retry).toBeLessThanOrEqual(3600);
    });
    it('does not exceed the window for day', () => {
      const retry = computeRetryAfter(200, 'authenticated', 'day');
      expect(retry).toBeLessThanOrEqual(86400);
    });
    it('returns 60 for unknown tier', () => {
      // Cast to bypass type-safety — simulates a programming error.
      expect(computeRetryAfter(100, 'unknown' as never)).toBe(60);
    });
  });

  describe('getRateLimitRule', () => {
    it('returns the rule for a known tier', () => {
      const rule = getRateLimitRule('premium');
      expect(rule.tier).toBe('premium');
    });
    it('throws for an unknown tier', () => {
      expect(() => getRateLimitRule('unknown' as never)).toThrow();
    });
  });

  describe('critical operations (financial safety)', () => {
    it('settlement_create is critical', () => {
      expect(isCriticalOperation('settlement_create')).toBe(true);
    });
    it('settlement_confirm is critical', () => {
      expect(isCriticalOperation('settlement_confirm')).toBe(true);
    });
    it('settlement_cancel is critical', () => {
      expect(isCriticalOperation('settlement_cancel')).toBe(true);
    });
    it('expense_create_offline_flush is critical', () => {
      expect(isCriticalOperation('expense_create_offline_flush')).toBe(true);
    });
    it('sync_conflict_resolve is critical', () => {
      expect(isCriticalOperation('sync_conflict_resolve')).toBe(true);
    });
    it('expense_create is NOT critical (rate-limitable)', () => {
      expect(isCriticalOperation('expense_create')).toBe(false);
    });
    it('ocr_run is NOT critical (rate-limitable)', () => {
      expect(isCriticalOperation('ocr_run')).toBe(false);
    });
    it('CRITICAL_OPERATIONS is frozen', () => {
      expect(Object.isFrozen(CRITICAL_OPERATIONS)).toBe(true);
    });
  });
});
