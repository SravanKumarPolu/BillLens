/**
 * Balance cache safety — CRITICAL financial integrity guard.
 *
 * CRITICAL CONTRACT:
 *   - The balance cache stores pre-computed member balances per (group,
 *     currency). It is an OPTIMIZATION ONLY — the cached balances MUST
 *     exactly match what `balance-engine.computeBalances()` would return
 *     if re-computed from source records.
 *   - The cache MUST invalidate on ANY financial mutation. The 5 mutations
 *     that always invalidate the cache are: `expense_create`,
 *     `expense_edit`, `settlement_create`, `settlement_reverse`,
 *     `settlement_confirm`.
 *   - On cache retrieval, the zero-sum invariant MUST be verified: the
 *     sum of all `netBalanceMinor` values across members in a single
 *     (group, currency) cache entry MUST equal 0. If it doesn't, the
 *     cache entry is corrupt and MUST be discarded.
 *   - All amounts are stored as integer minor units (e.g. paise, cents).
 *     Floating-point values are NEVER permitted — see
 *     `floating-point-guard.ts`.
 *
 * Pure functions — no I/O, no globals.
 */

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

export interface BalanceCacheEntry {
  /** Group ID the balances apply to. */
  readonly groupId: string;
  /** ISO 4217 currency code (e.g. 'USD', 'INR'). */
  readonly currencyCode: string;
  /**
   * Source version — a monotonically-increasing version string that
   * changes on ANY mutation to source records (expenses, settlements).
   * The cache is invalid when `currentSourceVersion !== entry.sourceVersion`.
   */
  readonly sourceVersion: string;
  /** Per-member net balances (integer minor units). */
  readonly memberBalances: readonly {
    readonly memberId: string;
    readonly netBalanceMinor: number;
  }[];
  /** ISO date-time when the cache entry was computed. */
  readonly computedAt: string;
}

// ---------------------------------------------------------------------------
// Cache validity
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the cache entry is still valid for the given current
 * source version.
 *
 * The cache is valid iff `entry.sourceVersion === currentSourceVersion`.
 * ANY mutation to source records changes the source version, invalidating
 * all cache entries.
 */
export function isCacheValid(
  entry: BalanceCacheEntry,
  currentSourceVersion: string,
): boolean {
  if (typeof entry.sourceVersion !== 'string' || entry.sourceVersion.length === 0) {
    return false;
  }
  if (typeof currentSourceVersion !== 'string' || currentSourceVersion.length === 0) {
    return false;
  }
  return entry.sourceVersion === currentSourceVersion;
}

// ---------------------------------------------------------------------------
// Zero-sum invariant
// ---------------------------------------------------------------------------

/**
 * Verifies the zero-sum invariant on a cache entry.
 *
 * CRITICAL: in a closed group, the sum of all member net balances MUST
 * equal 0 (every debt has a corresponding credit). If the sum is non-zero,
 * the cache entry is corrupt and MUST be discarded.
 *
 * Returns `true` iff:
 *   - All `netBalanceMinor` values are safe integers (no floats, no
 *     non-numbers, no non-finite values).
 *   - The sum of all `netBalanceMinor` values is exactly 0.
 */
