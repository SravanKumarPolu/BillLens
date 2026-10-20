import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  asGroupId,
  asMemberId,
  asReminderId,
  asSettlementId,
  asUserId,
  cancelSettlementReminder,
  createSettlementReminder,
  markReminderSent,
  type SettlementReminder,
} from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type {
  PaginatedResult,
  Pagination,
} from '@domain/repositories/repository-contracts';
import type {
  SettlementReminderRepository,
} from '@domain/repositories/settlement-reminder.repository';
import { asDateTime } from '@domain/value-objects';
import type { GroupId, MemberId, SettlementId } from '@shared-types/index';

import {
  InMemoryAuditRepository,
} from '../../settlements/__tests__/_in-memory-repositories';
import {
  CancelSettlementReminderUseCase,
  CreateSettlementReminderUseCase,
  ListSettlementRemindersUseCase,
  ReconcileReminderStateUseCase,
} from '../index';

// ── In-memory reminder repository ─────────────────────────────────

class InMemoryReminderRepository implements SettlementReminderRepository {
  private store = new Map<string, SettlementReminder>();

  seed(r: SettlementReminder): void {
    this.store.set(r.id, r);
  }

  async findById(id: string): Promise<SettlementReminder | null> {
    return this.store.get(id) ?? null;
  }

  async listByGroup(
    groupId: GroupId,
    filter?: { readonly status?: SettlementReminder['status'] },
    _pagination?: Pagination,
  ): Promise<PaginatedResult<SettlementReminder>> {
    let items = Array.from(this.store.values()).filter((r) => r.groupId === groupId);
    if (filter?.status) items = items.filter((r) => r.status === filter!.status);
    items.sort((a, b) => (a.scheduledAt as string).localeCompare(b.scheduledAt as string));
    return { items, hasMore: false };
  }

  async findMostRecentForCoolDown(
    _groupId: GroupId,
    _payerMemberId: MemberId,
    _receiverMemberId: MemberId,
    _currencyCode: string,
  ): Promise<SettlementReminder | null> {
    // Return the most recent scheduled-or-sent reminder.
    const candidates = Array.from(this.store.values())
      .filter((r) => r.status === 'scheduled' || r.status === 'sent')
      .sort((a, b) => (b.scheduledAt as string).localeCompare(a.scheduledAt as string));
    return candidates[0] ?? null;
  }

  async findScheduledForSettlement(settlementId: SettlementId): Promise<readonly SettlementReminder[]> {
    return Array.from(this.store.values()).filter(
      (r) => r.settlementId === settlementId && r.status === 'scheduled',
    );
  }

  async findScheduledForPayer(
    _groupId: GroupId,
    payerMemberId: MemberId,
  ): Promise<readonly SettlementReminder[]> {
    return Array.from(this.store.values()).filter(
      (r) => r.payerMemberId === payerMemberId && r.status === 'scheduled',
    );
  }

