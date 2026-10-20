import { describe, expect, it } from '@jest/globals';

import {
  asGroupId,
  asMemberId,
  asReminderId,
  asUserId,
  autoCancelSettlementReminder,
  cancelSettlementReminder,
  createSettlementReminder,
  isReminderScheduled,
  markReminderSent,
} from '../../entities/index';
import { InvalidEntityError } from '../../errors/index';
import { asDateTime } from '../../value-objects';

const NOW = asDateTime('2026-10-10T10:00:00.000Z');
const LATER = asDateTime('2026-10-11T10:00:00.000Z');
const GROUP_ID = asGroupId('group-1');
const USER_ID = asUserId('user-1');
const PAYER = asMemberId('m-1');
const RECEIVER = asMemberId('m-2');

function createBasic() {
  return createSettlementReminder({
    id: asReminderId('r-1'),
    groupId: GROUP_ID,
    payerMemberId: PAYER,
    receiverMemberId: RECEIVER,
    currencyCode: 'INR',
    amountMinor: 500,
    reminderType: 'one_time',
    scheduledAt: LATER,
    createdBy: USER_ID,
    now: NOW,
  });
}

describe('SettlementReminder entity', () => {
  // ── Factory ──────────────────────────────────────────────────

  describe('createSettlementReminder', () => {
    it('creates a reminder with sensible defaults', () => {
      const r = createBasic();
      expect(r.id).toBe(asReminderId('r-1'));
      expect(r.groupId).toBe(GROUP_ID);
      expect(r.payerMemberId).toBe(PAYER);
      expect(r.receiverMemberId).toBe(RECEIVER);
      expect(r.currencyCode).toBe('INR' as never);
      expect(r.amountMinor).toBe(500);
      expect(r.reminderType).toBe('one_time');
      expect(r.scheduledAt).toBe(LATER);
      expect(r.status).toBe('scheduled');
      expect(r.privacyMode).toBe('private'); // default
      expect(r.version).toBe(1);
    });

    it('accepts a custom privacy mode', () => {
      const r = createSettlementReminder({
        id: asReminderId('r-1'),
        groupId: GROUP_ID,
        payerMemberId: PAYER,
        receiverMemberId: RECEIVER,
        currencyCode: 'INR',
        reminderType: 'settlement_request',
        scheduledAt: LATER,
        privacyMode: 'detailed',
        createdBy: USER_ID,
        now: NOW,
      });
      expect(r.privacyMode).toBe('detailed');
    });

    it('rejects an invalid reminder type', () => {
      expect(() =>
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'spam' as never,
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects an invalid privacy mode', () => {
      expect(() =>
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          privacyMode: 'loud' as never,
          createdBy: USER_ID,
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects payer === receiver', () => {
      expect(() =>
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: PAYER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a non-positive amount', () => {
      expect(() =>
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          amountMinor: 0,
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a scheduledAt in the past', () => {
      expect(() =>
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: asDateTime('2026-10-09T10:00:00.000Z'), // before NOW
          createdBy: USER_ID,
          now: NOW,
        }),
      ).toThrow(InvalidEntityError);
    });

    it('allows only a payer (no receiver) for group-summary reminders', () => {
      const r = createSettlementReminder({
        id: asReminderId('r-1'),
        groupId: GROUP_ID,
        payerMemberId: PAYER,
        currencyCode: 'INR',
        reminderType: 'group_summary',
        scheduledAt: LATER,
        createdBy: USER_ID,
        now: NOW,
      });
      expect(r.receiverMemberId).toBeUndefined();
    });
  });

  // ── cancelSettlementReminder ──────────────────────────────

  describe('cancelSettlementReminder', () => {
    it('sets status=cancelled and cancelledAt', () => {
      const r = createBasic();
      const cancelled = cancelSettlementReminder(r, { now: LATER });
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).toBe(LATER);
      expect(cancelled.version).toBe(2);
    });

    it('throws on an already-cancelled reminder', () => {
      const r = cancelSettlementReminder(createBasic(), { now: LATER });
      expect(() => cancelSettlementReminder(r, { now: LATER })).toThrow(InvalidEntityError);
    });
  });

  // ── autoCancelSettlementReminder ─────────────────────────

  describe('autoCancelSettlementReminder', () => {
    it('sets status=no_longer_needed with the reason', () => {
      const r = createBasic();
      const auto = autoCancelSettlementReminder(r, { reason: 'settle_completed', now: LATER });
      expect(auto.status).toBe('no_longer_needed');
      expect(auto.autoCancelReason).toBe('settle_completed');
      expect(auto.cancelledAt).toBe(LATER);
    });

    it('rejects an invalid reason', () => {
      const r = createBasic();
      expect(() =>
        autoCancelSettlementReminder(r, { reason: 'spiderman' as never, now: LATER }),
      ).toThrow(InvalidEntityError);
    });

    it('throws on a non-scheduled reminder', () => {
      const sent = markReminderSent(createBasic(), { now: LATER });
      expect(() =>
        autoCancelSettlementReminder(sent, { reason: 'settle_completed', now: LATER }),
      ).toThrow(InvalidEntityError);
    });
  });

  // ── markReminderSent ──────────────────────────────────────

  describe('markReminderSent', () => {
    it('sets status=sent and sentAt', () => {
      const r = createBasic();
      const sent = markReminderSent(r, { now: LATER });
      expect(sent.status).toBe('sent');
      expect(sent.sentAt).toBe(LATER);
    });

    it('throws on an already-sent reminder', () => {
      const sent = markReminderSent(createBasic(), { now: LATER });
      expect(() => markReminderSent(sent, { now: LATER })).toThrow(InvalidEntityError);
    });
  });

  // ── isReminderScheduled ───────────────────────────────────

  describe('isReminderScheduled', () => {
    it('returns true for a scheduled reminder', () => {
      expect(isReminderScheduled(createBasic())).toBe(true);
    });

    it('returns false for sent/cancelled/no_longer_needed', () => {
      expect(isReminderScheduled(markReminderSent(createBasic(), { now: LATER }))).toBe(false);
      expect(isReminderScheduled(cancelSettlementReminder(createBasic(), { now: LATER }))).toBe(false);
      expect(
        isReminderScheduled(
          autoCancelSettlementReminder(createBasic(), { reason: 'settle_completed', now: LATER }),
        ),
      ).toBe(false);
    });
  });
});
