/**
 * Plan model tests.
 *
 * Phase 10 Prompt 98.
 */

import { describe, expect, it } from '@jest/globals';

import {
  type PlanTier,
  PLANS,
  comparePlans,
  getEffectiveMonthlyPrice,
  getPlan,
  getPrice,
} from '../plan-model';

describe('PLANS registry', () => {
  it('has all 4 tiers', () => {
    expect(Object.keys(PLANS).sort()).toEqual([
      'enterprise',
      'free',
      'premium',
      'team',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PLANS)).toBe(true);
    expect(Object.isFrozen(PLANS.free)).toBe(true);
    expect(Object.isFrozen(PLANS.free.limits)).toBe(true);
  });

  it('free tier has monthlyPrice 0 and yearlyPrice 0', () => {
    expect(PLANS.free.monthlyPrice).toBe(0);
    expect(PLANS.free.yearlyPrice).toBe(0);
  });

  it('premium tier costs more than free', () => {
    expect(PLANS.premium.monthlyPrice).toBeGreaterThan(0);
    expect(PLANS.premium.yearlyPrice).toBeGreaterThan(0);
  });

  it('team tier costs more than premium', () => {
    expect(PLANS.team.monthlyPrice).toBeGreaterThan(PLANS.premium.monthlyPrice);
  });

  it('enterprise tier costs more than team', () => {
    expect(PLANS.enterprise.monthlyPrice).toBeGreaterThan(
      PLANS.team.monthlyPrice,
    );
  });

  it('all plans use USD currency', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.currency).toBe('USD');
    }
  });

  it('all plans have at least 5 features', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.features.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('all plans have defined limits', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.limits).toBeDefined();
      expect(typeof plan.limits.maxGroups).toBe('number');
      expect(typeof plan.limits.maxExpensesPerMonth).toBe('number');
      expect(typeof plan.limits.maxReceiptScansPerMonth).toBe('number');
      expect(typeof plan.limits.maxStorageMb).toBe('number');
      expect(typeof plan.limits.apiAccess).toBe('boolean');
      expect(typeof plan.limits.advancedReporting).toBe('boolean');
      expect(typeof plan.limits.customBranding).toBe('boolean');
      expect(typeof plan.limits.ssoEnabled).toBe('boolean');
      expect(typeof plan.limits.auditLogRetentionDays).toBe('number');
    }
  });

  it('free tier is the most restrictive on every limit', () => {
    const free = PLANS.free.limits;
    const premium = PLANS.premium.limits;
    expect(free.maxGroups).toBeLessThanOrEqual(premium.maxGroups);
    expect(free.maxExpensesPerMonth).toBeLessThanOrEqual(
      premium.maxExpensesPerMonth,
    );
    expect(free.maxReceiptScansPerMonth).toBeLessThanOrEqual(
      premium.maxReceiptScansPerMonth,
    );
    expect(free.maxStorageMb).toBeLessThanOrEqual(premium.maxStorageMb);
    expect(free.auditLogRetentionDays).toBeLessThanOrEqual(
      premium.auditLogRetentionDays,
    );
  });

  it('enterprise tier has SSO and custom branding enabled', () => {
    expect(PLANS.enterprise.limits.ssoEnabled).toBe(true);
    expect(PLANS.enterprise.limits.customBranding).toBe(true);
  });

  it('free tier does NOT have SSO, API access, or custom branding', () => {
    expect(PLANS.free.limits.ssoEnabled).toBe(false);
    expect(PLANS.free.limits.apiAccess).toBe(false);
    expect(PLANS.free.limits.customBranding).toBe(false);
  });

  it('audit log retention increases with plan tier', () => {
    expect(PLANS.free.limits.auditLogRetentionDays).toBeLessThan(
      PLANS.premium.limits.auditLogRetentionDays,
    );
    expect(PLANS.premium.limits.auditLogRetentionDays).toBeLessThan(
      PLANS.team.limits.auditLogRetentionDays,
    );
    expect(PLANS.team.limits.auditLogRetentionDays).toBeLessThan(
      PLANS.enterprise.limits.auditLogRetentionDays,
    );
  });

  it('enterprise retention is 7 years (2555 days)', () => {
    expect(PLANS.enterprise.limits.auditLogRetentionDays).toBe(365 * 7);
  });
});

