/**
 * Activity feed model — Phase 7 Prompt 67.
 *
 * Defines the ActivityEvent entity, activity categories, filters,
 * visibility rules, and user-facing message generation.
 *
 * Activity events are derived from structured audit records — never
 * from comparing database rows after the fact (spec rule).
 */

import type { DateTime } from '@domain/value-objects/date-time';

// ---------------------------------------------------------------------------
// Activity event types (spec, Prompt 67)
// ---------------------------------------------------------------------------

export type ActivityEventType =
  | 'group_created'
  | 'member_added'
  | 'member_removed'
  | 'member_linked'
  | 'role_changed'
  | 'expense_created'
  | 'expense_edited'
  | 'expense_voided'
  | 'expense_restored'
  | 'expense_deleted'
  | 'receipt_attached'
  | 'settlement_requested'
  | 'settlement_confirmed'
  | 'settlement_disputed'
  | 'settlement_reversed'
  | 'conflict_resolved'
  | 'group_archived'
  | 'group_restored';

export const ALL_ACTIVITY_EVENT_TYPES: readonly ActivityEventType[] = [
  'group_created',
  'member_added',
  'member_removed',
  'member_linked',
  'role_changed',
  'expense_created',
  'expense_edited',
  'expense_voided',
  'expense_restored',
  'expense_deleted',
  'receipt_attached',
  'settlement_requested',
  'settlement_confirmed',
  'settlement_disputed',
  'settlement_reversed',
  'conflict_resolved',
  'group_archived',
  'group_restored',
];

// ---------------------------------------------------------------------------
// Visibility (spec, Prompt 67)
// ---------------------------------------------------------------------------

export type ActivityVisibility =
  | 'group'           // Visible to all group members
  | 'participants'    // Visible to expense participants only
  | 'private'         // Visible to the actor only
  | 'system';         // System-level event

// ---------------------------------------------------------------------------
// Activity event entity (spec, Prompt 67)
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  readonly id: string;
  readonly groupId?: string;
  readonly actorMemberId?: string;
  readonly actorDisplayName?: string;
  readonly eventType: ActivityEventType;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly occurredAt: DateTime;
  readonly eventData?: Readonly<Record<string, unknown>>;
  readonly originDeviceId?: string;
  readonly visibility: ActivityVisibility;
}

// ---------------------------------------------------------------------------
// Filters (spec, Prompt 67)
// ---------------------------------------------------------------------------

export type ActivityFilter =
  | 'all'
  | 'expenses'
  | 'settlements'
  | 'members'
  | 'group_changes'
  | 'conflicts'
  | 'my_activity';

/**
 * Filter activity events by the selected filter type.
 */
export function filterActivityEvents(
  events: readonly ActivityEvent[],
  filter: ActivityFilter,
  currentMemberId?: string,
): readonly ActivityEvent[] {
  switch (filter) {
    case 'all':
      return events;
    case 'expenses':
      return events.filter((e) =>
        e.eventType === 'expense_created' ||
        e.eventType === 'expense_edited' ||
        e.eventType === 'expense_voided' ||
        e.eventType === 'expense_restored' ||
        e.eventType === 'expense_deleted' ||
        e.eventType === 'receipt_attached',
      );
    case 'settlements':
      return events.filter((e) =>
        e.eventType === 'settlement_requested' ||
        e.eventType === 'settlement_confirmed' ||
        e.eventType === 'settlement_disputed' ||
        e.eventType === 'settlement_reversed',
      );
    case 'members':
      return events.filter((e) =>
        e.eventType === 'member_added' ||
        e.eventType === 'member_removed' ||
        e.eventType === 'member_linked' ||
        e.eventType === 'role_changed',
      );
    case 'group_changes':
      return events.filter((e) =>
        e.eventType === 'group_created' ||
        e.eventType === 'group_archived' ||
        e.eventType === 'group_restored',
      );
    case 'conflicts':
      return events.filter((e) => e.eventType === 'conflict_resolved');
    case 'my_activity':
      return events.filter((e) => e.actorMemberId === currentMemberId);
    default:
      return events;
  }
}

