import { describe, expect, it } from '@jest/globals';

import {
  asGroupId,
  asMemberId,
  asSettlementId,
  asUserId,
  cancelSettlement,
  confirmSettlement,
  createSettlement,
  createSettlementReversal,
  disputeSettlement,
  isSettlementCompleted,
  rejectSettlement,
  requestSettlement,
  recordSettlement,
  resolveDispute,
  reverseSettlement,
  retrySettlementAsDraft,
  softDeleteSettlement,
} from '../../entities/index';
import {
  DeletedEntityError,
  InvalidEntityError,
  InvalidStateTransitionError,
  VersionConflictError,
} from '../../errors/index';
import { asDateTime } from '../../value-objects/index';

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const LATER = asDateTime('2026-07-30T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');
const FROM_MEMBER = asMemberId('m-1');
const TO_MEMBER = asMemberId('m-2');

/**
 * Helper: create a draft settlement (status = 'draft') for testing
 * the transition functions.
 */
function createDraft() {
  return createSettlement({
    id: asSettlementId('s-1'),
    groupId: GROUP_ID,
    fromMemberId: FROM_MEMBER,
    toMemberId: TO_MEMBER,
    amountMinor: 500,
    currencyCode: 'INR',
    method: 'upi',
    createdBy: USER_ID,
    now: NOW,
    status: 'draft',
  });
}

