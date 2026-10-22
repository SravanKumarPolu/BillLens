/**
 * Expo implementation of {@link LocalNotificationPort}.
 *
 * Design rules:
 *
 *   1. **Never import in Expo Go.** The package entry point requires the
 *      `ExpoTopicSubscriptionModule` native module at evaluation time,
 *      which Expo Go does not ship. `availability()` short-circuits before
 *      the dynamic import, so the module is not even fetched there.
 *   2. **Feature-detect, do not assume.** Between a JS bundle update and a
 *      native build, a method can be missing. Every call checks the
 *      function exists and degrades to `unavailable` instead of throwing
 *      `undefined is not a function`.
 *   3. **Total functions.** No method rejects; failures are reported as a
 *      state (and logged without payload data).
 */

import { Platform } from 'react-native';

import type {
  LocalNotificationPort,
  LocalNotificationRequest,
  LocalNotificationScheduleResult,
  NotificationAvailability,
  NotificationPermissionState,
  ScheduledLocalNotification,
} from '@application/notifications/notification-capability.port';

import { detectNotificationRuntime, type NotificationRuntime } from './notification-runtime';

type NotificationsModule = typeof import('expo-notifications');

/** Injectable for tests — production uses the real dynamic import. */
export type NotificationsModuleLoader = () => Promise<NotificationsModule>;

/** Android channel id — also referenced by `app.config.ts`. */
export const REMINDER_CHANNEL_ID = 'billlens-reminders';

export interface ExpoLocalNotificationPortOptions {
  /** Override runtime detection (tests). */
  readonly runtime?: NotificationRuntime;
  /** Override the module loader (tests). */
  readonly loadModule?: NotificationsModuleLoader;
}

const defaultLoader: NotificationsModuleLoader = () => import('expo-notifications');

export class ExpoLocalNotificationPort implements LocalNotificationPort {
  private readonly runtime: NotificationRuntime;
  private readonly loadModule: NotificationsModuleLoader;
  private modulePromise: Promise<NotificationsModule | null> | null = null;

  constructor(options: ExpoLocalNotificationPortOptions = {}) {
    this.runtime = options.runtime ?? detectNotificationRuntime();
    this.loadModule = options.loadModule ?? defaultLoader;
  }

  availability(): NotificationAvailability {
    if (this.runtime === 'expo-go') return 'expo-go';
    if (this.runtime === 'web') return 'unsupported';
    return 'available';
  }

  async permission(): Promise<NotificationPermissionState> {
    const module = await this.load();
    if (module === null || typeof module.getPermissionsAsync !== 'function') {
      return 'unavailable';
    }
    try {
      const settings = await module.getPermissionsAsync();
      if (settings.granted) return 'granted';
      return settings.canAskAgain === false ? 'denied' : 'undetermined';
    } catch (error) {
      this.warn('could not read notification permission', error);
      return 'unavailable';
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    const module = await this.load();
    if (module === null || typeof module.requestPermissionsAsync !== 'function') {
      return 'unavailable';
    }
    try {
      const settings = await module.requestPermissionsAsync();
      if (settings.granted) return 'granted';
      return settings.canAskAgain === false ? 'denied' : 'undetermined';
    } catch (error) {
      this.warn('could not request notification permission', error);
      return 'unavailable';
    }
  }

  async ensureChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    const module = await this.load();
    if (module === null || typeof module.setNotificationChannelAsync !== 'function') return;
    try {
      const importance = module.AndroidImportance?.DEFAULT ?? 3;
      await module.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: 'BillLens reminders',
        description: 'A daily nudge when a group balance is still open.',
        importance,
        showBadge: false,
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch (error) {
      // A missing channel only affects presentation, never correctness.
      this.warn('could not create the Android notification channel', error);
    }
  }

  async listScheduled(): Promise<readonly ScheduledLocalNotification[]> {
    const module = await this.load();
    if (module === null || typeof module.getAllScheduledNotificationsAsync !== 'function') {
      return [];
    }
    try {
      const scheduled = await module.getAllScheduledNotificationsAsync();
      return scheduled.map((entry) => ({
        identifier: entry.identifier,
        title: String(entry.content?.title ?? ''),
        body: String(entry.content?.body ?? ''),
      }));
    } catch (error) {
      this.warn('could not read scheduled notifications', error);
      return [];
    }
  }

  async schedule(request: LocalNotificationRequest): Promise<LocalNotificationScheduleResult> {
    const module = await this.load();
    if (module === null || typeof module.scheduleNotificationAsync !== 'function') {
      return 'unavailable';
    }
    try {
      await module.scheduleNotificationAsync({
        identifier: request.identifier,
        content: {
          title: request.title,
          body: request.body,
          ...(request.data !== undefined ? { data: request.data } : {}),
        },
        // `type: 'timeInterval'` is the SDK 57 trigger discriminant. The
        // literal is used instead of the runtime enum so an incomplete
        // module namespace cannot turn this into `undefined`.
        trigger: {
          type: 'timeInterval',
          seconds: Math.max(1, Math.round(request.seconds)),
          repeats: true,
          channelId: REMINDER_CHANNEL_ID,
        } as never,
      });
      return 'scheduled';
    } catch (error) {
      this.warn('could not schedule the reminder', error);
      return 'unavailable';
    }
  }

  async cancel(identifier: string): Promise<void> {
    const module = await this.load();
    if (module === null || typeof module.cancelScheduledNotificationAsync !== 'function') {
      return;
    }
    try {
      await module.cancelScheduledNotificationAsync(identifier);
    } catch (error) {
      // Cancelling a notification that is not scheduled is not an error.
      this.warn('could not cancel the reminder', error);
    }
  }

  /**
   * Lazily evaluate `expo-notifications` exactly once per runtime.
   *
   * Returns null when the module is not allowed here, is not installed, or
   * does not expose the local-notification API. The negative result is
   * cached so a broken build cannot pay the cost on every call.
   */
  private async load(): Promise<NotificationsModule | null> {
    if (this.availability() !== 'available') return null;
    if (this.modulePromise === null) {
      this.modulePromise = this.loadModule()
        .then((module) => {
          if (typeof module.scheduleNotificationAsync !== 'function') {
            return null;
          }
          this.configureForegroundHandler(module);
          return module;
        })
        .catch((error: unknown) => {
          this.warn('native notification module unavailable', error);
          return null;
        });
    }
    return this.modulePromise;
  }

  private configureForegroundHandler(module: NotificationsModule): void {
    if (typeof module.setNotificationHandler !== 'function') return;
    try {
      module.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    } catch (error) {
      this.warn('could not install the foreground handler', error);
    }
  }

  private warn(message: string, error: unknown): void {
    console.warn(
      `[Notifications] ${message}:`,
      error instanceof Error ? error.message : 'unknown',
    );
  }
}
