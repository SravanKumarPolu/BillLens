import type {
  GroupId,
  MemberId,
  SettlementId,
  UserId,
} from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';
import {
  type DateTime,
  type CurrencyCode,
  asDateTime,
  asCurrencyCode,
  initialVersionNumber,
  nextVersionNumber,
  nowDateTime,
} from '../value-objects/index';

// ---------------------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------------------

export function asReminderId(value: string): ReminderId {
  return value as ReminderId;
}

export type ReminderId = string & { readonly __brand: 'ReminderId' };

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * The kind of reminder. Mirrors the `reminder_type` enum in the
 * Supabase schema (Track 1 migration).
 */
export type ReminderType =
  | 'one_time'
  | 'scheduled'
  | 'settlement_request'
  | 'pending_confirmation'
  | 'dispute_follow_up'
  | 'group_summary';

export const ALL_REMINDER_TYPES: readonly ReminderType[] = [
  'one_time',
  'scheduled',
  'settlement_request',
  'pending_confirmation',
  'dispute_follow_up',
  'group_summary',
];

/**
 * The lifecycle status of a reminder. Mirrors the `reminder_status`
 * enum in the Supabase schema.
 *
 *   - `scheduled` — waiting to be sent at `scheduled_at`
 *   - `sent` — the notification was dispatched
 *   - `cancelled` — manually cancelled by the user
 *   - `failed` — the notification system failed to dispatch
 *   - `no_longer_needed` — auto-cancelled because the relevant event
 *     happened (settle completed, dispute opened, member removed, etc.)
 */
export type ReminderStatus =
  | 'scheduled'
  | 'sent'
  | 'cancelled'
  | 'failed'
  | 'no_longer_needed';

export const ALL_REMINDER_STATUSES: readonly ReminderStatus[] = [
  'scheduled',
  'sent',
  'cancelled',
  'failed',
  'no_longer_needed',
];

/**
 * Notification privacy mode — frozen at the time of scheduling so
 * later changes to user preferences do not retroactively alter
 * already-sent notifications.
 *
 *   - `private` — lock-screen notification hides the amount; just
 *     says "Reminder from {group}". The default.
 *   - `detailed` — lock-screen notification includes the amount and
 *     the group name. The user explicitly opted in.
 *   - `in_app_only` — no push notification; the reminder appears
 *     only when the user opens BillLens.
 *   - `disabled` — no notification at all (the reminder is stored
 *     for the audit trail but never dispatched).
 */
export type ReminderPrivacyMode =
  | 'private'
  | 'detailed'
  | 'in_app_only'
  | 'disabled';

export const ALL_PRIVACY_MODES: readonly ReminderPrivacyMode[] = [
  'private',
  'detailed',
  'in_app_only',
  'disabled',
];

/**
 * The reason a reminder was auto-cancelled. Stored in
 * `auto_cancel_reason` so the audit trail shows why a scheduled
 * reminder never fired.
 */
export type AutoCancelReason =
  | 'settle_completed'
  | 'dispute_opened'
  | 'member_removed'
  | 'group_deleted'
  | 'reminder_manually_cancelled'
  | 'balance_no_longer_exists';

export const ALL_AUTO_CANCEL_REASONS: readonly AutoCancelReason[] = [
  'settle_completed',
  'dispute_opened',
  'member_removed',
  'group_deleted',
  'reminder_manually_cancelled',
  'balance_no_longer_exists',
];

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * A settlement reminder — Phase 6 Prompt 59.
 *
 * Respectful payment follow-up. The entity stores the scheduled time,
 * the reminder type, the privacy mode (frozen at scheduling), and the
 * lifecycle status. Cool-down and quiet-hours enforcement is done by
 * the pure `reminder-scheduling-rules` module (separate from this
 * entity) — the entity is the persistent state, not the policy.
 *
 * ── Spec rules (Prompt 59) ──
 *
 *   - No more than one reminder within a defined cool-down period
 *   - User-controlled cadence
 *   - Quiet-hour support
 *   - Easy cancellation
 *   - Stop reminders when balance is settled
 *   - Stop reminders when settlement is disputed
 *   - Stop reminders when member access is removed
 *
 * The entity enforces structural invariants (non-empty group, valid
 * type, valid status, valid privacy mode, payer ≠ receiver). The
 * cool-down and quiet-hours checks are done by the use case, using
 * the pure `reminder-scheduling-rules` module.
 */
