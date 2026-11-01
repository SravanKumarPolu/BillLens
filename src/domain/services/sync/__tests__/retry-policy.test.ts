import { describe, expect, it } from '@jest/globals';

import { asDateTime } from '@domain/value-objects';

import {
  computeNextRetry,
  hasExhaustedRetries,
  computeDelayMs,
  DEFAULT_RETRY_POLICY,
  type RetryPolicyConfig,
} from '../retry-policy';

const NOW = asDateTime('2026-10-10T10:00:00.000Z');

describe('Retry policy', () => {
  describe('computeNextRetry', () => {
    it('returns the current time for the first failure (immediate)', () => {
      const result = computeNextRetry(1, DEFAULT_RETRY_POLICY, NOW);
      expect(result).toBe(NOW);
    });

    it('returns a time within a few seconds for the second failure', () => {
      const result = computeNextRetry(2, DEFAULT_RETRY_POLICY, NOW);
      expect(result).not.toBeNull();
      const delay = new Date(result!).getTime() - new Date(NOW).getTime();
      // baseDelay (1000ms) × 2^0 = 1000ms + jitter (0-1000ms) = 1000-2000ms
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('returns a longer delay for the third failure', () => {
      const result = computeNextRetry(3, DEFAULT_RETRY_POLICY, NOW);
      expect(result).not.toBeNull();
      const delay = new Date(result!).getTime() - new Date(NOW).getTime();
      // baseDelay (1000ms) × 2^1 = 2000ms + jitter = 2000-3000ms
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(3000);
    });

    it('caps the delay at maxDelayMs', () => {
      const config: RetryPolicyConfig = {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        maxAttempts: 20,
      };
      const result = computeNextRetry(15, config, NOW);
      expect(result).not.toBeNull();
      const delay = new Date(result!).getTime() - new Date(NOW).getTime();
      // The raw delay would be 1000 × 2^13 = 8192000ms, capped at 5000ms
      // Plus jitter (0-1000ms) = 5000-6000ms
      expect(delay).toBeGreaterThanOrEqual(5000);
      expect(delay).toBeLessThanOrEqual(6000);
    });

    it('returns null when retries are exhausted', () => {
      const result = computeNextRetry(10, DEFAULT_RETRY_POLICY, NOW);
      expect(result).toBeNull();
    });

    it('respects server-provided retry-after value', () => {
      const result = computeNextRetry(2, DEFAULT_RETRY_POLICY, NOW, 60_000);
      expect(result).not.toBeNull();
      const delay = new Date(result!).getTime() - new Date(NOW).getTime();
      expect(delay).toBe(60_000); // exactly 60 seconds, no jitter
    });
  });

  describe('hasExhaustedRetries', () => {
    it('returns false within the limit', () => {
      expect(hasExhaustedRetries(1)).toBe(false);
      expect(hasExhaustedRetries(5)).toBe(false);
      expect(hasExhaustedRetries(9)).toBe(false);
    });

    it('returns true at and beyond the limit', () => {
      expect(hasExhaustedRetries(10)).toBe(true);
      expect(hasExhaustedRetries(15)).toBe(true);
    });
  });

  describe('computeDelayMs', () => {
    it('returns 0 for the first attempt', () => {
      expect(computeDelayMs(1)).toBe(0);
    });

    it('returns the base delay for the second attempt', () => {
      expect(computeDelayMs(2)).toBe(1000);
    });

    it('returns 2× base for the third attempt', () => {
      expect(computeDelayMs(3)).toBe(2000);
    });

    it('caps at maxDelayMs', () => {
      const config: RetryPolicyConfig = {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        maxAttempts: 20,
      };
      expect(computeDelayMs(15, config)).toBe(5000);
    });
  });

  it('DEFAULT_RETRY_POLICY has sensible values', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_POLICY.maxDelayMs).toBe(300_000);
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(10);
  });
});
