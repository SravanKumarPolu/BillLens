/**
 * Groups view-model unit tests (Prompt 16).
 *
 * Covers the pure projection / validation logic in
 * `src/presentation/view-models/groups.ts`:
 *   - Group name validation
 *   - Create-group view model
 *   - Invite token validation + normalization
 *   - Groups-list filtering + searching
 *   - Group-detail view model (empty / populated)
 *
 * Pure logic — no rendering, no React, no stores.
 */

import { describe, expect, it } from '@jest/globals';

import {
  GROUP_NAME_MAX_LENGTH,
  GROUP_TYPES,
  MIN_INVITE_TOKEN_LENGTH,
  PRIVACY_DEFAULTS,
  type GroupFilter,
  type GroupListItemViewModel,
  type GroupType,
  type StorageMode,
  createCreateGroupViewModel,
  createEmptyGroupDetail,
  createGroupDetailViewModel,
  createGroupsListViewModel,
  filterGroups,
  normalizeInviteToken,
  searchGroups,
  validateGroupName,
  validateInviteToken,
} from '@presentation/view-models/groups';

// ---------------------------------------------------------------------------
// Group name validation
// ---------------------------------------------------------------------------

describe('validateGroupName', () => {
  it('rejects an empty name', () => {
    const result = validateGroupName('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Group name is required.');
  });

  it('rejects a whitespace-only name', () => {
    const result = validateGroupName('   ');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Group name is required.');
  });

  it('accepts a one-character name', () => {
    const result = validateGroupName('A');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('accepts a normal name', () => {
    const result = validateGroupName('Weekend Trip');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeNull();
  });

  it(`rejects a name longer than ${GROUP_NAME_MAX_LENGTH} characters`, () => {
    const longName = 'A'.repeat(GROUP_NAME_MAX_LENGTH + 1);
    const result = validateGroupName(longName);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('at most');
    expect(result.error).toContain(String(GROUP_NAME_MAX_LENGTH));
  });

  it(`accepts a name exactly ${GROUP_NAME_MAX_LENGTH} characters long`, () => {
    const max = 'A'.repeat(GROUP_NAME_MAX_LENGTH);
    const result = validateGroupName(max);
    expect(result.isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Create-group view model
// ---------------------------------------------------------------------------

describe('createCreateGroupViewModel', () => {
  const baseInput = {
    name: 'Weekend Trip',
    currencyCode: 'USD',
    groupType: 'Trip' as GroupType,
    privacyDefault: 'local_only' as StorageMode,
  };

  it('returns a valid view model with no name error', () => {
    const vm = createCreateGroupViewModel(baseInput);
    expect(vm.name).toBe('Weekend Trip');
    expect(vm.currencyCode).toBe('USD');
    expect(vm.groupType).toBe('Trip');
    expect(vm.privacyDefault).toBe('local_only');
    expect(vm.nameError).toBeNull();
    expect(vm.canSubmit).toBe(true);
  });

  it('marks the form as not submittable when the name is empty', () => {
    const vm = createCreateGroupViewModel({ ...baseInput, name: '' });
    expect(vm.canSubmit).toBe(false);
    expect(vm.nameError).toBe('Group name is required.');
  });

  it('marks the form as not submittable when the name is too long', () => {
    const vm = createCreateGroupViewModel({
      ...baseInput,
      name: 'A'.repeat(GROUP_NAME_MAX_LENGTH + 1),
    });
    expect(vm.canSubmit).toBe(false);
    expect(vm.nameError).toContain('at most');
  });

  it('exposes every group type and privacy default through the constants', () => {
    expect(GROUP_TYPES).toEqual(['Trip', 'Home', 'Couple', 'Event', 'General']);
    expect(PRIVACY_DEFAULTS).toEqual([
      'local_only',
      'cloud_private',
      'shared_with_group',
      'delete_after_extraction',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Invite-token validation + normalization
// ---------------------------------------------------------------------------

describe('normalizeInviteToken', () => {
  it('returns the trimmed token when given a raw hex string', () => {
    const token = 'a'.repeat(MIN_INVITE_TOKEN_LENGTH);
    expect(normalizeInviteToken(`  ${token}  `)).toBe(token);
  });

  it('strips a URL prefix', () => {
    const token = 'a'.repeat(MIN_INVITE_TOKEN_LENGTH);
    expect(normalizeInviteToken(`https://billlens.app/join/${token}`)).toBe(token);
  });

  it('extracts the token from a ?token=… query string', () => {
    const token = 'a'.repeat(MIN_INVITE_TOKEN_LENGTH);
    expect(normalizeInviteToken(`https://billlens.app/join?token=${token}`)).toBe(token);
  });

  it('returns an empty string for an empty input', () => {
    expect(normalizeInviteToken('')).toBe('');
    expect(normalizeInviteToken('   ')).toBe('');
  });
});

describe('validateInviteToken', () => {
  const validToken = 'a'.repeat(MIN_INVITE_TOKEN_LENGTH);

  it('rejects an empty input', () => {
    const result = validateInviteToken('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Paste an invite token or link.');
  });

  it('accepts a valid hex token of the minimum length', () => {
    const result = validateInviteToken(validToken);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeNull();
    expect(result.normalized).toBe(validToken);
  });

  it('accepts a valid token wrapped in a URL', () => {
    const result = validateInviteToken(`https://billlens.app/join?token=${validToken}`);
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe(validToken);
  });

  it('rejects a token shorter than the minimum length', () => {
    const short = 'a'.repeat(MIN_INVITE_TOKEN_LENGTH - 1);
    const result = validateInviteToken(short);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('at least');
    expect(result.error).toContain(String(MIN_INVITE_TOKEN_LENGTH));
  });

  it('rejects a non-hex token', () => {
    const bad = 'z'.repeat(MIN_INVITE_TOKEN_LENGTH);
    const result = validateInviteToken(bad);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('hexadecimal');
  });
});

// ---------------------------------------------------------------------------
// Groups-list filtering + searching
// ---------------------------------------------------------------------------

function makeGroup(
  id: string,
  overrides: Partial<GroupListItemViewModel> = {},
): GroupListItemViewModel {
  return {
    id,
    name: id,
    memberCount: 3,
    userBalanceMinor: 0,
    currencyCode: 'USD',
    lastActivityLabel: '2 days ago',
    syncState: 'synced',
    archived: false,
    ...overrides,
  };
}

const SAMPLE_GROUPS: readonly GroupListItemViewModel[] = [
  makeGroup('g1', { name: 'Weekend Trip', archived: false }),
  makeGroup('g2', { name: 'Office Lunches', archived: false }),
  makeGroup('g3', { name: 'Old Trip', archived: true }),
];

describe('filterGroups', () => {
  it('returns every group when filter is "all"', () => {
    expect(filterGroups(SAMPLE_GROUPS, 'all')).toHaveLength(3);
  });

  it('returns only non-archived groups when filter is "active"', () => {
    const result = filterGroups(SAMPLE_GROUPS, 'active');
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('returns only archived groups when filter is "archived"', () => {
    const result = filterGroups(SAMPLE_GROUPS, 'archived');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('g3');
  });
});

describe('searchGroups', () => {
  it('returns every group when the query is empty', () => {
    expect(searchGroups(SAMPLE_GROUPS, '')).toHaveLength(3);
  });

  it('returns every group when the query is whitespace-only', () => {
    expect(searchGroups(SAMPLE_GROUPS, '   ')).toHaveLength(3);
  });

  it('matches by case-insensitive substring', () => {
    const result = searchGroups(SAMPLE_GROUPS, 'trip');
    expect(result.map((g) => g.id).sort()).toEqual(['g1', 'g3']);
  });

  it('matches a single group by exact name', () => {
    const result = searchGroups(SAMPLE_GROUPS, 'Office Lunches');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('g2');
  });

  it('returns nothing when no name matches', () => {
    expect(searchGroups(SAMPLE_GROUPS, 'nonexistent')).toHaveLength(0);
  });
});

describe('createGroupsListViewModel', () => {
  it('reports hasNoGroups when the input list is empty', () => {
    const vm = createGroupsListViewModel({
      groups: [],
      filter: 'all',
      searchQuery: '',
    });
    expect(vm.hasNoGroups).toBe(true);
    expect(vm.isEmpty).toBe(true);
    expect(vm.hasNoMatches).toBe(false);
    expect(vm.visibleGroups).toHaveLength(0);
  });

  it('reports hasNoMatches when groups exist but the search hides them all', () => {
    const vm = createGroupsListViewModel({
      groups: SAMPLE_GROUPS,
      filter: 'all',
      searchQuery: 'nonexistent',
    });
    expect(vm.hasNoGroups).toBe(false);
    expect(vm.isEmpty).toBe(false);
    expect(vm.hasNoMatches).toBe(true);
  });

  it('combines filter and search', () => {
    const vm = createGroupsListViewModel({
      groups: SAMPLE_GROUPS,
      filter: 'active',
      searchQuery: 'trip',
    });
    // "Weekend Trip" is active and matches "trip"; "Old Trip" is
    // archived so it is filtered out by "active".
    expect(vm.visibleGroups.map((g) => g.id)).toEqual(['g1']);
  });

  it('passes the filter through to the view model', () => {
    const filter: GroupFilter = 'archived';
    const vm = createGroupsListViewModel({
      groups: SAMPLE_GROUPS,
      filter,
      searchQuery: '',
    });
    expect(vm.filter).toBe('archived');
  });
});

// ---------------------------------------------------------------------------
// Group-detail view model
// ---------------------------------------------------------------------------

describe('createGroupDetailViewModel', () => {
  it('defaults every optional list to empty', () => {
    const vm = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 0,
    });
    expect(vm.recentExpenses).toEqual([]);
    expect(vm.suggestedTransfers).toEqual([]);
    expect(vm.members).toEqual([]);
    expect(vm.hasRecentExpenses).toBe(false);
    expect(vm.hasSuggestedTransfers).toBe(false);
    expect(vm.hasMembers).toBe(false);
  });

  it('classifies a positive balance as user-is-owed', () => {
    const vm = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 1250,
    });
    expect(vm.userIsOwed).toBe(true);
    expect(vm.userOwes).toBe(false);
    expect(vm.isAllSettledUp).toBe(false);
  });

  it('classifies a negative balance as user-owes', () => {
    const vm = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: -500,
    });
    expect(vm.userIsOwed).toBe(false);
    expect(vm.userOwes).toBe(true);
    expect(vm.isAllSettledUp).toBe(false);
  });

  it('classifies a zero balance as all-settled-up', () => {
    const vm = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 0,
    });
    expect(vm.userIsOwed).toBe(false);
    expect(vm.userOwes).toBe(false);
    expect(vm.isAllSettledUp).toBe(true);
  });

  it('passes through provided lists', () => {
    const vm = createGroupDetailViewModel({
      id: 'g1',
      name: 'Trip',
      currencyCode: 'USD',
      memberCount: 4,
      userBalanceMinor: 0,
      members: [
        {
          id: 'm1',
          displayName: 'Priya',
          role: 'owner',
          balanceMinor: 0,
          isCurrentUser: true,
        },
      ],
      recentExpenses: [
        {
          id: 'e1',
          description: 'Dinner',
          amountMinor: 5000,
          currencyCode: 'USD',
          dateLabel: 'Mar 14',
          payerName: 'Priya',
        },
      ],
      suggestedTransfers: [
        {
          id: 's1',
          fromMemberId: 'm1',
          fromMemberName: 'Priya',
          toMemberId: 'm2',
          toMemberName: 'Sam',
          amountMinor: 1250,
          currencyCode: 'USD',
        },
      ],
    });
    expect(vm.hasMembers).toBe(true);
    expect(vm.hasRecentExpenses).toBe(true);
    expect(vm.hasSuggestedTransfers).toBe(true);
  });
});

describe('createEmptyGroupDetail', () => {
  it('produces a legitimate empty view model with zero balances', () => {
    const vm = createEmptyGroupDetail('g1', 'Trip', 'USD', 1);
    expect(vm.id).toBe('g1');
    expect(vm.name).toBe('Trip');
    expect(vm.currencyCode).toBe('USD');
    expect(vm.memberCount).toBe(1);
    expect(vm.userBalanceMinor).toBe(0);
    expect(vm.isAllSettledUp).toBe(true);
    expect(vm.recentExpenses).toEqual([]);
    expect(vm.suggestedTransfers).toEqual([]);
    expect(vm.members).toEqual([]);
  });
});
