/**
 * GroupsListScreen — the "Groups" tab (Prompt 16).
 *
 * Lists every group the user belongs to with per-group balance, member
 * count, last-activity label, and sync status. Lets the user filter
 * (All / Active / Archived) and search by name. Empty state shows CTAs
 * to create or join a group. Loading state shows skeleton cards.
 *
 * Architecture:
 *   - The thin container `GroupsListScreen` reads `useGroupStore` and
 *     builds a `GroupsListViewModel` via `createGroupsListViewModel`.
 *   - The pure presentational component `GroupsListView` reads ONLY
 *     from the view model — no stores, no domain entities. This makes
 *     the layout fully unit-testable.
 *
 * All colours come from `useTheme()`. All interactive elements carry an
 * `accessibilityLabel`. Layout uses ONLY design-system primitives.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, TextInput, View } from 'react-native';

import { AmountText } from '@presentation/design-system/components/AmountText';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { IconButton } from '@presentation/design-system/components/IconButton';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Skeleton } from '@presentation/design-system/components/Skeleton';
import { Stack } from '@presentation/design-system/components/Stack';
import { StatusDot } from '@presentation/design-system/components/StatusDot';
import type { StatusDotVariant } from '@presentation/design-system/components/StatusDot';
import { Text } from '@presentation/design-system/components/Text';
import { describeAmount } from '@presentation/design-system/financial-format';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useGroupStoreHydration } from '@presentation/hooks/use-group-store-hydration';
import {
  type GroupFilter,
  type GroupListItemViewModel,
  type GroupsListViewModel,
  createGroupsListViewModel,
} from '@presentation/view-models/groups';
import { useGroupStore, type GroupSummary } from '@store/group-store';

// ---------------------------------------------------------------------------
// Container — builds the view model from stores.
// ---------------------------------------------------------------------------

/**
 * Map a stored `GroupSummary` into a `GroupListItemViewModel`.
 *
 * Pure projection — the screen never reads entity fields directly.
 */
function toListItem(group: GroupSummary): GroupListItemViewModel {
  return {
    id: group.id,
    name: group.name,
    memberCount: group.memberCount,
    userBalanceMinor: group.userBalanceMinor,
    currencyCode: group.currencyCode,
    lastActivityLabel: group.lastActivityLabel,
    syncState: group.syncState,
    archived: group.archived,
  };
}

export interface GroupsListScreenProps {
  /** Override the loaded flag (used by tests to drive the skeleton state). */
  readonly loadingOverride?: boolean;
}

