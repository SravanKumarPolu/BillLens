/**
 * useSyncStatusWatcher — keeps the app-state store's sync counters
 * honest (v2.5.0).
 *
 * Polls the REAL sync-queue counters (`countPending` /
 * `countConflicts`) into `useAppState` on an interval and refreshes
 * once when services become ready. Previously NOTHING ever wrote
 * `pendingSyncCount` / `hasFailedSync`, so the dashboard and settings
 * screens rendered "All synced" regardless of the actual queue state —
 * including when conflicted financial operations were awaiting user
 * review.
 *
 * Mounted once inside `ServicesGate` (app/_layout.tsx). The poll is
 * intentionally lightweight (two COUNT queries against the local
 * SQLite queue) and safe while offline — it never touches the network.
 */

import { useEffect } from 'react';

import { useAppState } from '@store/app-state-store';
import { useAppServicesReady } from '@store/services-registry';

/** Poll cadence for queue counters (ms). */
const SYNC_STATUS_POLL_INTERVAL_MS = 15_000;

export function useSyncStatusWatcher(): void {
  const servicesReady = useAppServicesReady();
  const refreshSyncStatus = useAppState((s) => s.refreshSyncStatus);

  useEffect(() => {
    if (!servicesReady) return;
    let cancelled = false;
    // Immediate first read — the queue may hold operations recovered
    // from a previous session.
    void refreshSyncStatus();
    const interval = setInterval(() => {
      if (cancelled) return;
      void refreshSyncStatus();
    }, SYNC_STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [servicesReady, refreshSyncStatus]);
}
