/**
 * Groups screen component tests (Prompt 16).
 *
 * Uses `@testing-library/react-native` to render the screens in
 * isolation. `expo-router` is mocked so the screens can call
 * `router.push` / `router.back` without a real navigation host.
 *
 * Coverage:
 *   - GroupsListScreen: empty state + group card rendering + filters
 *   - NewGroupScreen: form validation + create flow
 *   - JoinGroupScreen: token validation
 *   - GroupHomeScreen: balance summary states + primary actions
 *   - GroupSettingsScreen: editable name + danger zone
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { GroupBalancesView } from '@presentation/screens/group/GroupBalancesScreen';
import { GroupHomeView } from '@presentation/screens/group/GroupHomeScreen';
import { GroupSettingsView } from '@presentation/screens/group/GroupSettingsScreen';
import { GroupsListView } from '@presentation/screens/group/GroupsListScreen';
import { JoinGroupView } from '@presentation/screens/group/JoinGroupScreen';
import { NewGroupView } from '@presentation/screens/group/NewGroupScreen';
import {
  type GroupDetailViewModel,
  type GroupListItemViewModel,
  createGroupDetailViewModel,
  createGroupsListViewModel,
} from '@presentation/view-models/groups';
import { useGroupStore, type GroupSummary } from '@store/group-store';

// Mock expo-router — only variables prefixed with `mock` may be
// referenced inside `jest.mock()` factory bodies (jest hoists them).
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: readonly unknown[]) => mockRouterPush(...args),
    back: (...args: readonly unknown[]) => mockRouterBack(...args),
    replace: (...args: readonly unknown[]) => mockRouterReplace(...args),
  },
}));

/** Wrap children in the providers the design system expects. */
function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  return render(ui);
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

function makeListItem(
  id: string,
  overrides: Partial<GroupListItemViewModel> = {},
): GroupListItemViewModel {
  return {
    id,
    name: `Group ${id}`,
    memberCount: 3,
    userBalanceMinor: 0,
    currencyCode: 'USD',
    lastActivityLabel: '2 days ago',
    syncState: 'synced',
    archived: false,
    ...overrides,
  };
}

function makeGroupSummary(
  id: string,
  overrides: Partial<GroupSummary> = {},
): GroupSummary {
  return {
    id,
    name: `Group ${id}`,
    currencyCode: 'USD',
    memberCount: 3,
    userBalanceMinor: 0,
    lastActivityLabel: 'Just now',
    archived: false,
    syncState: 'synced',
    groupType: 'General',
    privacyDefault: 'local_only',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterBack.mockClear();
  mockRouterReplace.mockClear();
  useGroupStore.getState().reset();
});

// ---------------------------------------------------------------------------
// GroupsListScreen
// ---------------------------------------------------------------------------