export interface SettlementReminder {
  readonly id: ReminderId;
  readonly groupId: GroupId;
  readonly settlementId?: SettlementId;
  readonly payerMemberId?: MemberId;
  readonly receiverMemberId?: MemberId;
  readonly currencyCode: CurrencyCode;
  readonly amountMinor?: number;
  readonly reminderType: ReminderType;
  readonly scheduledAt: DateTime;
  readonly status: ReminderStatus;
  readonly privacyMode: ReminderPrivacyMode;
  readonly createdBy: UserId;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly sentAt?: DateTime;
  readonly cancelledAt?: DateTime;
  readonly autoCancelReason?: AutoCancelReason;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface SettlementReminderCreateInput {
  readonly id: ReminderId;
  readonly groupId: GroupId;
  readonly settlementId?: SettlementId;
  readonly payerMemberId?: MemberId;
  readonly receiverMemberId?: MemberId;
  readonly currencyCode: string;
  readonly amountMinor?: number;
  readonly reminderType: ReminderType;
  readonly scheduledAt: DateTime;
  readonly privacyMode?: ReminderPrivacyMode;
  readonly createdBy: UserId;
  readonly now?: DateTime;
}

export function createSettlementReminder(
  input: SettlementReminderCreateInput,
): SettlementReminder {
  // ── Validate type ──
  if (!ALL_REMINDER_TYPES.includes(input.reminderType)) {
    throw new InvalidEntityError(
      `Reminder type is not a valid value: "${input.reminderType}"`,
    );
  }

  // ── Validate privacy mode ──
  const privacyMode = input.privacyMode ?? 'private';
  if (!ALL_PRIVACY_MODES.includes(privacyMode)) {
    throw new InvalidEntityError(
      `Privacy mode is not a valid value: "${privacyMode}"`,
    );
  }

  // ── Validate currency ──
  const currencyCode = asCurrencyCode(input.currencyCode);

  // ── Validate amount (if present) ──
  if (input.amountMinor !== undefined) {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new InvalidEntityError(
        `Reminder amountMinor must be a positive integer, got ${input.amountMinor}`,
      );
    }
  }

  // ── Validate payer ≠ receiver ──
  if (
    input.payerMemberId !== undefined &&
    input.receiverMemberId !== undefined &&
    input.payerMemberId === input.receiverMemberId
  ) {
    throw new InvalidEntityError(
      `Reminder payer and receiver cannot be the same member: ${input.payerMemberId}`,
    );
  }

  // ── Validate scheduledAt is not in the past ──
  const now = input.now ?? nowDateTime();
  if (input.scheduledAt < now) {
    throw new InvalidEntityError(
      `Reminder scheduledAt (${input.scheduledAt}) is in the past (now=${now})`,
    );
  }

  return {
    id: input.id,
    groupId: input.groupId,
    ...(input.settlementId !== undefined ? { settlementId: input.settlementId } : {}),
    ...(input.payerMemberId !== undefined ? { payerMemberId: input.payerMemberId } : {}),
    ...(input.receiverMemberId !== undefined ? { receiverMemberId: input.receiverMemberId } : {}),
    currencyCode,
    ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
    reminderType: input.reminderType,
    scheduledAt: input.scheduledAt,
    status: 'scheduled',
    privacyMode,
    createdBy: input.createdBy,
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface ReminderCancelInput {
  readonly now?: DateTime;
}

/**
 * Manually cancel a scheduled reminder. Sets `status = 'cancelled'`
 * and `cancelledAt`. Only valid from `scheduled` status.
 */
export function cancelSettlementReminder(
  current: SettlementReminder,
  input: ReminderCancelInput,
): SettlementReminder {
  if (current.status !== 'scheduled') {
    throw new InvalidEntityError(
      `Reminder ${current.id} is in status "${current.status}"; only scheduled reminders can be cancelled`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    status: 'cancelled',
    cancelledAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: nextVersionNumber(current.version as never),
  };
}

export interface ReminderAutoCancelInput {
  readonly reason: AutoCancelReason;
  readonly now?: DateTime;
}

/**
 * Auto-cancel a scheduled reminder because an event made it no
 * longer relevant. Sets `status = 'no_longer_needed'`,
 * `cancelledAt`, and `autoCancelReason`.
 *
 * Used by `ReconcileReminderStateUseCase` when:
 *   - The relevant settlement completes (`settle_completed`)
 *   - The relevant settlement is disputed (`dispute_opened`)
 *   - The payer or receiver is removed from the group (`member_removed`)
 *   - The group is deleted (`group_deleted`)
 *   - The balance no longer exists (`balance_no_longer_exists`)
 */
export function autoCancelSettlementReminder(
  current: SettlementReminder,
  input: ReminderAutoCancelInput,
): SettlementReminder {
  if (current.status !== 'scheduled') {
    throw new InvalidEntityError(
      `Reminder ${current.id} is in status "${current.status}"; only scheduled reminders can be auto-cancelled`,
    );
  }
  if (!ALL_AUTO_CANCEL_REASONS.includes(input.reason)) {
    throw new InvalidEntityError(
      `Auto-cancel reason is not a valid value: "${input.reason}"`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    status: 'no_longer_needed',
    cancelledAt: asDateTime(now),
    autoCancelReason: input.reason,
    updatedAt: asDateTime(now),
    version: nextVersionNumber(current.version as never),
  };
}

export interface ReminderMarkSentInput {
  readonly now?: DateTime;
}

/**
 * Mark a scheduled reminder as sent. Sets `status = 'sent'` and
 * `sentAt`. Only valid from `scheduled` status.
 *
 * Called by the notification dispatcher when the push notification
 * was successfully dispatched.
 */
export function markReminderSent(
  current: SettlementReminder,
  input: ReminderMarkSentInput,
): SettlementReminder {
  if (current.status !== 'scheduled') {
    throw new InvalidEntityError(
      `Reminder ${current.id} is in status "${current.status}"; only scheduled reminders can be marked sent`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    status: 'sent',
    sentAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: nextVersionNumber(current.version as never),
  };
}

/**
 * Predicate: is the reminder still scheduled (not yet sent, cancelled,
 * or auto-cancelled)?
 */
export function isReminderScheduled(r: SettlementReminder): boolean {
  return r.status === 'scheduled';
}
