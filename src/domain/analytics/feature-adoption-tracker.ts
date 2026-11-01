/**
 * Feature adoption tracker.
 *
 * Tracks adoption of 15 product features. For each feature, records the
 * set of anonymous installation IDs that have used it at least once in
 * the current period (e.g. last 30 days). The adoption rate is the
 * fraction of MAU that used the feature.
 *
 * CRITICAL: feature names are FIXED (no free-text PII). Installation IDs
 * are anonymous (never emails or phone numbers).
 */

// ---------------------------------------------------------------------------
// Feature keys (15)
// ---------------------------------------------------------------------------

export type FeatureKey =
  | 'create_group'
  | 'join_group_via_invite'
  | 'create_expense_manual'
  | 'create_expense_ocr'
  | 'settlement_flow'
  | 'capture_receipt_camera'
  | 'capture_receipt_gallery'
  | 'expense_split_equal'
  | 'expense_split_exact'
  | 'expense_split_percentage'
  | 'expense_split_shares'
  | 'expense_split_items'
  | 'backup_local'
  | 'restore_local'
  | 'export_data';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'create_group',
  'join_group_via_invite',
  'create_expense_manual',
  'create_expense_ocr',
  'settlement_flow',
  'capture_receipt_camera',
  'capture_receipt_gallery',
  'expense_split_equal',
  'expense_split_exact',
  'expense_split_percentage',
  'expense_split_shares',
  'expense_split_items',
  'backup_local',
  'restore_local',
  'export_data',
] as const;

export const FEATURE_COUNT = FEATURE_KEYS.length; // 15

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

export interface FeatureAdoptionEntry {
  readonly feature: FeatureKey;
  readonly uniqueUsers: number;
  readonly adoptionRate: number;
}

export interface FeatureAdoptionReport {
  readonly periodLabel: string;
  readonly mau: number;
  readonly entries: readonly FeatureAdoptionEntry[];
  readonly mostAdoptedFeature: FeatureKey | null;
  readonly leastAdoptedFeature: FeatureKey | null;
}

/**
 * In-memory feature adoption tracker. Stores sets of anonymous
 * installation IDs per feature.
 *
 * Pure-ish: mutable internal state, but the `report()` method returns a
 * frozen snapshot. The tracker is intentionally NOT persisted — the
 * application layer wraps it with a repository.
 */
export class FeatureAdoptionTracker {
  private readonly usage: Map<FeatureKey, Set<string>> = new Map();
  private readonly periodLabel: string;
  private mau: number;

  constructor(periodLabel: string, mau: number) {
    if (typeof periodLabel !== 'string' || periodLabel.length === 0) {
      throw new Error('periodLabel must be a non-empty string');
    }
    if (!Number.isFinite(mau) || mau < 0) {
      throw new Error('mau must be a non-negative finite number');
    }
    this.periodLabel = periodLabel;
    this.mau = mau;
    for (const key of FEATURE_KEYS) {
      this.usage.set(key, new Set<string>());
    }
  }

  /**
   * Record that an anonymous installation ID used a feature. Idempotent
   * within the period (subsequent calls for the same (feature, id) pair
   * are no-ops).
   */
  recordUsage(feature: FeatureKey, anonymousId: string): void {
    if (!FEATURE_KEYS.includes(feature)) {
      throw new Error(`Unknown feature key: ${feature}`);
    }
    if (typeof anonymousId !== 'string' || anonymousId.length === 0) {
      throw new Error('anonymousId must be a non-empty string');
    }
    const set = this.usage.get(feature);
    if (!set) {
      // Should be unreachable — constructor initializes all features.
      throw new Error(`Feature ${feature} not initialized`);
    }
    set.add(anonymousId);
  }

  /**
   * Update the MAU count (e.g. when the period rolls over).
   */
  setMau(mau: number): void {
    if (!Number.isFinite(mau) || mau < 0) {
      throw new Error('mau must be a non-negative finite number');
    }
    this.mau = mau;
  }

  /**
   * Return the unique-user count for a feature.
   */
  uniqueUsersFor(feature: FeatureKey): number {
    const set = this.usage.get(feature);
    return set ? set.size : 0;
  }

  /**
   * Compute the adoption rate for a feature: uniqueUsers / mau.
   * Returns 0 when mau is 0.
   */
  adoptionRateFor(feature: FeatureKey): number {
    if (this.mau === 0) return 0;
    return this.uniqueUsersFor(feature) / this.mau;
  }

  /**
   * Build a frozen snapshot report of all 15 features.
   */
  report(): FeatureAdoptionReport {
    const entries: FeatureAdoptionEntry[] = FEATURE_KEYS.map((feature) => ({
      feature,
      uniqueUsers: this.uniqueUsersFor(feature),
      adoptionRate: this.adoptionRateFor(feature),
    }));

    let mostAdopted: FeatureAdoptionEntry | null = null;
    let leastAdopted: FeatureAdoptionEntry | null = null;
    for (const entry of entries) {
      if (mostAdopted === null || entry.adoptionRate > mostAdopted.adoptionRate) {
        mostAdopted = entry;
      }
      if (leastAdopted === null || entry.adoptionRate < leastAdopted.adoptionRate) {
        leastAdopted = entry;
      }
    }

    return Object.freeze({
      periodLabel: this.periodLabel,
      mau: this.mau,
      entries: Object.freeze(entries),
      mostAdoptedFeature: mostAdopted?.feature ?? null,
      leastAdoptedFeature: leastAdopted?.feature ?? null,
    });
  }

  /**
   * Reset all feature usage sets (e.g. at the start of a new period).
   * Does NOT reset MAU — call `setMau` separately.
   */
  reset(): void {
    for (const key of FEATURE_KEYS) {
      const set = this.usage.get(key);
      if (set) set.clear();
    }
  }
}

/**
 * Returns the list of feature keys. Pure helper.
 */
export function listFeatures(): readonly FeatureKey[] {
  return FEATURE_KEYS;
}