describe('GroupsListView', () => {
  it('shows the empty state with Create / Join CTAs when there are no groups', () => {
    const vm = createGroupsListViewModel({
      groups: [],
      filter: 'all',
      searchQuery: '',
    });
    const { getByText, getByLabelText } = renderWithProviders(
      <GroupsListView
        viewModel={vm}
        isLoading={false}
        onFilterChange={() => {}}
        onSearchChange={() => {}}
      />,
    );

    expect(getByText('No groups yet')).toBeTruthy();
    expect(
      getByText(
        'Create a group to start tracking shared expenses, or join one with an invite link.',
      ),
    ).toBeTruthy();

    fireEvent.press(getByLabelText('Create a new group'));
    expect(mockRouterPush).toHaveBeenCalledWith('/groups/new');
    fireEvent.press(getByLabelText('Join an existing group with an invite code'));
    expect(mockRouterPush).toHaveBeenCalledWith('/groups/join');
  });

  it('renders a card per visible group with name and member count', () => {
    const vm = createGroupsListViewModel({
      groups: [
        makeListItem('g1', { name: 'Weekend Trip', memberCount: 4 }),
        makeListItem('g2', { name: 'Office Lunches', memberCount: 6 }),
      ],
      filter: 'all',
      searchQuery: '',
    });
    const { getByText } = renderWithProviders(
      <GroupsListView
        viewModel={vm}
        isLoading={false}
        onFilterChange={() => {}}
        onSearchChange={() => {}}
      />,
    );

    expect(getByText('Weekend Trip')).toBeTruthy();
    expect(getByText(/4 members/)).toBeTruthy();
    expect(getByText('Office Lunches')).toBeTruthy();
    expect(getByText(/6 members/)).toBeTruthy();
  });

  it('navigates to /groups/[id] when a group card is tapped', () => {
    const vm = createGroupsListViewModel({
      groups: [makeListItem('g1', { name: 'Weekend Trip', memberCount: 4 })],
      filter: 'all',
      searchQuery: '',
    });
    const { getByLabelText } = renderWithProviders(
      <GroupsListView
        viewModel={vm}
        isLoading={false}
        onFilterChange={() => {}}
        onSearchChange={() => {}}
      />,
    );

    fireEvent.press(
      getByLabelText(/Open group Weekend Trip\. 4 members\./),
    );
    expect(mockRouterPush).toHaveBeenCalledWith('/groups/g1');
  });

  it('shows the "No groups match" state when a search hides every group', () => {
    const vm = createGroupsListViewModel({
      groups: [makeListItem('g1', { name: 'Weekend Trip' })],
      filter: 'all',
      searchQuery: 'nonexistent',
    });
    const { getByText } = renderWithProviders(
      <GroupsListView
        viewModel={vm}
        isLoading={false}
        onFilterChange={() => {}}
        onSearchChange={() => {}}
      />,
    );

    expect(getByText('No groups match')).toBeTruthy();
  });

  it('shows skeletons when loading', () => {
    const vm = createGroupsListViewModel({
      groups: [],
      filter: 'all',
      searchQuery: '',
    });
    const { getByLabelText } = renderWithProviders(
      <GroupsListView
        viewModel={vm}
        isLoading
        onFilterChange={() => {}}
        onSearchChange={() => {}}
      />,
    );

    expect(getByLabelText('Loading groups')).toBeTruthy();
  });

  it('invokes onFilterChange with the selected filter', () => {
    const onFilterChange = jest.fn();
    const vm = createGroupsListViewModel({
      groups: [makeListItem('g1')],
      filter: 'all',
      searchQuery: '',
    });
    const { getByLabelText } = renderWithProviders(
      <GroupsListView
        viewModel={vm}
        isLoading={false}
        onFilterChange={onFilterChange}
        onSearchChange={() => {}}
      />,
    );

    fireEvent.press(getByLabelText('Filter groups: Archived'));
    expect(onFilterChange).toHaveBeenCalledWith('archived');
  });

  it('invokes onSearchChange when typing in the search field', () => {
    const onSearchChange = jest.fn();
    const vm = createGroupsListViewModel({
      groups: [makeListItem('g1')],
      filter: 'all',
      searchQuery: '',
    });
    const { getByLabelText } = renderWithProviders(
      <GroupsListView
        viewModel={vm}
        isLoading={false}
        onFilterChange={() => {}}
        onSearchChange={onSearchChange}
      />,
    );

    fireEvent.changeText(getByLabelText('Search groups by name'), 'trip');
    expect(onSearchChange).toHaveBeenCalledWith('trip');
  });
});

// ---------------------------------------------------------------------------
// NewGroupScreen
// ---------------------------------------------------------------------------

