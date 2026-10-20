/**
 * ExpoConnectivityPort — concrete implementation of ConnectivityPort.
 *
 * Uses `fetch` to poll a lightweight endpoint for connectivity
 * detection. Falls back gracefully when `NetInfo` is not available.
 *
 * In a production React Native app, this would use
 * `@react-native-community/netinfo` for event-based connectivity
 * changes. For now, we poll every 30 seconds and also expose a
 * manual check method.
 *
 * The port also writes to the `app-state-store` so that
 * `OfflineBanner` and `SyncStatusIndicator` reflect the real
 * connectivity state.
 */

import type { ConnectivityPort } from '@application/sync/sync-coordinator-types';
import { useAppState } from '@store/app-state-store';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const CONNECTIVITY_CHECK_URL = 'https://www.google.com/generate_204';

export class ExpoConnectivityPort implements ConnectivityPort {
  private listeners: ((online: boolean) => void)[] = [];
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastOnline = true;

  async isOnline(): Promise<boolean> {
    try {
      const response = await fetch(CONNECTIVITY_CHECK_URL, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  }

  onConnectivityChange(callback: (online: boolean) => void): () => void {
    this.listeners.push(callback);

    // Start polling if not already
    if (this.pollInterval === null) {
      this.startPolling();
    }

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
      if (this.listeners.length === 0) {
        this.stopPolling();
      }
    };
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      const online = await this.isOnline();
      if (online !== this.lastOnline) {
        this.lastOnline = online;
        // Update the app-state store so OfflineBanner reflects reality
        useAppState.getState().setIsOnline(online);
        // Notify all listeners
        for (const listener of this.listeners) {
          listener(online);
        }
      }
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

/**
 * Singleton instance — the app should use this one.
 */
export const expoConnectivityPort = new ExpoConnectivityPort();
