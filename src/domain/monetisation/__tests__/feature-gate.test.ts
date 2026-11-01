/**
 * Feature gate tests.
 *
 * Phase 10 Prompt 98.
 *
 * CRITICAL: these tests assert that financial core features are
 * NEVER gated — they must be available on EVERY plan, including
 * free. If a future contributor adds a financial core feature to
 * FEATURE_GATE_MATRIX, these tests will fail loudly.
 */

import { describe, expect, it } from '@jest/globals';

import {
  type GatedFeature,
  FEATURE_GATE_MATRIX,
  getFeaturesGainedByUpgrade,
  isFeatureAvailable,
  isFinancialCoreFeature,
  NEVER_GATED_FEATURES,
} from '../feature-gate';
import { type PlanTier, PLANS } from '../plan-model';

describe('NEVER_GATED_FEATURES — CRITICAL', () => {
  it('contains the 8 financial core features', () => {
    expect(NEVER_GATED_FEATURES).toEqual(
      expect.arrayContaining([
        'balance_calculation',
        'split_methods',
        'settlement',
        'offline_sync',
        'backup_restore',
        'expense_creation',
        'group_management',
        'member_management',
      ]),
    );
  });

  it('is frozen', () => {
    expect(Object.isFrozen(NEVER_GATED_FEATURES)).toBe(true);
  });

  it('has exactly 8 entries', () => {
    expect(NEVER_GATED_FEATURES).toHaveLength(8);
  });
});

describe('isFinancialCoreFeature — CRITICAL', () => {
  it('returns true for balance_calculation', () => {
    expect(isFinancialCoreFeature('balance_calculation')).toBe(true);
  });

  it('returns true for split_methods', () => {
    expect(isFinancialCoreFeature('split_methods')).toBe(true);
  });

  it('returns true for settlement', () => {
    expect(isFinancialCoreFeature('settlement')).toBe(true);
  });

  it('returns true for offline_sync', () => {
    expect(isFinancialCoreFeature('offline_sync')).toBe(true);
  });

  it('returns true for backup_restore', () => {
    expect(isFinancialCoreFeature('backup_restore')).toBe(true);
  });

  it('returns true for expense_creation', () => {
    expect(isFinancialCoreFeature('expense_creation')).toBe(true);
  });

  it('returns true for group_management', () => {
    expect(isFinancialCoreFeature('group_management')).toBe(true);
  });

  it('returns true for member_management', () => {
    expect(isFinancialCoreFeature('member_management')).toBe(true);
  });

  it('returns false for gated features like api_access', () => {
    expect(isFinancialCoreFeature('api_access')).toBe(false);
  });

  it('returns false for unknown features', () => {
    expect(isFinancialCoreFeature('some_random_feature')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isFinancialCoreFeature('Balance_Calculation')).toBe(false);
    expect(isFinancialCoreFeature('BALANCE_CALCULATION')).toBe(false);
  });
});

describe('FEATURE_GATE_MATRIX — CRITICAL: financial core is NEVER listed', () => {
  const allTiers: readonly PlanTier[] = ['free', 'premium', 'team', 'enterprise'];

  it.each(allTiers)('does NOT list balance_calculation in %s tier', (tier) => {
    const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
    expect(features).not.toContain('balance_calculation');
  });

  it.each(allTiers)('does NOT list split_methods in %s tier', (tier) => {
    const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
    expect(features).not.toContain('split_methods');
  });

  it.each(allTiers)('does NOT list settlement in %s tier', (tier) => {
    const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
    expect(features).not.toContain('settlement');
  });

  it.each(allTiers)('does NOT list offline_sync in %s tier', (tier) => {
    const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
    expect(features).not.toContain('offline_sync');
  });

  it.each(allTiers)('does NOT list backup_restore in %s tier', (tier) => {
    const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
    expect(features).not.toContain('backup_restore');
  });

  it.each(allTiers)('does NOT list expense_creation in %s tier', (tier) => {
    const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
    expect(features).not.toContain('expense_creation');
  });

  it.each(allTiers)('does NOT list group_management in %s tier', (tier) => {
    const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
    expect(features).not.toContain('group_management');
  });

  it.each(allTiers)('does NOT list member_management in %s tier', (tier) => {
    const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
    expect(features).not.toContain('member_management');
  });

  it('none of the NEVER_GATED_FEATURES appear in any tier matrix', () => {
    for (const tier of allTiers) {
      const features = FEATURE_GATE_MATRIX[tier] as readonly string[];
      for (const ngf of NEVER_GATED_FEATURES) {
        expect(features).not.toContain(ngf);
      }
    }
  });
});

