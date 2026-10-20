/**
 * Subscription lifecycle tests.
 *
 * Phase 10 Prompt 98.
 */

import { describe, expect, it } from '@jest/globals';

import {
  type Subscription,
  getDaysUntilRenewal,
  getSeatUtilization,
  isInTrial,
  isPastDue,
  isPendingCancellation,
  isSubscriptionActive,
} from '../subscription-model';

const NOW = '2026-07-15T00:00:00.000Z';
const FUTURE = '2026-08-15T00:00:00.000Z';
const PAST = '2026-06-15T00:00:00.000Z';

function makeSubscription(overrides: Partial<Subscription>): Subscription {
  return {
    id: 'sub-1',
    userId: 'user-1',
    planTier: 'premium',
    billingCycle: 'monthly',
    status: 'active',
    currentPeriodStart: '2026-07-01T00:00:00.000Z',
    currentPeriodEnd: FUTURE,
    cancelAtPeriodEnd: false,
    seats: 1,
    createdAt: PAST,
    ...overrides,
  };
}

describe('isSubscriptionActive', () => {
  it('returns true for active subscription within period', () => {
    expect(isSubscriptionActive(makeSubscription({}), NOW)).toBe(true);
  });

  it('returns true for trialing subscription within period', () => {
    expect(
      isSubscriptionActive(
        makeSubscription({ status: 'trialing' }),
        NOW,
      ),
    ).toBe(true);
  });

  it('returns false for canceled subscription', () => {
    expect(
      isSubscriptionActive(makeSubscription({ status: 'canceled' }), NOW),
    ).toBe(false);
  });

  it('returns false for expired subscription', () => {
    expect(
      isSubscriptionActive(makeSubscription({ status: 'expired' }), NOW),
    ).toBe(false);
  });

  it('returns false for paused subscription', () => {
    expect(
      isSubscriptionActive(makeSubscription({ status: 'paused' }), NOW),
    ).toBe(false);
  });

  it('returns false for past_due subscription', () => {
    expect(
      isSubscriptionActive(makeSubscription({ status: 'past_due' }), NOW),
    ).toBe(false);
  });

  it('returns false when currentPeriodEnd is in the past', () => {
    expect(
      isSubscriptionActive(
        makeSubscription({ currentPeriodEnd: PAST }),
        NOW,
      ),
    ).toBe(false);
  });

  it('returns true when cancelAtPeriodEnd is true but period has not ended', () => {
    expect(
      isSubscriptionActive(
        makeSubscription({ cancelAtPeriodEnd: true }),
        NOW,
      ),
    ).toBe(true);
  });

  it('returns false when currentPeriodEnd is invalid', () => {
    expect(
      isSubscriptionActive(
        makeSubscription({ currentPeriodEnd: 'not-a-date' }),
        NOW,
      ),
    ).toBe(false);
  });

  it('returns false when now is invalid', () => {
    expect(isSubscriptionActive(makeSubscription({}), 'not-a-date')).toBe(
      false,
    );
  });

  it('returns true at the exact start of the period (boundary)', () => {
    expect(
      isSubscriptionActive(
        makeSubscription({ currentPeriodStart: NOW }),
        NOW,
      ),
    ).toBe(true);
  });

  it('returns false at the exact end of the period (boundary — period ended)', () => {
    expect(
      isSubscriptionActive(
        makeSubscription({ currentPeriodEnd: NOW }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe('isInTrial', () => {
  it('returns true for trialing subscription with future trialEnd', () => {
    expect(
      isInTrial(
        makeSubscription({
          status: 'trialing',
          trialEnd: FUTURE,
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it('returns false for active subscription (not trialing)', () => {
    expect(
      isInTrial(
        makeSubscription({
          status: 'active',
          trialEnd: FUTURE,
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it('returns false when trialEnd is in the past', () => {
    expect(
      isInTrial(
        makeSubscription({
          status: 'trialing',
          trialEnd: PAST,
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it('returns false when trialEnd is undefined', () => {
    expect(
      isInTrial(
        makeSubscription({ status: 'trialing', trialEnd: undefined }),
        NOW,
      ),
    ).toBe(false);
  });

  it('returns false when trialEnd is invalid', () => {
    expect(
      isInTrial(
        makeSubscription({
          status: 'trialing',
          trialEnd: 'not-a-date',
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it('returns true at the exact trial start (trialEnd > now)', () => {
    expect(
      isInTrial(
        makeSubscription({
          status: 'trialing',
          trialEnd: '2026-07-16T00:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it('returns false at the exact trial end (now == trialEnd)', () => {
    expect(
      isInTrial(
        makeSubscription({
          status: 'trialing',
          trialEnd: NOW,
        }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe('isPastDue', () => {
  it('returns true for past_due subscription', () => {
    expect(isPastDue(makeSubscription({ status: 'past_due' }))).toBe(true);
  });

  it('returns false for active subscription', () => {
    expect(isPastDue(makeSubscription({ status: 'active' }))).toBe(false);
  });

  it('returns false for trialing subscription', () => {
    expect(isPastDue(makeSubscription({ status: 'trialing' }))).toBe(false);
  });

  it('returns false for canceled subscription', () => {
    expect(isPastDue(makeSubscription({ status: 'canceled' }))).toBe(false);
  });

  it('returns false for expired subscription', () => {
    expect(isPastDue(makeSubscription({ status: 'expired' }))).toBe(false);
  });
});

describe('getDaysUntilRenewal', () => {
  it('returns positive days when renewal is in the future', () => {
    // currentPeriodEnd = 2026-08-15, now = 2026-07-15 → 31 days
    const sub = makeSubscription({ currentPeriodEnd: FUTURE });
    expect(getDaysUntilRenewal(sub, NOW)).toBe(31);
  });

  it('returns 0 when renewal is today', () => {
    const sub = makeSubscription({ currentPeriodEnd: NOW });
    expect(getDaysUntilRenewal(sub, NOW)).toBe(0);
  });

  it('returns negative days when renewal is in the past', () => {
    const sub = makeSubscription({ currentPeriodEnd: PAST });
    expect(getDaysUntilRenewal(sub, NOW)).toBeLessThan(0);
  });

  it('returns 0 for canceled subscription', () => {
    const sub = makeSubscription({
      status: 'canceled',
      currentPeriodEnd: FUTURE,
    });
    expect(getDaysUntilRenewal(sub, NOW)).toBe(0);
  });

  it('returns 0 for expired subscription', () => {
    const sub = makeSubscription({
      status: 'expired',
      currentPeriodEnd: FUTURE,
    });
    expect(getDaysUntilRenewal(sub, NOW)).toBe(0);
  });

  it('returns 0 for paused subscription', () => {
    const sub = makeSubscription({
      status: 'paused',
      currentPeriodEnd: FUTURE,
    });
    expect(getDaysUntilRenewal(sub, NOW)).toBe(0);
  });

  it('returns positive for trialing subscription (renewal after trial)', () => {
    const sub = makeSubscription({
      status: 'trialing',
      trialEnd: FUTURE,
      currentPeriodEnd: '2026-09-15T00:00:00.000Z',
    });
    expect(getDaysUntilRenewal(sub, NOW)).toBeGreaterThan(0);
  });

  it('rounds DOWN to the nearest day', () => {
    // 1 day + 12 hours = 1.5 days → floor to 1
    const sub = makeSubscription({
      currentPeriodEnd: '2026-07-16T12:00:00.000Z',
    });
    expect(getDaysUntilRenewal(sub, NOW)).toBe(1);
  });

  it('returns 0 when now is invalid', () => {
    expect(getDaysUntilRenewal(makeSubscription({}), 'not-a-date')).toBe(0);
  });
});

describe('isPendingCancellation', () => {
  it('returns true when cancelAtPeriodEnd is true and subscription is active', () => {
    const sub = makeSubscription({
      cancelAtPeriodEnd: true,
      status: 'active',
    });
    expect(isPendingCancellation(sub, NOW)).toBe(true);
  });

  it('returns false when cancelAtPeriodEnd is true but subscription is canceled', () => {
    const sub = makeSubscription({
      cancelAtPeriodEnd: true,
      status: 'canceled',
    });
    expect(isPendingCancellation(sub, NOW)).toBe(false);
  });

  it('returns false when cancelAtPeriodEnd is false', () => {
    const sub = makeSubscription({
      cancelAtPeriodEnd: false,
      status: 'active',
    });
    expect(isPendingCancellation(sub, NOW)).toBe(false);
  });

  it('returns false when subscription is past due', () => {
    const sub = makeSubscription({
      cancelAtPeriodEnd: true,
      status: 'past_due',
    });
    expect(isPendingCancellation(sub, NOW)).toBe(false);
  });
});

describe('getSeatUtilization', () => {
  it('returns 0 when no seats are used', () => {
    expect(getSeatUtilization(makeSubscription({ seats: 5 }), 0)).toBe(0);
  });

  it('returns 0.2 when 1 of 5 seats used', () => {
    expect(getSeatUtilization(makeSubscription({ seats: 5 }), 1)).toBe(0.2);
  });

  it('returns 1 when all seats used', () => {
    expect(getSeatUtilization(makeSubscription({ seats: 5 }), 5)).toBe(1);
  });

  it('caps at 1.0 when more seats used than allocated', () => {
    expect(getSeatUtilization(makeSubscription({ seats: 5 }), 10)).toBe(1);
  });

  it('returns 0 when seats is 0', () => {
    expect(getSeatUtilization(makeSubscription({ seats: 0 }), 0)).toBe(0);
  });

  it('returns 0 when seatsUsed is negative', () => {
    expect(getSeatUtilization(makeSubscription({ seats: 5 }), -1)).toBe(0);
  });

  it('works for team plan with 5 seats', () => {
    const sub = makeSubscription({ planTier: 'team', seats: 5 });
    expect(getSeatUtilization(sub, 4)).toBe(0.8);
  });

  it('works for enterprise plan with 25 seats', () => {
    const sub = makeSubscription({ planTier: 'enterprise', seats: 25 });
    expect(getSeatUtilization(sub, 25)).toBe(1);
  });
});
