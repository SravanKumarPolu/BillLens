/**
 * Which runtime is this JavaScript bundle executing in?
 *
 * `expo-notifications` must never be evaluated inside Expo Go on Android:
 * its package entry point eagerly re-exports `topicSubscription`, which
 * calls `requireNativeModule('ExpoTopicSubscriptionModule')`. That native
 * module is not part of the Expo Go binary (remote push was removed from
 * Expo Go with SDK 53), so the import itself throws before any API call —
 * a `try/catch` around the call cannot help, only avoiding the import can.
 *
 * `Constants.expoGoConfig` is populated exclusively inside Expo Go, which
 * distinguishes it from a development build (`expo-dev-client`) — both
 * report `executionEnvironment === 'storeClient'`, so that value alone is
 * not enough.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type NotificationRuntime = 'web' | 'expo-go' | 'native-build';

export function detectNotificationRuntime(): NotificationRuntime {
  if (Platform.OS === 'web') return 'web';
  try {
    if (String(Constants.appOwnership) === 'expo') return 'expo-go';
    if (Constants.expoGoConfig != null) return 'expo-go';
  } catch {
    // `expo-constants` is unavailable (bare unit harness). Treat it as a
    // native build: the adapter feature-detects the module anyway.
  }
  return 'native-build';
}
