/**
 * Home dashboard tests (Prompt 15).
 *
 * Two test layers:
 *   1. View-model unit tests — pure logic, no rendering. Covers the
 *      greeting, balance grouping, and empty-state derivations.
 *   2. Component tests — render `HomeDashboardView` with a synthetic
 *      view model and assert the visible output (greeting, balance
 *      cards, pending actions, empty state).
 *
 * `expo-router` is mocked so the dashboard can call `router.push`
 * without a real navigation host.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';


import { HomeDashboardScreen, HomeDashboardView } from '@presentation/screens/home/HomeDashboardScreen';
import {
  type HomeDashboardInput,
  type HomeDashboardViewModel,
  createHomeDashboardViewModel,
  greetingForHour,
} from '@presentation/view-models/home-dashboard';
import { useGroupStore, type GroupSummary } from '@store/group-store';
import { useGuestStore } from '@store/guest-store';
import { useNavigationStore } from '@store/navigation-store';

// Mock expo-router. The factory may only reference variables whose
// names start with `mock` (jest hoists `jest.mock()` above imports).
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: readonly unknown[]) => mockRouterPush(...args),
  },
  useFocusEffect: (cb: () => () => void) => cb,
  useLocalSearchParams: () => ({}),
}));

/** Build a view model from a partial input — sensible defaults for missing fields. */
function buildViewModel(overrides: Partial<HomeDashboardInput> = {}): HomeDashboardViewModel {
  const defaults: HomeDashboardInput = {
    displayName: 'Priya',
    balances: [],
    balancesUnavailable: false,
    degradedGroupCount: 0,
    recentGroups: [],
    pendingActions: [],
    hasPendingDrafts: false,
    pendingDraftCount: 0,
    hasFailedSync: false,
    failedSyncCount: 0,
    hourOfDay: 9,
  };
  return createHomeDashboardViewModel({ ...defaults, ...overrides });
}

/** Wrap children in the providers the design system expects. */
function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  return render(ui);
}

// ---------------------------------------------------------------------------
// View-model unit tests.
// ---------------------------------------------------------------------------

