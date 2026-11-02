import { describe, expect, it } from '@jest/globals';

import {
  asMemberId,
  asPaymentHandleId,
  createMemberPaymentHandle,
  isPaymentHandleActive,
  markPaymentHandleDefault,
  softDeletePaymentHandle,
  verifyPaymentHandle,
} from '../../entities/index';
import {
  DeletedEntityError,
  InvalidEntityError,
  VersionConflictError,
} from '../../errors/index';
import { asDateTime } from '../../value-objects';

const NOW = asDateTime('2026-10-10T10:00:00.000Z');
const LATER = asDateTime('2026-10-11T10:00:00.000Z');
const MEMBER = asMemberId('m-1');

function createBasicHandle() {
  return createMemberPaymentHandle({
    id: asPaymentHandleId('ph-1'),
    memberId: MEMBER,
    type: 'upi_vpa',
    maskedDisplayValue: 'jo***@oksbi',
    encryptedValue: 'ciphertext-abc',
    encryptionKeyId: 'key-1',
    now: NOW,
  });
}

describe('MemberPaymentHandle entity', () => {
  // ── Factory ────────────────────────────────────────────────

  describe('createMemberPaymentHandle', () => {
    it('creates a handle with sensible defaults', () => {
      const h = createBasicHandle();
      expect(h.id).toBe(asPaymentHandleId('ph-1'));
      expect(h.memberId).toBe(MEMBER);
      expect(h.type).toBe('upi_vpa');
      expect(h.maskedDisplayValue).toBe('jo***@oksbi');
      expect(h.encryptedValue).toBe('ciphertext-abc');
      expect(h.encryptionKeyId).toBe('key-1');
      expect(h.verificationStatus).toBe('unverified');
      expect(h.isDefault).toBe(false);
      expect(h.version).toBe(1 as never);
      expect(h.createdAt).toBe(NOW);
    });

    it('accepts a label', () => {
      const h = createMemberPaymentHandle({
        id: asPaymentHandleId('ph-1'),
        memberId: MEMBER,
        type: 'upi_vpa',
        maskedDisplayValue: 'jo***@oksbi',
        label: 'Personal UPI',
        now: NOW,
      });
      expect(h.label).toBe('Personal UPI');
    });

    it('accepts a non-default verification status', () => {
      const h = createMemberPaymentHandle({
        id: asPaymentHandleId('ph-1'),
        memberId: MEMBER,
        type: 'upi_vpa',
        maskedDisplayValue: 'jo***@oksbi',
        verificationStatus: 'user_confirmed',
        isDefault: true,
        now: NOW,
      });
      expect(h.verificationStatus).toBe('user_confirmed');
      expect(h.isDefault).toBe(true);
    });

    it('rejects an empty maskedDisplayValue', () => {
      expect(() =>
        createMemberPaymentHandle({
          id: asPaymentHandleId('ph-1'),
          memberId: MEMBER,
          type: 'upi_vpa',
          maskedDisplayValue: '',
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a maskedDisplayValue shorter than 3 chars', () => {
      expect(() =>
        createMemberPaymentHandle({
          id: asPaymentHandleId('ph-1'),
          memberId: MEMBER,
          type: 'upi_vpa',
          maskedDisplayValue: 'ab',
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a maskedDisplayValue longer than 64 chars', () => {
      expect(() =>
        createMemberPaymentHandle({
          id: asPaymentHandleId('ph-1'),
          memberId: MEMBER,
          type: 'upi_vpa',
          maskedDisplayValue: 'x'.repeat(65),
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects an empty encryptedValue (must be undefined or non-empty)', () => {
      expect(() =>
        createMemberPaymentHandle({
          id: asPaymentHandleId('ph-1'),
          memberId: MEMBER,
          type: 'upi_vpa',
          maskedDisplayValue: 'jo***@oksbi',
          encryptedValue: '',
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects an invalid verification status', () => {
      expect(() =>
        createMemberPaymentHandle({
          id: asPaymentHandleId('ph-1'),
          memberId: MEMBER,
          type: 'upi_vpa',
          maskedDisplayValue: 'jo***@oksbi',
          verificationStatus: 'spiderman' as never,
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects an invalid type', () => {
      expect(() =>
        createMemberPaymentHandle({
          id: asPaymentHandleId('ph-1'),
          memberId: MEMBER,
          type: 'crypto' as never,
          maskedDisplayValue: 'jo***@oksbi',
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });
  });

  // ── markPaymentHandleDefault ──────────────────────────────

  describe('markPaymentHandleDefault', () => {
    it('sets isDefault=true and bumps version', () => {
      const h = createBasicHandle();
      const updated = markPaymentHandleDefault(h, {
        expectedVersion: 1 as never,
        now: LATER,
      });
      expect(updated.isDefault).toBe(true);
      expect(updated.version).toBe(2 as never);
      expect(updated.updatedAt).toBe(LATER);
    });

    it('throws on stale version', () => {
      const h = createBasicHandle();
      expect(() =>
        markPaymentHandleDefault(h, {
          expectedVersion: 99 as never,
          now: LATER,
        }),
      ).toThrow(VersionConflictError);
    });

    it('throws on a deleted handle', () => {
      const h = softDeletePaymentHandle(createBasicHandle(), {
        expectedVersion: 1 as never,
        now: LATER,
      });
      expect(() =>
        markPaymentHandleDefault(h, {
          expectedVersion: 2 as never,
          now: LATER,
        }),
      ).toThrow(DeletedEntityError);
    });
  });

  // ── verifyPaymentHandle ──────────────────────────────────

  describe('verifyPaymentHandle', () => {
    it('updates the verification status', () => {
      const h = createBasicHandle();
      const updated = verifyPaymentHandle(h, {
        expectedVersion: 1 as never,
        newStatus: 'user_confirmed',
        now: LATER,
      });
      expect(updated.verificationStatus).toBe('user_confirmed');
      expect(updated.version).toBe(2 as never);
    });

    it('throws on an invalid newStatus', () => {
      const h = createBasicHandle();
      expect(() =>
        verifyPaymentHandle(h, {
          expectedVersion: 1 as never,
          newStatus: 'spiderman' as never,
          now: LATER,
        }),
      ).toThrow(InvalidEntityError);
    });
  });

  // ── softDeletePaymentHandle ────────────────────────────────

  describe('softDeletePaymentHandle', () => {
    it('sets deletedAt and bumps version', () => {
      const h = createBasicHandle();
      const deleted = softDeletePaymentHandle(h, {
        expectedVersion: 1 as never,
        now: LATER,
      });
      expect(deleted.deletedAt).toBe(LATER);
      expect(deleted.version).toBe(2 as never);
    });

    it('cannot be soft-deleted twice', () => {
      const h = createBasicHandle();
      const deleted = softDeletePaymentHandle(h, {
        expectedVersion: 1 as never,
        now: LATER,
      });
      expect(() =>
        softDeletePaymentHandle(deleted, {
          expectedVersion: 2 as never,
          now: LATER,
        }),
      ).toThrow(DeletedEntityError);
    });
  });

  // ── isPaymentHandleActive ───────────────────────────────────

  describe('isPaymentHandleActive', () => {
    it('returns true for a fresh handle', () => {
      expect(isPaymentHandleActive(createBasicHandle())).toBe(true);
    });

    it('returns false for a soft-deleted handle', () => {
      const h = softDeletePaymentHandle(createBasicHandle(), {
        expectedVersion: 1 as never,
        now: LATER,
      });
      expect(isPaymentHandleActive(h)).toBe(false);
    });
  });
});
