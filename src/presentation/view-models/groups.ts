/**
 * Groups view models.
 *
 * Pure projection from raw data into shapes the group screens consume.
 * The screens read ONLY from these view models — never from domain
 * entities or stores directly — so the screens stay thin and the layout
 * rules (filtering, validation, empty states) are unit-testable without
 * rendering React components.
 *
 * For Phase 2 the input is empty / zero everywhere, which produces
 * legitimate empty-state view models — no fake financial data ever
 * appears in production paths.
 *
 * Pure functions only — no I/O, no React, no stores.
 */

import type { StorageMode } from '@domain/entities/receipt';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** UI-facing group type, picked from a fixed list during group creation. */
export type GroupType = 'Trip' | 'Home' | 'Couple' | 'Event' | 'General';

/** Coarse sync state for a group, surfaced in the list via `StatusDot`. */
export type GroupSyncState = 'synced' | 'pending' | 'failed';

/** Filter applied to the groups list. */
export type GroupFilter = 'all' | 'active' | 'archived';

/** Member role within a group. */
export type MemberRole = 'owner' | 'admin' | 'member';

// Re-export StorageMode so consumers can import from a single entry point.
export type { StorageMode } from '@domain/entities/receipt';

/** All selectable group types, in display order. */
export const GROUP_TYPES: readonly GroupType[] = [
  'Trip',
  'Home',
  'Couple',
  'Event',
  'General',
];

/** All selectable receipt-privacy defaults, in display order. */
export const PRIVACY_DEFAULTS: readonly StorageMode[] = [
  'local_only',
  'cloud_private',
  'shared_with_group',
  'delete_after_extraction',
];

/** Short, human-readable label for each storage mode. */
export const PRIVACY_DEFAULT_LABELS: Readonly<Record<StorageMode, string>> = {
  local_only: 'Local only',
  cloud_private: 'Cloud private',
  shared_with_group: 'Shared with group',
  delete_after_extraction: 'Delete after extraction',
};

/** Plain-language description of what each storage mode does. */
export const PRIVACY_DEFAULT_DESCRIPTIONS: Readonly<Record<StorageMode, string>> = {
  local_only: 'Stored only on this device',
  cloud_private: 'Uploaded privately to your account',
  shared_with_group: 'Visible to group members',
  delete_after_extraction: 'Deleted after the values are extracted',
};

/** Ionicons glyph for each storage mode (used by PrivacyNotice + picker). */
export const PRIVACY_DEFAULT_ICONS: Readonly<Record<StorageMode, string>> = {
  local_only: 'phone-portrait-outline',
  cloud_private: 'lock-closed-outline',
  shared_with_group: 'people-outline',
  delete_after_extraction: 'trash-outline',
};

/** Group type → Ionicons glyph for the picker. */
export const GROUP_TYPE_ICONS: Readonly<Record<GroupType, string>> = {
  Trip: 'airplane-outline',
  Home: 'home-outline',
  Couple: 'heart-outline',
  Event: 'calendar-outline',
  General: 'pricetag-outline',
};

// ---------------------------------------------------------------------------
// Group name validation (mirrors the domain `validateGroupName` rules,
// kept in the view-model layer so the form can call it without pulling
// in the domain entity).
// ---------------------------------------------------------------------------

export const GROUP_NAME_MIN_LENGTH = 1;
export const GROUP_NAME_MAX_LENGTH = 100;

export interface NameValidation {
  readonly isValid: boolean;
  readonly error: string | null;
}

/**
 * Validate a raw group name string. Returns `{ isValid, error }`.
 *
 *   - Empty / whitespace-only → invalid, "Group name is required."
 *   - > 100 chars             → invalid, length-aware message.
 *   - Otherwise               → valid, no error.
 */
