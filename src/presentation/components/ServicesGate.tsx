/**
 * ServicesGate — boots the application service graph once at app start.
 *
 * Mounted by `app/_layout.tsx` INSIDE the query/theme providers. On
 * mount it calls `initAppServices()` (idempotent — see
 * `src/store/services-registry.ts`) and, once the graph is ready,
 * starts the offline-sync coordinator.
 *
 * Failure policy: initialization errors are surfaced through the
 * registry (`useServicesError()`) and logged — the app still renders,
 * because every consumer of the registry is null-safe
 * (`tryGetAppServices()`); screens simply keep showing their
 * empty/loading states. A soft-fail here is preferable to blocking the
 * UI on a storage error the user cannot act on. A retry banner is
 * offered so a transient SQLite failure is recoverable without an app
 * restart.
 *
 * This component intentionally renders NO chrome of its own beyond the
 * (rare) retry banner — it is a gate, not a screen.
 */

import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Row } from '@presentation/design-system/components/Row';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useSyncStatusWatcher } from '@presentation/hooks/use-sync-status-watcher';
import {
  initAppServices,
  startSyncCoordinator,
  tryGetAppServices,
  useAppServicesReady,
  useServicesError,
} from '@store/services-registry';

/**
 * Boot the graph, then arm the offline-sync loop + restore the cloud
 * session when an auth service is wired. Idempotent.
 *
 * v2.4.0: `startSyncCoordinator` itself skips the loop when Supabase is
 * not configured (offline-first — the queue stays local and the sync
 * status screen reports "not configured" instead of manufacturing
 * permanent failures). Session restore is best-effort: an expired or
 * invalid stored session degrades to guest/offline states without
 * blocking the app.
 */
async function bootServices(): Promise<void> {
  await initAppServices();
  await startSyncCoordinator();

  const services = tryGetAppServices();
  const authService = services?.identity?.authService ?? null;
  if (authService !== null) {
    try {
      await authService.restoreSession();
    } catch (error) {
      // Best-effort restore: auth store already reflects the degraded
      // state; never block the app on a failed token refresh.
      console.warn('[ServicesGate] session restore failed:', error);
    }
  }
}

interface ServicesGateProps {
  /** The rest of the app; rendered regardless of initialization outcome. */
  readonly children: ReactNode;
}

export function ServicesGate({ children }: ServicesGateProps): JSX.Element {
  const ready = useAppServicesReady();
  const errorMessage = useServicesError();

  // v2.5.0: poll the REAL sync-queue counters into the app-state store
  // (pending / needs-review). Previously nothing wrote them, so the UI
  // claimed "All synced" even with conflicted financial operations.
  useSyncStatusWatcher();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (cancelled) return;
      try {
        await bootServices();
      } catch (error) {
        // The registry already recorded the error for the UI; log for
        // diagnostics without crashing the tree.
        console.warn('[ServicesGate] initialization failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = useCallback((): void => {
    void (async () => {
      try {
        await bootServices();
      } catch {
        // Registry holds the error; the banner stays visible.
      }
    })();
  }, []);

  return (
    <>
      {errorMessage !== null && !ready ? (
        <InitErrorBanner message={errorMessage} onRetry={handleRetry} />
      ) : null}
      {children}
    </>
  );
}

function InitErrorBanner({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): JSX.Element {
  return (
    <Stack gap="xs" align="stretch" style={{ padding: 12 }}>
      <Card elevation="sm" padding="md" accessibilityRole="alert">
        <Row gap="md" align="center">
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text variant="bodyStrong" color="primary">
              Offline storage couldn&apos;t start
            </Text>
            <Text variant="caption" color="secondary">
              Your data is safe. Some features may be unavailable until storage is ready.
            </Text>
            <Text variant="caption" color="muted">
              {message}
            </Text>
          </Stack>
          <Button
            label="Try again"
            variant="secondary"
            size="sm"
            onPress={onRetry}
            accessibilityLabel="Retry initializing offline storage"
          />
        </Row>
      </Card>
    </Stack>
  );
}
