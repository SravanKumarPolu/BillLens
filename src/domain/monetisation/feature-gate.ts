/**
 * Feature gate — which features are available on which plan tier.
 *
 * Phase 10 Prompt 98: Revenue and Monetisation.
 *
 * CRITICAL: the financial core of BillLens — balance calculation,
 * split methods, settlement, offline sync, backup/restore, expense
 * creation, group management, member management — is NEVER gated.
 * These features are available on EVERY plan, including free. We do
 * not put core financial integrity behind a paywall.
 *
 * What IS gated:
 *   - Cloud OCR scans (free: limited; paid: more / unlimited)
 *   - Advanced reporting (paid only)
 *   - API access (team+ only)
 *   - Custom branding (enterprise only)
 *   - SSO (enterprise only)
 *   - Audit log export (team+ only)
 *   - White-label (enterprise only)
 *
 * This module is PURE: a feature-gate matrix + lookup helpers.
 *
 * See `docs/revenue-monetisation.md`.
 */

import type { PlanTier } from './plan-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GatedFeature =
  | 'unlimited_groups'
  | 'unlimited_expenses'
  | 'unlimited_receipt_scans'
  | 'cloud_ocr'
  | 'advanced_reporting'
  | 'api_access'
  | 'custom_branding'
  | 'sso'
  | 'audit_export'
  | 'white_label';

// ---------------------------------------------------------------------------
// NEVER-GATED financial core
// ---------------------------------------------------------------------------

/**
 * CRITICAL: the financial core of BillLens is NEVER gated.
 *
 * These features are always available on every plan, including free.
 * A user must always be able to:
 *   - Calculate balances accurately
 *   - Use all 5 split methods (equal, exact, percentage, share, itemised)
 *   - Settle debts and record payments
 *   - Use the app offline and sync when back online
 *   - Back up and restore their data locally
 *   - Create expenses (subject to free-tier monthly cap on COUNT,
 *     but never blocked from creating any expense at all)
 *   - Manage groups and members
 *
 * If a future contributor adds one of these to the FEATURE_GATE_MATRIX,
 * the test `feature-gate.test.ts > "financial core features are NEVER gated"`
 * will fail loudly.
 */
export const NEVER_GATED_FEATURES: readonly string[] = Object.freeze([
  'balance_calculation',
  'split_methods',
  'settlement',
  'offline_sync',
  'backup_restore',
  'expense_creation',
  'group_management',
  'member_management',
]);

/**
 * Returns true when `feature` is a financial core feature that must
 * NEVER be gated. The check is case-sensitive and exact-match.
 */
export function isFinancialCoreFeature(feature: string): boolean {
  return NEVER_GATED_FEATURES.includes(feature);
}

// ---------------------------------------------------------------------------
// Feature gate matrix
// ---------------------------------------------------------------------------

/**
 * The matrix of gated features × plan tier.
 *
 * Reading: `FEATURE_GATE_MATRIX['free']` is the list of gated features
 * AVAILABLE on the free tier. A feature not in a tier's list is NOT
 * available on that tier.
 *
 *   free       — unlimited_expenses is NOT here (free has 25/month cap)
 *   premium    — unlimited_expenses IS here (premium is unlimited)
 *   team       — adds api_access, audit_export
 *   enterprise — adds custom_branding, sso, white_label
 *
 * Note: `cloud_ocr` is in ALL tiers (including free — free gets 10
 * scans/month). The QUANTITY is gated via plan limits, not the
 * feature gate.
 */
const FREE_FEATURES: readonly GatedFeature[] = Object.freeze([
  'cloud_ocr', // 10 scans/month — quantity-limited, not feature-gated
]);
const PREMIUM_FEATURES: readonly GatedFeature[] = Object.freeze([
  'unlimited_groups',
  'unlimited_expenses',
  'cloud_ocr',
  'advanced_reporting',
]);
const TEAM_FEATURES: readonly GatedFeature[] = Object.freeze([
  'unlimited_groups',
  'unlimited_expenses',
  'cloud_ocr', // 500 scans/month
  'advanced_reporting',
  'api_access',
  'audit_export',
]);
const ENTERPRISE_FEATURES: readonly GatedFeature[] = Object.freeze([
  'unlimited_groups',
  'unlimited_expenses',
  'unlimited_receipt_scans',
  'cloud_ocr', // unlimited
  'advanced_reporting',
  'api_access',
  'custom_branding',
  'sso',
  'audit_export',
  'white_label',
]);

export const FEATURE_GATE_MATRIX: Readonly<
  Record<PlanTier, readonly GatedFeature[]>
> = Object.freeze({
  free: FREE_FEATURES,
  premium: PREMIUM_FEATURES,
  team: TEAM_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `feature` is available on `planTier`.
 *
 * CRITICAL: this function ONLY answers questions about gated features.
 * Financial core features (see `NEVER_GATED_FEATURES`) are ALWAYS
 * available and are NOT looked up in the matrix.
 *
 * The application layer should:
 *
 *   if (isFinancialCoreFeature(feature)) → allow (always)
 *   else if (isFeatureAvailable(feature, planTier)) → allow
 *   else → block + show upsell
 *
 */
export function isFeatureAvailable(
  feature: GatedFeature,
  planTier: PlanTier,
): boolean {
  const features = FEATURE_GATE_MATRIX[planTier];
  if (!features) {
    return false;
  }
  return features.includes(feature);
}

/**
 * Returns the list of features the user would GAIN by upgrading
 * from `currentTier` to `targetTier`.
 *
 * Returns an empty list when the target tier is the same or lower
 * than the current tier.
 */
export function getFeaturesGainedByUpgrade(
  currentTier: PlanTier,
  targetTier: PlanTier,
): readonly GatedFeature[] {
  const current = FEATURE_GATE_MATRIX[currentTier];
  const target = FEATURE_GATE_MATRIX[targetTier];
  const gained: GatedFeature[] = [];
  for (const f of target) {
    if (!current.includes(f)) {
      gained.push(f);
    }
  }
  return Object.freeze(gained);
}
