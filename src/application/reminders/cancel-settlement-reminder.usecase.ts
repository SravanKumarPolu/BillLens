
import { cancelSettlementReminder } from '@domain/entities/settlement-reminder';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementReminderRepository } from '@domain/repositories/settlement-reminder.repository';
import type { DateTime } from '@domain/value-objects';
import { nowDateTime } from '@domain/value-objects';
import type { UserId } from '@shared-types/index';

/**
 * Use case: Cancel a scheduled settlement reminder.
 *
 * Phase 6 Track 6 / Prompt 59 — manual cancellation. Sets the
 * reminder's status to `cancelled` and records `cancelledAt`.
 * Only scheduled reminders can be cancelled (sent or already-
 * cancelled reminders are terminal).
 *
 * ── Permission ──
 *
 * The creator (`createdBy`) or the receiver may cancel. The use
 * case trusts the caller to enforce that permission check.
 *
 * ── Idempotent ──
 *
 * If the reminder is already cancelled, the use case returns
 * without error (idempotent).
 */
export class CancelSettlementReminderUseCase {
  constructor(
    private readonly reminders: SettlementReminderRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: CancelSettlementReminderInput): Promise<void> {
    const current = await this.reminders.findById(input.reminderId);
    if (current === null) {
      throw new InvalidEntityError(
        `CancelSettlementReminder: reminder ${input.reminderId} not found`,
      );
    }
    if (current.status === 'cancelled' || current.status === 'no_longer_needed') {
      // Idempotent: already cancelled.
      return;
    }
    if (current.status !== 'scheduled') {
      throw new InvalidEntityError(
        `CancelSettlementReminder: reminder ${input.reminderId} is in status "${current.status}"; only scheduled reminders can be cancelled`,
      );
    }

    const now: DateTime = input.now ?? nowDateTime();
    const cancelled = cancelSettlementReminder(current, { now });
    await this.reminders.save(cancelled);

    await this.audit.append({
      id: generateId(),
      entityType: 'settlement_reminder',
      entityId: input.reminderId,
      action: 'delete',
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      groupId: current.groupId,
      previousVersion: current.version,
      newVersion: cancelled.version,
      changeSummary: { cancelled: true },
    });
  }
}

export interface CancelSettlementReminderInput {
  readonly reminderId: string;
  readonly actorId?: UserId;
  readonly now?: DateTime;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
