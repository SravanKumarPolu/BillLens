import { describe, expect, it } from '@jest/globals';

import {
  CURRENT_CONSENT_VERSION,
  OCR_CONSENT_SCOPES,
  canUseAggregatedPatterns,
  canUseAnonymousStats,
  canUseReceiptForTraining,
  getDefaultConsent,
  grantConsent,
  isOcrConsentScope,
  scopeAtLeast,
  scopeRank,
  summarizeConsent,
  withdrawConsent,
  type OcrConsentScope,
  type OcrImprovementConsent,
} from '../index';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('consent-manager', () => {
  describe('OCR_CONSENT_SCOPES', () => {
    it('contains exactly 3 scopes', () => {
      expect(OCR_CONSENT_SCOPES.length).toBe(3);
    });

    it.each(OCR_CONSENT_SCOPES)('includes %s', (scope) => {
      expect(OCR_CONSENT_SCOPES).toContain(scope);
    });
  });

  describe('isOcrConsentScope', () => {
    it.each(OCR_CONSENT_SCOPES)('returns true for %s', (scope) => {
      expect(isOcrConsentScope(scope)).toBe(true);
    });

    it('returns false for unknown strings', () => {
      expect(isOcrConsentScope('everything')).toBe(false);
      expect(isOcrConsentScope('')).toBe(false);
      expect(isOcrConsentScope(null)).toBe(false);
      expect(isOcrConsentScope(undefined)).toBe(false);
    });
  });

  describe('scopeRank + scopeAtLeast', () => {
    it('ranks anonymous_stats_only as 0', () => {
      expect(scopeRank('anonymous_stats_only')).toBe(0);
    });

    it('ranks aggregated_patterns as 1', () => {
      expect(scopeRank('aggregated_patterns')).toBe(1);
    });

    it('ranks individual_receipts as 2', () => {
      expect(scopeRank('individual_receipts')).toBe(2);
    });

    it('scopeAtLeast returns true for same scope', () => {
      expect(scopeAtLeast('anonymous_stats_only', 'anonymous_stats_only')).toBe(true);
      expect(scopeAtLeast('individual_receipts', 'individual_receipts')).toBe(true);
    });

    it('scopeAtLeast returns true for higher scope', () => {
      expect(scopeAtLeast('aggregated_patterns', 'anonymous_stats_only')).toBe(true);
      expect(scopeAtLeast('individual_receipts', 'anonymous_stats_only')).toBe(true);
      expect(scopeAtLeast('individual_receipts', 'aggregated_patterns')).toBe(true);
    });

    it('scopeAtLeast returns false for lower scope', () => {
      expect(scopeAtLeast('anonymous_stats_only', 'aggregated_patterns')).toBe(false);
      expect(scopeAtLeast('anonymous_stats_only', 'individual_receipts')).toBe(false);
      expect(scopeAtLeast('aggregated_patterns', 'individual_receipts')).toBe(false);
    });
  });

  describe('getDefaultConsent', () => {
    it('returns the MOST CONSERVATIVE default', () => {
      const c = getDefaultConsent('profile-1');
      expect(c.scope).toBe('anonymous_stats_only');
      expect(c.consentGiven).toBe(false);
    });

    it('CRITICAL: default consentGiven is false (no data uploaded without explicit opt-in)', () => {
      const c = getDefaultConsent('profile-1');
      expect(c.consentGiven).toBe(false);
    });

    it('CRITICAL: default scope is anonymous_stats_only (most restrictive)', () => {
      const c = getDefaultConsent('profile-1');
      expect(c.scope).toBe('anonymous_stats_only');
    });

    it('uses the current consent version', () => {
      const c = getDefaultConsent('profile-1');
      expect(c.consentVersion).toBe(CURRENT_CONSENT_VERSION);
    });

    it('does NOT include grantedAt or withdrawnAt', () => {
      const c = getDefaultConsent('profile-1');
      expect(c.grantedAt).toBeUndefined();
      expect(c.withdrawnAt).toBeUndefined();
    });

    it('throws for empty profileId', () => {
      expect(() => getDefaultConsent('')).toThrow();
      expect(() => getDefaultConsent('   ')).toThrow();
    });

    it('returns a frozen object', () => {
      const c = getDefaultConsent('profile-1');
      expect(Object.isFrozen(c)).toBe(true);
    });

    it('CRITICAL: canUseReceiptForTraining(default) returns false', () => {
      const c = getDefaultConsent('profile-1');
      expect(canUseReceiptForTraining(c)).toBe(false);
    });

    it('CRITICAL: canUseAggregatedPatterns(default) returns false', () => {
      const c = getDefaultConsent('profile-1');
      expect(canUseAggregatedPatterns(c)).toBe(false);
    });

    it('CRITICAL: canUseAnonymousStats(default) returns false', () => {
      const c = getDefaultConsent('profile-1');
      expect(canUseAnonymousStats(c)).toBe(false);
    });
  });

  describe('grantConsent', () => {
    it('sets consentGiven to true at the given scope', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'aggregated_patterns', '2025-01-15T10:00:00.000Z');
      expect(granted.consentGiven).toBe(true);
      expect(granted.scope).toBe('aggregated_patterns');
      expect(granted.grantedAt).toBe('2025-01-15T10:00:00.000Z');
      expect(granted.withdrawnAt).toBeUndefined();
    });

    it('updates the consent version', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'individual_receipts', '2025-01-15T10:00:00.000Z');
      expect(granted.consentVersion).toBe(CURRENT_CONSENT_VERSION);
    });

    it('throws for unknown scope', () => {
      const c = getDefaultConsent('profile-1');
      expect(() => grantConsent(c, 'everything' as OcrConsentScope, '2025-01-15T10:00:00.000Z')).toThrow();
    });

    it('throws for invalid grantedAt', () => {
      const c = getDefaultConsent('profile-1');
      expect(() => grantConsent(c, 'aggregated_patterns', 'not-a-date')).toThrow();
    });

    it('returns a frozen object', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'aggregated_patterns', '2025-01-15T10:00:00.000Z');
      expect(Object.isFrozen(granted)).toBe(true);
    });
  });

  describe('withdrawConsent', () => {
    it('reverts to the default (most conservative) scope', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'individual_receipts', '2025-01-15T10:00:00.000Z');
      const withdrawn = withdrawConsent(granted, '2025-02-01T08:00:00.000Z');
      expect(withdrawn.scope).toBe('anonymous_stats_only');
      expect(withdrawn.consentGiven).toBe(false);
      expect(withdrawn.withdrawnAt).toBe('2025-02-01T08:00:00.000Z');
    });

    it('CRITICAL: after withdrawal, canUseReceiptForTraining returns false', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'individual_receipts', '2025-01-15T10:00:00.000Z');
      const withdrawn = withdrawConsent(granted, '2025-02-01T08:00:00.000Z');
      expect(canUseReceiptForTraining(withdrawn)).toBe(false);
    });

    it('CRITICAL: after withdrawal, canUseAggregatedPatterns returns false', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'aggregated_patterns', '2025-01-15T10:00:00.000Z');
      const withdrawn = withdrawConsent(granted, '2025-02-01T08:00:00.000Z');
      expect(canUseAggregatedPatterns(withdrawn)).toBe(false);
    });

    it('CRITICAL: after withdrawal, canUseAnonymousStats returns false', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'anonymous_stats_only', '2025-01-15T10:00:00.000Z');
      const withdrawn = withdrawConsent(granted, '2025-02-01T08:00:00.000Z');
      expect(canUseAnonymousStats(withdrawn)).toBe(false);
    });

    it('preserves the original grantedAt', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'individual_receipts', '2025-01-15T10:00:00.000Z');
      const withdrawn = withdrawConsent(granted, '2025-02-01T08:00:00.000Z');
      expect(withdrawn.grantedAt).toBe('2025-01-15T10:00:00.000Z');
    });

    it('throws for invalid withdrawnAt', () => {
      const c = getDefaultConsent('profile-1');
      expect(() => withdrawConsent(c, 'not-a-date')).toThrow();
    });

    it('returns a frozen object', () => {
      const c = getDefaultConsent('profile-1');
      const withdrawn = withdrawConsent(c, '2025-02-01T08:00:00.000Z');
      expect(Object.isFrozen(withdrawn)).toBe(true);
    });
  });

  describe('canUseReceiptForTraining', () => {
    it('CRITICAL: returns true ONLY when scope=individual_receipts AND consentGiven=true', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'individual_receipts', '2025-01-15T10:00:00.000Z');
      expect(canUseReceiptForTraining(granted)).toBe(true);
    });

    it('returns false for anonymous_stats_only even with consentGiven=true', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'anonymous_stats_only', '2025-01-15T10:00:00.000Z');
      expect(canUseReceiptForTraining(granted)).toBe(false);
    });

    it('returns false for aggregated_patterns even with consentGiven=true', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'aggregated_patterns', '2025-01-15T10:00:00.000Z');
      expect(canUseReceiptForTraining(granted)).toBe(false);
    });

    it('returns false for individual_receipts when consentGiven=false', () => {
      // Construct a manually-broken consent (the API doesn't allow this
      // directly, but defense-in-depth: if the scope is right but
      // consentGiven is somehow false, still false).
      const c: OcrImprovementConsent = {
        profileId: 'profile-1',
        scope: 'individual_receipts',
        consentGiven: false,
        consentVersion: CURRENT_CONSENT_VERSION,
      };
      expect(canUseReceiptForTraining(c)).toBe(false);
    });

    it('CRITICAL: returns false for default consent', () => {
      expect(canUseReceiptForTraining(getDefaultConsent('profile-1'))).toBe(false);
    });
  });

  describe('canUseAggregatedPatterns', () => {
    it('returns true for aggregated_patterns with consentGiven=true', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'aggregated_patterns', '2025-01-15T10:00:00.000Z');
      expect(canUseAggregatedPatterns(granted)).toBe(true);
    });

    it('returns true for individual_receipts with consentGiven=true (hierarchy)', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'individual_receipts', '2025-01-15T10:00:00.000Z');
      expect(canUseAggregatedPatterns(granted)).toBe(true);
    });

    it('returns false for anonymous_stats_only with consentGiven=true', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'anonymous_stats_only', '2025-01-15T10:00:00.000Z');
      expect(canUseAggregatedPatterns(granted)).toBe(false);
    });

    it('returns false when consentGiven=false', () => {
      expect(canUseAggregatedPatterns(getDefaultConsent('profile-1'))).toBe(false);
    });
  });

  describe('canUseAnonymousStats', () => {
    it('returns true for any scope when consentGiven=true', () => {
      for (const scope of OCR_CONSENT_SCOPES) {
        const c = getDefaultConsent('profile-1');
        const granted = grantConsent(c, scope, '2025-01-15T10:00:00.000Z');
        expect(canUseAnonymousStats(granted)).toBe(true);
      }
    });

    it('returns false when consentGiven=false (any scope)', () => {
      const c: OcrImprovementConsent = {
        profileId: 'profile-1',
        scope: 'individual_receipts',
        consentGiven: false,
        consentVersion: CURRENT_CONSENT_VERSION,
      };
      expect(canUseAnonymousStats(c)).toBe(false);
    });

    it('CRITICAL: returns false for default consent', () => {
      expect(canUseAnonymousStats(getDefaultConsent('profile-1'))).toBe(false);
    });
  });

  describe('summarizeConsent', () => {
    it('returns a summary with all consent checks', () => {
      const c = getDefaultConsent('profile-1');
      const granted = grantConsent(c, 'aggregated_patterns', '2025-01-15T10:00:00.000Z');
      const summary = summarizeConsent(granted);
      expect(summary.profileId).toBe('profile-1');
      expect(summary.scope).toBe('aggregated_patterns');
      expect(summary.consentGiven).toBe(true);
      expect(summary.canUseAnonymousStats).toBe(true);
      expect(summary.canUseAggregatedPatterns).toBe(true);
      expect(summary.canUseReceiptForTraining).toBe(false);
    });

    it('returns false for all uses on default consent', () => {
      const summary = summarizeConsent(getDefaultConsent('profile-1'));
      expect(summary.canUseAnonymousStats).toBe(false);
      expect(summary.canUseAggregatedPatterns).toBe(false);
      expect(summary.canUseReceiptForTraining).toBe(false);
    });

    it('returns a frozen object', () => {
      const summary = summarizeConsent(getDefaultConsent('profile-1'));
      expect(Object.isFrozen(summary)).toBe(true);
    });
  });

  describe('CRITICAL: training requires explicit opt-in (exhaustive verification)', () => {
    it('no scope + no consent → cannot train', () => {
      expect(canUseReceiptForTraining(getDefaultConsent('profile-1'))).toBe(false);
    });

    it('anonymous_stats_only + consent → cannot train', () => {
      const c = grantConsent(getDefaultConsent('p1'), 'anonymous_stats_only', '2025-01-15T10:00:00.000Z');
      expect(canUseReceiptForTraining(c)).toBe(false);
    });

    it('aggregated_patterns + consent → cannot train', () => {
      const c = grantConsent(getDefaultConsent('p1'), 'aggregated_patterns', '2025-01-15T10:00:00.000Z');
      expect(canUseReceiptForTraining(c)).toBe(false);
    });

    it('individual_receipts + NO consent → cannot train', () => {
      const c: OcrImprovementConsent = {
        profileId: 'p1',
        scope: 'individual_receipts',
        consentGiven: false,
        consentVersion: CURRENT_CONSENT_VERSION,
      };
      expect(canUseReceiptForTraining(c)).toBe(false);
    });

    it('individual_receipts + consent → CAN train (the ONLY case)', () => {
      const c = grantConsent(getDefaultConsent('p1'), 'individual_receipts', '2025-01-15T10:00:00.000Z');
      expect(canUseReceiptForTraining(c)).toBe(true);
    });

    it('after withdrawal → cannot train (even if previously granted at individual_receipts)', () => {
      const c = getDefaultConsent('p1');
      const granted = grantConsent(c, 'individual_receipts', '2025-01-15T10:00:00.000Z');
      const withdrawn = withdrawConsent(granted, '2025-02-01T08:00:00.000Z');
      expect(canUseReceiptForTraining(withdrawn)).toBe(false);
    });
  });
});