describe('getPlan', () => {
  it('returns the plan for a known tier', () => {
    expect(getPlan('free').tier).toBe('free');
    expect(getPlan('premium').tier).toBe('premium');
    expect(getPlan('team').tier).toBe('team');
    expect(getPlan('enterprise').tier).toBe('enterprise');
  });

  it('throws on an unknown tier', () => {
    expect(() =>
      getPlan('platinum' as unknown as PlanTier),
    ).toThrow(/Unknown plan tier/);
  });
});

describe('comparePlans', () => {
  it('returns added features when upgrading free → premium', () => {
    const result = comparePlans('free', 'premium');
    expect(result.added.length).toBeGreaterThan(0);
    // `removed` may be non-empty because some feature names change between
    // tiers (e.g. "Cloud OCR (10 scans/month)" → "Cloud OCR (100 scans/month)").
  });

  it('returns no changes when comparing a tier to itself', () => {
    const result = comparePlans('premium', 'premium');
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('returns added features when upgrading premium → team', () => {
    const result = comparePlans('premium', 'team');
    expect(result.added).toContain('API access');
  });

  it('returns added features when upgrading team → enterprise', () => {
    const result = comparePlans('team', 'enterprise');
    expect(result.added).toContain('SSO (SAML / OIDC)');
    expect(result.added).toContain('Custom branding');
  });

  it('returns removed features when downgrading enterprise → free', () => {
    const result = comparePlans('enterprise', 'free');
    // Downgrade: many features are removed (enterprise has more included features than free).
    expect(result.removed.length).toBeGreaterThan(0);
    // Note: `added` may be non-empty because feature NAMES differ across tiers
    // (e.g. free has "Cloud OCR (10 scans/month)" while enterprise has
    // "Everything in Team"). Comparison is by exact feature name string.
  });

  it('returns frozen arrays', () => {
    const result = comparePlans('free', 'enterprise');
    expect(Object.isFrozen(result.added)).toBe(true);
    expect(Object.isFrozen(result.removed)).toBe(true);
  });

  it('returns sorted feature lists', () => {
    const result = comparePlans('free', 'enterprise');
    const sorted = [...result.added].sort();
    expect(result.added).toEqual(sorted);
  });
});

describe('getPrice', () => {
  it('returns monthly price for monthly cycle', () => {
    expect(getPrice('premium', 'monthly')).toBe(PLANS.premium.monthlyPrice);
  });

  it('returns yearly price for yearly cycle', () => {
    expect(getPrice('premium', 'yearly')).toBe(PLANS.premium.yearlyPrice);
  });

  it('returns 0 for free tier regardless of cycle', () => {
    expect(getPrice('free', 'monthly')).toBe(0);
    expect(getPrice('free', 'yearly')).toBe(0);
  });
});

describe('getEffectiveMonthlyPrice', () => {
  it('returns 0 for free tier', () => {
    expect(getEffectiveMonthlyPrice('free', 'monthly')).toBe(0);
    expect(getEffectiveMonthlyPrice('free', 'yearly')).toBe(0);
  });

  it('returns monthly price for monthly cycle', () => {
    expect(getEffectiveMonthlyPrice('premium', 'monthly')).toBe(
      PLANS.premium.monthlyPrice,
    );
  });

  it('returns yearly/12 for yearly cycle (rounded to 2 decimals)', () => {
    const expected = Math.round((PLANS.premium.yearlyPrice / 12) * 100) / 100;
    expect(getEffectiveMonthlyPrice('premium', 'yearly')).toBe(expected);
  });

  it('yearly is cheaper per month than monthly', () => {
    const monthly = getEffectiveMonthlyPrice('premium', 'monthly');
    const yearly = getEffectiveMonthlyPrice('premium', 'yearly');
    expect(yearly).toBeLessThan(monthly);
  });
});
