
import { autoCancelSettlementReminder, type AutoCancelReason } from '@domain/entities/settlement-reminder';
import type { SettlementReminder } from '@domain/entities/settlement-reminder';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementReminderRepository } from '@domain/repositories/settlement-reminder.repository';
import type { DateTime } from '@domain/value-objects';
import { nowDateTime } from '@domain/value-objects';
import type { GroupId, MemberId, SettlementId } from '@shared-types/index';

/**
 * Use case: Reconcile reminder state after a relevant event.
 *
 * Phase 6 Track 6 / Prompt 59 — auto-cancels scheduled reminders
 * that are no longer relevant because:
 *
 *   - The relevant settlement completed (`settle_completed`)
 *   - The relevant settlement was disputed (`dispute_opened`)
 *   - A member was removed from the group (`member_removed`)
 *   - The group was deleted (`group_deleted`)
 *   - The balance no longer exists (`balance_no_longer_exists`)
 *
 * The use case loads the scheduled reminders for the relevant
 * entity (settlement, member, or group), auto-cancels each one,
 * and saves the updated entity. The audit log records each
 * auto-cancellation with the reason.
 *
 * ── Idempotent ──
 *
 * If the reminders are already cancelled/sent/no_longer_needed,
 * the use case skips them. Calling this use case multiple times
 * for the same event has no additional effect.
 *
 * ── Spec rules ──
 *
 *   "Stop reminders when balance is settled"
 *   "Stop reminders when settlement is disputed"
 *   "Stop reminders when member access is removed"
 */
export class ReconcileReminderStateUseCase {
  constructor(
    private readonly reminders: SettlementReminderRepository,
    private readonly audit: AuditRepository,
  ) {}

  /**
   * Auto-cancel scheduled reminders for a settlement that
   * completed or was disputed.
   */
  async onSettlementStateChanged(
    settlementId: SettlementId,
    reason: 'settle_completed' | 'dispute_opened',
    now?: DateTime,
  ): Promise<{ readonly cancelledCount: number }> {
    return this.reconcileForSettlement(settlementId, reason, now);
  }

  /**
   * Auto-cancel scheduled reminders for a member who was removed
   * from a group.
   */
  async onMemberRemoved(
    groupId: GroupId,
    payerMemberId: MemberId,
    now?: DateTime,
  ): Promise<{ readonly cancelledCount: number }> {
    const scheduled = await this.reminders.findScheduledForPayer(groupId, payerMemberId);
    return this.autoCancelAll(scheduled, 'member_removed', now);
  }

  /**
   * Auto-cancel all scheduled reminders for a group (when the
   * group is deleted).
   */
  async onGroupDeleted(
    groupId: GroupId,
    now?: DateTime,
  ): Promise<{ readonly cancelledCount: number }> {
    const page = await this.reminders.listByGroup(groupId, { status: 'scheduled' }, { limit: 1000 });
    return this.autoCancelAll(page.items, 'group_deleted', now);
  }

  // ── Internal ──

  private async reconcileForSettlement(
    settlementId: SettlementId,
    reason: AutoCancelReason,
    now?: DateTime,
  ): Promise<{ readonly cancelledCount: number }> {
    const scheduled = await this.reminders.findScheduledForSettlement(settlementId);
    return this.autoCancelAll(scheduled, reason, now);
  }

  private async autoCancelAll(
    reminders: readonly SettlementReminder[],
    reason: AutoCancelReason,
    now?: DateTime,
  ): Promise<{ readonly cancelledCount: number }> {
    const currentTime: DateTime = now ?? nowDateTime();
    let count = 0;
    for (const r of reminders) {
      if (r.status !== 'scheduled') continue;
      const cancelled = autoCancelSettlementReminder(r, { reason, now: currentTime });
      await this.reminders.save(cancelled);
      await this.audit.append({
        id: generateId(),
        entityType: 'settlement_reminder',
        entityId: r.id,
        action: 'delete',
        groupId: r.groupId,
        previousVersion: r.version,
        newVersion: cancelled.version,
        changeSummary: { autoCancelled: true, reason },
      });
      count++;
    }
    return { cancelledCount: count };
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
