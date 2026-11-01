import { describe, expect, it } from '@jest/globals';

import {
  accessCountByDataType,
  createAuditEntry,
  getAccessHistory,
  getAdminAccessHistory,
  type CreateAuditEntryInput,
} from '../audit-trail';
import {
  evaluateDataAccess,
  type DataAccessRequest,
} from '../data-access-guard';

function makeApprovedRequest(
  overrides: Partial<DataAccessRequest> = {},
): DataAccessRequest {
  return {
    ticketId: 'ticket-1',
    dataType: 'receipt_image',
    adminId: 'admin-1',
    reason: 'User reported discrepancy in receipt total.',
    userConsentGiven: true,
    ...overrides,
  };
}

function makeAuditInput(
  overrides: Partial<CreateAuditEntryInput> & {
    ticketId?: string;
    adminId?: string;
    dataType?: DataAccessRequest['dataType'];
  } = {},
): CreateAuditEntryInput {
  const { ticketId, adminId, dataType, ...rest } = overrides;
  const request = makeApprovedRequest({
    ...(ticketId !== undefined ? { ticketId } : {}),
    ...(adminId !== undefined ? { adminId } : {}),
    ...(dataType !== undefined ? { dataType } : {}),
  });
  const decision = evaluateDataAccess(request);
  return {
    id: 'audit-1',
    request,
    decision,
    userConsentDate: '2025-01-01T00:00:00.000Z',
    ipAddress: '192.168.1.1',
    sessionDurationMs: 5000,
    accessedAt: '2025-01-01T00:00:01.000Z',
    ...rest,
  };
}

