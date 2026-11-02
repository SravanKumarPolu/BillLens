/**
 * Revenue metrics tests.
 *
 * Phase 10 Prompt 95.
 */

import { describe, expect, it } from '@jest/globals';

import {
  computeArpu,
  computeChurnRate,
  computeConversionRate,
  computeLtv,
  computeMrr,
  createRevenueSnapshot,
  type ActiveSubscription,
} from '../revenue-metrics';

describe('computeMrr', () => {
  it('sums the monthly prices of all active subscriptions', () => {
    const subs: ActiveSubscription[] = [
      { plan: 'free', price: 0 },
      { plan: 'pro', price: 9.99 },
      { plan: 'pro', price: 9.99 },
      { plan: 'team', price: 24.99 },
    ];
    expect(computeMrr(subs)).toBeCloseTo(44.97, 2);
  });

  it('returns 0 for an empty subscription list', () => {
    expect(computeMrr([])).toBe(0);
  });

  it('returns 0 for a list of free plans', () => {
    expect(computeMrr([{ plan: 'free', price: 0 }])).toBe(0);
  });

  it('throws on a negative price', () => {
    expect(() =>
      computeMrr([{ plan: 'pro', price: -5 }]),
    ).toThrow('subscription price must be non-negative');
  });

  it('throws on a non-finite price', () => {
    expect(() =>
      computeMrr([{ plan: 'pro', price: Number.POSITIVE_INFINITY }]),
    ).toThrow('subscription price must be finite');
  });
});

describe('computeChurnRate', () => {
  it('returns churned / startedWith as a fraction 0-1', () => {
    expect(computeChurnRate(100, 5)).toBeCloseTo(0.05, 5);
    expect(computeChurnRate(1000, 100)).toBeCloseTo(0.1, 5);
  });

  it('returns 0 when no users churned', () => {
    expect(computeChurnRate(100, 0)).toBe(0);
  });

  it('returns 1 when all users churned', () => {
    expect(computeChurnRate(100, 100)).toBe(1);
  });

  it('throws on startedWith=0 (division by zero)', () => {
    expect(() => computeChurnRate(0, 0)).toThrow(
      'startedWith must be positive',
    );
  });

  it('throws when churned > startedWith (impossible)', () => {
    expect(() => computeChurnRate(10, 20)).toThrow(
      'churned (20) cannot exceed startedWith (10)',
    );
  });

  it('throws on negative churned', () => {
    expect(() => computeChurnRate(100, -5)).toThrow(
      'churned must be non-negative',
    );
  });

  it('throws on non-integer inputs', () => {
    expect(() => computeChurnRate(100.5, 5)).toThrow(
      'startedWith and churned must be integers',
    );
  });
});

describe('computeLtv', () => {
  it('returns arpu / churnRate', () => {
    expect(computeLtv(10, 0.05)).toBeCloseTo(200, 5);
    expect(computeLtv(50, 0.1)).toBeCloseTo(500, 5);
  });

  it('returns Infinity when churnRate=0 (no churn → infinite lifetime)', () => {
    expect(computeLtv(10, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns 0 when arpu=0', () => {
    expect(computeLtv(0, 0.1)).toBe(0);
  });

  it('throws on negative arpu', () => {
    expect(() => computeLtv(-5, 0.1)).toThrow(
      'arpu must be non-negative',
    );
  });

  it('throws on negative churnRate', () => {
    expect(() => computeLtv(10, -0.1)).toThrow(
      'churnRate must be non-negative',
    );
  });

  it('throws on churnRate > 1', () => {
    expect(() => computeLtv(10, 1.5)).toThrow(
      'churnRate must be at most 1',
    );
  });
});

describe('computeArpu', () => {
  it('returns totalRevenue / totalUsers', () => {
    expect(computeArpu(1000, 100)).toBeCloseTo(10, 5);
  });

  it('returns 0 when totalUsers=0', () => {
    expect(computeArpu(1000, 0)).toBe(0);
  });

  it('throws on negative totalRevenue', () => {
    expect(() => computeArpu(-100, 10)).toThrow(
      'totalRevenue must be non-negative',
    );
  });

  it('throws on negative totalUsers', () => {
    expect(() => computeArpu(100, -10)).toThrow(
      'totalUsers must be non-negative',
    );
  });
});

describe('computeConversionRate', () => {
  it('returns payingUsers / (payingUsers + freeUsers)', () => {
    expect(computeConversionRate(10, 90)).toBeCloseTo(0.1, 5);
    expect(computeConversionRate(50, 50)).toBeCloseTo(0.5, 5);
  });

  it('returns 0 when there are no users', () => {
    expect(computeConversionRate(0, 0)).toBe(0);
  });

  it('returns 1 when all users are paying', () => {
    expect(computeConversionRate(100, 0)).toBe(1);
  });

  it('throws on negative users', () => {
    expect(() => computeConversionRate(-1, 10)).toThrow(
      'payingUsers and freeUsers must be non-negative',
    );
  });

  it('throws on non-integer inputs', () => {
    expect(() => computeConversionRate(10.5, 90)).toThrow(
      'payingUsers and freeUsers must be integers',
    );
  });
});

describe('createRevenueSnapshot', () => {
  it('computes all derived fields from inputs', () => {
    const snapshot = createRevenueSnapshot({
      period: '2026-07',
      activeSubscriptions: [
        { plan: 'pro', price: 9.99 },
        { plan: 'pro', price: 9.99 },
      ],
      totalRevenue: 19.98,
      payingUsers: 2,
      freeUsers: 18,
      startedWith: 100,
      churned: 5,
    });
    expect(snapshot.period).toBe('2026-07');
    expect(snapshot.mrr).toBeCloseTo(19.98, 2);
    expect(snapshot.arr).toBeCloseTo(239.76, 2);
    expect(snapshot.arpu).toBeCloseTo(0.999, 3); // 19.98 / 20
    expect(snapshot.payingUsers).toBe(2);
    expect(snapshot.freeUsers).toBe(18);
    expect(snapshot.conversionRate).toBeCloseTo(0.1, 5); // 2 / 20
    expect(snapshot.churnRate).toBeCloseTo(0.05, 5); // 5 / 100
    expect(snapshot.ltv).toBeCloseTo(0.999 / 0.05, 3); // arpu / churnRate
  });

  it('returns a frozen object', () => {
    const snapshot = createRevenueSnapshot({
      period: '2026-07',
      activeSubscriptions: [],
      totalRevenue: 0,
      payingUsers: 0,
      freeUsers: 0,
      startedWith: 1,
      churned: 0,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('throws on empty period', () => {
    expect(() =>
      createRevenueSnapshot({
        period: '',
        activeSubscriptions: [],
        totalRevenue: 0,
        payingUsers: 0,
        freeUsers: 0,
        startedWith: 1,
        churned: 0,
      }),
    ).toThrow('period must be a non-empty string');
  });

  it('throws when churned > startedWith', () => {
    expect(() =>
      createRevenueSnapshot({
        period: '2026-07',
        activeSubscriptions: [],
        totalRevenue: 0,
        payingUsers: 0,
        freeUsers: 0,
        startedWith: 10,
        churned: 20,
      }),
    ).toThrow('churned (20) cannot exceed startedWith (10)');
  });
});
