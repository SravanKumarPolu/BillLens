/**
 * Multi-layer caching strategy.
 *
 * Phase 10 Prompt 91: Scalability Architecture.
 *
 * Defines cache layers (memory / redis / cdn), invalidation strategies
 * (ttl / version / event / manual), and a registry of cache policies
 * keyed by stable identifier.
 *
 * This module is PURE and READ-ONLY. It defines policy; it does NOT
 * perform cache reads or writes (that is the responsibility of
 * infrastructure adapters).
 *
 * Financial safety: balance caches MUST use the 'version' invalidation
 * strategy so that any mutation bumps the version and invalidates
 * stale entries. See `balance-cache-safety.ts` and
 * `docs/money-and-rounding.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CacheLayer = 'memory' | 'redis' | 'cdn';

export type CacheInvalidationStrategy = 'ttl' | 'version' | 'event' | 'manual';

export interface CachePolicy {
  /** Stable cache-key pattern (with {param} placeholders). */
  readonly key: string;
  /** Where the cached entry lives. */
  readonly layer: CacheLayer;
  /** TTL in seconds. 0 means "no expiry". */
  readonly ttlSeconds: number;
  /** How stale entries are evicted. */
  readonly invalidationStrategy: CacheInvalidationStrategy;
  /** Optional per-entry size cap (bytes). */
  readonly maxSizeBytes?: number;
}

// ---------------------------------------------------------------------------
// Cache policy registry
// ---------------------------------------------------------------------------

/**
 * Canonical cache policies for BillLens. Add new policies here — never
 * construct ad-hoc cache keys outside this registry.
 *
 * Layers:
 *  - memory: short-lived, per-process, ultra-low-latency
 *  - redis:  shared across instances, medium TTL
 *  - cdn:    edge-cached static assets
 *
 * Invalidation:
 *  - ttl:     entry expires after ttlSeconds
 *  - version: entry is keyed by a versioned tag (bumped on mutation)
 *  - event:   entry is invalidated by an explicit event (e.g. expense_created)
 *  - manual:  entry is invalidated only by an explicit admin call
 */
export const CACHE_POLICIES: readonly CachePolicy[] = Object.freeze([
  {
    key: 'balance:{groupId}:{currency}',
    layer: 'memory',
    ttlSeconds: 300,
    invalidationStrategy: 'version',
    maxSizeBytes: 4_096,
  },
  {
    key: 'group_members:{groupId}',
    layer: 'redis',
    ttlSeconds: 600,
    invalidationStrategy: 'event',
    maxSizeBytes: 16_384,
  },
  {
    key: 'expense_list:{groupId}',
    layer: 'redis',
    ttlSeconds: 60,
    invalidationStrategy: 'event',
    maxSizeBytes: 65_536,
  },
  {
    key: 'user_profile:{userId}',
    layer: 'redis',
    ttlSeconds: 3600,
    invalidationStrategy: 'event',
    maxSizeBytes: 8_192,
  },
  {
    key: 'ocr_result:{imageHash}',
    layer: 'redis',
    ttlSeconds: 86_400,
    invalidationStrategy: 'ttl',
    maxSizeBytes: 131_072,
  },
  {
    key: 'static_assets',
    layer: 'cdn',
    ttlSeconds: 86_400,
    invalidationStrategy: 'ttl',
  },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the cache policy for a given key pattern, or null when no
 * policy exists. Lookup is by EXACT match against the registered key
 * pattern (e.g. 'balance:{groupId}:{currency}'), not by materialised
 * cache key.
 */
export function getCachePolicy(key: string): CachePolicy | null {
  return CACHE_POLICIES.find((p) => p.key === key) ?? null;
}

/**
 * Computes a concrete cache key from a prefix and a set of named
 * parameters. Parameters are sorted alphabetically and URL-encoded
 * for safe concatenation. The result is deterministic.
 *
 * Example:
 *   computeCacheKey('balance', { groupId: 'g_1', currency: 'INR' })
 *   → 'balance:currency=INR;groupId=g_1'
 *
 * This function deliberately does NOT use the {placeholder} pattern
 * from the policy; it produces a stable, sortable key that is easy
 * to grep in logs and to invalidate by prefix.
 */
export function computeCacheKey(
  prefix: string,
  params: Readonly<Record<string, string>>,
): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safePrefix.length === 0) {
    throw new Error('computeCacheKey: prefix must contain at least one alphanumeric character');
  }
  const keys = Object.keys(params).sort();
  if (keys.length === 0) {
    return safePrefix;
  }
  const pairs = keys.map((k) => {
    const safeKey = k.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeValue = encodeURIComponent(params[k] ?? '');
    return `${safeKey}=${safeValue}`;
  });
  return `${safePrefix}:${pairs.join(';')}`;
}

/**
 * Returns true when the given policy uses the 'version' invalidation
 * strategy — used by the balance-cache-safety guard.
 */
export function isVersionedPolicy(policy: CachePolicy): boolean {
  return policy.invalidationStrategy === 'version';
}