export function validateGroupName(raw: string): NameValidation {
  const trimmed = raw.trim();
  if (trimmed.length < GROUP_NAME_MIN_LENGTH) {
    return { isValid: false, error: 'Group name is required.' };
  }
  if (trimmed.length > GROUP_NAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Group name must be at most ${GROUP_NAME_MAX_LENGTH} characters.`,
    };
  }
  return { isValid: true, error: null };
}

// ---------------------------------------------------------------------------
// Create-group view model
// ---------------------------------------------------------------------------

export interface CreateGroupInput {
  readonly name: string;
  readonly currencyCode: string;
  readonly groupType: GroupType;
  readonly privacyDefault: StorageMode;
}

export interface CreateGroupViewModel {
  readonly name: string;
  readonly currencyCode: string;
  readonly groupType: GroupType;
  readonly privacyDefault: StorageMode;
  /** Validation error for the name field, or null when valid. */
  readonly nameError: string | null;
  /** True when every field passes validation and the form can submit. */
  readonly canSubmit: boolean;
}

/**
 * Build the create-group view model from the current form input.
 *
 * Pure — no React, no I/O. The screen wires its `useState` form values
 * into the input and renders the resulting view model.
 */
export function createCreateGroupViewModel(input: CreateGroupInput): CreateGroupViewModel {
  const validation = validateGroupName(input.name);
  return {
    name: input.name,
    currencyCode: input.currencyCode,
    groupType: input.groupType,
    privacyDefault: input.privacyDefault,
    nameError: validation.error,
    canSubmit: validation.isValid,
  };
}

// ---------------------------------------------------------------------------
// Join-group view model (invite token validation)
// ---------------------------------------------------------------------------

/** Minimum length of a hex invite token. Mirrors the domain entity rule. */
export const MIN_INVITE_TOKEN_LENGTH = 32;

/** Hex token regex. Mirrors `domain/entities/group-invite.ts`. */
export const INVITE_TOKEN_REGEX = /^[a-f0-9]+$/i;

export interface InviteTokenValidation {
  readonly isValid: boolean;
  readonly error: string | null;
  /** The token after URL/query stripping. */
  readonly normalized: string;
}

/**
 * Strip a URL or query-string wrapper from a pasted invite, leaving just
 * the raw token.
 *
 *   "https://billlens.app/join?token=abcd1234…" → "abcd1234…"
 *   "https://billlens.app/join/abcd1234…"       → "abcd1234…"
 *   "abcd1234…"                                 → "abcd1234…"
 *   "  abcd1234  "                              → "abcd1234"
 */
export function normalizeInviteToken(raw: string): string {
  let value = raw.trim();
  if (value.length === 0) return value;

  // `?token=...` form
  const tokenMatch = value.match(/[?&]token=([^&]+)/i);
  if (tokenMatch && tokenMatch[1]) {
    try {
      value = decodeURIComponent(tokenMatch[1]);
    } catch {
      value = tokenMatch[1];
    }
  } else {
    // Path-form: take the segment after the last slash.
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash >= 0 && lastSlash < value.length - 1) {
      value = value.slice(lastSlash + 1);
    }
  }
  return value.trim();
}

/**
 * Validate an invite token / URL pasted by the user.
 *
 *   - Empty        → "Paste an invite token or link."
 *   - Too short    → length-aware message.
 *   - Non-hex      → "Invite token must be hexadecimal characters."
 *   - Otherwise    → valid.
 */
export function validateInviteToken(raw: string): InviteTokenValidation {
  const normalized = normalizeInviteToken(raw);
  if (normalized.length === 0) {
    return { isValid: false, error: 'Paste an invite token or link.', normalized };
  }
  if (normalized.length < MIN_INVITE_TOKEN_LENGTH) {
    return {
      isValid: false,
      error: `Invite token must be at least ${MIN_INVITE_TOKEN_LENGTH} characters.`,
      normalized,
    };
  }
  if (!INVITE_TOKEN_REGEX.test(normalized)) {
    return {
      isValid: false,
      error: 'Invite token must be hexadecimal characters.',
      normalized,
    };
  }
  return { isValid: true, error: null, normalized };
}

// ---------------------------------------------------------------------------
// Groups-list view model
// ---------------------------------------------------------------------------

export interface GroupListItemViewModel {
  readonly id: string;
  readonly name: string;
  readonly memberCount: number;
  /** Negative = the user owes the group; positive = group owes the user. */
  readonly userBalanceMinor: number;
  readonly currencyCode: string;
  /** Pre-formatted relative label, e.g. "2 days ago". */
  readonly lastActivityLabel: string;
  readonly syncState: GroupSyncState;
  readonly archived: boolean;
}

export interface GroupsListViewModel {
  readonly allGroups: readonly GroupListItemViewModel[];
  readonly visibleGroups: readonly GroupListItemViewModel[];
  readonly filter: GroupFilter;
  readonly searchQuery: string;
  readonly isEmpty: boolean;
  /** True when the user has zero groups at all (triggers the first-run CTA). */
  readonly hasNoGroups: boolean;
  /** True when at least one group exists but the filter/search hid them all. */
  readonly hasNoMatches: boolean;
}

export interface GroupsListInput {
  readonly groups: readonly GroupListItemViewModel[];
  readonly filter: GroupFilter;
  readonly searchQuery: string;
}

/**
 * Filter the list by `filter` and search query.
 *
 * Pure — the screen reads store.groups, projects each into a
 * `GroupListItemViewModel`, and passes them through this function.
 */
export function filterGroups(
  groups: readonly GroupListItemViewModel[],
  filter: GroupFilter,
): readonly GroupListItemViewModel[] {
  switch (filter) {
    case 'active':
      return groups.filter((g) => !g.archived);
    case 'archived':
      return groups.filter((g) => g.archived);
    case 'all':
    default:
      return groups;
  }
}

/**
 * Case-insensitive substring search over the group name.
 * An empty / whitespace-only query returns every group unchanged.
 */
export function searchGroups(
  groups: readonly GroupListItemViewModel[],
  query: string,
): readonly GroupListItemViewModel[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return groups;
  return groups.filter((g) => g.name.toLowerCase().includes(trimmed));
}

/**
 * Build the groups-list view model: applies the active filter and the
 * search query, then derives the empty / no-matches / no-groups flags.
 */
export function createGroupsListViewModel(input: GroupsListInput): GroupsListViewModel {
  const filtered = filterGroups(input.groups, input.filter);
  const visibleGroups = searchGroups(filtered, input.searchQuery);

  return {
    allGroups: input.groups,
    visibleGroups,
    filter: input.filter,
    searchQuery: input.searchQuery,
    isEmpty: input.groups.length === 0,
    hasNoGroups: input.groups.length === 0,
    hasNoMatches: input.groups.length > 0 && visibleGroups.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Group-detail view model
// ---------------------------------------------------------------------------

export interface MemberSummaryViewModel {
  readonly id: string;
  readonly displayName: string;
  readonly role: MemberRole;
  /** Negative = this member owes the group; positive = group owes them. */
  readonly balanceMinor: number;
  readonly isCurrentUser: boolean;
}

export interface ExpenseSummaryViewModel {
  readonly id: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  /** Pre-formatted date label, e.g. "Mar 14". */
  readonly dateLabel: string;
  readonly payerName: string;
}

export interface SuggestedTransferViewModel {
  readonly id: string;
  readonly fromMemberId: string;
  readonly fromMemberName: string;
  readonly toMemberId: string;
  readonly toMemberName: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
}

export interface GroupDetailViewModel {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly memberCount: number;
  /** The signed balance for the current user within this group. */
  readonly userBalanceMinor: number;
  readonly recentExpenses: readonly ExpenseSummaryViewModel[];
  readonly suggestedTransfers: readonly SuggestedTransferViewModel[];
  readonly members: readonly MemberSummaryViewModel[];
  readonly hasRecentExpenses: boolean;
  readonly hasSuggestedTransfers: boolean;
  readonly hasMembers: boolean;
  readonly isAllSettledUp: boolean;
  /** True when the current user owes money within this group. */
  readonly userOwes: boolean;
  /** True when the current user is owed money within this group. */
  readonly userIsOwed: boolean;
}

export interface GroupDetailInput {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly memberCount: number;
  readonly userBalanceMinor: number;
  readonly recentExpenses?: readonly ExpenseSummaryViewModel[];
  readonly suggestedTransfers?: readonly SuggestedTransferViewModel[];
  readonly members?: readonly MemberSummaryViewModel[];
}

/**
 * Build the group-detail view model. Defaults every optional list to an
 * empty array — Phase 2 starts empty, no fake financial data.
 */
export function createGroupDetailViewModel(input: GroupDetailInput): GroupDetailViewModel {
  const recentExpenses = input.recentExpenses ?? [];
  const suggestedTransfers = input.suggestedTransfers ?? [];
  const members = input.members ?? [];

  return {
    id: input.id,
    name: input.name,
    currencyCode: input.currencyCode,
    memberCount: input.memberCount,
    userBalanceMinor: input.userBalanceMinor,
    recentExpenses,
    suggestedTransfers,
    members,
    hasRecentExpenses: recentExpenses.length > 0,
    hasSuggestedTransfers: suggestedTransfers.length > 0,
    hasMembers: members.length > 0,
    isAllSettledUp: input.userBalanceMinor === 0,
    userOwes: input.userBalanceMinor < 0,
    userIsOwed: input.userBalanceMinor > 0,
  };
}

/**
 * Build an empty group-detail view model — used by Phase 2 screens that
 * have not yet wired the real repositories. The returned view model
 * renders a legitimate empty state with zero balances and no members.
 */
export function createEmptyGroupDetail(
  id: string,
  name: string,
  currencyCode: string,
  memberCount: number,
): GroupDetailViewModel {
  return createGroupDetailViewModel({
    id,
    name,
    currencyCode,
    memberCount,
    userBalanceMinor: 0,
  });
}
