/**
 * SettingsScreen tests.
 *
 * Verifies the pure presentational component renders the preference
 * groups (Appearance, Receipts, Diagnostics, Feedback, Account, About),
 * that selecting a theme or a storage mode calls the right callback,
 * and that the deep-link chevron rows navigate to the right routes.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { SettingsScreen, SettingsView } from '@presentation/screens/settings/SettingsScreen';
import type { SettingsViewModel } from '@presentation/screens/settings/SettingsScreen';
import type { StorageMode } from '@presentation/view-models/groups';
import { useCaptureStore } from '@store/capture-store';
import { useThemeStore } from '@store/theme-store';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: readonly unknown[]) => mockRouterPush(...args) },
  useFocusEffect: (cb: () => () => void) => cb,
  useLocalSearchParams: () => ({}),
}));

jest.mock('@config/app-metadata', () => ({
  __esModule: true,
  APP_METADATA: { name: 'BillLens', version: '2.2.0' },
}));

function makeViewModel(
  overrides: Partial<SettingsViewModel> = {},
): SettingsViewModel {
  return {
    themeMode: 'system',
    defaultStorageMode: 'local_only',
    pendingSyncCount: 0,
    hasFailedSync: false,
  failedSyncCount: 0,
    appVersion: '2.2.0',
    appName: 'BillLens',
    ...overrides,
  };
}

describe('SettingsView', () => {
  it('renders the section headers', () => {
    const vm = makeViewModel();
    const { getByText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={() => {}}
        onOpenFeedback={() => {}}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Receipts')).toBeTruthy();
    expect(getByText('Sync & diagnostics')).toBeTruthy();
    expect(getByText('Feedback')).toBeTruthy();
    expect(getByText('Account')).toBeTruthy();
    expect(getByText('About')).toBeTruthy();
  });

  it('renders the three theme options with the current selection marked', () => {
    const vm = makeViewModel({ themeMode: 'dark' });
    const { getByLabelText, getAllByText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={() => {}}
        onOpenFeedback={() => {}}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    // The "Dark" row should be selected (accessibilityState.selected = true)
    const darkButton = getByLabelText('Set theme to Dark');
    expect(darkButton.props.accessibilityState.selected).toBe(true);
    // The label appears once per row
    expect(getAllByText('Dark').length).toBeGreaterThan(0);
  });

  it('calls onSelectTheme when a theme row is pressed', () => {
    const handleSelect = jest.fn<(m: 'light' | 'dark' | 'system') => void>();
    const vm = makeViewModel();
    const { getByLabelText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={(m): void => handleSelect(m)}
        onSelectStorageMode={() => {}}
        onOpenFeedback={() => {}}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('Set theme to Light'));
    expect(handleSelect).toHaveBeenCalledWith('light');
  });

  it('renders the four receipt-storage options', () => {
    const vm = makeViewModel({ defaultStorageMode: 'cloud_private' });
    const { getByLabelText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={() => {}}
        onOpenFeedback={() => {}}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    expect(getByLabelText('Set default receipt storage to Local only')).toBeTruthy();
    expect(getByLabelText('Set default receipt storage to Cloud private')).toBeTruthy();
    expect(getByLabelText('Set default receipt storage to Shared with group')).toBeTruthy();
    expect(getByLabelText('Set default receipt storage to Delete after extraction')).toBeTruthy();
  });

  it('calls onSelectStorageMode when a storage-mode row is pressed', () => {
    const handleSelect = jest.fn<(m: StorageMode) => void>();
    const vm = makeViewModel();
    const { getByLabelText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={(m): void => handleSelect(m)}
        onOpenFeedback={() => {}}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('Set default receipt storage to Delete after extraction'));
    expect(handleSelect).toHaveBeenCalledWith('delete_after_extraction');
  });

  it('renders the failed-sync warning when hasFailedSync is true', () => {
    const vm = makeViewModel({ hasFailedSync: true, failedSyncCount: 2, pendingSyncCount: 2 });
    const { getByText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={() => {}}
        onOpenFeedback={() => {}}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    expect(getByText(/2 changes need your review/)).toBeTruthy();
  });

  it('navigates to /settings/feedback when Send feedback is pressed', () => {
    const handleOpen = jest.fn();
    const vm = makeViewModel();
    const { getByLabelText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={() => {}}
        onOpenFeedback={handleOpen}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('Send feedback — opens the feedback form'));
    expect(handleOpen).toHaveBeenCalledTimes(1);
  });

  it('navigates to /settings/metrics when App health is pressed', () => {
    const handleOpen = jest.fn();
    const vm = makeViewModel();
    const { getByLabelText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={() => {}}
        onOpenFeedback={() => {}}
        onOpenMetrics={handleOpen}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('App health — opens the on-device metrics dashboard'));
    expect(handleOpen).toHaveBeenCalledTimes(1);
  });

  it('navigates to /settings/delete-account when Delete account is pressed', () => {
    const handleOpen = jest.fn();
    const vm = makeViewModel();
    const { getByLabelText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={() => {}}
        onOpenFeedback={() => {}}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={handleOpen}
      />,
    );
    fireEvent.press(getByLabelText('Delete account — opens the account deletion flow'));
    expect(handleOpen).toHaveBeenCalledTimes(1);
  });

  it('renders the app name + version in the About section', () => {
    const vm = makeViewModel({ appName: 'BillLens', appVersion: '9.9.9' });
    const { getByText } = render(
      <SettingsView
        viewModel={vm}
        onSelectTheme={() => {}}
        onSelectStorageMode={() => {}}
        onOpenFeedback={() => {}}
        onOpenMetrics={() => {}}
        onOpenSyncStatus={() => {}}
        onOpenDeleteAccount={() => {}}
      />,
    );
    expect(getByText('BillLens')).toBeTruthy();
    expect(getByText('9.9.9')).toBeTruthy();
  });
});

describe('SettingsScreen (container wiring)', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
    useThemeStore.setState({ mode: 'system' });
    useCaptureStore.setState({ defaultStorageMode: 'local_only' });
  });

  afterEach(() => {
    act(() => {
      useThemeStore.setState({ mode: 'system' });
      useCaptureStore.setState({ defaultStorageMode: 'local_only' });
    });
  });

  it('persists the theme choice via useThemeStore', () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Set theme to Dark'));
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('persists the storage-mode choice via useCaptureStore', () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Set default receipt storage to Cloud private'));
    expect(useCaptureStore.getState().defaultStorageMode).toBe('cloud_private');
  });

  it('navigates to the feedback route when Send feedback is pressed', () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Send feedback — opens the feedback form'));
    expect(mockRouterPush).toHaveBeenCalledWith('/settings/feedback');
  });

  it('navigates to the metrics route when App health is pressed', () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('App health — opens the on-device metrics dashboard'));
    expect(mockRouterPush).toHaveBeenCalledWith('/settings/metrics');
  });

  it('navigates to the delete-account route when Delete account is pressed', () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Delete account — opens the account deletion flow'));
    expect(mockRouterPush).toHaveBeenCalledWith('/settings/delete-account');
  });
});