  async save(reminder: SettlementReminder): Promise<void> {
    this.store.set(reminder.id, reminder);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────

const NOW = asDateTime('2026-10-10T10:00:00.000Z');
const LATER = asDateTime('2026-10-11T10:00:00.000Z');
const MUCH_LATER = asDateTime('2026-10-12T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');
const PAYER = asMemberId('m-1');
const RECEIVER = asMemberId('m-2');

// ── Tests ──────────────────────────────────────────────────────────

describe('Phase 6 Track 6 — Settlement reminders (Prompt 59)', () => {
  let reminders: InMemoryReminderRepository;
  let audit: InMemoryAuditRepository;

  beforeEach(() => {
    reminders = new InMemoryReminderRepository();
    audit = new InMemoryAuditRepository();
  });

  // ── CreateSettlementReminderUseCase ─────────────────────────

  describe('CreateSettlementReminderUseCase', () => {
    it('creates a scheduled reminder', async () => {
      const useCase = new CreateSettlementReminderUseCase(reminders, audit);
      const result = await useCase.execute({
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
      expect(result.reminder.status).toBe('scheduled');
      expect(result.reminder.scheduledAt).toBe(LATER);
      expect(result.reminder.privacyMode).toBe('private');
      // Audit entry was created
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]?.entityType).toBe('settlement_reminder');
    });

    it('throws on cool-down violation', async () => {
      // Seed a prior reminder scheduled for NOW
      reminders.seed(
        createSettlementReminder({
          id: asReminderId('r-prior'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER, // 24h after NOW
          createdBy: USER_ID,
          now: NOW,
        }),
      );
      const useCase = new CreateSettlementReminderUseCase(reminders, audit);
      // Try to create a new reminder 1 hour after the prior one (within 24h cool-down)
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: asDateTime('2026-10-11T11:00:00.000Z'), // 1h after LATER
          createdBy: USER_ID,
          now: NOW,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('allows a reminder after the cool-down elapses', async () => {
      reminders.seed(
        createSettlementReminder({
          id: asReminderId('r-prior'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      );
      const useCase = new CreateSettlementReminderUseCase(reminders, audit);
      // Create a new reminder 25h after the prior one (outside 24h cool-down)
      const result = await useCase.execute({
        groupId: GROUP_ID,
        payerMemberId: PAYER,
        receiverMemberId: RECEIVER,
        currencyCode: 'INR',
        reminderType: 'one_time',
        scheduledAt: MUCH_LATER, // > 24h after LATER
        createdBy: USER_ID,
        now: NOW,
      });
      expect(result.reminder.status).toBe('scheduled');
    });

    it('throws when neither payer nor receiver is provided', async () => {
      const useCase = new CreateSettlementReminderUseCase(reminders, audit);
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── CancelSettlementReminderUseCase ─────────────────────────

  describe('CancelSettlementReminderUseCase', () => {
    it('cancels a scheduled reminder', async () => {
      reminders.seed(
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      );
      const useCase = new CancelSettlementReminderUseCase(reminders, audit);
      await useCase.execute({ reminderId: 'r-1', now: LATER });
      const r = await reminders.findById('r-1');
      expect(r?.status).toBe('cancelled');
      expect(r?.cancelledAt).toBe(LATER);
    });

    it('is idempotent on already-cancelled', async () => {
      reminders.seed(
        cancelSettlementReminder(
          createSettlementReminder({
            id: asReminderId('r-1'),
            groupId: GROUP_ID,
            payerMemberId: PAYER,
            receiverMemberId: RECEIVER,
            currencyCode: 'INR',
            reminderType: 'one_time',
            scheduledAt: LATER,
            createdBy: USER_ID,
            now: NOW,
          }),
          { now: LATER },
        ),
      );
      const useCase = new CancelSettlementReminderUseCase(reminders, audit);
      await useCase.execute({ reminderId: 'r-1' }); // should not throw
      expect(audit.entries).toHaveLength(0); // no new audit entry
    });

    it('throws on a sent reminder', async () => {
      reminders.seed(
        markReminderSent(
          createSettlementReminder({
            id: asReminderId('r-1'),
            groupId: GROUP_ID,
            payerMemberId: PAYER,
            receiverMemberId: RECEIVER,
            currencyCode: 'INR',
            reminderType: 'one_time',
            scheduledAt: LATER,
            createdBy: USER_ID,
            now: NOW,
          }),
          { now: LATER },
        ),
      );
      const useCase = new CancelSettlementReminderUseCase(reminders, audit);
      await expect(useCase.execute({ reminderId: 'r-1' })).rejects.toThrow(InvalidEntityError);
    });

    it('throws on not-found', async () => {
      const useCase = new CancelSettlementReminderUseCase(reminders, audit);
      await expect(useCase.execute({ reminderId: 'nope' })).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── ListSettlementRemindersUseCase ──────────────────────────

  describe('ListSettlementRemindersUseCase', () => {
    it('lists reminders for a group', async () => {
      reminders.seed(
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      );
      const useCase = new ListSettlementRemindersUseCase(reminders);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        pagination: { limit: 10 },
      });
      expect(result.items).toHaveLength(1);
    });

    it('filters by status', async () => {
      reminders.seed(
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      );
      reminders.seed(
        markReminderSent(
          createSettlementReminder({
            id: asReminderId('r-2'),
            groupId: GROUP_ID,
            payerMemberId: PAYER,
            receiverMemberId: RECEIVER,
            currencyCode: 'INR',
            reminderType: 'one_time',
            scheduledAt: LATER,
            createdBy: USER_ID,
            now: NOW,
          }),
          { now: LATER },
        ),
      );
      const useCase = new ListSettlementRemindersUseCase(reminders);
      const scheduled = await useCase.execute({
        groupId: GROUP_ID,
        status: 'scheduled',
        pagination: { limit: 10 },
      });
      expect(scheduled.items).toHaveLength(1);
      expect(scheduled.items[0]?.id).toBe(asReminderId('r-1'));
    });
  });

  // ── ReconcileReminderStateUseCase ──────────────────────────

  describe('ReconcileReminderStateUseCase', () => {
    function seedScheduledForSettlement(settlementId: string) {
      reminders.seed(
        createSettlementReminder({
          id: asReminderId(`r-${settlementId}`),
          groupId: GROUP_ID,
          settlementId: asSettlementId(settlementId),
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'pending_confirmation',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      );
    }

    it('auto-cancels scheduled reminders when a settlement completes', async () => {
      seedScheduledForSettlement('s-1');
      const useCase = new ReconcileReminderStateUseCase(reminders, audit);
      const result = await useCase.onSettlementStateChanged(
        asSettlementId('s-1'),
        'settle_completed',
        LATER,
      );
      expect(result.cancelledCount).toBe(1);
      const r = await reminders.findById('r-s-1');
      expect(r?.status).toBe('no_longer_needed');
      expect(r?.autoCancelReason).toBe('settle_completed');
    });

    it('auto-cancels scheduled reminders when a settlement is disputed', async () => {
      seedScheduledForSettlement('s-1');
      const useCase = new ReconcileReminderStateUseCase(reminders, audit);
      const result = await useCase.onSettlementStateChanged(
        asSettlementId('s-1'),
        'dispute_opened',
        LATER,
      );
      expect(result.cancelledCount).toBe(1);
      const r = await reminders.findById('r-s-1');
      expect(r?.autoCancelReason).toBe('dispute_opened');
    });

    it('does not cancel already-sent reminders', async () => {
      reminders.seed(
        markReminderSent(
          createSettlementReminder({
            id: asReminderId('r-sent'),
            groupId: GROUP_ID,
            settlementId: asSettlementId('s-1'),
            payerMemberId: PAYER,
            receiverMemberId: RECEIVER,
            currencyCode: 'INR',
            reminderType: 'pending_confirmation',
            scheduledAt: LATER,
            createdBy: USER_ID,
            now: NOW,
          }),
          { now: LATER },
        ),
      );
      const useCase = new ReconcileReminderStateUseCase(reminders, audit);
      const result = await useCase.onSettlementStateChanged(
        asSettlementId('s-1'),
        'settle_completed',
        LATER,
      );
      expect(result.cancelledCount).toBe(0); // sent reminders are not cancelled
    });

    it('auto-cancels reminders for a removed member', async () => {
      reminders.seed(
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      );
      const useCase = new ReconcileReminderStateUseCase(reminders, audit);
      const result = await useCase.onMemberRemoved(GROUP_ID, PAYER, LATER);
      expect(result.cancelledCount).toBe(1);
      const r = await reminders.findById('r-1');
      expect(r?.autoCancelReason).toBe('member_removed');
    });

    it('auto-cancels all scheduled reminders when a group is deleted', async () => {
      reminders.seed(
        createSettlementReminder({
          id: asReminderId('r-1'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'one_time',
          scheduledAt: LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      );
      reminders.seed(
        createSettlementReminder({
          id: asReminderId('r-2'),
          groupId: GROUP_ID,
          payerMemberId: PAYER,
          receiverMemberId: RECEIVER,
          currencyCode: 'INR',
          reminderType: 'group_summary',
          scheduledAt: MUCH_LATER,
          createdBy: USER_ID,
          now: NOW,
        }),
      );
      const useCase = new ReconcileReminderStateUseCase(reminders, audit);
      const result = await useCase.onGroupDeleted(GROUP_ID, LATER);
      expect(result.cancelledCount).toBe(2);
    });

    it('is idempotent — calling twice has no additional effect', async () => {
      seedScheduledForSettlement('s-1');
      const useCase = new ReconcileReminderStateUseCase(reminders, audit);
      await useCase.onSettlementStateChanged(asSettlementId('s-1'), 'settle_completed', LATER);
      const result = await useCase.onSettlementStateChanged(
        asSettlementId('s-1'),
        'settle_completed',
        LATER,
      );
      expect(result.cancelledCount).toBe(0); // already cancelled
    });
  });
});
