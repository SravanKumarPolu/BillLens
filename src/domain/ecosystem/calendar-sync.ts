/**
 * Calendar sync — generate events for settlement reminders + expenses.
 *
 * Phase 10 Prompt 99: Ecosystem Expansion.
 *
 * Generates CalendarEvent objects that the application layer can push
 * to Google Calendar, Apple Calendar, Outlook, etc. via their
 * respective APIs.
 *
 * CRITICAL: we never include raw receipt images or PII in calendar
 * event descriptions. Only:
 *   - Settlement: payer → payee + amount + currency + due date.
 *   - Expense: title + amount + currency + date (NO merchant name,
 *     NO category — those are in the receipt, not the calendar).
 *
 * This module is PURE: it builds CalendarEvent objects from inputs.
 *
 * See `docs/ecosystem-expansion.md`.
 */

import { formatMinorAmount } from '../entities/currency';
import type { CurrencyCode } from '../value-objects/currency-code';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  /** Event title (shown in the calendar UI). */
  readonly title: string;
  /** Event description (shown when the user expands the event). */
  readonly description: string;
  /** ISO date-time when the event starts. */
  readonly startAt: string;
  /** ISO date-time when the event ends (optional; defaults to 30 min). */
  readonly endAt?: string;
  /** Location string (optional). */
  readonly location?: string;
  /** Attendee email addresses (optional). */
  readonly attendees: readonly string[];
}

// ---------------------------------------------------------------------------
// Event factories
// ---------------------------------------------------------------------------

/**
 * Creates a calendar event for a settlement reminder.
 *
 * The event:
 *   - Title: "Settle up: <fromMember> → <toMember> <amount>"
 *   - Description: includes the amount, currency, and a link back to
 *     the BillLens group (link is rendered by the application layer;
 *     we only include the placeholder here).
 *   - Starts at the due date (all-day in the user's timezone, which
 *     the application layer computes).
 *   - Attendees: empty (the application layer can add the recipient's
 *     email if the user explicitly chooses to notify them).
 *
 * The amount is formatted as "<major>.<minor>" with 2 decimal places
 * (e.g. 1234 → "12.34"). This is for display only — settlement
 * calculations remain in minor units throughout.
 */
export function createSettlementReminderEvent(settlement: {
  fromMember: string;
  toMember: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
}): CalendarEvent {
  const amountDisplay = formatAmount(settlement.amountMinor, settlement.currency);
  const title = `Settle up: ${settlement.fromMember} → ${settlement.toMember} ${amountDisplay} ${settlement.currency}`;
  const description = [
    `Reminder: ${settlement.fromMember} owes ${settlement.toMember} ${amountDisplay} ${settlement.currency}.`,
    '',
    'Tap to open in BillLens and mark as paid.',
  ].join('\n');

  return Object.freeze({
    title,
    description,
    startAt: settlement.dueDate,
    attendees: Object.freeze([]),
  });
}

/**
 * Creates a calendar event for an expense.
 *
 * The event:
 *   - Title: "<title> — <amount> <currency>"
 *   - Description: includes the amount, currency, and the group ID
 *     (the application layer renders a deep link).
 *   - Starts at the expense date.
 *   - No attendees (the expense isn't a meeting).
 *
 * The merchant name is intentionally NOT included — it's PII that
 * belongs in the receipt, not in a shared calendar. The expense title
 * is user-editable and the user controls what to put in it.
 */
export function createExpenseEvent(expense: {
  title: string;
  amountMinor: number;
  currency: string;
  date: string;
  groupId: string;
}): CalendarEvent {
  const amountDisplay = formatAmount(expense.amountMinor, expense.currency);
  const title = `${expense.title} — ${amountDisplay} ${expense.currency}`;
  const description = [
    `Expense in group ${expense.groupId}.`,
    `Amount: ${amountDisplay} ${expense.currency}.`,
    '',
    'Tap to open in BillLens.',
  ].join('\n');

  return Object.freeze({
    title,
    description,
    startAt: expense.date,
    attendees: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatAmount(amountMinor: number, currencyCode: string): string {
  if (!Number.isFinite(amountMinor)) {
    return '0.00';
  }
  // v2.5.0: currency-aware minor-unit formatting (was hardcoded ÷100).
  return formatMinorAmount(amountMinor, currencyCode as CurrencyCode);
}