describe('Settlement entity — Phase 6 state transitions', () => {
  // ── Backwards compatibility ────────────────────────────────────────

  describe('backwards compatibility with pre-Phase-6 callers', () => {
    it('createSettlement defaults status to "completed" when not specified', () => {
      const s = createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
      });
      // Pre-Phase-6 callers expect this to be 'completed' so the
      // balance engine counts it immediately.
      expect(s.status).toBe('completed');
    });

    it('isSettlementCompleted returns true for default-status settlement', () => {
      const s = createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
      });
      expect(isSettlementCompleted(s)).toBe(true);
    });

    it('supports the new card method', () => {
      const s = createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'USD',
        method: 'card',
        createdBy: USER_ID,
        now: NOW,
      });
      expect(s.method).toBe('card');
    });

    it('supports the new wallet method', () => {
      const s = createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'wallet',
        createdBy: USER_ID,
        now: NOW,
      });
      expect(s.method).toBe('wallet');
    });
  });

  // ── Valid transitions ────────────────────────────────────────────────

  describe('requestSettlement — draft → requested', () => {
    it('transitions draft to requested', () => {
      const s = createDraft();
      const requested = requestSettlement(s, { expectedVersion: 1 as never, now: LATER });
      expect(requested.status).toBe('requested');
      expect(requested.version).toBe(2);
      expect(requested.updatedAt).toBe(LATER);
    });

    it('rejects version conflict', () => {
      const s = createDraft();
      expect(() =>
        requestSettlement(s, { expectedVersion: 99 as never, now: LATER }),
      ).toThrow(VersionConflictError);
    });

    it('rejects invalid source state', () => {
      const completed = createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        status: 'completed',
      });
      expect(() =>
        requestSettlement(completed, { expectedVersion: 1 as never, now: LATER }),
      ).toThrow(InvalidStateTransitionError);
    });
  });

  describe('recordSettlement — draft|requested → pending_confirmation', () => {
    it('transitions draft to pending_confirmation', () => {
      const s = createDraft();
      const pending = recordSettlement(s, {
        expectedVersion: 1 as never,
        now: LATER,
        paymentReferenceHash: 'a'.repeat(64),
      });
      expect(pending.status).toBe('pending_confirmation');
      expect(pending.paymentReferenceHash).toBe('a'.repeat(64));
    });

    it('transitions requested to pending_confirmation', () => {
      const s = requestSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const pending = recordSettlement(s, { expectedVersion: 2 as never, now: LATER });
      expect(pending.status).toBe('pending_confirmation');
    });

    it('attaches evidence hash', () => {
      const s = createDraft();
      const pending = recordSettlement(s, {
        expectedVersion: 1 as never,
        now: LATER,
        evidenceHash: 'b'.repeat(64),
      });
      expect(pending.evidenceHash).toBe('b'.repeat(64));
    });
  });

  describe('confirmSettlement — pending_confirmation → completed', () => {
    it('transitions pending_confirmation to completed and records the confirmer', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const completed = confirmSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        confirmedByMemberId: TO_MEMBER,
      });
      expect(completed.status).toBe('completed');
      expect(completed.confirmedByMemberId).toBe(TO_MEMBER);
      expect(completed.confirmedAt).toBe(LATER);
    });

    it('is completed (contributes to balance)', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const completed = confirmSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        confirmedByMemberId: TO_MEMBER,
      });
      expect(isSettlementCompleted(completed)).toBe(true);
    });

    it('rejects confirmation from cancelled (invalid transition)', () => {
      // cancelled is terminal — no transitions out (except soft-delete)
      // Build a cancelled settlement via the requested → cancelled path
      const requested = requestSettlement(createDraft(), {
        expectedVersion: 1 as never,
        now: LATER,
      });
      const cancelled = cancelSettlement(requested, {
        expectedVersion: 2 as never,
        now: LATER,
      });
      expect(() =>
        confirmSettlement(cancelled, {
          expectedVersion: 3 as never,
          now: LATER,
          confirmedByMemberId: TO_MEMBER,
        }),
      ).toThrow(InvalidStateTransitionError);
    });
  });

  describe('rejectSettlement — pending_confirmation → failed', () => {
    it('transitions pending_confirmation to failed', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const failed = rejectSettlement(pending, { expectedVersion: 2 as never, now: LATER });
      expect(failed.status).toBe('failed');
      expect(isSettlementCompleted(failed)).toBe(false);
    });
  });

  describe('cancelSettlement — pending_confirmation|requested → cancelled', () => {
    it('transitions pending_confirmation to cancelled', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const cancelled = cancelSettlement(pending, { expectedVersion: 2 as never, now: LATER });
      expect(cancelled.status).toBe('cancelled');
    });

    it('transitions requested to cancelled', () => {
      const requested = requestSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const cancelled = cancelSettlement(requested, { expectedVersion: 2 as never, now: LATER });
      expect(cancelled.status).toBe('cancelled');
    });

    it('does NOT contribute to balance (terminal)', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const cancelled = cancelSettlement(pending, { expectedVersion: 2 as never, now: LATER });
      expect(isSettlementCompleted(cancelled)).toBe(false);
    });
  });

  describe('disputeSettlement — pending_confirmation → disputed', () => {
    it('transitions to disputed with a structured reason', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const disputed = disputeSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        reason: 'not_received',
      });
      expect(disputed.status).toBe('disputed');
      expect(disputed.disputeReason).toBe('not_received');
    });

    it('attaches an optional note', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const disputed = disputeSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        reason: 'wrong_amount',
        note: 'You said £42 but I see £40',
      });
      expect(disputed.disputeNote).toBe('You said £42 but I see £40');
    });

    it('rejects an invalid reason', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      expect(() =>
        disputeSettlement(pending, {
          expectedVersion: 2 as never,
          now: LATER,
          reason: 'whatever' as never,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('requires a note when reason is "other"', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      expect(() =>
        disputeSettlement(pending, {
          expectedVersion: 2 as never,
          now: LATER,
          reason: 'other',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('does NOT contribute to balance while disputed', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const disputed = disputeSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        reason: 'not_received',
      });
      expect(isSettlementCompleted(disputed)).toBe(false);
    });
  });

  describe('resolveDispute — disputed → completed|cancelled', () => {
    it('resolves disputed to completed with a confirmer', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const disputed = disputeSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        reason: 'wrong_amount',
      });
      const resolved = resolveDispute(disputed, {
        expectedVersion: 3 as never,
        now: LATER,
        resolution: 'completed',
        confirmedByMemberId: TO_MEMBER,
      });
      expect(resolved.status).toBe('completed');
      expect(resolved.confirmedByMemberId).toBe(TO_MEMBER);
      expect(resolved.confirmedAt).toBe(LATER);
    });

    it('resolves disputed to cancelled', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const disputed = disputeSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        reason: 'wrong_amount',
      });
      const resolved = resolveDispute(disputed, {
        expectedVersion: 3 as never,
        now: LATER,
        resolution: 'cancelled',
      });
      expect(resolved.status).toBe('cancelled');
    });

    it('requires confirmedByMemberId for "completed" resolution', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const disputed = disputeSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        reason: 'wrong_amount',
      });
      expect(() =>
        resolveDispute(disputed, {
          expectedVersion: 3 as never,
          now: LATER,
          resolution: 'completed',
        }),
      ).toThrow(InvalidEntityError);
    });
  });

  describe('reverseSettlement — completed → reversed', () => {
    it('transitions completed to reversed and links the reversal record', () => {
      // Build a completed settlement via the full happy path
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const completed = confirmSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        confirmedByMemberId: TO_MEMBER,
      });

      // Create the reversal record (separate financial record)
      const reversalId = asSettlementId('s-reversal-1');
      const reversal = createSettlementReversal({
        id: reversalId,
        originalSettlement: completed,
        createdBy: USER_ID,
        now: LATER,
      });
      expect(reversal.status).toBe('completed');
      expect(reversal.reversalOfSettlementId).toBe(completed.id);

      // Mark the original as reversed
      const reversed = reverseSettlement(completed, {
        expectedVersion: 3 as never,
        now: LATER,
        reversalSettlementId: reversalId,
      });
      expect(reversed.status).toBe('reversed');
      expect(reversed.reversesSettlementId).toBe(reversalId);
      // Reversed settlements do NOT contribute to balance (the reversal cancels them)
      expect(isSettlementCompleted(reversed)).toBe(false);
    });

    it('rejects reversal of a pending settlement', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      expect(() =>
        reverseSettlement(pending, {
          expectedVersion: 2 as never,
          now: LATER,
          reversalSettlementId: asSettlementId('s-rev'),
        }),
      ).toThrow(InvalidStateTransitionError);
    });
  });

  describe('retrySettlementAsDraft — failed → draft', () => {
    it('transitions failed back to draft for retry', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const failed = rejectSettlement(pending, { expectedVersion: 2 as never, now: LATER });
      const draftAgain = retrySettlementAsDraft(failed, { expectedVersion: 3 as never, now: LATER });
      expect(draftAgain.status).toBe('draft');
    });
  });

  // ── Soft-delete interaction ─────────────────────────────────────────

  describe('soft-delete on a stateful settlement', () => {
    it('soft-deletes a completed settlement (preserves status)', () => {
      const pending = recordSettlement(createDraft(), { expectedVersion: 1 as never, now: LATER });
      const completed = confirmSettlement(pending, {
        expectedVersion: 2 as never,
        now: LATER,
        confirmedByMemberId: TO_MEMBER,
      });
      const deleted = softDeleteSettlement(completed, {
        now: LATER,
        expectedVersion: 3 as never,
      });
      expect(deleted.deletedAt).toBe(LATER);
      // Status is preserved through soft-delete
      expect(deleted.status).toBe('completed');
      expect(deleted.version).toBe(4);
    });
  });

  // ── Deleted entity guard ────────────────────────────────────────────

  describe('transitions on deleted settlements', () => {
    it('reject any transition on a deleted settlement', () => {
      const s = createDraft();
      const deleted = softDeleteSettlement(s, {
        now: LATER,
        expectedVersion: 1 as never,
      });
      expect(() =>
        requestSettlement(deleted, { expectedVersion: 2 as never, now: LATER }),
      ).toThrow(DeletedEntityError);
    });
  });

  // ── Field validation ────────────────────────────────────────────────

  describe('paymentReferenceHash and evidenceHash validation', () => {
    it('rejects a paymentReferenceHash that is not 64-char hex', () => {
      expect(() =>
        createSettlement({
          id: asSettlementId('s-1'),
          groupId: GROUP_ID,
          fromMemberId: FROM_MEMBER,
          toMemberId: TO_MEMBER,
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID,
          now: NOW,
          paymentReferenceHash: 'short',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects an evidenceHash that is not 64-char hex', () => {
      expect(() =>
        createSettlement({
          id: asSettlementId('s-1'),
          groupId: GROUP_ID,
          fromMemberId: FROM_MEMBER,
          toMemberId: TO_MEMBER,
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID,
          now: NOW,
          evidenceHash: 'XYZ',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('accepts a 64-char lowercase hex paymentReferenceHash', () => {
      const s = createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        paymentReferenceHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      });
      expect(s.paymentReferenceHash).toBe(
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      );
    });
  });
});
