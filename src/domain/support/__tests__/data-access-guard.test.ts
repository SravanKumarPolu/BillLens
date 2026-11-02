import { describe, expect, it } from '@jest/globals';

import {
  ALWAYS_SENSITIVE_TYPES,
  AUDIT_REQUIRED_TYPES,
  SENSITIVE_DATA_TYPES,
  evaluateDataAccess,
  evaluateDataAccessBatch,
  isAlwaysSensitiveType,
  isSensitiveDataType,
  requiresAuditTrail,
  validateDataAccessRequest,
  type DataAccessRequest,
} from '../data-access-guard';

function makeRequest(overrides: Partial<DataAccessRequest> = {}): DataAccessRequest {
  return {
    ticketId: 'ticket-1',
    dataType: 'receipt_image',
    adminId: 'admin-1',
    reason: 'User reported discrepancy in receipt total.',
    userConsentGiven: true,
    ...overrides,
  };
}

describe('data-access-guard', () => {
  describe('SENSITIVE_DATA_TYPES', () => {
    it('exposes 6 data types', () => {
      expect(SENSITIVE_DATA_TYPES).toEqual([
        'receipt_image',
        'upi_id',
        'payment_reference',
        'bank_account',
        'ocr_text',
        'full_backup',
      ]);
    });

    it('isSensitiveDataType accepts known types', () => {
      for (const t of SENSITIVE_DATA_TYPES) {
        expect(isSensitiveDataType(t)).toBe(true);
      }
    });

    it('isSensitiveDataType rejects unknown values', () => {
      expect(isSensitiveDataType('random')).toBe(false);
      expect(isSensitiveDataType(42)).toBe(false);
      expect(isSensitiveDataType(null)).toBe(false);
    });
  });

  describe('ALWAYS_SENSITIVE_TYPES — CRITICAL list', () => {
    it('exposes 5 always-sensitive types', () => {
      expect(ALWAYS_SENSITIVE_TYPES).toEqual([
        'receipt_image',
        'upi_id',
        'payment_reference',
        'bank_account',
        'full_backup',
      ]);
    });

    it('isAlwaysSensitiveType returns true for the 5 always-sensitive types', () => {
      expect(isAlwaysSensitiveType('receipt_image')).toBe(true);
      expect(isAlwaysSensitiveType('upi_id')).toBe(true);
      expect(isAlwaysSensitiveType('payment_reference')).toBe(true);
      expect(isAlwaysSensitiveType('bank_account')).toBe(true);
      expect(isAlwaysSensitiveType('full_backup')).toBe(true);
    });

    it('isAlwaysSensitiveType returns false for ocr_text', () => {
      expect(isAlwaysSensitiveType('ocr_text')).toBe(false);
    });

    it('CRITICAL — raw receipt_image access is DENIED without consent', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'receipt_image', userConsentGiven: false }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.requiresUserConsent).toBe(true);
    });

    it('CRITICAL — UPI ID access is DENIED without consent', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'upi_id', userConsentGiven: false }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.requiresUserConsent).toBe(true);
    });

    it('CRITICAL — payment_reference access is DENIED without consent', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'payment_reference', userConsentGiven: false }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('CRITICAL — bank_account access is DENIED without consent', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'bank_account', userConsentGiven: false }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('CRITICAL — full_backup access is DENIED without consent', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'full_backup', userConsentGiven: false }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('ALLOWS receipt_image access WITH consent AND requires audit trail', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'receipt_image', userConsentGiven: true }),
      );
      expect(decision.allowed).toBe(true);
      expect(decision.requiresAuditTrail).toBe(true);
      expect(decision.requiresUserConsent).toBe(true);
    });

    it('ALLOWS upi_id access WITH consent AND requires audit trail', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'upi_id', userConsentGiven: true }),
      );
      expect(decision.allowed).toBe(true);
      expect(decision.requiresAuditTrail).toBe(true);
    });

    it('denied decisions do NOT require an audit trail (no access happened)', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'receipt_image', userConsentGiven: false }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.requiresAuditTrail).toBe(false);
    });
  });

  describe('AUDIT_REQUIRED_TYPES', () => {
    it('exposes ocr_text as audit-required', () => {
      expect(AUDIT_REQUIRED_TYPES).toEqual(['ocr_text']);
    });

    it('ocr_text access is ALLOWED WITHOUT user consent BUT audit trail is required', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'ocr_text', userConsentGiven: false }),
      );
      expect(decision.allowed).toBe(true);
      expect(decision.requiresAuditTrail).toBe(true);
      expect(decision.requiresUserConsent).toBe(false);
    });

    it('ocr_text access is ALLOWED WITH user consent AND audit trail is required', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'ocr_text', userConsentGiven: true }),
      );
      expect(decision.allowed).toBe(true);
      expect(decision.requiresAuditTrail).toBe(true);
    });
  });

  describe('requiresAuditTrail', () => {
    it('returns true for ALL always-sensitive types', () => {
      for (const t of ALWAYS_SENSITIVE_TYPES) {
        expect(requiresAuditTrail(t)).toBe(true);
      }
    });

    it('returns true for ocr_text', () => {
      expect(requiresAuditTrail('ocr_text')).toBe(true);
    });

    it('returns true for every sensitive data type', () => {
      for (const t of SENSITIVE_DATA_TYPES) {
        expect(requiresAuditTrail(t)).toBe(true);
      }
    });
  });

  describe('validateDataAccessRequest', () => {
    it('accepts a well-formed request', () => {
      expect(() => validateDataAccessRequest(makeRequest())).not.toThrow();
    });

    it('rejects an empty ticketId', () => {
      expect(() => validateDataAccessRequest(makeRequest({ ticketId: '' }))).toThrow();
    });

    it('rejects an unknown dataType', () => {
      expect(() =>
        validateDataAccessRequest(makeRequest({ dataType: 'random' as never })),
      ).toThrow();
    });

    it('rejects an empty adminId', () => {
      expect(() => validateDataAccessRequest(makeRequest({ adminId: '' }))).toThrow();
    });

    it('rejects an empty reason', () => {
      expect(() => validateDataAccessRequest(makeRequest({ reason: '' }))).toThrow();
    });

    it('rejects a non-boolean userConsentGiven', () => {
      expect(() =>
        validateDataAccessRequest(
          makeRequest({ userConsentGiven: 'yes' as unknown as boolean }),
        ),
      ).toThrow();
    });
  });

  describe('evaluateDataAccess — decision shape', () => {
    it('returns a frozen decision', () => {
      const decision = evaluateDataAccess(makeRequest());
      expect(Object.isFrozen(decision)).toBe(true);
    });

    it('decision reason is non-empty', () => {
      const decision = evaluateDataAccess(makeRequest());
      expect(decision.reason.length).toBeGreaterThan(0);
    });

    it('denied decision mentions consent when consent was required', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'upi_id', userConsentGiven: false }),
      );
      expect(decision.reason.toLowerCase()).toContain('consent');
    });

    it('allowed decision mentions audit trail when audit is required', () => {
      const decision = evaluateDataAccess(
        makeRequest({ dataType: 'receipt_image', userConsentGiven: true }),
      );
      expect(decision.reason.toLowerCase()).toContain('audit');
    });
  });

  describe('evaluateDataAccessBatch', () => {
    it('returns decisions for each request', () => {
      const requests = [
        makeRequest({ dataType: 'receipt_image', userConsentGiven: true }),
        makeRequest({ dataType: 'upi_id', userConsentGiven: false }),
        makeRequest({ dataType: 'ocr_text' }),
      ];
      const result = evaluateDataAccessBatch(requests);
      expect(result.decisions).toHaveLength(3);
      expect(result.allowedCount).toBe(2);
      expect(result.deniedCount).toBe(1);
      expect(result.auditRequiredCount).toBe(2); // receipt_image + ocr_text
    });

    it('returns a frozen result', () => {
      const result = evaluateDataAccessBatch([makeRequest()]);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.decisions)).toBe(true);
    });

    it('handles an empty input', () => {
      const result = evaluateDataAccessBatch([]);
      expect(result.allowedCount).toBe(0);
      expect(result.deniedCount).toBe(0);
      expect(result.auditRequiredCount).toBe(0);
    });
  });

  describe('CRITICAL — regression guard for the spec', () => {
    it('the ALWAYS_SENSITIVE_TYPES list has exactly 5 entries', () => {
      expect(ALWAYS_SENSITIVE_TYPES.length).toBe(5);
    });

    it('every ALWAYS_SENSITIVE_TYPE is denied without consent', () => {
      for (const dataType of ALWAYS_SENSITIVE_TYPES) {
        const decision = evaluateDataAccess(
          makeRequest({ dataType, userConsentGiven: false }),
        );
        expect(decision.allowed).toBe(false);
      }
    });

    it('every ALWAYS_SENSITIVE_TYPE is allowed WITH consent AND audit trail', () => {
      for (const dataType of ALWAYS_SENSITIVE_TYPES) {
        const decision = evaluateDataAccess(
          makeRequest({ dataType, userConsentGiven: true }),
        );
        expect(decision.allowed).toBe(true);
        expect(decision.requiresAuditTrail).toBe(true);
      }
    });
  });
});
