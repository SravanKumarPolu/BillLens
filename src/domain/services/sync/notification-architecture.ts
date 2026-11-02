/**
 * Notification model — Phase 7 Prompt 66.
 *
 * Defines the AppNotification entity, notification categories, privacy
 * levels, delivery types, preference controls, and deduplication
 * rules.
 *
 * The existing reminder scheduling rules (Track 6) handle reminder
 * notifications; this module defines the general notification
 * framework that reminders, settlement events, expense events, and
 * sync events all feed into.
 */

import type { DateTime } from '@domain/value-objects/date-time';

// ---------------------------------------------------------------------------
// Notification categories (spec, Prompt 66)
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | 'group_invitation'
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'draft_needs_review'
  | 'settlement_requested'
  | 'settlement_awaiting_confirmation'
  | 'settlement_confirmed'
  | 'settlement_disputed'
  | 'reminder'
  | 'sync_failure'
  | 'conflict_requires_review'
  | 'account_security_event';

export const ALL_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'group_invitation',
  'expense_added',
  'expense_edited',
  'expense_deleted',
  'draft_needs_review',
  'settlement_requested',
  'settlement_awaiting_confirmation',
  'settlement_confirmed',
  'settlement_disputed',
  'reminder',
  'sync_failure',
  'conflict_requires_review',
  'account_security_event',
];

// ---------------------------------------------------------------------------
// Delivery types
// ---------------------------------------------------------------------------

export type NotificationDeliveryType =
  | 'local'           // Local notification (in-app banner / notification centre)
  | 'push'            // Push notification (APNs / FCM)
  | 'in_app'          // In-app notification centre only
  | 'email';          // Email (placeholder for future)

// ---------------------------------------------------------------------------
// Privacy levels (spec, Prompt 66)
// ---------------------------------------------------------------------------

export type NotificationPrivacyLevel = 'private' | 'summary' | 'detailed';

// ---------------------------------------------------------------------------
// Notification status (spec, Prompt 66)
// ---------------------------------------------------------------------------

export type NotificationStatus =
  | 'created'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'dismissed'
  | 'failed'
  | 'cancelled';

// ---------------------------------------------------------------------------
// AppNotification entity (spec, Prompt 66)
// ---------------------------------------------------------------------------

export interface AppNotification {
  readonly id: string;
  readonly recipientProfileId: string;
  readonly category: NotificationCategory;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly groupId?: string;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly bodyArgumentsJson?: string;
  readonly privacyLevel: NotificationPrivacyLevel;
  readonly status: NotificationStatus;
  readonly createdAt: DateTime;
  readonly readAt?: DateTime;
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
  readonly pushEnabled: boolean;
  readonly inAppEnabled: boolean;
  readonly expenseUpdates: boolean;
  readonly settlementNotifications: boolean;
  readonly groupInvitations: boolean;
  readonly reminders: boolean;
  readonly syncAlerts: boolean;
  readonly securityAlerts: boolean;
  readonly quietHoursStart?: number; // 0-23
  readonly quietHoursEnd?: number;   // 0-23
  readonly lockScreenDetailLevel: NotificationPrivacyLevel;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  inAppEnabled: true,
  expenseUpdates: true,
  settlementNotifications: true,
  groupInvitations: true,
  reminders: true,
  syncAlerts: true,
  securityAlerts: true,
  lockScreenDetailLevel: 'private',
};

/**
 * Determine whether a notification should be delivered based on the
 * user's preferences.
 *
 * Security alerts are ALWAYS delivered, even if the user disabled
 * them (spec: "Do not allow users to disable essential account-
 * security notices where policy requires them").
 */
export function shouldDeliverNotification(
  category: NotificationCategory,
  prefs: NotificationPreferences,
): boolean {
  // Security alerts are always delivered
  if (category === 'account_security_event') return true;

  // Check category-specific preferences
  if (category === 'group_invitation' && !prefs.groupInvitations) return false;
  if (
    (category === 'expense_added' || category === 'expense_edited' || category === 'expense_deleted') &&
    !prefs.expenseUpdates
  ) {
    return false;
  }
  if (
    (category === 'settlement_requested' ||
      category === 'settlement_awaiting_confirmation' ||
      category === 'settlement_confirmed' ||
      category === 'settlement_disputed') &&
    !prefs.settlementNotifications
  ) {
    return false;
  }
  if (category === 'reminder' && !prefs.reminders) return false;
  if (category === 'sync_failure' && !prefs.syncAlerts) return false;
  if (category === 'conflict_requires_review' && !prefs.syncAlerts) return false;

  return true;
}

/**
 * Build the notification body based on the privacy level.
 *
 *   - `private`: "You have a new BillLens update."
 *   - `summary`: "A settlement needs your confirmation."
 *   - `detailed`: "Maya recorded a £24 settlement in Weekend Trip."
 */
export function buildNotificationBody(
  privacyLevel: NotificationPrivacyLevel,
  _category: NotificationCategory,
  detailedBody: string,
  summaryBody: string,
): string {
  switch (privacyLevel) {
    case 'private':
      return 'You have a new BillLens update.';
    case 'summary':
      return summaryBody;
    case 'detailed':
      return detailedBody;
    default:
      return summaryBody;
  }
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Generate a deduplication key for a notification. Two notifications
 * with the same key should NOT be delivered twice.
 *
 * The key is `${category}:${entityType}:${entityId}:${recipientProfileId}`.
 * This prevents duplicate notifications from:
 *   - Sync retries (same entity event re-triggered)
 *   - Replayed webhooks
 *   - Multiple device registrations
 *   - Local and push delivery overlap
 */
export function notificationDeduplicationKey(
  category: NotificationCategory,
  entityType: string | undefined,
  entityId: string | undefined,
  recipientProfileId: string,
): string {
  return `${category}:${entityType ?? ''}:${entityId ?? ''}:${recipientProfileId}`;
}

// ---------------------------------------------------------------------------
// Deep-link validation
// ---------------------------------------------------------------------------

/**
 * Deep-link targets for notifications (spec, Prompt 66).
 */
export type NotificationDeepLinkTarget =
  | 'group'
  | 'expense'
  | 'settlement'
  | 'conflict'
  | 'invite'
  | 'draft';

/**
 * Build a deep-link URL for a notification.
 *
 * Format: `billlens://{target}/{entityId}`
 *
 * The spec says: "Validate access after opening. Do not assume
 * notification possession grants permission."
 */
export function buildNotificationDeepLink(
  target: NotificationDeepLinkTarget,
  entityId: string,
): string {
  return `billlens://${target}/${entityId}`;
}
