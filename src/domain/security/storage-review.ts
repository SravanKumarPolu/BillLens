/**
 * Storage security review.
 *
 * Reviews the five storage tiers BillLens uses and classifies the
 * sensitivity of data each tier is allowed to hold:
 *
 *   1. sqlite              — on-device SQLite database (encrypted at rest
 *                            via SQLCipher on iOS Keychain / Android
 *                            Keystore-derived key).
 *   2. securestore         — Expo SecureStore (iOS Keychain / Android
 *                            Keystore). Holds short-lived secrets.
 *   3. filesystem_temp     — `expo-file-system` cache directory. Holds
 *                            transient files (resized receipt images
 *                            before upload, OCR temp files). MUST be
 *                            cleared on logout.
 *   4. cloud_supabase      — Supabase Postgres + Storage. Holds the
 *                            durable cloud copy. RLS-enforced.
 *   5. cloud_ocr           — Third-party OCR provider. Holds receipt
 *                            images temporarily during OCR processing.
 *
 * Each storage tier has a sensitivity ceiling — the highest data
 * classification it is allowed to hold. The `reviewStorageTier()`
 * function checks whether a given data classification fits within a
 * tier's ceiling.
 *
 * This module is a PURE function library: no I/O, no globals.
 *
 * See `docs/security-maintenance.md` and `docs/security-model.md`.
 */

// ---------------------------------------------------------------------------
// Storage tiers
// ---------------------------------------------------------------------------

export type StorageTier =
  | 'sqlite'
  | 'securestore'
  | 'filesystem_temp'
  | 'cloud_supabase'
  | 'cloud_ocr';

export const STORAGE_TIERS: readonly StorageTier[] = [
  'sqlite',
  'securestore',
  'filesystem_temp',
  'cloud_supabase',
  'cloud_ocr',
] as const;