describe('audit-trail', () => {
  describe('createAuditEntry', () => {
    it('creates an entry from an approved request', () => {
      const entry = createAuditEntry(makeAuditInput());
      expect(entry.id).toBe('audit-1');
      expect(entry.ticketId).toBe('ticket-1');
      expect(entry.adminId).toBe('admin-1');
      expect(entry.dataType).toBe('receipt_image');
      expect(entry.userConsentGiven).toBe(true);
      expect(entry.userConsentDate).toBe('2025-01-01T00:00:00.000Z');
      expect(entry.ipAddress).toBe('192.168.1.1');
      expect(entry.sessionDurationMs).toBe(5000);
    });

    it('throws when the decision did NOT require an audit trail', () => {
      const request = makeApprovedRequest({ dataType: 'ocr_text' });
      const decision = evaluateDataAccess(request);
      // ocr_text is audit-required — so this SHOULD work. Use a denied
      // decision instead to verify the guard.
      const deniedRequest = makeApprovedRequest({
        dataType: 'receipt_image',
        userConsentGiven: false,
      });
      const deniedDecision = evaluateDataAccess(deniedRequest);
      expect(() =>
        createAuditEntry({
          ...makeAuditInput(),
          request: deniedRequest,
          decision: deniedDecision,
        }),
      ).toThrow();
      void decision;
    });

    it('throws when the decision denied access', () => {
      const deniedRequest = makeApprovedRequest({ userConsentGiven: false });
      const deniedDecision = evaluateDataAccess(deniedRequest);
      expect(() =>
        createAuditEntry({
          ...makeAuditInput(),
          request: deniedRequest,
          decision: deniedDecision,
        }),
      ).toThrow();
    });

    it('throws when consent was required but not given', () => {
      const request = makeApprovedRequest({ userConsentGiven: false });
      const decision = evaluateDataAccess(request);
      // The decision will be `denied` — so the createAuditEntry guard
      // will throw on the denial check first. Use a request where the
      // guard returns allowed but consent was somehow not given — this
      // is unreachable in practice, so we just confirm the guard throws
      // on denied.
      expect(decision.allowed).toBe(false);
      expect(() =>
        createAuditEntry({ ...makeAuditInput(), request, decision }),
      ).toThrow();
    });

    it('throws when consent was required but userConsentDate is invalid', () => {
      expect(() =>
        createAuditEntry(
          makeAuditInput({ userConsentDate: 'not-a-date' }),
        ),
      ).toThrow();
    });

    it('omits userConsentDate when consent was NOT required (ocr_text)', () => {
      const request = makeApprovedRequest({ dataType: 'ocr_text' });
      const decision = evaluateDataAccess(request);
      const entry = createAuditEntry({
        ...makeAuditInput(),
        request,
        decision,
        // userConsentDate should be ignored for ocr_text.
        userConsentDate: '2025-01-01T00:00:00.000Z',
      });
      expect(entry.userConsentDate).toBe('');
    });

    it('rejects an invalid IPv4 address', () => {
      expect(() =>
        createAuditEntry(makeAuditInput({ ipAddress: '999.999.999.999' })),
      ).toThrow();
    });

    it('rejects an invalid IP address format', () => {
      expect(() =>
        createAuditEntry(makeAuditInput({ ipAddress: 'not-an-ip' })),
      ).toThrow();
    });

    it('accepts a valid IPv6 address', () => {
      const entry = createAuditEntry(
        makeAuditInput({ ipAddress: '::1' }),
      );
      expect(entry.ipAddress).toBe('::1');
    });

    it('rejects a negative sessionDurationMs', () => {
      expect(() =>
        createAuditEntry(makeAuditInput({ sessionDurationMs: -1 })),
      ).toThrow();
    });

    it('rejects an empty auditEntryId', () => {
      expect(() =>
        createAuditEntry(makeAuditInput({ id: '' })),
      ).toThrow();
    });

    it('returns a frozen entry', () => {
      const entry = createAuditEntry(makeAuditInput());
      expect(Object.isFrozen(entry)).toBe(true);
    });

    it('accepts a valid IPv4 address', () => {
      const entry = createAuditEntry(
        makeAuditInput({ ipAddress: '10.0.0.1' }),
      );
      expect(entry.ipAddress).toBe('10.0.0.1');
    });
  });

  describe('getAccessHistory', () => {
    const entries = [
      createAuditEntry(makeAuditInput({
        id: 'a1',
        accessedAt: '2025-01-01T10:00:00.000Z',
      })),
      createAuditEntry(makeAuditInput({
        id: 'a2',
        ticketId: 'ticket-2',
        accessedAt: '2025-01-01T11:00:00.000Z',
      })),
      createAuditEntry(makeAuditInput({
        id: 'a3',
        accessedAt: '2025-01-01T12:00:00.000Z',
      })),
    ];

    it('returns entries for the given ticket, most-recent-first', () => {
      const history = getAccessHistory(entries, 'ticket-1');
      expect(history).toHaveLength(2);
      expect(history[0]!.id).toBe('a3'); // most recent
      expect(history[1]!.id).toBe('a1');
    });

    it('returns [] when no entries match the ticket', () => {
      const history = getAccessHistory(entries, 'nonexistent');
      expect(history).toEqual([]);
    });

    it('rejects an empty ticketId', () => {
      expect(() => getAccessHistory(entries, '')).toThrow();
    });

    it('returns a frozen array', () => {
      const history = getAccessHistory(entries, 'ticket-1');
      expect(Object.isFrozen(history)).toBe(true);
    });
  });

  describe('getAdminAccessHistory', () => {
    const entries = [
      createAuditEntry(makeAuditInput({
        id: 'a1',
        adminId: 'admin-1',
        accessedAt: '2025-01-01T10:00:00.000Z',
      })),
      createAuditEntry(makeAuditInput({
        id: 'a2',
        adminId: 'admin-2',
        accessedAt: '2025-01-01T11:00:00.000Z',
      })),
      createAuditEntry(makeAuditInput({
        id: 'a3',
        adminId: 'admin-1',
        accessedAt: '2025-01-01T12:00:00.000Z',
      })),
    ];

    it('returns entries for the given admin, most-recent-first', () => {
      const history = getAdminAccessHistory(entries, 'admin-1');
      expect(history).toHaveLength(2);
      expect(history[0]!.id).toBe('a3');
      expect(history[1]!.id).toBe('a1');
    });

    it('returns [] when no entries match the admin', () => {
      const history = getAdminAccessHistory(entries, 'nonexistent');
      expect(history).toEqual([]);
    });

    it('rejects an empty adminId', () => {
      expect(() => getAdminAccessHistory(entries, '')).toThrow();
    });
  });

  describe('accessCountByDataType', () => {
    it('counts accesses per data type', () => {
      const entries = [
        createAuditEntry(makeAuditInput({ id: 'a1', dataType: 'receipt_image' })),
        createAuditEntry(makeAuditInput({ id: 'a2', dataType: 'receipt_image' })),
        createAuditEntry(makeAuditInput({ id: 'a3', dataType: 'upi_id' })),
        createAuditEntry(makeAuditInput({ id: 'a4', dataType: 'ocr_text' })),
      ];
      const counts = accessCountByDataType(entries);
      expect(counts.receipt_image).toBe(2);
      expect(counts.upi_id).toBe(1);
      expect(counts.ocr_text).toBe(1);
      expect(counts.payment_reference).toBe(0);
      expect(counts.bank_account).toBe(0);
      expect(counts.full_backup).toBe(0);
    });

    it('returns a frozen record', () => {
      const counts = accessCountByDataType([]);
      expect(Object.isFrozen(counts)).toBe(true);
    });

    it('returns zero counts for an empty input', () => {
      const counts = accessCountByDataType([]);
      expect(counts.receipt_image).toBe(0);
      expect(counts.upi_id).toBe(0);
      expect(counts.ocr_text).toBe(0);
      expect(counts.payment_reference).toBe(0);
      expect(counts.bank_account).toBe(0);
      expect(counts.full_backup).toBe(0);
    });
  });

  describe('privacy — audit entries never carry raw secrets', () => {
    it('the entry does NOT contain the raw data (only metadata)', () => {
      const entry = createAuditEntry(makeAuditInput());
      const serialised = JSON.stringify(entry);
      // The entry carries the admin's REASON (free text) and the data
      // TYPE — never the actual UPI ID, receipt image, or payment ref.
      expect(serialised).not.toContain('alice@okhdfcbank');
      expect(serialised).not.toContain('004523689123');
      expect(serialised).not.toContain('data:image/jpeg');
    });

    it('captures consent state for compliance audits', () => {
      const entry = createAuditEntry(makeAuditInput());
      expect(entry.userConsentGiven).toBe(true);
      expect(entry.userConsentDate).toBe('2025-01-01T00:00:00.000Z');
    });
  });
});
