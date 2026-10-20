import { describe, expect, it } from '@jest/globals';

import {
  shouldDeliverNotification,
  buildNotificationBody,
  notificationDeduplicationKey,
  buildNotificationDeepLink,
  DEFAULT_NOTIFICATION_PREFERENCES,
  ALL_NOTIFICATION_CATEGORIES,
} from '../notification-architecture';

describe('Notification architecture', () => {
  describe('shouldDeliverNotification', () => {
    it('always delivers security alerts', () => {
      expect(
        shouldDeliverNotification('account_security_event', {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          securityAlerts: false,
        }),
      ).toBe(true);
    });
    it('respects expenseUpdates preference', () => {
      const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, expenseUpdates: false };
      expect(shouldDeliverNotification('expense_added', prefs)).toBe(false);
      expect(shouldDeliverNotification('expense_edited', prefs)).toBe(false);
    });
    it('respects settlementNotifications preference', () => {
      const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, settlementNotifications: false };
      expect(shouldDeliverNotification('settlement_requested', prefs)).toBe(false);
      expect(shouldDeliverNotification('settlement_confirmed', prefs)).toBe(false);
    });
    it('respects reminders preference', () => {
      const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, reminders: false };
      expect(shouldDeliverNotification('reminder', prefs)).toBe(false);
    });
  });

  describe('buildNotificationBody', () => {
    it('builds private body', () => {
      expect(buildNotificationBody('private', 'expense_added', 'Maya added £62', 'Expense added'))
        .toBe('You have a new BillLens update.');
    });
    it('builds summary body', () => {
      expect(buildNotificationBody('summary', 'settlement_awaiting_confirmation', 'Maya sent £24', 'Settlement needs confirmation'))
        .toBe('Settlement needs confirmation');
    });
    it('builds detailed body', () => {
      expect(buildNotificationBody('detailed', 'expense_added', 'Maya added Dinner for £62', 'Expense added'))
        .toBe('Maya added Dinner for £62');
    });
  });

  describe('deduplication', () => {
    it('generates a stable key', () => {
      const key1 = notificationDeduplicationKey('expense_added', 'expense', 'e-1', 'user-1');
      const key2 = notificationDeduplicationKey('expense_added', 'expense', 'e-1', 'user-1');
      expect(key1).toBe(key2);
      expect(key1).toBe('expense_added:expense:e-1:user-1');
    });
    it('generates different keys for different recipients', () => {
      const key1 = notificationDeduplicationKey('expense_added', 'expense', 'e-1', 'user-1');
      const key2 = notificationDeduplicationKey('expense_added', 'expense', 'e-1', 'user-2');
      expect(key1).not.toBe(key2);
    });
  });

  describe('deep links', () => {
    it('builds a billlens:// deep link', () => {
      expect(buildNotificationDeepLink('expense', 'e-1')).toBe('billlens://expense/e-1');
      expect(buildNotificationDeepLink('settlement', 's-1')).toBe('billlens://settlement/s-1');
    });
  });

  it('ALL_NOTIFICATION_CATEGORIES has 13 categories', () => {
    expect(ALL_NOTIFICATION_CATEGORIES).toHaveLength(13);
  });
});