export function GroupsListScreen({ loadingOverride }: GroupsListScreenProps): JSX.Element {
  const groups = useGroupStore((s) => s.groups);
  // Hydrates the cache from the SQLite read model (real balances, real
  // members, real sync state) and reports loading / error for the UI.
  const hydration = useGroupStoreHydration();
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // First paint uses the persisted cache (instant); the skeleton shows
  // only while the first SQLite pass is still in flight AND the cache
  // is empty, so a returning user never sees a flash of skeletons.
  const isLoading = loadingOverride ?? (hydration.loading && groups.length === 0);

  const viewModel = useMemo(
    () =>
      createGroupsListViewModel({
        groups: groups.map(toListItem),
        filter,
        searchQuery,
      }),
    [groups, filter, searchQuery],
  );

  return (
    <GroupsListView
      viewModel={viewModel}
      isLoading={isLoading}
      loadError={hydration.error}
      onRetry={hydration.retry}
      onFilterChange={setFilter}
      onSearchChange={setSearchQuery}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface GroupsListViewProps {
  readonly viewModel: GroupsListViewModel;
  readonly isLoading: boolean;
  /** Non-null when the SQLite hydration failed (retry offered). */
  readonly loadError?: string | null;
  readonly onRetry?: () => void;
  readonly onFilterChange: (filter: GroupFilter) => void;
  readonly onSearchChange: (query: string) => void;
}

const FILTER_PILLS: readonly { readonly value: GroupFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export function GroupsListView({
  viewModel,
  isLoading,
  loadError = null,
  onRetry,
  onFilterChange,
  onSearchChange,
}: GroupsListViewProps): JSX.Element {
  const handleCreateGroup = (): void => {
    router.push('/groups/new');
  };
  const handleJoinGroup = (): void => {
    router.push('/groups/join');
  };

  // FlatList (not ScrollView + map): the groups list is unbounded over a
  // member's lifetime. Only the visible window renders (performance
  // standard rule 5). The header (title, search, filters) stays pinned
  // via ListHeaderComponent so the empty/skeleton/error states still
  // render inside the list.
  return (
    <Screen safeArea>
      <FlatList
        data={viewModel.visibleGroups}
        keyExtractor={(group) => group.id}
        renderItem={({ item }) => <GroupListItem group={item} />}
        ItemSeparatorComponent={GroupsListSeparator}
        contentContainerStyle={{ padding: spacing.xl }}
        ListHeaderComponent={
          <Stack gap="lg" align="stretch" style={{ marginBottom: spacing.lg }}>
            <Row gap="md" align="center">
              <Stack gap={0} style={{ flex: 1 }}>
                <Text variant="screenTitle" color="primary" accessibilityRole="header">
                  Groups
                </Text>
                <Text variant="caption" color="muted">
                  {viewModel.allGroups.length}{' '}
                  {viewModel.allGroups.length === 1 ? 'group' : 'groups'}
                </Text>
              </Stack>
              <IconButton
                icon="search-outline"
                onPress={() => router.push('/search')}
                accessibilityLabel="Search all expenses"
              />
              <IconButton
                icon="add-circle-outline"
                onPress={handleCreateGroup}
                accessibilityLabel="Create a new group from the header"
              />
              <IconButton
                icon="person-add-outline"
                onPress={handleJoinGroup}
                accessibilityLabel="Join an existing group from the header"
              />
            </Row>

            <SearchInput
              value={viewModel.searchQuery}
              onChangeText={onSearchChange}
            />

            {!viewModel.hasNoGroups ? (
              <Row gap="xs" align="center">
                {FILTER_PILLS.map((pill) => (
                  <FilterPill
                    key={pill.value}
                    label={pill.label}
                    active={viewModel.filter === pill.value}
                    onPress={() => onFilterChange(pill.value)}
                  />
                ))}
              </Row>
            ) : null}
          </Stack>
        }
        ListEmptyComponent={
          isLoading ? (
            <GroupsListSkeleton />
          ) : loadError !== null ? (
            <GroupsLoadErrorState message={loadError} onRetry={onRetry} />
          ) : viewModel.hasNoGroups ? (
            <NoGroupsEmptyState
              onCreate={handleCreateGroup}
              onJoin={handleJoinGroup}
            />
          ) : viewModel.hasNoMatches ? (
            <NoMatchesState query={viewModel.searchQuery} />
          ) : null
        }
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'web'}
      />
    </Screen>
  );
}

function GroupsListSeparator(): ReactNode {
  return <View style={{ height: spacing.md }} />;
}

// ---------------------------------------------------------------------------
// Search input — uses raw RN TextInput styled with design-system tokens
// (the design system does not export a themed TextInput yet).
// ---------------------------------------------------------------------------

interface SearchInputProps {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}

function SearchInput({ value, onChangeText }: SearchInputProps): JSX.Element {
  const theme = useTheme();
  return (
    <Row
      gap="sm"
      align="center"
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: spacing.md,
        minHeight: 48,
      }}
    >
      <Icon name="search-outline" size={theme.iconSizes.md} color={theme.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search groups"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Search groups by name"
        accessibilityRole="search"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={[
          theme.typography.input,
          { color: theme.colors.textPrimary, flex: 1, paddingVertical: 0 },
        ]}
      />
      {value.length > 0 ? (
        <IconButton
          icon="close-circle"
          size="sm"
          variant="ghost"
          onPress={() => onChangeText('')}
          accessibilityLabel="Clear search"
        />
      ) : null}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Filter pill — toggle button styled with design-system primitives.
// ---------------------------------------------------------------------------

interface FilterPillProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}

function FilterPill({ label, active, onPress }: FilterPillProps): JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Filter groups: ${label}`}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: theme.borderRadius.full,
        backgroundColor: active ? theme.colors.brandPrimary : theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: active ? theme.colors.brandPrimary : theme.colors.border,
        minHeight: 32,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant="label"
        color={active ? 'onColor' : 'secondary'}
        style={{ fontSize: 13 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Group card — list item.
// ---------------------------------------------------------------------------

const SYNC_DOT_VARIANT: Readonly<Record<GroupListItemViewModel['syncState'], StatusDotVariant>> = {
  synced: 'syncComplete',
  pending: 'syncPending',
  failed: 'syncFailed',
  // Neutral grey: this device's data is the system of record (no cloud
  // configured). Previously every group showed the amber "Syncing" dot
  // forever because the cache wrote 'pending' and nothing ever updated it.
  local: 'confidenceUnknown',
};

const SYNC_LABEL: Readonly<Record<GroupListItemViewModel['syncState'], string>> = {
  synced: 'Synced',
  pending: 'Syncing',
  failed: 'Sync failed',
  local: 'Local only',
};

function GroupListItem({ group }: { readonly group: GroupListItemViewModel }): ReactNode {
  const theme = useTheme();

  const handleOpen = (): void => {
    router.push(`/groups/${group.id}`);
  };

  return (
    <Pressable
      onPress={handleOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open group ${group.name}. ${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}. ${SYNC_LABEL[group.syncState]}.`}
    >
      <Card elevation="sm" padding="lg">
        <Row gap="md" align="center">
          <Stack gap={0} style={{ flex: 1 }}>
            <Row gap="sm" align="center">
              <Text variant="cardTitle" color="primary" numberOfLines={1}>
                {group.name}
              </Text>
              {group.archived ? (
                <Text variant="caption" color="muted">
                  · Archived
                </Text>
              ) : null}
            </Row>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} ·{' '}
              {group.lastActivityLabel} · {group.currencyCode}
            </Text>
            <Row gap="xs" align="center" style={{ marginTop: spacing.xs }}>
              <StatusDot
                variant={SYNC_DOT_VARIANT[group.syncState]}
                accessibilityLabel={SYNC_LABEL[group.syncState]}
              />
              <Text variant="caption" color="secondary">
                {SYNC_LABEL[group.syncState]}
              </Text>
            </Row>
          </Stack>
          <Stack gap={0} align="flex-end">
            <AmountText
              amountMinor={group.userBalanceMinor}
              currencyCode={group.currencyCode}
              variant="amountMedium"
              accessibilityLabel={`${describeAmount(group.userBalanceMinor, group.currencyCode)} in ${group.name}`}
            />
          </Stack>
          <Icon
            name="chevron-forward"
            size={theme.iconSizes.md}
            color={theme.colors.textMuted}
          />
        </Row>
      </Card>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading state.
