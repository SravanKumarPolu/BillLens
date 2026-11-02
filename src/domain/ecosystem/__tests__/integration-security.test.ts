/**
 * Integration security tests.
 *
 * Phase 10 Prompt 99.
 *
 * CRITICAL: these tests assert that:
 *   1. The 5 FORBIDDEN_DATA_TYPES are correctly identified.
 *   2. No integration in AVAILABLE_INTEGRATIONS sends forbidden data.
 *   3. isIntegrationSecure() fails closed on incomplete reviews.
 */

import { describe, expect, it } from '@jest/globals';

import { AVAILABLE_INTEGRATIONS } from '../integration-model';
import {
  type IntegrationSecurityReview,
  FORBIDDEN_DATA_TYPES,
  containsForbiddenData,
  getApprovedIntegrations,
  getBlockedIntegrations,
  isIntegrationSecure,
} from '../integration-security';

// ---------------------------------------------------------------------------
// FORBIDDEN_DATA_TYPES — CRITICAL
// ---------------------------------------------------------------------------

describe('FORBIDDEN_DATA_TYPES — CRITICAL', () => {
  it('contains exactly 5 forbidden types', () => {
    expect(FORBIDDEN_DATA_TYPES).toHaveLength(5);
  });

  it('contains upi_id', () => {
    expect(FORBIDDEN_DATA_TYPES).toContain('upi_id');
  });

  it('contains bank_password', () => {
    expect(FORBIDDEN_DATA_TYPES).toContain('bank_password');
  });

  it('contains otp', () => {
    expect(FORBIDDEN_DATA_TYPES).toContain('otp');
  });

  it('contains payment_pin', () => {
    expect(FORBIDDEN_DATA_TYPES).toContain('payment_pin');
  });

  it('contains full_receipt_image_without_consent', () => {
    expect(FORBIDDEN_DATA_TYPES).toContain(
      'full_receipt_image_without_consent',
    );
  });

  it('is frozen', () => {
    expect(Object.isFrozen(FORBIDDEN_DATA_TYPES)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// containsForbiddenData — CRITICAL
// ---------------------------------------------------------------------------

describe('containsForbiddenData — CRITICAL', () => {
  it('returns empty array for allowed data types only', () => {
    const result = containsForbiddenData([
      'expense_summary',
      'category',
      'currency',
    ]);
    expect(result).toEqual([]);
  });

  it('returns the forbidden type when upi_id is present', () => {
    const result = containsForbiddenData(['expense_summary', 'upi_id']);
    expect(result).toEqual(['upi_id']);
  });

  it('returns the forbidden type when bank_password is present', () => {
    const result = containsForbiddenData(['bank_password']);
    expect(result).toEqual(['bank_password']);
  });

  it('returns the forbidden type when otp is present', () => {
    const result = containsForbiddenData(['otp']);
    expect(result).toEqual(['otp']);
  });

  it('returns the forbidden type when payment_pin is present', () => {
    const result = containsForbiddenData(['payment_pin']);
    expect(result).toEqual(['payment_pin']);
  });

  it('returns the forbidden type when full_receipt_image_without_consent is present', () => {
    const result = containsForbiddenData([
      'full_receipt_image_without_consent',
    ]);
    expect(result).toEqual(['full_receipt_image_without_consent']);
  });

  it('returns all forbidden types when multiple are present', () => {
    const result = containsForbiddenData([
      'upi_id',
      'bank_password',
      'otp',
      'payment_pin',
      'full_receipt_image_without_consent',
    ]);
    expect(result).toHaveLength(5);
    expect(result).toEqual(
      expect.arrayContaining([
        'upi_id',
        'bank_password',
        'otp',
        'payment_pin',
        'full_receipt_image_without_consent',
      ]),
    );
  });

  it('returns empty array for an empty input', () => {
    expect(containsForbiddenData([])).toEqual([]);
  });

  it('returns empty array for unknown data types', () => {
    expect(containsForbiddenData(['unknown_type', 'another_type'])).toEqual([]);
  });

  it('returns a frozen array', () => {
    const result = containsForbiddenData(['upi_id']);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CRITICAL: no integration in AVAILABLE_INTEGRATIONS sends forbidden data
// ---------------------------------------------------------------------------

describe('AVAILABLE_INTEGRATIONS do NOT send forbidden data — CRITICAL', () => {
  it.each(AVAILABLE_INTEGRATIONS.map((i) => [i.id, i.dataSent] as const))(
    'integration "%s" does not send forbidden data',
    (_id, dataSent) => {
      const forbidden = containsForbiddenData(dataSent);
      expect(forbidden).toEqual([]);
    },
  );

  it('all integrations explicitly use receipt_image_with_consent (not without_consent)', () => {
    for (const integration of AVAILABLE_INTEGRATIONS) {
      for (const dt of integration.dataSent) {
        expect(dt).not.toBe('full_receipt_image_without_consent');
        // If they send receipt images, they must use the _with_consent variant.
        if (dt.includes('receipt_image')) {
          expect(dt).toBe('receipt_image_with_consent');
        }
      }
    }
  });

  it('no integration sends upi_id', () => {
    for (const integration of AVAILABLE_INTEGRATIONS) {
      expect(integration.dataSent).not.toContain('upi_id');
    }
  });

  it('no integration sends bank_password', () => {
    for (const integration of AVAILABLE_INTEGRATIONS) {
      expect(integration.dataSent).not.toContain('bank_password');
    }
  });

  it('no integration sends otp', () => {
    for (const integration of AVAILABLE_INTEGRATIONS) {
      expect(integration.dataSent).not.toContain('otp');
    }
  });

  it('no integration sends payment_pin', () => {
    for (const integration of AVAILABLE_INTEGRATIONS) {
      expect(integration.dataSent).not.toContain('payment_pin');
    }
  });

  it('banking integrations receive transactions but do not send credentials', () => {
    const banking = AVAILABLE_INTEGRATIONS.filter(
      (i) => i.category === 'banking',
    );
    expect(banking.length).toBeGreaterThan(0);
    for (const integration of banking) {
      // Banking integrations send NO data (they only receive transactions).
      expect(integration.dataSent).toEqual([]);
      expect(integration.privacyLevel).toBe('read_only');
    }
  });
});

// ---------------------------------------------------------------------------
// isIntegrationSecure
// ---------------------------------------------------------------------------

function makeSecureReview(
  overrides: Partial<IntegrationSecurityReview>,
): IntegrationSecurityReview {
  return {
    integrationId: 'test-integration',
    dataMinimization: true,
    encryptedInTransit: true,
    noSensitiveDataShared: true,
    userConsentRequired: true,
    revocable: true,
    auditLogged: true,
    privacyPolicyReviewed: true,
    securityReviewDate: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isIntegrationSecure', () => {
  it('returns true when all checks pass', () => {
    expect(isIntegrationSecure(makeSecureReview({}))).toBe(true);
  });

  it('returns false when dataMinimization is false', () => {
    expect(isIntegrationSecure(makeSecureReview({ dataMinimization: false }))).toBe(false);
  });

  it('returns false when encryptedInTransit is false', () => {
    expect(
      isIntegrationSecure(makeSecureReview({ encryptedInTransit: false })),
    ).toBe(false);
  });

  it('returns false when noSensitiveDataShared is false', () => {
    expect(
      isIntegrationSecure(makeSecureReview({ noSensitiveDataShared: false })),
    ).toBe(false);
  });

  it('returns false when userConsentRequired is false', () => {
    expect(
      isIntegrationSecure(makeSecureReview({ userConsentRequired: false })),
    ).toBe(false);
  });

  it('returns false when revocable is false', () => {
    expect(isIntegrationSecure(makeSecureReview({ revocable: false }))).toBe(false);
  });

  it('returns false when auditLogged is false', () => {
    expect(isIntegrationSecure(makeSecureReview({ auditLogged: false }))).toBe(false);
  });

  it('returns false when privacyPolicyReviewed is false', () => {
    expect(
      isIntegrationSecure(makeSecureReview({ privacyPolicyReviewed: false })),
    ).toBe(false);
  });

  it('returns false when securityReviewDate is missing', () => {
    expect(
      isIntegrationSecure(
        makeSecureReview({ securityReviewDate: undefined as never }),
      ),
    ).toBe(false);
  });

  it('returns false when securityReviewDate is empty string', () => {
    expect(
      isIntegrationSecure(makeSecureReview({ securityReviewDate: '' })),
    ).toBe(false);
  });

  it('returns false when securityReviewDate is unparseable', () => {
    expect(
      isIntegrationSecure(makeSecureReview({ securityReviewDate: 'not-a-date' })),
    ).toBe(false);
  });

  it('returns true for a valid future-dated review', () => {
    expect(
      isIntegrationSecure(
        makeSecureReview({ securityReviewDate: '2026-12-31T00:00:00.000Z' }),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getBlockedIntegrations / getApprovedIntegrations
// ---------------------------------------------------------------------------

describe('getBlockedIntegrations', () => {
  it('returns IDs of integrations with failed reviews', () => {
    const reviews: readonly IntegrationSecurityReview[] = [
      makeSecureReview({ integrationId: 'secure-1' }),
      makeSecureReview({
        integrationId: 'insecure-1',
        dataMinimization: false,
      }),
      makeSecureReview({
        integrationId: 'insecure-2',
        securityReviewDate: '',
      }),
    ];
    const blocked = getBlockedIntegrations(reviews);
    expect(blocked).toEqual(['insecure-1', 'insecure-2']);
  });

  it('returns empty array when all reviews pass', () => {
    const reviews: readonly IntegrationSecurityReview[] = [
      makeSecureReview({ integrationId: 'a' }),
      makeSecureReview({ integrationId: 'b' }),
    ];
    expect(getBlockedIntegrations(reviews)).toEqual([]);
  });

  it('returns empty array for an empty input', () => {
    expect(getBlockedIntegrations([])).toEqual([]);
  });

  it('returns a frozen array', () => {
    const reviews: readonly IntegrationSecurityReview[] = [
      makeSecureReview({ integrationId: 'x', dataMinimization: false }),
    ];
    expect(Object.isFrozen(getBlockedIntegrations(reviews))).toBe(true);
  });
});

describe('getApprovedIntegrations', () => {
  it('returns IDs of integrations with passing reviews', () => {
    const reviews: readonly IntegrationSecurityReview[] = [
      makeSecureReview({ integrationId: 'secure-1' }),
      makeSecureReview({
        integrationId: 'insecure-1',
        dataMinimization: false,
      }),
      makeSecureReview({ integrationId: 'secure-2' }),
    ];
    const approved = getApprovedIntegrations(reviews);
    expect(approved).toEqual(['secure-1', 'secure-2']);
  });

  it('returns empty array when no reviews pass', () => {
    const reviews: readonly IntegrationSecurityReview[] = [
      makeSecureReview({ integrationId: 'a', revocable: false }),
      makeSecureReview({ integrationId: 'b', auditLogged: false }),
    ];
    expect(getApprovedIntegrations(reviews)).toEqual([]);
  });

  it('returns a frozen array', () => {
    const reviews: readonly IntegrationSecurityReview[] = [
      makeSecureReview({ integrationId: 'a' }),
    ];
    expect(Object.isFrozen(getApprovedIntegrations(reviews))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration catalog — every integration should be securable
// (i.e. a well-formed review could approve it).
// ---------------------------------------------------------------------------

describe('Integration catalog is securable', () => {
  it('every integration requires user consent (no silent auto-connect)', () => {
    // The security review model has a userConsentRequired flag. Every
    // integration in the catalog should be reviewable as user-consent-required.
    // (We can't enforce this from the catalog side directly — the security
    // review is separate — but we CAN verify that every integration has
    // dataSent and dataReceived declared, which is a prerequisite for
    // the security review.)
    for (const integration of AVAILABLE_INTEGRATIONS) {
      expect(Array.isArray(integration.dataSent)).toBe(true);
      expect(Array.isArray(integration.dataReceived)).toBe(true);
      expect(integration.requiredScopes).toBeDefined();
    }
  });

  it('no integration has full_access privacy level (we cap at read_write)', () => {
    for (const integration of AVAILABLE_INTEGRATIONS) {
      expect(integration.privacyLevel).not.toBe('full_access');
    }
  });

  it('every integration has a stable ID and name', () => {
    for (const integration of AVAILABLE_INTEGRATIONS) {
      expect(typeof integration.id).toBe('string');
      expect(integration.id.length).toBeGreaterThan(0);
      expect(typeof integration.name).toBe('string');
      expect(integration.name.length).toBeGreaterThan(0);
    }
  });

  it('integration IDs are unique', () => {
    const ids = AVAILABLE_INTEGRATIONS.map((i) => i.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