export function isStorageTier(value: unknown): value is StorageTier {
  return (
    typeof value === 'string' &&
    (STORAGE_TIERS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Data sensitivity classifications
// ---------------------------------------------------------------------------

export type DataSensitivity =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted'
  | 'top_secret';

export const DATA_SENSITIVITIES: readonly DataSensitivity[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
  'top_secret',
] as const;

export function isDataSensitivity(value: unknown): value is DataSensitivity {
  return (
    typeof value === 'string' &&
    (DATA_SENSITIVITIES as readonly string[]).includes(value)
  );
}

/**
 * Numeric rank for each sensitivity classification. Higher = more
 * sensitive. Used to compare against a tier's ceiling.
 */
export const SENSITIVITY_RANK: Readonly<Record<DataSensitivity, number>> = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
  top_secret: 4,
});

// ---------------------------------------------------------------------------
// Storage tier profile
// ---------------------------------------------------------------------------

export interface StorageTierProfile {
  /** The storage tier. */
  readonly tier: StorageTier;
  /** Human-readable description. */
  readonly description: string;
  /**
   * Highest sensitivity classification the tier is allowed to hold.
   * Data with HIGHER sensitivity than the ceiling MUST be rejected.
   */
  readonly sensitivityCeiling: DataSensitivity;
  /** Whether the tier is encrypted at rest. */
  readonly encryptedAtRest: boolean;
  /** Whether the tier is cleared on user logout. */
  readonly clearedOnLogout: boolean;
  /** Maximum time-to-live for data in this tier, in milliseconds (0 = no TTL). */
  readonly ttlMs: number;
}

/**
 * The profile for each storage tier. Used by `reviewStorageTier()`.
 *
 * SENSITIVITY CEILINGS:
 *   sqlite             — restricted  (holds receipts + payment evidence)
 *   securestore        — top_secret  (holds OAuth tokens + device secret)
 *   filesystem_temp    — restricted  (transient receipt images)
 *   cloud_supabase     — restricted  (durable cloud copy, RLS-enforced)
 *   cloud_ocr          — confidential (receipt images for OCR; provider
 *                                     must delete post-processing)
 *
 * NOTE: top_secret data (device secret, OAuth tokens) is ONLY allowed
 * in SecureStore — never in SQLite, never in temp files, never in
 * cloud. The SQLite DB stores the device secret HASH, not the secret.
 */
export const STORAGE_TIER_PROFILES: Readonly<Record<StorageTier, StorageTierProfile>> = Object.freeze({
  sqlite: Object.freeze({
    tier: 'sqlite',
    description: 'On-device SQLite database (SQLCipher-encrypted).',
    sensitivityCeiling: 'restricted',
    encryptedAtRest: true,
    clearedOnLogout: true,
    ttlMs: 0,
  }),
  securestore: Object.freeze({
    tier: 'securestore',
    description: 'Expo SecureStore (iOS Keychain / Android Keystore).',
    sensitivityCeiling: 'top_secret',
    encryptedAtRest: true,
    clearedOnLogout: true,
    ttlMs: 0,
  }),
  filesystem_temp: Object.freeze({
    tier: 'filesystem_temp',
    description: 'expo-file-system cache directory (transient files).',
    sensitivityCeiling: 'restricted',
    encryptedAtRest: false,
    clearedOnLogout: true,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  }),
  cloud_supabase: Object.freeze({
    tier: 'cloud_supabase',
    description: 'Supabase Postgres + Storage (durable cloud copy, RLS-enforced).',
    sensitivityCeiling: 'restricted',
    encryptedAtRest: true,
    clearedOnLogout: false,
    ttlMs: 0,
  }),
  cloud_ocr: Object.freeze({
    tier: 'cloud_ocr',
    description: 'Third-party OCR provider (transient receipt processing).',
    sensitivityCeiling: 'confidential',
    encryptedAtRest: true,
    clearedOnLogout: false,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  }),
});

// ---------------------------------------------------------------------------
// Storage review
// ---------------------------------------------------------------------------

export type StorageReviewVerdict = 'allowed' | 'denied' | 'review_required';

export interface StorageReviewResult {
  readonly tier: StorageTier;
  readonly dataSensitivity: DataSensitivity;
  readonly verdict: StorageReviewVerdict;
  readonly reason: string;
  readonly profile: StorageTierProfile;
}

/**
 * Review whether a given data classification may be stored in the
 * given tier.
 *
 *   - If `dataSensitivity` rank > tier ceiling rank → 'denied'.
 *   - If `dataSensitivity` rank == tier ceiling rank AND the ceiling
 *     is `restricted` or higher → 'review_required' (we want a human
 *     in the loop before storing the most-sensitive data at the
 *     tier's ceiling).
 *   - Otherwise → 'allowed'.
 */
export function reviewStorageTier(
  tier: StorageTier,
  dataSensitivity: DataSensitivity,
): StorageReviewResult {
  if (!isStorageTier(tier)) throw new Error(`Unknown storage tier: ${tier}`);
  if (!isDataSensitivity(dataSensitivity)) {
    throw new Error(`Unknown data sensitivity: ${dataSensitivity}`);
  }
  const profile = STORAGE_TIER_PROFILES[tier];
  const dataRank = SENSITIVITY_RANK[dataSensitivity];
  const ceilingRank = SENSITIVITY_RANK[profile.sensitivityCeiling];

  if (dataRank > ceilingRank) {
    return Object.freeze({
      tier,
      dataSensitivity,
      verdict: 'denied',
      reason: `Data sensitivity '${dataSensitivity}' exceeds tier '${tier}' ceiling '${profile.sensitivityCeiling}'.`,
      profile,
    });
  }

  if (dataRank === ceilingRank && ceilingRank >= SENSITIVITY_RANK.restricted) {
    return Object.freeze({
      tier,
      dataSensitivity,
      verdict: 'review_required',
      reason: `Data sensitivity '${dataSensitivity}' is at the tier's ceiling — manual review required.`,
      profile,
    });
  }

  return Object.freeze({
    tier,
    dataSensitivity,
    verdict: 'allowed',
    reason: `Data sensitivity '${dataSensitivity}' is within tier '${tier}' ceiling.`,
    profile,
  });
}

/**
 * Run the storage review across all five tiers for a given data
 * classification. Useful for dashboards that show "where can this
 * data class live?".
 */
export function reviewAllTiers(
  dataSensitivity: DataSensitivity,
): readonly StorageReviewResult[] {
  if (!isDataSensitivity(dataSensitivity)) {
    throw new Error(`Unknown data sensitivity: ${dataSensitivity}`);
  }
  return Object.freeze(
    STORAGE_TIERS.map((tier) => reviewStorageTier(tier, dataSensitivity)),
  );
}

/**
 * Returns true when a tier is appropriate for storing PII-classified
 * data (confidential or higher). Convenience wrapper around
 * `reviewStorageTier()`.
 */
export function canStorePii(tier: StorageTier): boolean {
  const result = reviewStorageTier(tier, 'confidential');
  return result.verdict === 'allowed' || result.verdict === 'review_required';
}

/**
 * Returns the list of tiers that MUST be cleared on user logout.
 * Useful for the logout use case to enumerate cleanup steps.
 */
export function tiersClearedOnLogout(): readonly StorageTier[] {
  return Object.freeze(
    STORAGE_TIERS.filter((t) => STORAGE_TIER_PROFILES[t].clearedOnLogout),
  );
}
