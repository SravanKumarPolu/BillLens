/**
 * Hermetic default for {@link LocalNotificationPort}.
 *
 * The composition root must stay unit-testable without React Native or
 * Expo native modules (see its header rules), so the default capability
 * reports "unsupported" instead of importing `expo-notifications`. The
 * production bootstrap (`src/store/services-registry.ts`) injects
 * `ExpoLocalNotificationPort` — the only place that is allowed to load
 * the native package.
 *
 * The reminder decision still runs and is still persisted in SQLite:
 * this adapter only removes the ability to *present* it.
 */

import type {
  LocalNotificationPort,
  LocalNotificationRequest,
  LocalNotificationScheduleResult,
  NotificationAvailability,
  NotificationPermissionState,
  ScheduledLocalNotification,
} from '@application/notifications/notification-capability.port';

export class UnavailableLocalNotificationPort implements LocalNotificationPort {
  availability(): NotificationAvailability {
    return 'unsupported';
  }

  async permission(): Promise<NotificationPermissionState> {
    return 'unavailable';
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    return 'unavailable';
  }

  async ensureChannel(): Promise<void> {}

  async listScheduled(): Promise<readonly ScheduledLocalNotification[]> {
    return [];
  }

  async schedule(_request: LocalNotificationRequest): Promise<LocalNotificationScheduleResult> {
    return 'unavailable';
  }

  async cancel(_identifier: string): Promise<void> {}
}