// ---------------------------------------------------------------------------
// User-facing message generation (spec, Prompt 67)
// ---------------------------------------------------------------------------

/**
 * Generate a user-facing message for an activity event.
 *
 * The spec says:
 *
 *   "Maya added Dinner for £62."
 *   "Alex changed the Dinner total from £60 to £62."
 *   "Priya reversed a £20 settlement."
 *
 * Do not expose:
 *   - Internal IDs
 *   - Raw JSON
 *   - Full payment references
 *   - Hidden receipt data
 *   - Technical sync errors
 */
export function buildActivityMessage(
  event: ActivityEvent,
  formattedAmount?: string,
): string {
  const actor = event.actorDisplayName ?? 'Someone';
  switch (event.eventType) {
    case 'expense_created': {
      const title = (event.eventData?.['title'] as string) ?? 'an expense';
      const amt = formattedAmount ? ` for ${formattedAmount}` : '';
      return `${actor} added ${title}${amt}.`;
    }
    case 'expense_edited': {
      const title = (event.eventData?.['title'] as string) ?? 'an expense';
      const oldAmount = event.eventData?.['oldAmountMinor'] as number | undefined;
      const newAmount = event.eventData?.['newAmountMinor'] as number | undefined;
      if (oldAmount !== undefined && newAmount !== undefined) {
        return `${actor} changed the ${title} total from ${formatMinor(oldAmount)} to ${formatMinor(newAmount)}.`;
      }
      return `${actor} edited ${title}.`;
    }
    case 'expense_voided': {
      const title = (event.eventData?.['title'] as string) ?? 'an expense';
      return `${actor} voided ${title}.`;
    }
    case 'expense_deleted': {
      const title = (event.eventData?.['title'] as string) ?? 'an expense';
      return `${actor} deleted ${title}.`;
    }
    case 'settlement_requested':
      return `${actor} requested a settlement.`;
    case 'settlement_confirmed':
      return `${actor} confirmed a settlement.`;
    case 'settlement_disputed':
      return `${actor} disputed a settlement.`;
    case 'settlement_reversed': {
      const amt = formattedAmount ? ` a ${formattedAmount}` : ' a';
      return `${actor} reversed${amt} settlement.`;
    }
    case 'member_added': {
      const name = (event.eventData?.['memberName'] as string) ?? 'a member';
      return `${actor} added ${name} to the group.`;
    }
    case 'member_removed': {
      const name = (event.eventData?.['memberName'] as string) ?? 'a member';
      return `${name} was removed from the group.`;
    }
    case 'role_changed': {
      const name = (event.eventData?.['memberName'] as string) ?? 'a member';
      const newRole = (event.eventData?.['newRole'] as string) ?? 'a new role';
      return `${name} is now ${newRole}.`;
    }
    case 'group_created': {
      const name = (event.eventData?.['groupName'] as string) ?? 'a group';
      return `${actor} created ${name}.`;
    }
    case 'group_archived': {
      const name = (event.eventData?.['groupName'] as string) ?? 'a group';
      return `${name} was archived.`;
    }
    case 'conflict_resolved':
      return `${actor} resolved a conflict.`;
    case 'receipt_attached':
      return `${actor} attached a receipt.`;
    default:
      return `${actor} performed an action.`;
  }
}

function formatMinor(minor: number): string {
  return `${(minor / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Sensitive-field redaction
// ---------------------------------------------------------------------------

/**
 * Fields that must NOT appear in activity feed messages.
 */
export const REDACTED_FIELDS: readonly string[] = [
  'paymentReferenceHash',
  'evidenceHash',
  'operationId',
  'idempotencyKey',
  'accessToken',
  'refreshToken',
  'vpa',
  'upiId',
  'bankReference',
];

/**
 * Redact sensitive fields from an activity event's `eventData`.
 *
 * Returns a copy of `eventData` with sensitive fields replaced by
 * `'[REDACTED]'`.
 */
export function redactActivityEventData(
  eventData: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(eventData)) {
    result[key] = REDACTED_FIELDS.includes(key) ? '[REDACTED]' : value;
  }
  return result;
}
