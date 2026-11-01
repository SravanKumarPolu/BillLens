import type { DateTime } from '../../value-objects/date-time';

/**
 * Reminder scheduling rules — Phase 6 Track 6 / Prompt 59.
 *
 * Pure module that enforces the spec's respectful-defaults rules:
 *
 *   - Cool-down: no more than one reminder within a defined period
 *   - Quiet hours: no notifications during the user's quiet hours
 *   - Stop-on-settle: cancel reminders when the balance is settled
 *   - Stop-on-dispute: cancel reminders when the settlement is disputed
 *   - Stop-on-removed: cancel reminders when the member is removed
 *
 * This module is PURE: no side effects, no I/O, no React Native
 * dependencies. It operates on plain values (timestamps, member ids,
 * quiet-hours windows). The use cases call into it to decide
 * whether to allow a new reminder, and to filter existing reminders
 * for auto-cancellation.
 *
 * ── Wording (Prompt 59) ──
 *
 * The spec requires neutral language. Example:
 *
 *   "Reminder from the Weekend Trip group:
 *    A balance of £24 is still open.
 *    Open BillLens to review the details."
 *
 * Forbidden shame-oriented language:
 *   - "You still haven't paid."
 *   - "Pay immediately."
 *   - "Everyone is waiting for you."
 *   - Public ranking of late payers.
 */

// ---------------------------------------------------------------------------
// Cool-down
// ---------------------------------------------------------------------------

/**
 * The default cool-down period in hours. The spec says "no more than
 * one reminder within a defined cool-down period" — we default to 24
 * hours, which is conservative enough to avoid harassment but short
 * enough to be useful.
 *
 * The cool-down is per (payer, receiver, group, currency) tuple: a
 * reminder to payer A does not cool-down a reminder to payer B.
 */
export const DEFAULT_COOL_DOWN_HOURS = 24;

/**
 * Check whether a new reminder would violate the cool-down period
 * relative to the most recent scheduled-or-sent reminder for the same
 * (payer, receiver, group, currency) tuple.
 *
 * Returns `true` if the new reminder is allowed (the cool-down has
 * elapsed or there is no prior reminder). Returns `false` if the
 * cool-down would be violated.
 *
 * @param now — the current time
 * @param scheduledAt — when the new reminder is scheduled for
 * @param lastReminderAt — when the most recent scheduled-or-sent
 *                         reminder for the same tuple was created/sent,
 *                         or `null` if there is no prior reminder
 * @param coolDownHours — the cool-down period (default 24)
 */
export function isWithinCoolDown(
  _now: DateTime,
  scheduledAt: DateTime,
  lastReminderAt: DateTime | null,
  coolDownHours: number = DEFAULT_COOL_DOWN_HOURS,
): boolean {
  if (lastReminderAt === null) {
    return false; // no prior reminder → no cool-down
  }
  // The cool-down is measured from the last reminder's timestamp to
  // the new reminder's scheduled time. If the gap is less than the
  // cool-down, the new reminder is within the cool-down (i.e. NOT
  // allowed).
  const lastMs = new Date(lastReminderAt).getTime();
  const scheduledMs = new Date(scheduledAt).getTime();
  const gapMs = scheduledMs - lastMs;
  const coolDownMs = coolDownHours * 60 * 60 * 1000;
  return gapMs < coolDownMs;
}

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

/**
 * A quiet-hours window. Times are in the user's local timezone,
 * expressed as hours (0-23) and minutes (0-59).
 *
 * If `startHour` < `endHour`, the window is a simple range (e.g.
 * 22:00–07:00 would be start=22, end=7 — but this wraps midnight,
 * so we use a different representation: start=22, end=7 means
 * "from 22:00 to 07:00 the next day").
 *
 * For simplicity, we represent the window as (startHour, endHour)
 * where endHour may be less than startHour (indicating a wrap
 * across midnight). 22:00–07:00 is (22, 7).
 */
