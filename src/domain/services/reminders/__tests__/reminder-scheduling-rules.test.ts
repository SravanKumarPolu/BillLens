import { describe, expect, it } from '@jest/globals';

import { asDateTime } from '@domain/value-objects';

import {
  DEFAULT_COOL_DOWN_HOURS,
  isWithinCoolDown,
  isWithinQuietHours,
  scheduledInQuietHours,
  delayPastQuietHours,
  buildNeutralReminderMessage,
  containsShameLanguage,
  type QuietHoursWindow,
} from '../reminder-scheduling-rules';

describe('Reminder scheduling rules', () => {
  // ── Cool-down ────────────────────────────────────────────────

  describe('isWithinCoolDown', () => {
    it('returns false when there is no prior reminder', () => {
      expect(isWithinCoolDown(asDateTime('2026-10-10T10:00:00.000Z'), asDateTime('2026-10-10T10:00:00.000Z'), null)).toBe(false);
    });

    it('returns false when the gap exceeds the cool-down', () => {
      const last = asDateTime('2026-10-09T10:00:00.000Z');
      const scheduled = asDateTime('2026-10-10T10:00:00.000Z'); // 24 hours later
      expect(isWithinCoolDown(asDateTime('2026-10-09T10:00:00.000Z'), scheduled, last)).toBe(false);
    });

    it('returns true when the gap is within the cool-down', () => {
      const last = asDateTime('2026-10-10T09:00:00.000Z');
      const scheduled = asDateTime('2026-10-10T10:00:00.000Z'); // 1 hour later (< 24h)
      expect(isWithinCoolDown(asDateTime('2026-10-10T09:00:00.000Z'), scheduled, last)).toBe(true);
    });

    it('respects a custom cool-down period', () => {
      const last = asDateTime('2026-10-10T09:00:00.000Z');
      const scheduled = asDateTime('2026-10-10T10:00:00.000Z'); // 1 hour later
      // With a 0.5-hour (30-min) cool-down, 1 hour is outside.
      expect(isWithinCoolDown(asDateTime('2026-10-10T09:00:00.000Z'), scheduled, last, 0.5)).toBe(false);
      // With a 2-hour cool-down, 1 hour is inside.
      expect(isWithinCoolDown(asDateTime('2026-10-10T09:00:00.000Z'), scheduled, last, 2)).toBe(true);
    });

    it('DEFAULT_COOL_DOWN_HOURS is 24', () => {
      expect(DEFAULT_COOL_DOWN_HOURS).toBe(24);
    });
  });

  // ── Quiet hours ─────────────────────────────────────────────

  describe('isWithinQuietHours', () => {
    it('returns false for a zero-width window (start === end)', () => {
      expect(isWithinQuietHours(22, { startHour: 22, endHour: 22 })).toBe(false);
    });

    it('handles a simple range (no wrap): 09:00–17:00', () => {
      const window: QuietHoursWindow = { startHour: 9, endHour: 17 };
      expect(isWithinQuietHours(9, window)).toBe(true);
      expect(isWithinQuietHours(12, window)).toBe(true);
      expect(isWithinQuietHours(16, window)).toBe(true);
      expect(isWithinQuietHours(17, window)).toBe(false); // end is exclusive
      expect(isWithinQuietHours(8, window)).toBe(false);
      expect(isWithinQuietHours(18, window)).toBe(false);
    });

    it('handles a wrap-across-midnight range: 22:00–07:00', () => {
      const window: QuietHoursWindow = { startHour: 22, endHour: 7 };
      expect(isWithinQuietHours(22, window)).toBe(true);
      expect(isWithinQuietHours(23, window)).toBe(true);
      expect(isWithinQuietHours(0, window)).toBe(true);
      expect(isWithinQuietHours(3, window)).toBe(true);
      expect(isWithinQuietHours(6, window)).toBe(true);
      expect(isWithinQuietHours(7, window)).toBe(false); // end is exclusive
      expect(isWithinQuietHours(21, window)).toBe(false);
      expect(isWithinQuietHours(12, window)).toBe(false);
    });

    it('throws on an invalid hour', () => {
      expect(() => isWithinQuietHours(24, { startHour: 22, endHour: 7 })).toThrow();
      expect(() => isWithinQuietHours(-1, { startHour: 22, endHour: 7 })).toThrow();
    });
  });

  describe('scheduledInQuietHours', () => {
    it('delegates to isWithinQuietHours', () => {
      const window: QuietHoursWindow = { startHour: 22, endHour: 7 };
      expect(scheduledInQuietHours(23, window)).toBe(true);
      expect(scheduledInQuietHours(12, window)).toBe(false);
    });
  });

  describe('delayPastQuietHours', () => {
    it('returns the original hour if not in quiet hours', () => {
      const window: QuietHoursWindow = { startHour: 22, endHour: 7 };
      expect(delayPastQuietHours(12, window)).toBe(12);
    });

    it('returns the end hour if in quiet hours', () => {
      const window: QuietHoursWindow = { startHour: 22, endHour: 7 };
      expect(delayPastQuietHours(23, window)).toBe(7);
      expect(delayPastQuietHours(3, window)).toBe(7);
    });
  });

  // ── Neutral wording ────────────────────────────────────────

  describe('buildNeutralReminderMessage', () => {
    it('builds a private-mode message (hides the amount)', () => {
      const msg = buildNeutralReminderMessage({
        groupName: 'Weekend Trip',
        formattedAmount: '₹24.00',
        privacyMode: 'private',
      });
      expect(msg).toContain('Weekend Trip');
      expect(msg).toContain('A balance is still open');
      expect(msg).not.toContain('₹24.00');
      expect(msg).toContain('Open BillLens');
    });

    it('builds a detailed-mode message (includes the amount)', () => {
      const msg = buildNeutralReminderMessage({
        groupName: 'Weekend Trip',
        formattedAmount: '₹24.00',
        privacyMode: 'detailed',
      });
      expect(msg).toContain('Weekend Trip');
      expect(msg).toContain('₹24.00');
      expect(msg).toContain('Open BillLens');
    });
  });

  describe('containsShameLanguage', () => {
    it('returns true for forbidden phrases', () => {
      expect(containsShameLanguage("You still haven't paid.")).toBe(true);
      expect(containsShameLanguage('Pay immediately!')).toBe(true);
      expect(containsShameLanguage('Everyone is waiting for you.')).toBe(true);
      expect(containsShameLanguage('You are an overdue payer.')).toBe(true);
    });

    it('returns false for neutral wording', () => {
      expect(containsShameLanguage('A balance of £24 is still open.')).toBe(false);
      expect(containsShameLanguage('Open BillLens to review the details.')).toBe(false);
      expect(containsShameLanguage('Reminder from the Weekend Trip group.')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(containsShameLanguage('PAY NOW')).toBe(true);
      expect(containsShameLanguage('OVERDUE')).toBe(true);
    });
  });
});