describe('FEATURE_GATE_MATRIX structure', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(FEATURE_GATE_MATRIX)).toBe(true);
    expect(Object.isFrozen(FEATURE_GATE_MATRIX.free)).toBe(true);
  });

  it('has entries for all 4 tiers', () => {
    expect(Object.keys(FEATURE_GATE_MATRIX).sort()).toEqual([
      'enterprise',
      'free',
      'premium',
      'team',
    ]);
  });

  it('free tier has cloud_ocr (quantity-limited but feature available)', () => {
    expect(FEATURE_GATE_MATRIX.free).toContain('cloud_ocr');
  });

  it('free tier does NOT have advanced_reporting', () => {
    expect(FEATURE_GATE_MATRIX.free).not.toContain('advanced_reporting');
  });

  it('premium tier has advanced_reporting', () => {
    expect(FEATURE_GATE_MATRIX.premium).toContain('advanced_reporting');
  });

  it('premium tier does NOT have api_access', () => {
    expect(FEATURE_GATE_MATRIX.premium).not.toContain('api_access');
  });

  it('team tier has api_access', () => {
    expect(FEATURE_GATE_MATRIX.team).toContain('api_access');
  });

  it('enterprise tier has sso and custom_branding', () => {
    expect(FEATURE_GATE_MATRIX.enterprise).toContain('sso');
    expect(FEATURE_GATE_MATRIX.enterprise).toContain('custom_branding');
    expect(FEATURE_GATE_MATRIX.enterprise).toContain('white_label');
  });

  it('team tier does NOT have sso', () => {
    expect(FEATURE_GATE_MATRIX.team).not.toContain('sso');
  });

  it('enterprise tier has unlimited_receipt_scans', () => {
    expect(FEATURE_GATE_MATRIX.enterprise).toContain(
      'unlimited_receipt_scans',
    );
  });

  it('lower tiers do NOT have unlimited_receipt_scans', () => {
    expect(FEATURE_GATE_MATRIX.free).not.toContain(
      'unlimited_receipt_scans',
    );
    expect(FEATURE_GATE_MATRIX.premium).not.toContain(
      'unlimited_receipt_scans',
    );
    expect(FEATURE_GATE_MATRIX.team).not.toContain(
      'unlimited_receipt_scans',
    );
  });
});

describe('isFeatureAvailable', () => {
  it('returns true for cloud_ocr on free tier', () => {
    expect(isFeatureAvailable('cloud_ocr', 'free')).toBe(true);
  });

  it('returns true for advanced_reporting on premium tier', () => {
    expect(isFeatureAvailable('advanced_reporting', 'premium')).toBe(true);
  });

  it('returns false for advanced_reporting on free tier', () => {
    expect(isFeatureAvailable('advanced_reporting', 'free')).toBe(false);
  });

  it('returns true for api_access on team tier', () => {
    expect(isFeatureAvailable('api_access', 'team')).toBe(true);
  });

  it('returns false for api_access on premium tier', () => {
    expect(isFeatureAvailable('api_access', 'premium')).toBe(false);
  });

  it('returns true for sso on enterprise tier', () => {
    expect(isFeatureAvailable('sso', 'enterprise')).toBe(true);
  });

  it('returns false for sso on team tier', () => {
    expect(isFeatureAvailable('sso', 'team')).toBe(false);
  });

  it('returns true for white_label on enterprise tier', () => {
    expect(isFeatureAvailable('white_label', 'enterprise')).toBe(true);
  });

  it('returns false for white_label on team tier', () => {
    expect(isFeatureAvailable('white_label', 'team')).toBe(false);
  });

  it('returns false for unknown tier', () => {
    expect(
      isFeatureAvailable('cloud_ocr', 'platinum' as unknown as PlanTier),
    ).toBe(false);
  });

  it('feature availability is monotonic — enterprise has everything free has', () => {
    const freeFeatures = FEATURE_GATE_MATRIX.free;
    const enterpriseFeatures = FEATURE_GATE_MATRIX.enterprise;
    for (const f of freeFeatures) {
      expect(enterpriseFeatures).toContain(f);
    }
  });

  it('feature availability is monotonic — enterprise has everything premium has', () => {
    const premiumFeatures = FEATURE_GATE_MATRIX.premium;
    const enterpriseFeatures = FEATURE_GATE_MATRIX.enterprise;
    for (const f of premiumFeatures) {
      expect(enterpriseFeatures).toContain(f);
    }
  });
});