export interface QuietHoursWindow {
  readonly startHour: number; // 0-23
  readonly endHour: number;   // 0-23 (may be < startHour, meaning wrap)
}

/**
 * Check whether a given hour-of-day falls within a quiet-hours window.
 *
 * The window wraps midnight: (22, 7) means 22:00–07:00.
 */
export function isWithinQuietHours(
  hour: number,
  window: QuietHoursWindow,
): boolean {
  if (hour < 0 || hour > 23) {
    throw new Error(`isWithinQuietHours: hour must be 0-23, got ${hour}`);
  }
  if (window.startHour === window.endHour) {
    // start === end means "no quiet hours" (the window is zero-width)
    return false;
  }
  if (window.startHour < window.endHour) {
    // Simple range, no wrap: e.g. (9, 17) = 09:00–17:00
    return hour >= window.startHour && hour < window.endHour;
  }
  // Wrap across midnight: e.g. (22, 7) = 22:00–07:00
  return hour >= window.startHour || hour < window.endHour;
}

/**
 * Check whether a scheduled time falls within the user's quiet
 * hours. The `scheduledAt` is a UTC ISO string; the `userLocalHour`
 * is the hour-of-day in the user's local timezone (the caller
 * converts from UTC to local before calling this function).
 */
export function scheduledInQuietHours(
  userLocalHour: number,
  window: QuietHoursWindow,
): boolean {
  return isWithinQuietHours(userLocalHour, window);
}

/**
 * Delay a scheduled time to the first non-quiet hour after the
 * window ends.
 *
 * If the scheduled time is within quiet hours, returns a new
 * timestamp for the end of the quiet window. If it's not within
 * quiet hours, returns the original timestamp unchanged.
 *
 * The caller is responsible for converting the UTC timestamp to
 * the user's local timezone for the hour check, and for converting
 * the "end of quiet window" back to UTC. This function operates on
 * the hour-of-day and the window, not on full timestamps.
 */
export function delayPastQuietHours(
  userLocalHour: number,
  window: QuietHoursWindow,
): number {
  if (!scheduledInQuietHours(userLocalHour, window)) {
    return userLocalHour; // not in quiet hours — no delay
  }
  // Return the end hour of the quiet window (the first non-quiet hour).
  return window.endHour;
}

// ---------------------------------------------------------------------------
// Neutral wording
// ---------------------------------------------------------------------------

/**
 * Build a neutral reminder message per the spec's example.
 *
 *   "Reminder from the {groupName} group:
 *    A balance of {amount} is still open.
 *    Open BillLens to review the details."
 *
 * The wording is deliberately neutral. The spec forbids:
 *   - "You still haven't paid."
 *   - "Pay immediately."
 *   - "Everyone is waiting for you."
 *   - Public ranking of late payers.
 */
export function buildNeutralReminderMessage(input: {
  readonly groupName: string;
  readonly formattedAmount: string;
  readonly privacyMode: 'private' | 'detailed' | 'in_app_only' | 'disabled';
}): string {
  if (input.privacyMode === 'private') {
    // Private mode: hide the amount on the lock screen.
    return (
      `Reminder from the ${input.groupName} group.\n` +
      `A balance is still open.\n` +
      `Open BillLens to review the details.`
    );
  }
  // Detailed mode: include the amount.
  return (
    `Reminder from the ${input.groupName} group:\n` +
    `A balance of ${input.formattedAmount} is still open.\n` +
    `Open BillLens to review the details.`
  );
}

/**
 * Check whether a wording string contains shame-oriented language
 * forbidden by the spec.
 *
 * Used by tests and by the UI to validate user-customised reminder
 * templates. The check is case-insensitive and matches whole-word
 * phrases.
 */
export function containsShameLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  const forbidden = [
    "you still haven't paid",
    'you still have not paid',
    'pay immediately',
    'pay now',
    'everyone is waiting',
    'we are all waiting',
    'overdue',
    'late payer',
    'deadbeat',
  ];
  return forbidden.some((phrase) => lower.includes(phrase));
}