export function verifyZeroSumInvariant(entry: BalanceCacheEntry): boolean {
  if (!Array.isArray(entry.memberBalances)) return false;
  if (entry.memberBalances.length === 0) return true; // empty = trivially balanced

  let sum = 0;
  for (const mb of entry.memberBalances) {
    if (mb === null || typeof mb !== 'object') return false;
    const value = mb.netBalanceMinor;
    if (typeof value !== 'number') return false;
    if (!Number.isSafeInteger(value)) return false;
    if (!Number.isFinite(value)) return false;
    sum += value;
  }

  // The sum must be exactly 0. We're using integers, so no floating-point
  // drift is possible — but we still verify defensively.
  return sum === 0;
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

/**
 * The 5 financial mutations that ALWAYS invalidate the balance cache.
 */
export type FinancialMutation =
  | 'expense_create'
  | 'expense_edit'
  | 'settlement_create'
  | 'settlement_reverse'
  | 'settlement_confirm';

export const FINANCIAL_MUTATIONS: readonly FinancialMutation[] = Object.freeze([
  'expense_create',
  'expense_edit',
  'settlement_create',
  'settlement_reverse',
  'settlement_confirm',
]);

/**
 * Returns `true` when the given financial mutation invalidates the balance
 * cache.
 *
 * CRITICAL: this function ALWAYS returns `true` — ANY financial mutation
 * invalidates the balance cache. There are NO exceptions.
 *
 * The function exists as a defense-in-depth measure: the cache
 * invalidation logic is centralized here, so future developers cannot
 * accidentally introduce a code path that fails to invalidate the cache
 * on a financial mutation.
 */
export function invalidateOnFinancialMutation(
  mutation: FinancialMutation,
): boolean {
  // Any financial mutation invalidates the cache. Always.
  return FINANCIAL_MUTATIONS.includes(mutation);
}

// ---------------------------------------------------------------------------
// Cache construction
// ---------------------------------------------------------------------------

export interface BalanceCacheEntryInput {
  readonly groupId: string;
  readonly currencyCode: string;
  readonly sourceVersion: string;
  readonly memberBalances: readonly {
    readonly memberId: string;
    readonly netBalanceMinor: number;
  }[];
  readonly computedAt: string;
}

/**
 * Constructs a new balance cache entry. Validates that all amounts are
 * safe integers and that the zero-sum invariant holds.
 *
 * Throws if:
 *   - Any amount is not a safe integer.
 *   - The zero-sum invariant is violated.
 *   - Any required field is missing or empty.
 */
export function createBalanceCacheEntry(
  input: BalanceCacheEntryInput,
): BalanceCacheEntry {
  if (input.groupId.trim().length === 0) {
    throw new Error('groupId must not be empty');
  }
  if (input.currencyCode.trim().length === 0) {
    throw new Error('currencyCode must not be empty');
  }
  if (input.sourceVersion.trim().length === 0) {
    throw new Error('sourceVersion must not be empty');
  }
  if (Number.isNaN(Date.parse(input.computedAt))) {
    throw new Error('computedAt must be a valid ISO date-time');
  }

  // Validate all amounts are safe integers.
  for (const mb of input.memberBalances) {
    if (typeof mb.netBalanceMinor !== 'number' || !Number.isSafeInteger(mb.netBalanceMinor)) {
      throw new Error(
        `netBalanceMinor for member ${mb.memberId} must be a safe integer, got ${mb.netBalanceMinor}`,
      );
    }
  }

  const entry: BalanceCacheEntry = {
    groupId: input.groupId,
    currencyCode: input.currencyCode,
    sourceVersion: input.sourceVersion,
    memberBalances: input.memberBalances,
    computedAt: input.computedAt,
  };

  // Verify zero-sum invariant.
  if (!verifyZeroSumInvariant(entry)) {
    throw new Error(
      `Balance cache entry for group ${input.groupId} ${input.currencyCode} violates the zero-sum invariant`,
    );
  }

  return Object.freeze(entry);
}

// ---------------------------------------------------------------------------
// Safe retrieval
// ---------------------------------------------------------------------------

/**
 * Returns the cached balances if the entry is valid AND the zero-sum
 * invariant holds. Returns `null` otherwise.
 *
 * This is the safe retrieval function — callers should ALWAYS use this
 * instead of accessing the cache entry directly, to ensure the zero-sum
 * invariant is verified on every retrieval.
 */
export function safelyRetrieveCachedBalances(
  entry: BalanceCacheEntry,
  currentSourceVersion: string,
): BalanceCacheEntry | null {
  if (!isCacheValid(entry, currentSourceVersion)) return null;
  if (!verifyZeroSumInvariant(entry)) return null;
  return entry;
}
