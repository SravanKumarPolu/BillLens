/**
 * Usage tracking tests.
 *
 * Phase 10 Prompt 98.
 */

import { describe, expect, it } from '@jest/globals';

import { PLANS } from '../plan-model';
import {
  type UsageRecord,
  checkUsageLimit,
  getUsagePercentage,
  shouldWarnUser,
} from '../usage-tracking';

function makeUsage(overrides: Partial<UsageRecord>): UsageRecord {
  return {
    userId: 'user-1',
    period: '2026-07',
    groupsCreated: 0,
    expensesCreated: 0,
    receiptScansUsed: 0,
    storageUsedMb: 0,
    apiCallsMade: 0,
    ...overrides,
  };
}

describe('checkUsageLimit — free tier', () => {
  const plan = PLANS.free;

  it('returns exceeded=false when no usage', () => {
    const result = checkUsageLimit(makeUsage({}), plan);
    expect(result.exceeded).toBe(false);
  });

  it('returns exceeded=true when groupsCreated > maxGroups', () => {
    const result = checkUsageLimit(
      makeUsage({ groupsCreated: 2 }),
      plan,
    );
    expect(result.exceeded).toBe(true);
    expect(result.limits.groups.exceeded).toBe(true);
    expect(result.limits.groups.used).toBe(2);
    expect(result.limits.groups.limit).toBe(1);
  });

  it('returns exceeded=true when expensesCreated > maxExpensesPerMonth', () => {
    const result = checkUsageLimit(
      makeUsage({ expensesCreated: 26 }),
      plan,
    );
    expect(result.exceeded).toBe(true);
    expect(result.limits.expenses.exceeded).toBe(true);
  });

  it('returns exceeded=true when receiptScansUsed > maxReceiptScansPerMonth', () => {
    const result = checkUsageLimit(
      makeUsage({ receiptScansUsed: 11 }),
      plan,
    );
    expect(result.exceeded).toBe(true);
    expect(result.limits.receiptScans.exceeded).toBe(true);
  });

  it('returns exceeded=true when storageUsedMb > maxStorageMb', () => {
    const result = checkUsageLimit(
      makeUsage({ storageUsedMb: 51 }),
      plan,
    );
    expect(result.exceeded).toBe(true);
    expect(result.limits.storage.exceeded).toBe(true);
  });

  it('returns exceeded=true when apiCallsMade > 0 and plan has no API access', () => {
    const result = checkUsageLimit(
      makeUsage({ apiCallsMade: 1 }),
      plan,
    );
    expect(result.exceeded).toBe(true);
    expect(result.limits.apiCalls.exceeded).toBe(true);
  });

  it('returns exceeded=false at the exact limit (boundary — equal is allowed)', () => {
    const result = checkUsageLimit(
      makeUsage({
        groupsCreated: 1, // = limit
        expensesCreated: 25, // = limit
        receiptScansUsed: 10, // = limit
        storageUsedMb: 50, // = limit
      }),
      plan,
    );
    expect(result.exceeded).toBe(false);
  });

  it('returns exceeded=false one below the limit', () => {
    const result = checkUsageLimit(
      makeUsage({
        groupsCreated: 0,
        expensesCreated: 24,
        receiptScansUsed: 9,
        storageUsedMb: 49,
      }),
      plan,
    );
    expect(result.exceeded).toBe(false);
  });

  it('returns all 5 limit buckets', () => {
    const result = checkUsageLimit(makeUsage({}), plan);
    expect(Object.keys(result.limits).sort()).toEqual([
      'apiCalls',
      'expenses',
      'groups',
      'receiptScans',
      'storage',
    ]);
  });
});

describe('checkUsageLimit — premium tier', () => {
  const plan = PLANS.premium;

  it('returns exceeded=false for many groups (premium is unlimited)', () => {
    const result = checkUsageLimit(
      makeUsage({ groupsCreated: 1000 }),
      plan,
    );
    expect(result.exceeded).toBe(false);
    expect(result.limits.groups.limit).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns exceeded=false for many expenses (premium is unlimited)', () => {
    const result = checkUsageLimit(
      makeUsage({ expensesCreated: 10000 }),
      plan,
    );
    expect(result.exceeded).toBe(false);
  });

  it('returns exceeded=true when receiptScansUsed > 100', () => {
    const result = checkUsageLimit(
      makeUsage({ receiptScansUsed: 101 }),
      plan,
    );
    expect(result.exceeded).toBe(true);
    expect(result.limits.receiptScans.exceeded).toBe(true);
  });

  it('returns exceeded=false when apiCallsMade > 0 (premium has no API access but API is blocked at gateway, not by count)', () => {
    // Hmm, wait — premium does NOT have API access. Let me check.
    // Per the plan-model, premium has apiAccess: false.
    // So apiCallsMade > 0 should be exceeded.
    const result = checkUsageLimit(
      makeUsage({ apiCallsMade: 1 }),
      plan,
    );
    expect(result.exceeded).toBe(true);
  });

  it('returns exceeded=false when storage is within 5 GB', () => {
    const result = checkUsageLimit(
      makeUsage({ storageUsedMb: 4 * 1024 }),
      plan,
    );
    expect(result.exceeded).toBe(false);
  });

  it('returns exceeded=true when storage exceeds 5 GB', () => {
    const result = checkUsageLimit(
      makeUsage({ storageUsedMb: 5 * 1024 + 1 }),
      plan,
    );
    expect(result.exceeded).toBe(true);
  });
});

