import { describe, expect, it } from '@jest/globals';

import {
  FINANCIAL_MUTATIONS,
  createBalanceCacheEntry,
  invalidateOnFinancialMutation,
  isCacheValid,
  safelyRetrieveCachedBalances,
  verifyZeroSumInvariant,
  type BalanceCacheEntry,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<BalanceCacheEntry> = {}): BalanceCacheEntry {
  return {
    groupId: overrides.groupId ?? 'group-1',
    currencyCode: overrides.currencyCode ?? 'USD',
    sourceVersion: overrides.sourceVersion ?? 'v1',
    memberBalances: overrides.memberBalances ?? [
      { memberId: 'm1', netBalanceMinor: 100 },
      { memberId: 'm2', netBalanceMinor: -100 },
    ],
    computedAt: overrides.computedAt ?? '2025-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('balance-cache-safety', () => {
  describe('isCacheValid', () => {
    it('returns true when sourceVersion matches', () => {
      const entry = makeEntry({ sourceVersion: 'v1' });
      expect(isCacheValid(entry, 'v1')).toBe(true);
    });

    it('returns false when sourceVersion differs (cache stale)', () => {
      const entry = makeEntry({ sourceVersion: 'v1' });
      expect(isCacheValid(entry, 'v2')).toBe(false);
    });

    it('returns false when entry.sourceVersion is empty', () => {
      const entry = makeEntry({ sourceVersion: '' });
      expect(isCacheValid(entry, 'v1')).toBe(false);
    });

    it('returns false when currentSourceVersion is empty', () => {
      const entry = makeEntry({ sourceVersion: 'v1' });
      expect(isCacheValid(entry, '')).toBe(false);
    });
  });

  describe('verifyZeroSumInvariant', () => {
    it('returns true when sum is exactly 0', () => {
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: 100 },
          { memberId: 'm2', netBalanceMinor: -100 },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(true);
    });

    it('returns true when sum is exactly 0 (3 members)', () => {
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: 100 },
          { memberId: 'm2', netBalanceMinor: -50 },
          { memberId: 'm3', netBalanceMinor: -50 },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(true);
    });

    it('returns true for an empty member list', () => {
      const entry = makeEntry({ memberBalances: [] });
      expect(verifyZeroSumInvariant(entry)).toBe(true);
    });

    it('CRITICAL: returns false when sum is non-zero (corrupt cache)', () => {
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: 100 },
          { memberId: 'm2', netBalanceMinor: -90 },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(false);
    });

    it('CRITICAL: returns false when a balance is a float', () => {
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: 100.5 },
          { memberId: 'm2', netBalanceMinor: -100.5 },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(false);
    });

    it('CRITICAL: returns false when a balance is NaN', () => {
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: NaN },
          { memberId: 'm2', netBalanceMinor: 0 },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(false);
    });

    it('CRITICAL: returns false when a balance is Infinity', () => {
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: Infinity },
          { memberId: 'm2', netBalanceMinor: 0 },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(false);
    });

    it('returns false when a balance is not a number', () => {
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: '100' as unknown as number },
          { memberId: 'm2', netBalanceMinor: -100 },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(false);
    });

    it('returns false when a balance is not a safe integer (too large)', () => {
      const tooLarge = Number.MAX_SAFE_INTEGER + 1;
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: tooLarge },
          { memberId: 'm2', netBalanceMinor: -tooLarge },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(false);
    });

    it('handles large realistic amounts (₹1 crore in paise = 10^8)', () => {
      const oneCrorePaise = 10 ** 8;
      const entry = makeEntry({
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: oneCrorePaise },
          { memberId: 'm2', netBalanceMinor: -oneCrorePaise },
        ],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(true);
    });

    it('returns false when memberBalances is not an array', () => {
      const entry = makeEntry({
        memberBalances: 'not-an-array' as unknown as BalanceCacheEntry['memberBalances'],
      });
      expect(verifyZeroSumInvariant(entry)).toBe(false);
    });
  });

  describe('invalidateOnFinancialMutation', () => {
    it('CRITICAL: returns true for expense_create', () => {
      expect(invalidateOnFinancialMutation('expense_create')).toBe(true);
    });

    it('CRITICAL: returns true for expense_edit', () => {
      expect(invalidateOnFinancialMutation('expense_edit')).toBe(true);
    });

    it('CRITICAL: returns true for settlement_create', () => {
      expect(invalidateOnFinancialMutation('settlement_create')).toBe(true);
    });

    it('CRITICAL: returns true for settlement_reverse', () => {
      expect(invalidateOnFinancialMutation('settlement_reverse')).toBe(true);
    });

    it('CRITICAL: returns true for settlement_confirm', () => {
      expect(invalidateOnFinancialMutation('settlement_confirm')).toBe(true);
    });

    it('CRITICAL: ALL 5 financial mutations invalidate the cache', () => {
      // Verify each mutation returns true.
      for (const m of FINANCIAL_MUTATIONS) {
        expect(invalidateOnFinancialMutation(m)).toBe(true);
      }
      // Verify exactly 5 mutations are listed.
      expect(FINANCIAL_MUTATIONS.length).toBe(5);
    });

    it('FINANCIAL_MUTATIONS is a readonly frozen list', () => {
      expect(Object.isFrozen(FINANCIAL_MUTATIONS)).toBe(true);
    });
  });

  describe('createBalanceCacheEntry', () => {
    it('creates an entry when inputs are valid', () => {
      const entry = createBalanceCacheEntry({
        groupId: 'g1',
        currencyCode: 'USD',
        sourceVersion: 'v1',
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: 100 },
          { memberId: 'm2', netBalanceMinor: -100 },
        ],
        computedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(entry.groupId).toBe('g1');
      expect(entry.currencyCode).toBe('USD');
      expect(entry.sourceVersion).toBe('v1');
      expect(entry.memberBalances.length).toBe(2);
      expect(Object.isFrozen(entry)).toBe(true);
    });

    it('throws when groupId is empty', () => {
      expect(() =>
        createBalanceCacheEntry({
          groupId: '',
          currencyCode: 'USD',
          sourceVersion: 'v1',
          memberBalances: [],
          computedAt: '2025-01-01T00:00:00.000Z',
        }),
      ).toThrow();
    });

    it('throws when currencyCode is empty', () => {
      expect(() =>
        createBalanceCacheEntry({
          groupId: 'g1',
          currencyCode: '',
          sourceVersion: 'v1',
          memberBalances: [],
          computedAt: '2025-01-01T00:00:00.000Z',
        }),
      ).toThrow();
    });

    it('throws when sourceVersion is empty', () => {
      expect(() =>
        createBalanceCacheEntry({
          groupId: 'g1',
          currencyCode: 'USD',
          sourceVersion: '',
          memberBalances: [],
          computedAt: '2025-01-01T00:00:00.000Z',
        }),
      ).toThrow();
    });

    it('throws when computedAt is invalid', () => {
      expect(() =>
        createBalanceCacheEntry({
          groupId: 'g1',
          currencyCode: 'USD',
          sourceVersion: 'v1',
          memberBalances: [],
          computedAt: 'not-a-date',
        }),
      ).toThrow();
    });

    it('CRITICAL: throws when a balance is a float', () => {
      expect(() =>
        createBalanceCacheEntry({
          groupId: 'g1',
          currencyCode: 'USD',
          sourceVersion: 'v1',
          memberBalances: [
            { memberId: 'm1', netBalanceMinor: 100.5 },
            { memberId: 'm2', netBalanceMinor: -100.5 },
          ],
          computedAt: '2025-01-01T00:00:00.000Z',
        }),
      ).toThrow();
    });

    it('CRITICAL: throws when the zero-sum invariant is violated', () => {
      expect(() =>
        createBalanceCacheEntry({
          groupId: 'g1',
          currencyCode: 'USD',
          sourceVersion: 'v1',
          memberBalances: [
            { memberId: 'm1', netBalanceMinor: 100 },
            { memberId: 'm2', netBalanceMinor: -90 },
          ],
          computedAt: '2025-01-01T00:00:00.000Z',
        }),
      ).toThrow();
    });
  });

  describe('safelyRetrieveCachedBalances', () => {
    it('returns the entry when valid and zero-sum holds', () => {
      const entry = makeEntry({ sourceVersion: 'v1' });
      const result = safelyRetrieveCachedBalances(entry, 'v1');
      expect(result).toBe(entry);
    });

    it('returns null when the cache is stale (sourceVersion mismatch)', () => {
      const entry = makeEntry({ sourceVersion: 'v1' });
      const result = safelyRetrieveCachedBalances(entry, 'v2');
      expect(result).toBe(null);
    });

    it('returns null when the zero-sum invariant is violated', () => {
      const entry = makeEntry({
        sourceVersion: 'v1',
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: 100 },
          { memberId: 'm2', netBalanceMinor: -90 },
        ],
      });
      const result = safelyRetrieveCachedBalances(entry, 'v1');
      expect(result).toBe(null);
    });

    it('returns null when a balance is a float (even if sum is 0)', () => {
      const entry = makeEntry({
        sourceVersion: 'v1',
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: 100.5 },
          { memberId: 'm2', netBalanceMinor: -100.5 },
        ],
      });
      const result = safelyRetrieveCachedBalances(entry, 'v1');
      expect(result).toBe(null);
    });
  });

  describe('CRITICAL: invalidation on all 5 financial mutations (exhaustive)', () => {
    // CRITICAL: this is the key invariant — ANY financial mutation
    // invalidates the cache, NO exceptions.

    it.each(FINANCIAL_MUTATIONS)(
      'invalidateOnFinancialMutation(%s) returns true',
      (mutation) => {
        expect(invalidateOnFinancialMutation(mutation)).toBe(true);
      },
    );

    it('the cache becomes invalid after any of the 5 mutations (simulated by sourceVersion bump)', () => {
      // Before mutation: cache is valid.
      const entry = makeEntry({ sourceVersion: 'v1' });
      expect(isCacheValid(entry, 'v1')).toBe(true);

      // After mutation: sourceVersion bumps to v2, cache is invalid.
      expect(isCacheValid(entry, 'v2')).toBe(false);
    });

    it('CRITICAL: zero-sum invariant is verified on EVERY retrieval (defense-in-depth)', () => {
      // Even if sourceVersion matches, a corrupt cache (non-zero sum) is rejected.
      const corrupt = makeEntry({
        sourceVersion: 'v1',
        memberBalances: [
          { memberId: 'm1', netBalanceMinor: 100 },
          { memberId: 'm2', netBalanceMinor: -90 }, // sum = 10 ≠ 0
        ],
      });
      // sourceVersion matches, but zero-sum fails.
      expect(safelyRetrieveCachedBalances(corrupt, 'v1')).toBe(null);
    });
  });
});
