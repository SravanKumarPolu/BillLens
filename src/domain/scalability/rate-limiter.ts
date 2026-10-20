/**
 * Rate limiting model — tiered request quotas.
 *
 * Phase 10 Prompt 91: Scalability Architecture.
 *
 * CRITICAL CONSTRAINT: rate limiting MUST NOT block critical financial
 * operations. Settlements are ALWAYS allowed regardless of tier or
 * current request count. The application layer is responsible for
 * calling `isCriticalOperation()` before applying rate-limit decisions.
 *
 * This module is PURE: it computes decisions from inputs; it does not
 * store counters or perform I/O.
 *
 * See `docs/scalability-architecture.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitTier =
  | 'anonymous'
  | 'authenticated'
  | 'premium'
  | 'enterprise'
  | 'internal';

export interface RateLimitRule {
  readonly tier: RateLimitTier;
  readonly requestsPerMinute: number;
  readonly requestsPerHour: number;
  readonly requestsPerDay: number;
  readonly burstSize: number;
}

export interface RateLimitDecision {
  readonly limited: boolean;
  readonly retryAfterSeconds?: number;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Operations that are EXEMPT from rate limiting
// ---------------------------------------------------------------------------

/**
 * Operations that MUST NEVER be rate-limited because they are critical
 * for financial correctness or for resolving an in-flight payment.
 *
 * Settlements are the canonical example: blocking a settlement because
 * the user hit a per-minute quota could leave a balance in an
 * inconsistent state.
 */
export const CRITICAL_OPERATIONS: readonly string[] = Object.freeze([
  'settlement_create',
  'settlement_confirm',
  'settlement_cancel',
  'expense_create_offline_flush',
  'sync_conflict_resolve',
]);

export function isCriticalOperation(operation: string): boolean {
  return CRITICAL_OPERATIONS.includes(operation);
}

// ---------------------------------------------------------------------------
// Tier rules
// ---------------------------------------------------------------------------

export const RATE_LIMIT_RULES: Readonly<Record<RateLimitTier, RateLimitRule>> =
  Object.freeze({
    anonymous: Object.freeze({
      tier: 'anonymous',
      requestsPerMinute: 30,
      requestsPerHour: 500,
      requestsPerDay: 2_000,
      burstSize: 10,
    }),
    authenticated: Object.freeze({
      tier: 'authenticated',
      requestsPerMinute: 120,
      requestsPerHour: 5_000,
      requestsPerDay: 25_000,
      burstSize: 30,
    }),
    premium: Object.freeze({
      tier: 'premium',
      requestsPerMinute: 300,
      requestsPerHour: 15_000,
      requestsPerDay: 100_000,
      burstSize: 60,
    }),
    enterprise: Object.freeze({
      tier: 'enterprise',
      requestsPerMinute: 1_200,
      requestsPerHour: 60_000,
      requestsPerDay: 500_000,
      burstSize: 200,
    }),
    internal: Object.freeze({
      tier: 'internal',
      requestsPerMinute: 6_000,
      requestsPerHour: 300_000,
      requestsPerDay: Number.MAX_SAFE_INTEGER,
      burstSize: 1_000,
    }),
  });

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/**
 * Returns a rate-limit decision for the given request counts and tier.
 *
 * The decision considers (in order of strictness): per-minute, per-hour,
 * and per-day counters. If any one is exceeded the request is limited
 * and `retryAfterSeconds` is set to the time needed to drop back below
 * the most-exceeded limit.
 *
 * For the `internal` tier, the function returns `limited: false`
 * unconditionally (internal service-to-service traffic is not rate
 * limited; it is throttled by circuit breakers instead).
 */
export function shouldRateLimit(
  requestsInLastMinute: number,
  requestsInLastHour: number,
  requestsInLastDay: number,
  tier: RateLimitTier,
): RateLimitDecision {
  const rule = RATE_LIMIT_RULES[tier];
  if (!rule) {
    return { limited: true, retryAfterSeconds: 60, reason: 'unknown_tier' };
  }
  if (tier === 'internal') {
    return { limited: false };
  }

  if (requestsInLastDay >= rule.requestsPerDay) {
    return {
      limited: true,
      retryAfterSeconds: computeRetryAfter(requestsInLastMinute, tier, 'day'),
      reason: 'day_limit_exceeded',
    };
  }
  if (requestsInLastHour >= rule.requestsPerHour) {
    return {
      limited: true,
      retryAfterSeconds: computeRetryAfter(requestsInLastMinute, tier, 'hour'),
      reason: 'hour_limit_exceeded',
    };
  }
  if (requestsInLastMinute >= rule.requestsPerMinute) {
    return {
      limited: true,
      retryAfterSeconds: computeRetryAfter(requestsInLastMinute, tier),
      reason: 'minute_limit_exceeded',
    };
  }
  return { limited: false };
}

/**
 * Computes the number of seconds the client should wait before retrying
 * after hitting the per-minute limit.
 *
 * Strategy: at `requestsPerMinute` evenly distributed across 60 seconds,
 * one slot is `60 / requestsPerMinute` seconds. We always return at
 * least 1 second so the client doesn't tight-loop.
 *
 * The optional `window` parameter selects which limit to base the
 * calculation on (defaults to 'minute').
 */
export function computeRetryAfter(
  requestsInLastMinute: number,
  tier: RateLimitTier,
  window: 'minute' | 'hour' | 'day' = 'minute',
): number {
  const rule = RATE_LIMIT_RULES[tier];
  if (!rule) {
    return 60;
  }
  const limit =
    window === 'day'
      ? rule.requestsPerDay
      : window === 'hour'
        ? rule.requestsPerHour
        : rule.requestsPerMinute;
  if (!Number.isFinite(limit) || limit <= 0) {
    return 1;
  }
  const windowSeconds = window === 'day' ? 86_400 : window === 'hour' ? 3_600 : 60;
  // Over-shoot factor: the more we exceed, the longer the wait.
  const overshoot = Math.max(0, requestsInLastMinute - limit);
  const perSlot = windowSeconds / limit;
  const retry = Math.ceil(perSlot + overshoot * perSlot);
  return Math.max(1, Math.min(retry, windowSeconds));
}

/**
 * Convenience: returns the rule for a tier (throws on unknown tier — a
 * programming error).
 */
export function getRateLimitRule(tier: RateLimitTier): RateLimitRule {
  const rule = RATE_LIMIT_RULES[tier];
  if (!rule) {
    throw new Error(`Unknown rate-limit tier: ${tier}`);
  }
  return rule;
}