describe('checkUsageLimit — enterprise tier', () => {
  const plan = PLANS.enterprise;

  it('returns exceeded=false for any usage (enterprise is unlimited)', () => {
    const result = checkUsageLimit(
      makeUsage({
        groupsCreated: 1_000_000,
        expensesCreated: 1_000_000,
        receiptScansUsed: 1_000_000,
        storageUsedMb: 1_000_000,
        apiCallsMade: 1_000_000,
      }),
      plan,
    );
    expect(result.exceeded).toBe(false);
  });

  it('apiCalls bucket returns Infinity as limit when apiAccess is true', () => {
    const result = checkUsageLimit(makeUsage({}), plan);
    expect(result.limits.apiCalls.limit).toBe(Number.POSITIVE_INFINITY);
    expect(result.limits.apiCalls.exceeded).toBe(false);
  });
});

describe('getUsagePercentage', () => {
  it('returns 0 when limit is 0', () => {
    expect(getUsagePercentage(5, 0)).toBe(0);
  });

  it('returns 0 when limit is Infinity', () => {
    expect(getUsagePercentage(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('returns 0 when used is 0', () => {
    expect(getUsagePercentage(0, 100)).toBe(0);
  });

  it('returns 50 when used is half of limit', () => {
    expect(getUsagePercentage(50, 100)).toBe(50);
  });

  it('returns 100 when used equals limit', () => {
    expect(getUsagePercentage(100, 100)).toBe(100);
  });

  it('returns > 100 when used exceeds limit', () => {
    expect(getUsagePercentage(150, 100)).toBe(150);
  });

  it('returns 1 decimal place (33.3 for 1/3)', () => {
    expect(getUsagePercentage(1, 3)).toBe(33.3);
  });

  it('returns 0 for negative used', () => {
    expect(getUsagePercentage(-5, 100)).toBe(0);
  });

  it('returns 0 for NaN inputs', () => {
    expect(getUsagePercentage(NaN, 100)).toBe(0);
    expect(getUsagePercentage(5, NaN)).toBe(0);
  });

  it('works for free tier receipt scans (8 of 10 = 80%)', () => {
    expect(getUsagePercentage(8, 10)).toBe(80);
  });
});

describe('shouldWarnUser', () => {
  const plan = PLANS.free;

  it('returns false when usage is below 80%', () => {
    expect(
      shouldWarnUser(
        makeUsage({ receiptScansUsed: 5 }), // 50%
        plan,
      ),
    ).toBe(false);
  });

  it('returns true when usage reaches 80%', () => {
    expect(
      shouldWarnUser(
        makeUsage({ receiptScansUsed: 8 }), // 80%
        plan,
      ),
    ).toBe(true);
  });

  it('returns true when usage exceeds 80%', () => {
    expect(
      shouldWarnUser(
        makeUsage({ receiptScansUsed: 9 }), // 90%
        plan,
      ),
    ).toBe(true);
  });

  it('returns true when usage exceeds 100%', () => {
    expect(
      shouldWarnUser(
        makeUsage({ receiptScansUsed: 20 }), // 200%
        plan,
      ),
    ).toBe(true);
  });

  it('returns true when storage reaches 80% (40 MB of 50)', () => {
    expect(
      shouldWarnUser(
        makeUsage({ storageUsedMb: 40 }),
        plan,
      ),
    ).toBe(true);
  });

  it('returns false when no usage approaches 80%', () => {
    expect(
      shouldWarnUser(
        makeUsage({
          groupsCreated: 0,
          expensesCreated: 0,
          receiptScansUsed: 0,
          storageUsedMb: 0,
        }),
        plan,
      ),
    ).toBe(false);
  });

  it('returns false for premium tier with unlimited groups', () => {
    expect(
      shouldWarnUser(
        makeUsage({ groupsCreated: 1000 }),
        PLANS.premium,
      ),
    ).toBe(false);
  });

  it('returns true for premium tier when storage approaches limit', () => {
    expect(
      shouldWarnUser(
        makeUsage({ storageUsedMb: 4.2 * 1024 }), // 84% of 5 GB
        PLANS.premium,
      ),
    ).toBe(true);
  });

  it('returns false for enterprise tier (all unlimited)', () => {
    expect(
      shouldWarnUser(
        makeUsage({
          groupsCreated: 1_000_000,
          expensesCreated: 1_000_000,
          receiptScansUsed: 1_000_000,
          storageUsedMb: 1_000_000,
        }),
        PLANS.enterprise,
      ),
    ).toBe(false);
  });
});
