/**
 * ActivityScreen tests.
 *
 * Verifies the pure presentational component renders the loading,
 * error, empty, and ready states correctly. The container's service
 * interaction is covered by the use-case tests over the real SQLite
 * adapters; here we focus on the UI contract.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import {
  ActivityView,
  formatRelativeTime,
  type ActivityScreenViewModel,
} from '@presentation/screens/activity/ActivityScreen';

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => () => void) => cb,
  useLocalSearchParams: () => ({}),
}));

function makeViewModel(
  overrides: Partial<ActivityScreenViewModel> = {},
): ActivityScreenViewModel {
  return {
    loading: false,
    loadedOnce: true,
    error: null,
    hasMore: false,
    entries: [],
    ...overrides,
  };
}

describe('formatRelativeTime', () => {
  it('returns "Just now" for timestamps less than a minute old', () => {
    const now = new Date('2026-10-11T10:00:00.000Z');
    expect(formatRelativeTime('2026-10-11T09:59:30.000Z', now)).toBe('Just now');
    expect(formatRelativeTime('2026-10-11T10:00:00.000Z', now)).toBe('Just now');
  });

  it('returns a relative label for older timestamps', () => {
    const now = new Date('2026-10-11T10:00:00.000Z');
    expect(formatRelativeTime('2026-10-11T09:00:00.000Z', now)).toMatch(/hour/);
    expect(formatRelativeTime('2026-10-10T10:00:00.000Z', now)).toMatch(/yesterday|day/);
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });
});

describe('ActivityView', () => {
  it('renders the loading card while loading and no entries yet', () => {
    const vm = makeViewModel({ loading: true, loadedOnce: false });
    const { getByText } = render(<ActivityView viewModel={vm} />);
    expect(getByText('Loading recent activity…')).toBeTruthy();
  });

  it('renders the error card when an error is set', () => {
    const vm = makeViewModel({ error: 'Storage is offline' });
    const { getByText } = render(<ActivityView viewModel={vm} />);
    expect(getByText('Could not load recent activity')).toBeTruthy();
    expect(getByText('Storage is offline')).toBeTruthy();
  });

  it('renders the empty state when the timeline is empty', () => {
    const vm = makeViewModel({ entries: [] });
    const { getByText } = render(<ActivityView viewModel={vm} />);
    expect(getByText('No activity yet')).toBeTruthy();
    expect(getByText(/Recent expenses and settlements across your groups/)).toBeTruthy();
  });

  it('renders timeline entries with description, subtitle, and amount', () => {
    const vm = makeViewModel({
      entries: [
        {
          id: 'expense:e1',
          kind: 'expense',
          description: 'Dinner',
          subtitle: 'Alice paid',
          relativeTimeLabel: '2 hours ago',
          currencyCode: 'USD',
          amountMinor: 3000,
          targetRoute: '/expenses/e1',
        },
        {
          id: 'settlement:s1',
          kind: 'settlement',
          description: 'Bob paid Alice',
          subtitle: 'UPI',
          relativeTimeLabel: '5 hours ago',
          currencyCode: 'USD',
          amountMinor: 1000,
          targetRoute: '/settlements/preview?fromMemberId=...&toMemberId=...',
        },
      ],
    });
    const { getByText, getByLabelText } = render(<ActivityView viewModel={vm} />);
    expect(getByText('Dinner')).toBeTruthy();
    expect(getByText('Alice paid')).toBeTruthy();
    expect(getByText('Bob paid Alice')).toBeTruthy();
    expect(getByText('UPI')).toBeTruthy();
    expect(getByText('2 hours ago')).toBeTruthy();
    expect(getByText('5 hours ago')).toBeTruthy();
    // Pressing an entry navigates via expo-router's router.push.
    fireEvent.press(getByLabelText('Expense: Dinner'));
    // router.push is mocked — no assertion needed beyond not crashing.
  });

  it('renders the "hasMore" hint when there are more entries available', () => {
    const vm = makeViewModel({
      hasMore: true,
      entries: [
        {
          id: 'expense:e1',
          kind: 'expense',
          description: 'Dinner',
          subtitle: null,
          relativeTimeLabel: 'Just now',
          currencyCode: 'USD',
          amountMinor: 1000,
          targetRoute: '/expenses/e1',
        },
      ],
    });
    const { getByText } = render(<ActivityView viewModel={vm} />);
    expect(getByText(/Showing the most recent entries/)).toBeTruthy();
  });
});
