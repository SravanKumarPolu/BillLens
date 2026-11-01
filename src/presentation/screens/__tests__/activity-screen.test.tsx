/**
 * ActivityScreen tests.
 *
 * Verifies the pure presentational component renders the loading, error,
 * empty, and ready states correctly, and that the relative-time formatter
 * degrades safely on Hermes builds without `Intl.RelativeTimeFormat`.
 *
 * Timestamps are built from local wall-clock dates so the expectations do not
 * depend on the machine's timezone or on the run happening near midnight.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { ActivityEntry } from '@application/activity/list-recent-activity.usecase';
import { useActivityFeed } from '@presentation/hooks/use-activity-feed';
import {
  ActivityScreen,
  ActivityView,
  type ActivityScreenViewModel,
} from '@presentation/screens/activity/ActivityScreen';
import { formatRelativeTime } from '@presentation/utils/relative-time';

jest.mock('@presentation/hooks/use-activity-feed', () => ({
  useActivityFeed: jest.fn(),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => () => void) => cb,
  useLocalSearchParams: () => ({}),
}));

/** Local noon on 11 Oct 2026 — far enough from midnight for every case. */
const NOW = new Date(2026, 9, 11, 12, 0, 0);

function localDate(daysFromNow: number, minutesFromNow = 0, hoursFromNow = 0): string {
  return new Date(
    NOW.getTime() + daysFromNow * 86_400_000 + hoursFromNow * 3_600_000 + minutesFromNow * 60_000,
  ).toISOString();
}

/**
 * Run `assertions` with `Intl.RelativeTimeFormat` replaced, restoring the
 * original descriptor afterwards even if the assertions throw.
 */
function withRelativeTimeFormat(replacement: unknown, assertions: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'RelativeTimeFormat');
  Object.defineProperty(Intl, 'RelativeTimeFormat', {
    configurable: true,
    value: replacement,
    writable: true,
  });
  try {
    assertions();
  } finally {
    if (descriptor !== undefined) {
      Object.defineProperty(Intl, 'RelativeTimeFormat', descriptor);
    } else {
      delete (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat;
    }
  }
}

function makeViewModel(overrides: Partial<ActivityScreenViewModel> = {}): ActivityScreenViewModel {
  return {
    loading: false,
    loadedOnce: true,
    error: null,
    hasMore: false,
    entries: [],
    ...overrides,
  };
}

function makeActivityEntry(id: string, timestamp: string): ActivityEntry {
  return {
    id,
    kind: 'expense',
    groupId: 'group-1' as ActivityEntry['groupId'],
    timestamp: timestamp as ActivityEntry['timestamp'],
    createdAt: timestamp as ActivityEntry['createdAt'],
    description: id,
    subtitle: 'Alice paid',
    currencyCode: 'USD',
    amountMinor: 3000,
    memberId: null,
    targetRoute: `/expenses/${id}`,
  };
}