describe('getFeaturesGainedByUpgrade', () => {
  it('returns empty list when upgrading to the same tier', () => {
    expect(getFeaturesGainedByUpgrade('premium', 'premium')).toEqual([]);
  });

  it('returns advanced_reporting when upgrading free → premium', () => {
    const gained = getFeaturesGainedByUpgrade('free', 'premium');
    expect(gained).toContain('advanced_reporting');
    expect(gained).toContain('unlimited_groups');
    expect(gained).toContain('unlimited_expenses');
  });

  it('returns api_access + audit_export when upgrading premium → team', () => {
    const gained = getFeaturesGainedByUpgrade('premium', 'team');
    expect(gained).toContain('api_access');
    expect(gained).toContain('audit_export');
  });

  it('returns sso + custom_branding + white_label when upgrading team → enterprise', () => {
    const gained = getFeaturesGainedByUpgrade('team', 'enterprise');
    expect(gained).toContain('sso');
    expect(gained).toContain('custom_branding');
    expect(gained).toContain('white_label');
    expect(gained).toContain('unlimited_receipt_scans');
  });

  it('returns empty list when "upgrading" to a lower tier', () => {
    const gained = getFeaturesGainedByUpgrade('enterprise', 'free');
    expect(gained).toEqual([]);
  });

  it('returns frozen array', () => {
    const gained = getFeaturesGainedByUpgrade('free', 'enterprise');
    expect(Object.isFrozen(gained)).toBe(true);
  });
});

describe('Plan limits are consistent with feature gate matrix', () => {
  it('free tier limits.apiAccess === false matches matrix absence of api_access', () => {
    expect(PLANS.free.limits.apiAccess).toBe(false);
    expect(FEATURE_GATE_MATRIX.free).not.toContain('api_access');
  });

  it('team tier limits.apiAccess === true matches matrix presence of api_access', () => {
    expect(PLANS.team.limits.apiAccess).toBe(true);
    expect(FEATURE_GATE_MATRIX.team).toContain('api_access');
  });

  it('enterprise tier limits.ssoEnabled === true matches matrix presence of sso', () => {
    expect(PLANS.enterprise.limits.ssoEnabled).toBe(true);
    expect(FEATURE_GATE_MATRIX.enterprise).toContain('sso');
  });

  it('premium tier limits.advancedReporting === true matches matrix presence of advanced_reporting', () => {
    expect(PLANS.premium.limits.advancedReporting).toBe(true);
    expect(FEATURE_GATE_MATRIX.premium).toContain('advanced_reporting');
  });

  it('free tier limits.advancedReporting === false matches matrix absence', () => {
    expect(PLANS.free.limits.advancedReporting).toBe(false);
    expect(FEATURE_GATE_MATRIX.free).not.toContain('advanced_reporting');
  });
});

describe('CRITICAL: financial core is never gated (integration check)', () => {
  const financialCoreActions: readonly string[] = NEVER_GATED_FEATURES;

  it.each(financialCoreActions)(
    'application gate for "%s" returns true regardless of tier',
    (feature) => {
      // The application gate is:
      //   isFinancialCoreFeature(feature) || isFeatureAvailable(feature, tier)
      for (const tier of ['free', 'premium', 'team', 'enterprise'] as const) {
        const allowed =
          isFinancialCoreFeature(feature) ||
          isFeatureAvailable(feature as GatedFeature, tier);
        expect(allowed).toBe(true);
      }
    },
  );
});
