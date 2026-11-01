/**
 * Sync status route (v2.5.0, extended v2.6.0 for bidirectional sync).
 *
 * The `SyncStatusScreen` existed since Phase 7 but had NO route and no
 * container — the screen was unreachable, and nothing surfaced the
 * queue's pending/failed state (the dashboard even mislabeled pending
 * ops as "failed"). This container wires the REAL sync repository +
 * coordinator + (v2.6.0) the download half:
 *
 *   - Needs-review operations come from `listFailed` /
 *     `listPermanentlyFailed` on the sync repository.
 *   - v2.6.0: unresolved REMOTE CONFLICTS (a remote change racing a
 *     local edit) come from the sync conflict repository and are
 *     resolved through `ResolveRemoteConflictUseCase` — the local edit
 *     is re-based onto the cloud version (keep mine) or the cloud
 *     payload is applied and stale ops cancelled (use cloud).
 *   - v2.6.0: the last DOWNLOAD error is surfaced honestly instead of
 *     hiding pull failures behind upload state.
 *   - v2.6.0: "Full re-sync" resets the download cursors (a replay-safe
 *     full re-download) and triggers a fresh run.
 *   - Retry / retry-all / sync-now call the `SyncCoordinator` (the
 *     ONLY component allowed to drive sync runs).
 *   - When Supabase is not configured the screen is still reachable and
 *     reports the queue honestly ("not configured — changes stay on
 *     this device") instead of manufacturing failures.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { ResolveRemoteConflictUseCase } from '@application/sync/resolve-remote-conflict.usecase';
import { SyncStatusScreen } from '@presentation/screens/sync/SyncStatusScreen';
import type {
  FailedSyncOperationViewModel,
  RemoteConflictViewModel,
} from '@presentation/screens/sync/SyncStatusScreen';
import { useAppState } from '@store/app-state-store';
import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

const ENTITY_LABELS: Record<string, string> = {
  group: 'group details',
  group_member: 'a member',
  group_invite: 'an invite',
  expense: 'an expense',
  expense_payer: 'who paid',
  expense_split: 'a share',
  settlement: 'a settlement',
};

function conflictSummary(entityType: string, localVersion: number, cloudVersion: number): string {
  const label = ENTITY_LABELS[entityType] ?? entityType;
  return `Your ${label} (v${localVersion}) differs from the cloud version (v${cloudVersion}).`;
}

export default function SyncStatusRoute(): ReactNode {
  const servicesReady = useAppServicesReady();
  const refreshSyncStatus = useAppState((s) => s.refreshSyncStatus);
  const [failedOperations, setFailedOperations] = useState<
    readonly FailedSyncOperationViewModel[]
  >([]);
  const [remoteConflicts, setRemoteConflicts] = useState<readonly RemoteConflictViewModel[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadFailed = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) return;
    try {
      const failed = await services.sync.repository.listFailed(50);
      const permanent = await services.sync.repository.listPermanentlyFailed(50);
      const viewModels: FailedSyncOperationViewModel[] = [...failed, ...permanent]
        .map((op) => ({
          id: op.id,
          entityType: op.entityType as string,
          operation: op.operation as string,
          errorMessage:
            op.lastErrorMessage ??
            op.lastErrorCode ??
            'This change could not be uploaded yet.',
          retryCount: op.retryCount,
        }));
      setFailedOperations(viewModels);

      // v2.6.0: unresolved download-side conflicts + the last download
      // error — the honest full picture of the bidirectional sync.
      const unresolved = await services.sync.conflicts.listUnresolved(50);
      setRemoteConflicts(
        unresolved
          .map((c) => ({
            id: c.id,
            entityType: c.entityType as string,
            entityId: c.entityId,
            summary: conflictSummary(c.entityType as string, c.localVersion, c.cloudVersion),
          })),
      );
      setDownloadError(services.sync.coordinator.getDownloadError()?.errorMessage ?? null);

      await refreshSyncStatus();
    } catch {
      // Counters stay as-is; the screen still renders.
    }
  }, [refreshSyncStatus]);

  useEffect(() => {
    if (!servicesReady) return;
    void loadFailed();
  }, [servicesReady, loadFailed]);

  const handleRetryOperation = useCallback(
    (operationId: string): void => {
      const services = tryGetAppServices();
      if (services === null) return;
      void (async () => {
        setSyncing(true);
        try {
          await services.sync.coordinator.retryOperation(operationId);
        } finally {
          setSyncing(false);
          await loadFailed();
        }
      })();
    },
    [loadFailed],
  );

  const handleRetryAll = useCallback((): void => {
    const services = tryGetAppServices();
    if (services === null) return;
    void (async () => {
      setSyncing(true);
      try {
        for (const op of failedOperations) {
          await services.sync.repository.resetForRetry(op.id);
        }
        await services.sync.coordinator.requestSync('user_retry');
      } finally {
        setSyncing(false);
        await loadFailed();
      }
    })();
  }, [failedOperations, loadFailed]);

  const handleSyncNow = useCallback((): void => {
    const services = tryGetAppServices();
    if (services === null) return;
    void (async () => {
      setSyncing(true);
      try {
        await services.sync.coordinator.requestSync('manual');
      } finally {
        setSyncing(false);
        await loadFailed();
      }
    })();
  }, [loadFailed]);

  // v2.6.0 — resolve a remote conflict with the user's decision.
  const handleResolveConflict = useCallback(
    (conflictId: string, resolution: 'keep_local' | 'keep_cloud'): void => {
      const services = tryGetAppServices();
      if (services === null) return;
      void (async () => {
        setSyncing(true);
        try {
          // Resolve on the SAME applier instance the engine uses.
          const useCase = new ResolveRemoteConflictUseCase(
            services.sync.resolveApplier,
            services.sync.conflicts,
          );
          await useCase.execute({ conflictId, resolution, resolvedBy: 'local-user' as never });
          if (resolution === 'keep_local') {
            // The re-based upload should go out promptly.
            await services.sync.coordinator.requestSync('user_retry');
          }
        } finally {
          setSyncing(false);
          await loadFailed();
        }
      })();
    },
    [loadFailed],
  );

  // v2.6.0 — full re-sync: reset cursors, then a fresh run re-downloads
  // everything (replay-safe; applying is version-guarded).
  const handleFullResync = useCallback((): void => {
    const services = tryGetAppServices();
    if (services === null) return;
    void (async () => {
      setSyncing(true);
      try {
        await services.sync.coordinator.resetFullSync();
        await services.sync.coordinator.requestSync('manual');
      } finally {
        setSyncing(false);
        await loadFailed();
      }
    })();
  }, [loadFailed]);

  return (
    <SyncStatusScreen
      failedOperations={failedOperations}
      onRetryOperation={handleRetryOperation}
      onRetryAll={handleRetryAll}
      onSyncNow={handleSyncNow}
      syncing={syncing}
      remoteConflicts={remoteConflicts}
      onResolveConflict={handleResolveConflict}
      onFullResync={handleFullResync}
      downloadError={downloadError}
      onClose={() => router.back()}
    />
  );
}
