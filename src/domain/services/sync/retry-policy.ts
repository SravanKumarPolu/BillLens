import type { DateTime } from '../../value-objects/date-time';
import { asDateTime, nowDateTime } from '../../value-objects/date-time';

/**
 * Retry policy — Phase 7 Prompt 61/62.
 *
 * Pure module that computes the next retry time for a failed sync
 * operation using bounded exponential backoff with jitter.
 *
 * The policy:
 *
 *   Attempt 1: immediate (no delay)
 *   Attempt 2: short delay (baseDelay × 2^0 + jitter)
 *   Attempt 3: longer delay (baseDelay × 2^1 + jitter)
 *   Later attempts: capped delay (baseDelay × 2^(n-2) + jitter, capped at maxDelay)
 *
 * The jitter is a random value between 0 and `baseDelay` to prevent
 * thundering-herd retries when many operations fail simultaneously
 * (e.g. after a network outage).
 *
 * The policy respects server-provided `retryAfter` values when
 * available (e.g. from an HTTP 429 response). If the server says
 * "retry after 60 seconds", the policy uses 60 seconds instead of
 * the computed backoff.
 */

// ---------------------------------------------------------------------------
// Policy configuration
// ---------------------------------------------------------------------------

export interface RetryPolicyConfig {
  /** The base delay in milliseconds. Default: 1000 (1 second). */
  readonly baseDelayMs: number;
  /** The maximum delay in milliseconds. Default: 300000 (5 minutes). */
  readonly maxDelayMs: number;
  /** The maximum number of retry attempts. Default: 10. */
  readonly maxAttempts: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 300_000, // 5 minutes
  maxAttempts: 10,
};

/**
 * The retry cap, SHARED between the retry policy and the SQLite sync
 * repository's SQL queries (v2.5.0). Previously the policy said 10 while
 * the repository SQL hardcoded 8 — operations at retry_count 8–9
 * vanished from both the "ready" and "permanently failed" lists.
 * Single-sourced here; import this constant wherever a retry-count
 * bound is needed.
 */
export const MAX_SYNC_RETRIES: number = DEFAULT_RETRY_POLICY.maxAttempts;

// ---------------------------------------------------------------------------
// Compute next retry time
// ---------------------------------------------------------------------------

/**
 * Compute the next retry time for a failed sync operation.
 *
 * @param attemptCount — the number of attempts so far (1 = first attempt
 *   failed, 2 = second attempt failed, etc.)
 * @param config — the retry policy configuration
 * @param now — the current time (for testing; defaults to real now)
 * @param serverRetryAfterMs — optional server-provided retry-after value
 *   in milliseconds (e.g. from an HTTP 429 response). If provided, this
 *   overrides the computed backoff.
 * @returns The next retry time as a `DateTime`, or `null` if the
 *   operation has exhausted all retries.
 *
 * @example
 *   // First failure (attemptCount=1): immediate retry
 *   computeNextRetry(1, DEFAULT_RETRY_POLICY)
 *   // → now (immediate)
 *
 *   // Second failure (attemptCount=2): ~1 second delay
 *   computeNextRetry(2, DEFAULT_RETRY_POLICY)
 *   // → now + ~1000ms ± jitter
 *
 *   // Tenth failure (attemptCount=10): max delay
 *   computeNextRetry(10, DEFAULT_RETRY_POLICY)
 *   // → now + 300000ms (5 minutes, capped)
 *
 *   // Eleventh failure (attemptCount=11): null (exhausted)
 *   computeNextRetry(11, DEFAULT_RETRY_POLICY)
 *   // → null
 */
export function computeNextRetry(
  attemptCount: number,
  config: RetryPolicyConfig = DEFAULT_RETRY_POLICY,
  now: DateTime = nowDateTime(),
  serverRetryAfterMs?: number,
): DateTime | null {
  if (attemptCount >= config.maxAttempts) {
    return null; // exhausted
  }

  // If the server provided a retry-after value, use it directly.
  if (serverRetryAfterMs !== undefined && serverRetryAfterMs > 0) {
    const retryMs = new Date(now).getTime() + serverRetryAfterMs;
    return asDateTime(new Date(retryMs).toISOString());
  }

  // First failure: immediate retry (no delay)
  if (attemptCount <= 1) {
    return now;
  }

  // Exponential backoff: baseDelay × 2^(attempt-2), capped at maxDelay
  const exponent = attemptCount - 2;
  const rawDelay = config.baseDelayMs * Math.pow(2, exponent);
  const cappedDelay = Math.min(rawDelay, config.maxDelayMs);

  // Add jitter: a random value between 0 and baseDelay, to prevent
  // thundering-herd retries.
  const jitter = Math.random() * config.baseDelayMs;
  const totalDelay = cappedDelay + jitter;

  const retryMs = new Date(now).getTime() + totalDelay;
  return asDateTime(new Date(retryMs).toISOString());
}

/**
 * Check whether an operation has exhausted all retry attempts.
 */
export function hasExhaustedRetries(
  attemptCount: number,
  config: RetryPolicyConfig = DEFAULT_RETRY_POLICY,
): boolean {
  return attemptCount >= config.maxAttempts;
}

/**
 * Compute the delay in milliseconds for a given attempt number (for
 * display in the UI's "retrying in X seconds" indicator).
 */
export function computeDelayMs(
  attemptCount: number,
  config: RetryPolicyConfig = DEFAULT_RETRY_POLICY,
): number {
  if (attemptCount <= 1) return 0;
  const exponent = attemptCount - 2;
  const rawDelay = config.baseDelayMs * Math.pow(2, exponent);
  return Math.min(rawDelay, config.maxDelayMs);
}