// ---------------------------------------------------------------------------

function GroupsListSkeleton(): ReactNode {
  return (
    <Stack gap="md" align="stretch" accessibilityLabel="Loading groups">
      {[0, 1, 2].map((i) => (
        <Card key={i} elevation="sm" padding="lg">
          <Row gap="md" align="center">
            <Stack gap="xs" style={{ flex: 1 }}>
              <Skeleton width="60%" height={18} />
              <Skeleton width="80%" height={14} />
              <Skeleton width="40%" height={12} />
            </Stack>
            <Skeleton width={72} height={28} />
          </Row>
        </Card>
      ))}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Empty states.
// ---------------------------------------------------------------------------

function NoGroupsEmptyState({
  onCreate,
  onJoin,
}: {
  readonly onCreate: () => void;
  readonly onJoin: () => void;
}): ReactNode {
  const theme = useTheme();

  return (
    <Card elevation="md" padding="xxl" accessibilityRole="text">
      <Stack gap="lg" align="center">
        <Row
          gap="sm"
          align="center"
          accessibilityLabel="Empty groups illustration"
          style={{
            width: 72,
            height: 72,
            borderRadius: theme.borderRadius.full,
            backgroundColor: theme.colors.surfaceMuted,
            justifyContent: 'center',
          }}
        >
          <Icon
            name="people-outline"
            size={theme.iconSizes.xl * 1.25}
            color={theme.colors.brandPrimary}
          />
        </Row>
        <Text variant="sectionTitle" color="primary" style={{ textAlign: 'center' }}>
          No groups yet
        </Text>
        <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
          Create a group to start tracking shared expenses, or join one with an invite link.
        </Text>
        <Stack gap="sm" align="stretch" style={{ width: '100%' }}>
          <Button
            label="Create Group"
            variant="primary"
            size="md"
            onPress={onCreate}
            accessibilityLabel="Create a new group"
            icon="add-circle-outline"
          />
          <Button
            label="Join Group"
            variant="secondary"
            size="md"
            onPress={onJoin}
            accessibilityLabel="Join an existing group with an invite code"
            icon="person-add-outline"
          />
        </Stack>
      </Stack>
    </Card>
  );
}

function NoMatchesState({ query }: { readonly query: string }): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="xxl" accessibilityRole="text">
      <Stack gap="sm" align="center">
        <Icon name="search-outline" size={theme.iconSizes.xl} color={theme.colors.textMuted} />
        <Text variant="bodyStrong" color="primary">
          No groups match
        </Text>
        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          Nothing matches “{query}”. Try a different search or filter.
        </Text>
      </Stack>
    </Card>
  );
}

function GroupsLoadErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg" accessibilityRole="alert">
      <Stack gap="md" align="stretch">
        <Row gap="md" align="center">
          <Icon
            name="cloud-offline-outline"
            size={theme.iconSizes.lg}
            color={theme.colors.negative}
          />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="bodyStrong" color="primary">
              Could not load your groups
            </Text>
            <Text variant="caption" color="secondary">
              {message}
            </Text>
          </Stack>
        </Row>
        {onRetry !== undefined ? (
          <Button
            label="Try again"
            variant="secondary"
            size="sm"
            onPress={onRetry}
            accessibilityLabel="Retry loading groups"
          />
        ) : null}
      </Stack>
    </Card>
  );
}