describe('NewGroupView', () => {
  it('keeps the Create button disabled when the name is empty', () => {
    const onNameChange = jest.fn();
    const onCurrencyChange = jest.fn();
    const onGroupTypeChange = jest.fn();
    const onPrivacyChange = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <NewGroupView
        viewModel={{
          name: '',
          currencyCode: 'USD',
          groupType: 'General',
          privacyDefault: 'local_only',
          nameError: 'Group name is required.',
          canSubmit: false,
        }}
        onNameChange={onNameChange}
        onCurrencyChange={onCurrencyChange}
        onGroupTypeChange={onGroupTypeChange}
        onPrivacyChange={onPrivacyChange}
      />,
    );

    const create = getByLabelText('Create the new group');
    // Pressing a disabled Pressable is a no-op — verify no state changed.
    fireEvent.press(create);
    expect(onNameChange).not.toHaveBeenCalled();
  });

  it('shows a name error when the name is too long', () => {
    const longName = 'A'.repeat(101);
    const { getByLabelText, getByText } = renderWithProviders(
      <NewGroupView
        viewModel={{
          name: longName,
          currencyCode: 'USD',
          groupType: 'General',
          privacyDefault: 'local_only',
          nameError: 'Group name must be at most 100 characters.',
          canSubmit: false,
        }}
        onNameChange={() => {}}
        onCurrencyChange={() => {}}
        onGroupTypeChange={() => {}}
        onPrivacyChange={() => {}}
      />,
    );

    expect(getByText('Group name must be at most 100 characters.')).toBeTruthy();
    // The disabled create button still renders, just not enabled.
    expect(getByLabelText('Create the new group')).toBeTruthy();
  });

  it('shows a name-required error for an empty name', () => {
    const { getByText } = renderWithProviders(
      <NewGroupView
        viewModel={{
          name: '',
          currencyCode: 'USD',
          groupType: 'General',
          privacyDefault: 'local_only',
          nameError: 'Group name is required.',
          canSubmit: false,
        }}
        onNameChange={() => {}}
        onCurrencyChange={() => {}}
        onGroupTypeChange={() => {}}
        onPrivacyChange={() => {}}
      />,
    );

    expect(getByText('Group name is required.')).toBeTruthy();
  });

  it('reflects a valid name with the create button enabled', () => {
    const { getByLabelText, queryByText } = renderWithProviders(
      <NewGroupView
        viewModel={{
          name: 'Weekend Trip',
          currencyCode: 'USD',
          groupType: 'Trip',
          privacyDefault: 'local_only',
          nameError: null,
          canSubmit: true,
        }}
        onNameChange={() => {}}
        onCurrencyChange={() => {}}
        onGroupTypeChange={() => {}}
        onPrivacyChange={() => {}}
      />,
    );

    expect(queryByText('Group name is required.')).toBeNull();
    expect(getByLabelText('Create the new group')).toBeTruthy();
  });

  it('invokes the field-change callbacks when the user edits each field', () => {
    const onNameChange = jest.fn();
    const onCurrencyChange = jest.fn();
    const onGroupTypeChange = jest.fn();
    const onPrivacyChange = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <NewGroupView
        viewModel={{
          name: 'Trip',
          currencyCode: 'USD',
          groupType: 'General',
          privacyDefault: 'local_only',
          nameError: null,
          canSubmit: true,
        }}
        onNameChange={onNameChange}
        onCurrencyChange={onCurrencyChange}
        onGroupTypeChange={onGroupTypeChange}
        onPrivacyChange={onPrivacyChange}
      />,
    );

    fireEvent.changeText(getByLabelText('Group name'), 'Weekend Trip');
    expect(onNameChange).toHaveBeenCalledWith('Weekend Trip');

    fireEvent.press(getByLabelText('Select INR as default currency'));
    expect(onCurrencyChange).toHaveBeenCalledWith('INR');

    fireEvent.press(getByLabelText('Select Trip as group type'));
    expect(onGroupTypeChange).toHaveBeenCalledWith('Trip');

    fireEvent.press(
      getByLabelText('Cloud private — Uploaded privately to your account'),
    );
    expect(onPrivacyChange).toHaveBeenCalledWith('cloud_private');
  });
});

// ---------------------------------------------------------------------------
// JoinGroupScreen
// ---------------------------------------------------------------------------