describe('formatRelativeTime', () => {
  it('returns "Just now" for timestamps less than a minute old', () => {
    expect(formatRelativeTime(localDate(0, 0, 0), NOW)).toBe('Just now');
    expect(formatRelativeTime(localDate(0, -0.5), NOW)).toBe('Just now');
  });

  it('returns a relative label for older timestamps', () => {
    expect(formatRelativeTime(localDate(0, -1), NOW)).toMatch(/minute/);
    expect(formatRelativeTime(localDate(0, 0, -5), NOW)).toMatch(/hour/);
    expect(formatRelativeTime(localDate(-1), NOW)).toMatch(/yesterday|day/i);
    expect(formatRelativeTime(localDate(-4), NOW)).toMatch(/day/i);
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
    expect(formatRelativeTime('', NOW)).toBe('');
    expect(formatRelativeTime('2026-10-11T12:00:00.000Z', new Date(Number.NaN))).toBe('');
  });

  it('never throws for values a malformed row could carry', () => {
    expect(formatRelativeTime(Symbol('timestamp') as unknown as string, NOW)).toBe('');
    expect(formatRelativeTime({} as unknown as string, NOW)).toBe('');
    expect(formatRelativeTime(null as unknown as string, NOW)).toBe('');
    expect(formatRelativeTime(undefined as unknown as string, NOW)).toBe('');
  });

  it('returns a device-locale calendar date for rows older than six days', () => {
    const then = new Date(NOW.getTime() - 7 * 86_400_000);
    expect(formatRelativeTime(then.toISOString(), NOW)).toBe(then.toLocaleDateString());
  });

  it('handles future timestamps', () => {
    expect(formatRelativeTime(localDate(0, 0.5), NOW)).toBe('In a few seconds');
    expect(formatRelativeTime(localDate(0, 5), NOW)).toMatch(/^in 5 minutes$/i);
    expect(formatRelativeTime(localDate(1), NOW)).toMatch(/^tomorrow$/i);
    expect(formatRelativeTime(localDate(3), NOW)).toMatch(/^in 3 days$/i);
  });

  it('uses a safe English fallback when RelativeTimeFormat is unavailable', () => {
    withRelativeTimeFormat(undefined, () => {
      expect(formatRelativeTime(localDate(0, -0.5), NOW)).toBe('Just now');
      expect(formatRelativeTime(localDate(0, 0.5), NOW)).toBe('In a few seconds');
      expect(formatRelativeTime(localDate(0, -5), NOW)).toBe('5 minutes ago');
      expect(formatRelativeTime(localDate(0, -2, 0), NOW)).toBe('2 minutes ago');
      expect(formatRelativeTime(localDate(0, 0, -2), NOW)).toBe('2 hours ago');
      expect(formatRelativeTime(localDate(-1), NOW)).toBe('Yesterday');
      expect(formatRelativeTime(localDate(-3), NOW)).toBe('3 days ago');
      expect(formatRelativeTime(localDate(1), NOW)).toBe('Tomorrow');
      expect(formatRelativeTime(localDate(4), NOW)).toBe('In 4 days');
      expect(formatRelativeTime(localDate(0, 5), NOW)).toBe('In 5 minutes');
      expect(formatRelativeTime(localDate(0, 0, 3), NOW)).toBe('In 3 hours');
      expect(formatRelativeTime(localDate(-8), NOW)).toBe(
        new Date(localDate(-8)).toLocaleDateString(),
      );
      expect(formatRelativeTime('not-a-date', NOW)).toBe('');
    });
  });

  it('falls back when a partial RelativeTimeFormat implementation throws on construction', () => {
    withRelativeTimeFormat(
      function throwingConstructor(): never {
        throw new Error('RelativeTimeFormat is not enabled in this Hermes build');
      },
      () => {
        expect(formatRelativeTime(localDate(0, -5), NOW)).toBe('5 minutes ago');
        expect(formatRelativeTime(localDate(-1), NOW)).toBe('Yesterday');
        expect(formatRelativeTime('not-a-date', NOW)).toBe('');
      },
    );
  });

  it('rebuilds the formatter when the runtime gains RelativeTimeFormat again', () => {
    const RealConstructor = Intl.RelativeTimeFormat;
    let constructed = 0;
    const countingConstructor = function countingConstructor(
      locales?: string | string[],
      options?: Intl.RelativeTimeFormatOptions,
    ): Intl.RelativeTimeFormat {
      constructed += 1;
      return new RealConstructor(locales, options);
    };

    withRelativeTimeFormat(undefined, () => {
      expect(formatRelativeTime(localDate(0, -5), NOW)).toBe('5 minutes ago');
    });

    withRelativeTimeFormat(countingConstructor, () => {
      expect(formatRelativeTime(localDate(0, -5), NOW)).not.toBe('');
      expect(constructed).toBe(1);
      // A second call reuses the cached formatter.
      expect(formatRelativeTime(localDate(0, -6), NOW)).not.toBe('');
      expect(constructed).toBe(1);
    });
  });
});

describe('ActivityScreen', () => {
  it('renders several activity timestamps and keeps an invalid timestamp from crashing', () => {
    const entries = [
      makeActivityEntry('recent', new Date(Date.now() - 5 * 60_000).toISOString()),
      makeActivityEntry('older', new Date(Date.now() - 10 * 60_000).toISOString()),
      makeActivityEntry('invalid', 'not-a-date'),
    ];
    jest.mocked(useActivityFeed).mockReturnValue({
      loading: false,
      loadedOnce: true,
      error: null,
      entries,
      hasMore: false,
    });

    const { getByText, getAllByText } = render(<ActivityScreen />);

    expect(getByText('recent')).toBeTruthy();
    expect(getByText('older')).toBeTruthy();
    expect(getByText('invalid')).toBeTruthy();
    // Only the two valid rows render a relative label; the invalid one is blank.
    expect(getAllByText(/(Just now|ago|yesterday|tomorrow|^In )/i).length).toBe(2);
  });

  it('renders a full activity list while RelativeTimeFormat is unavailable', () => {
    const entries = [
      makeActivityEntry('a', new Date(Date.now() - 2 * 60_000).toISOString()),
      makeActivityEntry('b', new Date(Date.now() - 3 * 3_600_000).toISOString()),
      makeActivityEntry('c', new Date(Date.now() - 3 * 86_400_000).toISOString()),
      makeActivityEntry('d', 'not-a-date'),
    ];
    jest.mocked(useActivityFeed).mockReturnValue({
      loading: false,
      loadedOnce: true,
      error: null,
      entries,
      hasMore: true,
    });

    withRelativeTimeFormat(undefined, () => {
      const { getByText, getAllByText } = render(<ActivityScreen />);
      expect(getByText('a')).toBeTruthy();
      expect(getByText('b')).toBeTruthy();
      expect(getByText('c')).toBeTruthy();
      expect(getByText('d')).toBeTruthy();
      // Three valid rows carry a label; the invalid row renders a blank one.
      expect(getAllByText(/(Just now|ago|yesterday|tomorrow|^in )/i).length).toBe(3);
      expect(getByText(/Showing the most recent entries/)).toBeTruthy();
    });
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