describe('createHomeDashboardViewModel', () => {
  beforeEach(() => {
    useGuestStore.getState().reset();
    useNavigationStore.setState({ onboardingComplete: false, hasUnsavedDraftChanges: false });
  });

  describe('greeting', () => {
    it('returns "Good morning" before noon', () => {
      const vm = buildViewModel({ hourOfDay: 9 });
      expect(vm.greeting).toBe('Good morning');
    });

    it('returns "Good afternoon" between noon and 5pm', () => {
      const vm = buildViewModel({ hourOfDay: 15 });
      expect(vm.greeting).toBe('Good afternoon');
    });

    it('returns "Good evening" after 5pm', () => {
      const vm = buildViewModel({ hourOfDay: 20 });
      expect(vm.greeting).toBe('Good evening');
    });

    it('handles midnight (hour 0) as morning', () => {
      expect(greetingForHour(0)).toBe('Good morning');
    });

    it('handles noon (hour 12) as afternoon', () => {
      expect(greetingForHour(12)).toBe('Good afternoon');
    });

    it('handles 11pm (hour 23) as evening', () => {
      expect(greetingForHour(23)).toBe('Good evening');
    });
  });

  describe('empty state', () => {
    it('reports all settled up when balances are empty', () => {
      const vm = buildViewModel({ balances: [] });
      expect(vm.isAllSettledUp).toBe(true);
      expect(vm.owedByCurrency).toHaveLength(0);
      expect(vm.owedToCurrency).toHaveLength(0);
    });

    it('reports all settled up when every balance is zero', () => {
      const vm = buildViewModel({
        balances: [
          { currencyCode: 'USD', amountMinor: 0 },
          { currencyCode: 'EUR', amountMinor: 0 },
        ],
      });
      expect(vm.isAllSettledUp).toBe(true);
    });

    it('reports no groups when recentGroups is empty', () => {
      const vm = buildViewModel({ recentGroups: [] });
      expect(vm.hasNoGroups).toBe(true);
    });

    it('reports no pending actions when pendingActions is empty', () => {
      const vm = buildViewModel({ pendingActions: [] });
      expect(vm.hasPendingActions).toBe(false);
    });
  });

  describe('balance grouping', () => {
    it('groups positive balances into owedByCurrency', () => {
      const vm = buildViewModel({
        balances: [
          { currencyCode: 'USD', amountMinor: 1250 },
          { currencyCode: 'EUR', amountMinor: 5000 },
        ],
      });
      expect(vm.owedByCurrency).toEqual([
        { currencyCode: 'USD', amountMinor: 1250 },
        { currencyCode: 'EUR', amountMinor: 5000 },
      ]);
      expect(vm.owedToCurrency).toHaveLength(0);
      expect(vm.isAllSettledUp).toBe(false);
    });

    it('groups negative balances into owedToCurrency with absolute values', () => {
      const vm = buildViewModel({
        balances: [{ currencyCode: 'USD', amountMinor: -750 }],
      });
      expect(vm.owedToCurrency).toEqual([{ currencyCode: 'USD', amountMinor: 750 }]);
      expect(vm.owedByCurrency).toHaveLength(0);
      expect(vm.isAllSettledUp).toBe(false);
    });

    it('keeps positive and negative balances separate per currency', () => {
      const vm = buildViewModel({
        balances: [
          { currencyCode: 'USD', amountMinor: 1250 },
          { currencyCode: 'EUR', amountMinor: -500 },
          { currencyCode: 'JPY', amountMinor: 0 },
        ],
      });
      expect(vm.owedByCurrency).toEqual([{ currencyCode: 'USD', amountMinor: 1250 }]);
      expect(vm.owedToCurrency).toEqual([{ currencyCode: 'EUR', amountMinor: 500 }]);
      expect(vm.isAllSettledUp).toBe(false);
    });
  });

  describe('pending drafts / sync', () => {
    it('clamps negative draft counts to zero', () => {
      const vm = buildViewModel({ hasPendingDrafts: true, pendingDraftCount: -3 });
      expect(vm.pendingDraftCount).toBe(0);
    });

    it('passes through the failed-sync flag and count', () => {
      const vm = buildViewModel({ hasFailedSync: true, failedSyncCount: 2 });
      expect(vm.hasFailedSync).toBe(true);
      expect(vm.failedSyncCount).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Component tests.
// ---------------------------------------------------------------------------

describe('HomeDashboardView', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
    useGuestStore.getState().reset();
    useNavigationStore.setState({ onboardingComplete: false, hasUnsavedDraftChanges: false });
  });

  describe('greeting', () => {
    it('renders the greeting and display name', () => {
      const vm = buildViewModel({ hourOfDay: 9, displayName: 'Priya' });
      const { getByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      expect(getByText('Good morning, Priya')).toBeTruthy();
    });

    it('renders the afternoon greeting', () => {
      const vm = buildViewModel({ hourOfDay: 15, displayName: 'Sam' });
      const { getByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      expect(getByText('Good afternoon, Sam')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows "Welcome to BillLens!" when there are no groups and balances are zero', () => {
      const vm = buildViewModel({
        balances: [],
        recentGroups: [],
      });
      const { getByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      expect(getByText("You're all settled up")).toBeTruthy();
      expect(getByText('Welcome to BillLens!')).toBeTruthy();
      expect(getByText('Create a group to start tracking expenses together.')).toBeTruthy();
    });

    it('renders the Create Group and Scan First Receipt CTAs', () => {
      const vm = buildViewModel({ recentGroups: [] });
      const { getByLabelText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      fireEvent.press(getByLabelText('Create your first group'));
      expect(mockRouterPush).toHaveBeenCalledWith('/groups/new');

      fireEvent.press(getByLabelText('Scan your first receipt'));
      expect(mockRouterPush).toHaveBeenCalledWith('/capture');
    });
  });

  describe('balance display', () => {
    it('shows the "You are owed" and "You owe" cards when balances exist', () => {
      const vm = buildViewModel({
        balances: [
          { currencyCode: 'USD', amountMinor: 1250 },
          { currencyCode: 'EUR', amountMinor: -500 },
        ],
        recentGroups: [
          {
            id: 'g1',
            name: 'Trip',
            memberCount: 3,
            userBalanceMinor: 0,
            currencyCode: 'USD',
            lastActivityLabel: '2 days ago',
          },
        ],
      });
      const { getByText, queryByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      expect(getByText('Your balances')).toBeTruthy();
      expect(getByText('You are owed')).toBeTruthy();
      expect(getByText('You owe')).toBeTruthy();
      // The "all settled up" message must NOT appear when balances exist.
      expect(queryByText("You're all settled up")).toBeNull();
    });

    it('renders a dash in the "You owe" card when there is nothing owed', () => {
      const vm = buildViewModel({
        balances: [{ currencyCode: 'USD', amountMinor: 1250 }],
        recentGroups: [
          {
            id: 'g1',
            name: 'Trip',
            memberCount: 3,
            userBalanceMinor: 0,
            currencyCode: 'USD',
            lastActivityLabel: '2 days ago',
          },
        ],
      });
      const { getAllByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      // The dash placeholder appears for the empty "You owe" side.
      expect(getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Phase 4 — zero vs unavailable
  // -------------------------------------------------------------------------

  describe('unavailable / degraded states (Phase 4)', () => {
    it('renders "Balances unavailable" — NEVER "all settled up" — when balance queries failed', () => {
      const vm = buildViewModel({ balancesUnavailable: true, degradedGroupCount: 1 });
      const { getByText, getByTestId, queryByText } = renderWithProviders(
        <HomeDashboardView viewModel={vm} />,
      );

      expect(getByTestId('balances-unavailable')).toBeTruthy();
      expect(getByText('Balances unavailable')).toBeTruthy();
      // The authoritative zero-state claim must NOT appear on partial data.
      expect(queryByText("You're all settled up")).toBeNull();
    });

    it('renders the degraded warning when only non-balance queries failed', () => {
      const vm = buildViewModel({ balancesUnavailable: false, degradedGroupCount: 2 });
      const { getByTestId, getByText } = renderWithProviders(
        <HomeDashboardView viewModel={vm} />,
      );

      expect(getByTestId('degraded-warning')).toBeTruthy();
      expect(getByText(/2 groups’ data could not be fully loaded/)).toBeTruthy();
      expect(getByText(/Numbers shown may be incomplete/)).toBeTruthy();
    });

    it('hides the degraded warning when balances are unavailable (the unavailable card covers it)', () => {
      const vm = buildViewModel({ balancesUnavailable: true, degradedGroupCount: 1 });
      const { queryByTestId } = renderWithProviders(<HomeDashboardView viewModel={vm} />);
      expect(queryByTestId('degraded-warning')).toBeNull();
    });

    it('calls onRetryLoad when the user taps "Try again" on the unavailable card', () => {
      const handleRetry = jest.fn<() => void>();
      const vm = buildViewModel({ balancesUnavailable: true, degradedGroupCount: 1 });
      const { getByLabelText } = renderWithProviders(
        <HomeDashboardView viewModel={vm} onRetryLoad={(): void => handleRetry()} />,
      );
      fireEvent.press(getByLabelText('Retry loading your balances'));
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('view model derives a singular degraded warning for exactly one group', () => {
      const vm = buildViewModel({ degradedGroupCount: 1 });
      expect(vm.degradedWarning).toBe('1 group’s data could not be fully loaded.');
      const vmMany = buildViewModel({ degradedGroupCount: 3 });
      expect(vmMany.degradedWarning).toBe('3 groups’ data could not be fully loaded.');
    });
  });

  describe('pending actions', () => {
    it('renders "No pending actions" when there are none', () => {
      const vm = buildViewModel({ pendingActions: [] });
      const { getByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      expect(getByText('No pending actions')).toBeTruthy();
      expect(getByText("You're all caught up.")).toBeTruthy();
    });

    it('renders pending action cards when they exist', () => {
      const vm = buildViewModel({
        pendingActions: [
          {
            id: 'a1',
            kind: 'receipt-waiting-for-review',
            title: 'Receipt waiting for review',
            description: 'A receipt was scanned and needs your review.',
            targetRoute: '/drafts/d1',
          },
          {
            id: 'a2',
            kind: 'failed-sync-operation',
            title: 'Failed sync operation',
            description: 'A change could not be synced.',
            targetRoute: '/settings',
          },
        ],
        recentGroups: [
          {
            id: 'g1',
            name: 'Trip',
            memberCount: 3,
            userBalanceMinor: 0,
            currencyCode: 'USD',
            lastActivityLabel: '2 days ago',
          },
        ],
      });
      const { getByText, queryByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      expect(getByText('Receipt waiting for review')).toBeTruthy();
      expect(getByText('Failed sync operation')).toBeTruthy();
      expect(queryByText('No pending actions')).toBeNull();
    });
  });

  describe('pending drafts and sync', () => {
    it('renders the drafts banner when hasPendingDrafts is true', () => {
      const vm = buildViewModel({
        hasPendingDrafts: true,
        pendingDraftCount: 3,
        recentGroups: [
          {
            id: 'g1',
            name: 'Trip',
            memberCount: 3,
            userBalanceMinor: 0,
            currencyCode: 'USD',
            lastActivityLabel: '2 days ago',
          },
        ],
      });
      const { getByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      expect(getByText(/3 drafts waiting for review/)).toBeTruthy();
    });

    it('renders the failed-sync banner with a Retry button when hasFailedSync is true', () => {
      const vm = buildViewModel({
        hasFailedSync: true,
        failedSyncCount: 2,
        recentGroups: [
          {
            id: 'g1',
            name: 'Trip',
            memberCount: 3,
            userBalanceMinor: 0,
            currencyCode: 'USD',
            lastActivityLabel: '2 days ago',
          },
        ],
      });
      const { getByText, getByLabelText } = renderWithProviders(
        <HomeDashboardView viewModel={vm} />,
      );

      expect(getByText(/2 changes failed to sync/)).toBeTruthy();

      fireEvent.press(getByLabelText('Retry failed sync operations'));
      expect(mockRouterPush).toHaveBeenCalledWith('/settings');
    });
  });

  describe('recent groups', () => {
    it('renders recent group cards with their name and member count', () => {
      const vm = buildViewModel({
        recentGroups: [
          {
            id: 'g1',
            name: 'Weekend Trip',
            memberCount: 4,
            userBalanceMinor: 1250,
            currencyCode: 'USD',
            lastActivityLabel: '2 days ago',
          },
        ],
      });
      const { getByText } = renderWithProviders(<HomeDashboardView viewModel={vm} />);

      expect(getByText('Recent Groups')).toBeTruthy();
      expect(getByText('Weekend Trip')).toBeTruthy();
      expect(getByText(/4 members/)).toBeTruthy();
      expect(getByText(/2 days ago/)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Container tests — the real store → view-model wiring.
// ---------------------------------------------------------------------------

describe('HomeDashboardScreen (container wiring)', () => {
  beforeEach(() => {
    useGuestStore.getState().reset();
    useGroupStore.getState().reset();
    useNavigationStore.setState({ onboardingComplete: false, hasUnsavedDraftChanges: false });
  });

  afterEach(() => {
    useGroupStore.getState().reset();
  });

  /** Build a persisted GroupSummary with only the fields the card needs. */
  function makeGroup(overrides: Partial<GroupSummary> = {}): GroupSummary {
    return {
      id: 'group-1',
      name: 'Goa Trip',
      currencyCode: 'INR',
      memberCount: 3,
      userBalanceMinor: 250,
      lastActivityLabel: 'just now',
      archived: false,
      syncState: 'synced',
      groupType: 'Trip',
      privacyDefault: 'local_only',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-09T09:00:00.000Z',
      ...overrides,
    };
  }

  it('renders groups from the real group store (not hardcoded empties)', () => {
    useGroupStore.getState().addGroup(makeGroup());

    const { getByText } = renderWithProviders(<HomeDashboardScreen />);

    expect(getByText('Recent Groups')).toBeTruthy();
    expect(getByText('Goa Trip')).toBeTruthy();
    expect(getByText(/3 members/)).toBeTruthy();
  });

  it('shows at most 3 groups, newest activity first, excluding archived ones', () => {
    useGroupStore.getState().addGroup(makeGroup({ id: 'oldest', name: 'Oldest', updatedAt: '2026-10-01T00:00:00.000Z' }));
    useGroupStore.getState().addGroup(makeGroup({ id: 'older', name: 'Older', updatedAt: '2026-10-03T00:00:00.000Z' }));
    useGroupStore.getState().addGroup(makeGroup({ id: 'newest', name: 'Newest', updatedAt: '2026-10-09T12:00:00.000Z' }));
    useGroupStore.getState().addGroup(makeGroup({ id: 'archived', name: 'Archived One', archived: true }));
    useGroupStore.getState().addGroup(makeGroup({ id: 'middle', name: 'Middle', updatedAt: '2026-10-05T00:00:00.000Z' }));

    const { getByText, queryByText } = renderWithProviders(<HomeDashboardScreen />);

    // Cap = 3, applied AFTER the archived filter and recency sort.
    expect(getByText('Newest')).toBeTruthy();
    expect(getByText('Middle')).toBeTruthy();
    expect(getByText('Older')).toBeTruthy();
    expect(queryByText('Oldest')).toBeNull();
    expect(queryByText('Archived One')).toBeNull();
  });

  it('keeps the first-run empty state when the store has no groups', () => {
    const { getByText } = renderWithProviders(<HomeDashboardScreen />);
    expect(getByText('Welcome to BillLens!')).toBeTruthy();
  });
});