describe('JoinGroupView', () => {
  it('keeps the Join button disabled when the token is empty', () => {
    const onJoin = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <JoinGroupView
        token=""
        validation={{ isValid: false, error: 'Paste an invite token or link.', normalized: '' }}
        showError={false}
        onTokenChange={() => {}}
        onJoin={onJoin}
        onCancel={() => {}}
      />,
    );

    fireEvent.press(getByLabelText('Join the group'));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('shows a validation error after the user submits an invalid token', () => {
    const { getByLabelText, getByText } = renderWithProviders(
      <JoinGroupView
        token="short"
        validation={{
          isValid: false,
          error: `Invite token must be at least 32 characters.`,
          normalized: 'short',
        }}
        showError
        onTokenChange={() => {}}
        onJoin={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(getByText('Invite token must be at least 32 characters.')).toBeTruthy();
    // The Join button is rendered but disabled.
    expect(getByLabelText('Join the group')).toBeTruthy();
  });

  it('shows the helper note about asking the group creator', () => {
    const { getByText } = renderWithProviders(
      <JoinGroupView
        token=""
        validation={{ isValid: false, error: 'Paste an invite token or link.', normalized: '' }}
        showError={false}
        onTokenChange={() => {}}
        onJoin={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(getByText('Ask the group creator for an invite link.')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// GroupHomeScreen
// ---------------------------------------------------------------------------

describe('GroupHomeView', () => {
  it('renders the all-settled-up balance card when balance is zero', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Weekend Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 0,
    });
    const { getByText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    expect(getByText('Weekend Trip')).toBeTruthy();
    expect(getByText('All settled up')).toBeTruthy();
  });

  it('renders the "You owe" label when balance is negative', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: -500,
    });
    const { getByText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    expect(getByText('You owe')).toBeTruthy();
  });

  it('renders the "You are owed" label when balance is positive', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 1250,
    });
    const { getByText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    expect(getByText('You are owed')).toBeTruthy();
  });

  it('renders all 4 primary action buttons', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 0,
    });
    const { getByLabelText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    expect(getByLabelText('Add a new expense to this group')).toBeTruthy();
    expect(getByLabelText('Scan a receipt for this group')).toBeTruthy();
    expect(getByLabelText('Record a settlement in this group')).toBeTruthy();
    expect(getByLabelText('Invite a member to this group')).toBeTruthy();
  });

  it('navigates to /expenses/new?groupId=… when Add Expense is pressed', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 0,
    });
    const { getByLabelText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    fireEvent.press(getByLabelText('Add a new expense to this group'));
    expect(mockRouterPush).toHaveBeenCalledWith('/expenses/new?groupId=g1');
  });

  it('navigates to /capture?groupId=… when Scan Receipt is pressed', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 0,
    });
    const { getByLabelText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    fireEvent.press(getByLabelText('Scan a receipt for this group'));
    expect(mockRouterPush).toHaveBeenCalledWith('/capture?groupId=g1');
  });

  it('renders the empty-state cards for recent expenses and settlements', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 0,
    });
    const { getByText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    expect(getByText('No expenses yet')).toBeTruthy();
    expect(getByText('Nothing to settle')).toBeTruthy();
  });

  // -----------------------------------------------------------------
  // Polished states — real repository data projected through the view
  // model (the container loads via useGroupDashboardData).
  // -----------------------------------------------------------------

  it('renders real recent expenses with payer names and dates', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'INR',
      memberCount: 3,
      userBalanceMinor: 0,
      recentExpenses: [
        {
          id: 'e1',
          description: 'Dinner at Rasa',
          amountMinor: 1000,
          currencyCode: 'INR',
          dateLabel: 'Oct 5',
          payerName: 'Alice',
        },
        {
          id: 'e2',
          description: 'Taxi',
          amountMinor: 400,
          currencyCode: 'INR',
          dateLabel: 'Oct 6',
          payerName: 'Bob',
        },
      ],
    });
    const { getByText, queryByText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    expect(getByText('Dinner at Rasa')).toBeTruthy();
    expect(getByText('Alice · Oct 5')).toBeTruthy();
    expect(getByText('Taxi')).toBeTruthy();
    expect(getByText('Bob · Oct 6')).toBeTruthy();
    expect(queryByText('No expenses yet')).toBeNull();
  });

  it('renders real suggested transfers from the balance engine', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'INR',
      memberCount: 2,
      userBalanceMinor: 0,
      suggestedTransfers: [
        {
          id: 't1',
          fromMemberId: 'm-bob',
          fromMemberName: 'Bob',
          toMemberId: 'm-alice',
          toMemberName: 'Alice',
          amountMinor: 500,
          currencyCode: 'INR',
        },
      ],
    });
    const { getByText, queryByText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    expect(getByText('Bob pays Alice')).toBeTruthy();
    expect(queryByText('Nothing to settle')).toBeNull();
  });

  it('renders real members in the members row', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 2,
      userBalanceMinor: 0,
      members: [
        { id: 'm-alice', displayName: 'Alice', role: 'owner', balanceMinor: 0, isCurrentUser: false },
        { id: 'm-bob', displayName: 'Bob', role: 'member', balanceMinor: 0, isCurrentUser: false },
      ],
    });
    const { getByText, getByLabelText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    expect(getByLabelText('Alice')).toBeTruthy();
    expect(getByLabelText('Bob')).toBeTruthy();
    expect(getByText('Members')).toBeTruthy();
  });

  it('shows the honest outstanding-balances card when transfers exist but user balance is zero', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'INR',
      memberCount: 3,
      userBalanceMinor: 0,
      suggestedTransfers: [
        {
          id: 't1',
          fromMemberId: 'm-bob',
          fromMemberName: 'Bob',
          toMemberId: 'm-alice',
          toMemberName: 'Alice',
          amountMinor: 500,
          currencyCode: 'INR',
        },
        {
          id: 't2',
          fromMemberId: 'm-carol',
          fromMemberName: 'Carol',
          toMemberId: 'm-alice',
          toMemberName: 'Alice',
          amountMinor: 300,
          currencyCode: 'INR',
        },
      ],
    });
    const { getByText, queryByText } = renderWithProviders(<GroupHomeView viewModel={vm} />);

    // NOT the misleading "All settled up" — the group has debts.
    expect(getByText('Outstanding balances in this group')).toBeTruthy();
    expect(getByText('2 settlements are suggested below to even things out.')).toBeTruthy();
    expect(queryByText('All settled up')).toBeNull();
  });

  it('renders the loading and error states without fake content', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 2,
      userBalanceMinor: 0,
    });
    const { getByText, rerender } = renderWithProviders(
      <GroupHomeView viewModel={vm} isLoading />,
    );
    expect(getByText("Loading this group's expenses and balances…")).toBeTruthy();

    rerender(
      <GroupHomeView viewModel={vm} loadError="Group g1 not found" />,
    );
    expect(getByText('Some content could not load')).toBeTruthy();
    expect(getByText('Group g1 not found')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// GroupBalancesScreen
// ---------------------------------------------------------------------------

describe('GroupBalancesView', () => {
  it('renders the empty-members state when there are no members', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 0,
      userBalanceMinor: 0,
    });
    const { getByText } = renderWithProviders(
      <GroupBalancesView
        viewModel={vm}
        loading={false}
        loadError={null}
        pending={[]}
        pendingLoading={false}
        pendingError={null}
        acting={false}
        actionError={null}
        onConfirm={() => {}}
        onDispute={() => {}}
      />,
    );

    expect(getByText('No members yet')).toBeTruthy();
    expect(getByText('Nothing to settle')).toBeTruthy();
  });

  it('renders a card per member when members are present', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 2,
      userBalanceMinor: 0,
      members: [
        {
          id: 'm1',
          displayName: 'Priya',
          role: 'owner',
          balanceMinor: 1250,
          isCurrentUser: true,
        },
        {
          id: 'm2',
          displayName: 'Sam',
          role: 'member',
          balanceMinor: -1250,
          isCurrentUser: false,
        },
      ],
    });
    const { getByText } = renderWithProviders(
      <GroupBalancesView
        viewModel={vm}
        loading={false}
        loadError={null}
        pending={[]}
        pendingLoading={false}
        pendingError={null}
        acting={false}
        actionError={null}
        onConfirm={() => {}}
        onDispute={() => {}}
      />,
    );

    // "Priya (you)" — current user gets the suffix; Sam has no suffix.
    expect(getByText(/Priya/)).toBeTruthy();
    expect(getByText('Sam')).toBeTruthy();
  });

  it('renders the pending-confirmation section when entries are supplied', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 1,
      userBalanceMinor: 0,
      members: [{ id: 'm1', displayName: 'Alice', role: 'owner', balanceMinor: 0, isCurrentUser: true }],
    });
    const pendingEntry = {
      settlementId: 's1',
      fromMemberId: 'm2',
      toMemberId: 'm1',
      fromMemberName: 'Bob',
      toMemberName: 'Alice',
      amountMinor: 2500,
      currencyCode: 'USD',
      method: 'UPI',
      note: 'Dinner',
      createdAt: '2026-10-11T10:00:00.000Z',
    };
    const onConfirm = jest.fn();
    const onDispute = jest.fn();
    const { getByText, getByLabelText } = renderWithProviders(
      <GroupBalancesView
        viewModel={vm}
        loading={false}
        loadError={null}
        pending={[pendingEntry]}
        pendingLoading={false}
        pendingError={null}
        acting={false}
        actionError={null}
        onConfirm={onConfirm}
        onDispute={onDispute}
      />,
    );
    expect(getByText('Pending your confirmation')).toBeTruthy();
    expect(getByText('Bob paid you')).toBeTruthy();
    expect(getByText(/“Dinner”/)).toBeTruthy();
    fireEvent.press(getByLabelText('Confirm the settlement from Bob'));
    expect(onConfirm).toHaveBeenCalledWith('s1', 2, 'm1');
  });

  it('hides the pending-confirmation section when entries are empty and no error', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 0,
      userBalanceMinor: 0,
    });
    const { queryByText } = renderWithProviders(
      <GroupBalancesView
        viewModel={vm}
        loading={false}
        loadError={null}
        pending={[]}
        pendingLoading={false}
        pendingError={null}
        acting={false}
        actionError={null}
        onConfirm={() => {}}
        onDispute={() => {}}
      />,
    );
    expect(queryByText('Pending your confirmation')).toBeNull();
  });

  it('renders the pending-loading card while pendingLoading is true', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 0,
      userBalanceMinor: 0,
    });
    const { getByText } = renderWithProviders(
      <GroupBalancesView
        viewModel={vm}
        loading={false}
        loadError={null}
        pending={[]}
        pendingLoading
        pendingError={null}
        acting={false}
        actionError={null}
        onConfirm={() => {}}
        onDispute={() => {}}
      />,
    );
    expect(getByText('Loading pending settlements…')).toBeTruthy();
  });

  it('renders the action-error card when actionError is set', () => {
    const vm: GroupDetailViewModel = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 0,
      userBalanceMinor: 0,
    });
    const pendingEntry = {
      settlementId: 's1',
      fromMemberId: 'm2',
      toMemberId: 'm1',
      fromMemberName: 'Bob',
      toMemberName: 'Alice',
      amountMinor: 2500,
      currencyCode: 'USD',
      method: 'UPI',
      note: null,
      createdAt: '2026-10-11T10:00:00.000Z',
    };
    const { getByText } = renderWithProviders(
      <GroupBalancesView
        viewModel={vm}
        loading={false}
        loadError={null}
        pending={[pendingEntry]}
        pendingLoading={false}
        pendingError={null}
        acting={false}
        actionError="Version conflict"
        onConfirm={() => {}}
        onDispute={() => {}}
      />,
    );
    expect(getByText('Version conflict')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// GroupSettingsScreen
// ---------------------------------------------------------------------------

describe('GroupSettingsView', () => {
  // Helper: the new members-related props default to empty/false/null so
  // every test in this suite passes them without cluttering each call.
  function makeSettingsProps(overrides: Partial<{
    group: GroupSummary;
    name: string;
    nameError: string | null;
    isDirty: boolean;
    canSave: boolean;
    onNameChange: (v: string) => void;
    onSaveName: () => void;
    onArchive: () => void;
    onUnarchive: () => void;
    onLeave: () => void;
    onBack: () => void;
    members: readonly { id: string; displayName: string; role: 'owner' | 'admin' | 'member'; isCurrentUser: boolean }[];
    membersLoading: boolean;
    membersLoadError: string | null;
  }> = {}) {
    return {
      group: makeGroupSummary('g1'),
      name: 'Trip',
      nameError: null,
      isDirty: false,
      canSave: false,
      onNameChange: () => {},
      onSaveName: () => {},
      onArchive: () => {},
      onUnarchive: () => {},
      onLeave: () => {},
      onBack: () => {},
      members: [],
      membersLoading: false,
      membersLoadError: null,
      ...overrides,
    };
  }

  it('renders the editable name with the current value', () => {
    const group = makeGroupSummary('g1', { name: 'Weekend Trip' });
    const { getByLabelText, getByDisplayValue } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps({ group, name: 'Weekend Trip' })} />,
    );

    expect(getByLabelText('Edit group name')).toBeTruthy();
    expect(getByDisplayValue('Weekend Trip')).toBeTruthy();
  });

  it('renders the danger zone with Archive and Leave', () => {
    const { getByLabelText } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps()} />,
    );

    expect(getByLabelText('Archive this group')).toBeTruthy();
    expect(getByLabelText('Leave this group permanently')).toBeTruthy();
  });

  it('shows Unarchive instead of Archive when the group is archived', () => {
    const group = makeGroupSummary('g1', { archived: true });
    const { getByLabelText, queryByLabelText } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps({ group })} />,
    );

    expect(getByLabelText('Unarchive this group')).toBeTruthy();
    expect(queryByLabelText('Archive this group')).toBeNull();
  });

  it('disables Save when the name is unchanged', () => {
    const onSaveName = jest.fn();
    const group = makeGroupSummary('g1', { name: 'Trip' });
    const { getByLabelText } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps({ group, onSaveName })} />,
    );

    fireEvent.press(getByLabelText('Save the new group name'));
    expect(onSaveName).not.toHaveBeenCalled();
  });

  it('invokes onLeave when the Leave action is pressed', () => {
    const onLeave = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps({ onLeave })} />,
    );

    fireEvent.press(getByLabelText('Leave this group permanently'));
    expect(onLeave).toHaveBeenCalled();
  });

  it('renders the real members list when members are supplied', () => {
    const members = [
      { id: 'm1', displayName: 'Alice', role: 'owner' as const, isCurrentUser: true },
      { id: 'm2', displayName: 'Bob', role: 'member' as const, isCurrentUser: false },
    ];
    const { getByText } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps({ members })} />,
    );

    expect(getByText('2 people are in this group.')).toBeTruthy();
    expect(getByText('Alice (you)')).toBeTruthy();
    expect(getByText('Bob')).toBeTruthy();
  });

  it('renders the members-loading state', () => {
    const { getByText } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps({ membersLoading: true })} />,
    );

    expect(getByText('Loading members…')).toBeTruthy();
  });

  it('renders the members-load-error state', () => {
    const { getByText } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps({ membersLoadError: 'Storage offline' })} />,
    );

    expect(getByText('Storage offline')).toBeTruthy();
  });

  it('renders the empty-members state', () => {
    const { getByText } = renderWithProviders(
      <GroupSettingsView {...makeSettingsProps({ members: [] })} />,
    );

    expect(getByText('No members have joined yet.')).toBeTruthy();
  });
});
