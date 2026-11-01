/**
 * Settlement history tests (v2.26.2).
 *
 * Covers `/groups/[groupId]/settlements` (KL-7 / KL-8):
 *   - rows render member names, method, note and status badges;
 *   - screen-reader labels describe the amount and never contain the
 *     raw minor-unit integer (AUDIT_OCT_2026 §3.1 regression guard);
 *   - filter chips request the matching status from the use case;
 *   - cursor pagination appends and dedupes;
 *   - load errors surface with a working retry;
 *   - the empty state distinguishes "no settlements" from "no matches".
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import {
  GroupSettlementsScreen,
  SettlementHistoryView,
  type SettlementHistoryViewModel,
  type SettlementRowViewModel,
} from '@presentation/screens/settlement/SettlementHistoryScreen';
import { tryGetAppServices } from '@store/services-registry';

jest.mock('@store/services-registry', () => ({
  __esModule: true,
  tryGetAppServices: jest.fn(),
}));

const ROWS: readonly SettlementRowViewModel[] = [
  {
    id: 'st-1',
    fromName: 'Alice',
    toName: 'Bob',
    amountMinor: 12_500,
    currencyCode: 'INR',
    methodLabel: 'Cash',
    statusLabel: 'Completed',
    dateLabel: '10/1/2026',
    note: 'October rent',
    isReversal: false,
  },
  {
    id: 'st-2',
    fromName: 'Bob',
    toName: 'Alice',
    amountMinor: 3_000,
    currencyCode: 'INR',
    methodLabel: 'Upi',
    statusLabel: 'Awaiting confirmation',
    dateLabel: '10/5/2026',
    note: null,
    isReversal: true,
  },
];

function viewModel(
  overrides: Partial<SettlementHistoryViewModel> = {},
): SettlementHistoryViewModel {
  return {
    groupName: 'Flatmates',
    loading: false,
    loadingMore: false,
    error: null,
    rows: ROWS,
    hasMore: false,
    filter: 'all',
    ...overrides,
  };
}

async function flushUntil(predicate: () => boolean, timeoutMs = 4_000): Promise<void> {
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

describe('SettlementHistoryView', () => {
  it('renders rows with names, method, note and status badges', () => {
    const { getByText, getByLabelText } = render(
      <SettlementHistoryView
        viewModel={viewModel()}
        onFilterChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    expect(getByText('Every transfer recorded in Flatmates.')).toBeTruthy();
    expect(getByText('Alice → Bob')).toBeTruthy();
    expect(getByText('Bob → Alice')).toBeTruthy();
    expect(getByText('October rent')).toBeTruthy();
    // Scope badge queries to a row: "Completed" is also a filter chip label.
    const row = getByLabelText(/Settlement: Alice paid Bob/);
    expect(within(row).getByText('Completed')).toBeTruthy();
    // Reversal records badge as "Reversal", not their source status.
    expect(getByText('Reversal')).toBeTruthy();
  });

  it('speaks the formatted amount and never the raw minor units', () => {
    const { getByLabelText, queryAllByText } = render(
      <SettlementHistoryView
        viewModel={viewModel()}
        onFilterChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    const row = getByLabelText(/Settlement: Alice paid Bob/);
    expect(row.props.accessibilityLabel).toBe(
      'Settlement: Alice paid Bob ₹125.00 INR. Completed.',
    );
    // The AmountText label is the spoken, formatted amount.
    expect(getByLabelText('₹125.00 INR')).toBeTruthy();

    // AUDIT_OCT_2026 §3.1: the storage integer must never be rendered as
    // text (the view model carries amountMinor, but no Text node shows it).
    expect(queryAllByText(/12500/)).toHaveLength(0);
    expect(queryAllByText(/\b3000\b/)).toHaveLength(0);
  });

  it('requests a new status filter when a chip is pressed', () => {
    const onFilterChange = jest.fn();
    const { getByLabelText } = render(
      <SettlementHistoryView
        viewModel={viewModel({ filter: 'all' })}
        onFilterChange={onFilterChange}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    fireEvent.press(getByLabelText('Filter settlements: Completed'));
    expect(onFilterChange).toHaveBeenCalledWith('completed');

    fireEvent.press(getByLabelText('Filter settlements: Disputed'));
    expect(onFilterChange).toHaveBeenCalledWith('disputed');
  });

  it('marks the selected filter chip', () => {
    const { getByLabelText } = render(
      <SettlementHistoryView
        viewModel={viewModel({ filter: 'completed' })}
        onFilterChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    expect(getByLabelText('Filter settlements: Completed').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(getByLabelText('Filter settlements: All').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('shows the empty state for a group without settlements', () => {
    const { getByText } = render(
      <SettlementHistoryView
        viewModel={viewModel({ rows: [] })}
        onFilterChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    expect(getByText('No settlements yet')).toBeTruthy();
    expect(
      getByText('Recorded transfers will appear here once you settle up.'),
    ).toBeTruthy();
  });

  it('distinguishes an empty filter result from an empty group', () => {
    const { getByText } = render(
      <SettlementHistoryView
        viewModel={viewModel({ rows: [], filter: 'disputed' })}
        onFilterChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    expect(getByText('No settlements here')).toBeTruthy();
    expect(getByText('Nothing matches this filter. Try another status.')).toBeTruthy();
  });

  it('renders the loading card while the first page loads', () => {
    const { getByText, queryByText } = render(
      <SettlementHistoryView
        viewModel={viewModel({ loading: true, rows: [] })}
        onFilterChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    expect(getByText('Loading settlements…')).toBeTruthy();
    expect(queryByText('No settlements yet')).toBeNull();
  });

  it('surfaces load errors with a retry action', () => {
    const onRetry = jest.fn();
    const { getByText, getByLabelText } = render(
      <SettlementHistoryView
        viewModel={viewModel({ rows: [], error: 'disk error' })}
        onFilterChange={() => undefined}
        onRetry={onRetry}
        onLoadMore={() => undefined}
      />,
    );

    expect(getByText('Could not load settlements')).toBeTruthy();
    expect(getByText('disk error')).toBeTruthy();

    fireEvent.press(getByLabelText('Retry loading settlements'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers more pages when hasMore is set', () => {
    const { getByText, rerender } = render(
      <SettlementHistoryView
        viewModel={viewModel({ hasMore: true })}
        onFilterChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(getByText('Scroll for older settlements')).toBeTruthy();

    rerender(
      <SettlementHistoryView
        viewModel={viewModel({ hasMore: true, loadingMore: true })}
        onFilterChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(getByText('Loading more…')).toBeTruthy();
  });
});

describe('GroupSettlementsScreen (container)', () => {
  interface ListSettlementsPage {
    readonly items: readonly Record<string, unknown>[];
    readonly nextCursor: string | undefined;
    readonly hasMore: boolean;
  }

  const settlement = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    groupId: 'g-1',
    fromMemberId: 'm-1',
    toMemberId: 'm-2',
    amountMinor: 12_500,
    currencyCode: 'INR',
    method: 'cash',
    settlementDate: '2026-10-01',
    note: 'October rent',
    createdBy: 'local-user',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    version: 1,
    status: 'completed',
    ...overrides,
  });

  const listSettlements = jest.fn(async (_input: unknown): Promise<ListSettlementsPage> => ({
    items: [],
    nextCursor: undefined,
    hasMore: false,
  }));
  const listGroupMembers = jest.fn(async (_groupId: string) => ({
    groupId: 'g-1',
    groupName: 'Flatmates',
    currencyCode: 'INR',
    members: [
      { id: 'm-1', displayName: 'Alice', role: 'owner', isRegisteredUser: false },
      { id: 'm-2', displayName: 'Bob', role: 'member', isRegisteredUser: false },
    ],
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    listSettlements.mockReset();
    listSettlements.mockResolvedValue({
      items: [settlement('st-1')],
      nextCursor: undefined,
      hasMore: false,
    });
    jest.mocked(tryGetAppServices).mockReturnValue({
      settlements: { listSettlements: { execute: listSettlements } },
      groups: { listGroupMembers: { execute: listGroupMembers } },
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads members and settlements, and renders names', async () => {
    const { getByText, queryByText } = render(<GroupSettlementsScreen groupId="g-1" />);

    await flushUntil(() => queryByText('Alice → Bob') !== null);
    expect(getByText('Every transfer recorded in Flatmates.')).toBeTruthy();
    expect(getByText('October rent')).toBeTruthy();
    expect(listSettlements).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'g-1', pagination: { limit: 20 } }),
    );
  });

  it('re-queries with the status filter when a chip is pressed', async () => {
    const { getByLabelText, queryByText } = render(<GroupSettlementsScreen groupId="g-1" />);

    await flushUntil(() => queryByText('Alice → Bob') !== null);
    fireEvent.press(getByLabelText('Filter settlements: Completed'));

    await flushUntil(() => listSettlements.mock.calls.length >= 2);
    expect(listSettlements).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: { status: 'completed' } }),
    );
  });

  it('loads the next page with the cursor and dedupes repeated rows', async () => {
    listSettlements.mockResolvedValue({
      items: [settlement('st-1')],
      nextCursor: 'cursor-1',
      hasMore: true,
    });

    const { getByText, queryByText, UNSAFE_getByType } = render(
      <GroupSettlementsScreen groupId="g-1" />,
    );

    await flushUntil(() => queryByText('Alice → Bob') !== null);

    listSettlements.mockResolvedValueOnce({
      // st-1 repeated (already on screen) + a genuinely new row.
      items: [settlement('st-1'), settlement('st-2', { fromMemberId: 'm-2', toMemberId: 'm-1' })],
      nextCursor: undefined,
      hasMore: false,
    });

    // Synthetic scroll events do not reliably reach VirtualizedList's
    // onEndReached logic in tests — invoke the callback directly.
    await act(async () => {
      UNSAFE_getByType(FlatList).props.onEndReached({ distanceFromEnd: 10 });
    });
    await flushUntil(() => listSettlements.mock.calls.length >= 2);

    expect(listSettlements).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagination: { limit: 20, cursor: 'cursor-1' } }),
    );
    await flushUntil(() => getByText('Bob → Alice') !== null);
    // The repeated st-1 row is deduped, not mounted twice.
    expect(getByText('Alice → Bob')).toBeTruthy();
  });

  it('surfaces a load error and recovers on retry', async () => {
    listSettlements.mockRejectedValueOnce(new Error('disk error'));
    const { getByText, getByLabelText, queryByText } = render(
      <GroupSettlementsScreen groupId="g-1" />,
    );

    await flushUntil(() => queryByText(/Could not load settlements/) !== null);
    expect(getByText('disk error')).toBeTruthy();

    fireEvent.press(getByLabelText('Retry loading settlements'));
    await flushUntil(() => queryByText('Alice → Bob') !== null);
    expect(listSettlements.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('explains when storage is still starting up', async () => {
    jest.mocked(tryGetAppServices).mockReturnValue(null);
    const { getByText } = render(<GroupSettlementsScreen groupId="g-1" />);

    await flushUntil(() => getByText('Could not load settlements') !== null);
    expect(getByText('Storage is still starting up. Try again in a moment.')).toBeTruthy();
    expect(listSettlements).not.toHaveBeenCalled();
  });
});
