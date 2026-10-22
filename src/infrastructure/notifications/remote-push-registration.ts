/**
 * Remote push registration — deliberately separate from local reminders,
 * and deliberately off by default.
 *
 * BillLens is local-first: nothing here runs at startup, and nothing here
 * runs unless a caller explicitly opts in *and* the runtime can support it:
 *
 *   - web                      → `unsupported-platform`
 *   - Expo Go                  → `expo-go` (never imports the package)
 *   - build without EAS project → `not-configured`
 *   - caller passed `enabled: false` (the default at the call site)
 *                              → `disabled`
 *
 * The import is dynamic so `expo-notifications` is never evaluated on a
 * path that cannot support it. In Expo Go on Android the package entry
 * point itself throws (missing `ExpoTopicSubscriptionModule`), which is
 * why a `try/catch` around a static import would be too late.
 */

import Constants from 'expo-constants';

import type {
  RemotePushPort,
  RemotePushRegistration,
} from '@application/notifications/notification-capability.port';

import { detectNotificationRuntime, type NotificationRuntime } from './notification-runtime';

type NotificationsModule = typeof import('expo-notifications');

export interface ExpoRemotePushOptions {
  /** Override runtime detection (tests). */
  readonly runtime?: NotificationRuntime;
  /** Override the module loader (tests). */
  readonly loadModule?: () => Promise<NotificationsModule>;
  /** Override the EAS project id (tests); defaults to the app config. */
  readonly projectId?: string | null;
}

const defaultLoader = (): Promise<NotificationsModule> => import('expo-notifications');

export class ExpoRemotePushRegistration implements RemotePushPort {
  private readonly runtime: NotificationRuntime;
  private readonly loadModule: () => Promise<NotificationsModule>;
  private readonly projectId: string | null;

  constructor(options: ExpoRemotePushOptions = {}) {
    this.runtime = options.runtime ?? detectNotificationRuntime();
    this.loadModule = options.loadModule ?? defaultLoader;
    this.projectId = options.projectId ?? readProjectId();
  }

  async register(options: { readonly enabled: boolean }): Promise<RemotePushRegistration> {
    if (!options.enabled) return { status: 'disabled' };
    if (this.runtime === 'web') return { status: 'unsupported-platform' };
    if (this.runtime === 'expo-go') return { status: 'expo-go' };
    if (this.projectId === null) return { status: 'not-configured' };

    let module: NotificationsModule;
    try {
      module = await this.loadModule();
    } catch (error) {
      console.warn(
        '[Notifications] push module unavailable:',
        error instanceof Error ? error.message : 'unknown',
      );
      return { status: 'error' };
    }

    if (
      typeof module.getExpoPushTokenAsync !== 'function' ||
      typeof module.getPermissionsAsync !== 'function'
    ) {
      return { status: 'error' };
    }

    try {
      const settings = await module.getPermissionsAsync();
      if (!settings.granted) return { status: 'denied' };
      const token = await module.getExpoPushTokenAsync({ projectId: this.projectId });
      return { status: 'registered', token: token.data };
    } catch (error) {
      console.warn(
        '[Notifications] push registration failed:',
        error instanceof Error ? error.message : 'unknown',
      );
      return { status: 'error' };
    }
  }
}

function readProjectId(): string | null {
  try {
    const fromConfig = Constants.expoConfig?.extra?.['eas'] as
      | { readonly projectId?: unknown }
      | undefined;
    if (typeof fromConfig?.projectId === 'string' && fromConfig.projectId.length > 0) {
      return fromConfig.projectId;
    }
    const easConfig = Constants.easConfig as { readonly projectId?: unknown } | null;
    if (typeof easConfig?.projectId === 'string' && easConfig.projectId.length > 0) {
      return easConfig.projectId;
    }
  } catch {
    // No app config available (unit harness) — push stays not configured.
  }
  return null;
}
