/**
 * Sync status screen + container error-handling tests (v2.26.2).
 *
 * Regression: the container swallowed a queue/conflict load failure
 * (`catch {}`) and the action handlers could reject without surfacing
 * anything, so the screen kept showing stale counters as if sync were
 * healthy. These tests assert that:
 *   - a load failure renders an actionable error card with a retry,
 *   - retrying clears the error once the read succeeds,
 *   - an action failure is surfaced as a live-region message.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import SyncStatusRoute from '@app/settings/sync';
import { SyncStatusScreen } from '@presentation/screens/sync/SyncStatusScreen';
import { tryGetAppServices } from '@store/services-registry';

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: jest.fn() },
}));

const mockRefreshSyncStatus = jest.fn(async (): Promise<void> => undefined);

jest.mock('@store/app-state-store', () => ({
  useAppState: (
    selector: (state: {
      isOnline: boolean;
      pendingSyncCount: number;
      hasFailedSync: boolean;
      refreshSyncStatus: () => Promise<void>;
    }) => unknown,
  ) =>
    selector({
      isOnline: true,
      pendingSyncCount: 0,
      hasFailedSync: false,
      refreshSyncStatus: mockRefreshSyncStatus,
    }),
}));

jest.mock('@store/services-registry', () => ({
  __esModule: true,
  useAppServicesReady: () => true,
  tryGetAppServices: jest.fn(),
}));

const baseScreenProps = {
  failedOperations: [],
  onRetryOperation: () => undefined,
  onRetryAll: () => undefined,
  onSyncNow: () => undefined,
  syncing: false,
};

async function flushUntil(
  predicate: () => boolean,
  timeoutMs = 4_000,
): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (predicate()) return;
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for the expected screen state');
    }
  }
}

describe('SyncStatusScreen error states', () => {
  it('does not render an error card when loading succeeded', () => {
    const { queryByText } = render(<SyncStatusScreen {...baseScreenProps} />);
    expect(queryByText('Could not load sync status')).toBeNull();
  });

  it('renders a retryable error card when the queue could not be read', () => {
    const onReload = jest.fn();
    const { getByText, getByLabelText } = render(
      <SyncStatusScreen
        {...baseScreenProps}
        loadError="Could not read the sync queue."
        onReload={onReload}
      />,
    );

    expect(getByText('Could not load sync status')).toBeTruthy();
    expect(getByText('Could not read the sync queue.')).toBeTruthy();
    fireEvent.press(getByLabelText('Retry loading sync status'));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('surfaces an action failure instead of hiding it', () => {
    const { getByText } = render(
      <SyncStatusScreen {...baseScreenProps} actionError="Could not start a sync." />,
    );
    expect(getByText('Could not start a sync.')).toBeTruthy();
  });
});

describe('SyncStatusRoute error handling', () => {
  const listFailed = jest.fn<() => Promise<never[]>>();
  const listPermanentlyFailed = jest.fn<() => Promise<never[]>>();
  const requestSync = jest.fn<() => Promise<void>>();

  function makeServices(): unknown {
    return {
      sync: {
        repository: { listFailed, listPermanentlyFailed },
        conflicts: { listUnresolved: jest.fn(async () => []) },
        coordinator: {
          getDownloadError: () => null,
          requestSync,
          retryOperation: jest.fn(async () => undefined),
          resetFullSync: jest.fn(async () => undefined),
        },
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listFailed.mockResolvedValue([]);
    listPermanentlyFailed.mockResolvedValue([]);
    jest.mocked(tryGetAppServices).mockReturnValue(makeServices() as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the load error and recovers after a successful retry', async () => {
    listFailed.mockRejectedValueOnce(new Error('sync queue is locked'));

    const { getByText, getByLabelText, queryByText } = render(<SyncStatusRoute />);

    await flushUntil(() => queryByText('Could not load sync status') !== null);
    expect(getByText('sync queue is locked')).toBeTruthy();

    fireEvent.press(getByLabelText('Retry loading sync status'));
    await flushUntil(() => queryByText('Could not load sync status') === null);
    expect(listFailed).toHaveBeenCalledTimes(2);
  });

  it('surfaces a failed manual sync action', async () => {
    requestSync.mockRejectedValueOnce(new Error('relay is unreachable'));

    const { getByText, getByLabelText, queryByText } = render(<SyncStatusRoute />);
    fireEvent.press(getByLabelText('Manually trigger a sync'));

    await flushUntil(() => queryByText('relay is unreachable') !== null);
    expect(getByText('relay is unreachable')).toBeTruthy();
  });
});
