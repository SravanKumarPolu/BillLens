/**
 * HomeDashboardScreen — the main "Home" tab (Prompt 15).
 *
 * Renders a dashboard with:
 *   - A time-based greeting + the user's display name.
 *   - Overall balance summary (you-are-owed / you-owe) grouped by
 *     currency, with an "all settled up" message when zero across the
 *     board.
 *   - Pending actions (receipt waiting for review, failed sync, low
 *     confidence draft field, duplicate warning) — or an empty state
 *     when none.
 *   - Recent groups list, or a first-run empty state with "Create
 *     Group" / "Scan First Receipt" CTAs when the user has no groups.
 *   - Pending drafts / failed sync banners, read from `useAppState`.
 *
 * Architecture:
 *   - The screen is split into a thin container (`HomeDashboardScreen`)
 *     that reads from `useGuestStore` / `useAppState` and builds a
 *     `HomeDashboardViewModel` via `createHomeDashboardViewModel`.
 *   - The pure presentational component `HomeDashboardView` reads ONLY
 *     from the view model — no stores, no domain entities. This makes
 *     the layout fully unit-testable.
 *
 * All colours come from `useTheme()`. All interactive elements carry an
 * `accessibilityLabel`. Layout uses ONLY design-system primitives.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { AmountText } from '@presentation/design-system/components/AmountText';
import { BentoGrid } from '@presentation/design-system/components/BentoGrid';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { describeAmount } from '@presentation/design-system/financial-format';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useHomeDashboardData } from '@presentation/hooks/use-home-dashboard-data';
import {
  type CurrencyBalanceEntry,
  type GroupCardViewModel,
  type HomeDashboardViewModel,
  type PendingActionViewModel,
  createHomeDashboardViewModel,
} from '@presentation/view-models/home-dashboard';
import { useAppState } from '@store/app-state-store';
import { useGroupStore } from '@store/group-store';
import { useGuestStore } from '@store/guest-store';

/** How many recent-group cards the dashboard shows (see view-model docs). */
const RECENT_GROUP_LIMIT = 3;

// ---------------------------------------------------------------------------
// Container — builds the view model from stores + the new dashboard-data hook.
// ---------------------------------------------------------------------------

/**
 * Build the dashboard view model from the current store state + the
 * dashboard-data hook.
 *
 * Data sources (composition-root era):
 *   - displayName / draft / sync flags → zustand stores (real data).
 *   - recentGroups → the persisted group store — the same source the
 *     Groups List tab reads. Groups created via "New group" appear here
 *     immediately.
 *   - pendingActions → DERIVED FROM REAL DATA via
 *     `useHomeDashboardData`:
 *       1. "X settlements awaiting your confirmation" (from
 *          `listPendingConfirmations` per group) — deep-links to the
 *          first group's balances screen.
 *       2. "M groups have outstanding balances" (from
 *          `generateSettlementSuggestions` per group) — deep-links to
 *          the Groups tab.
 *     The existing `useAppState.hasFailedSync` flag still surfaces the
 *     failed-sync pending-action card via the existing banner.
 *   - balances → empty until member-identity linking + the SQLite
 *     expense/settlement repository adapters land (Known Limitations).
 *     The query path itself is live via the composition root
 *     (`getAppServices().balances.*`); with no financial rows in the
 *     local database the legitimate result is the empty set — no fake
 *     financial data is ever rendered.
 */
export function useHomeDashboardViewModel(
  dashboardData: ReturnType<typeof useHomeDashboardData>,
): HomeDashboardViewModel {
  const displayName = useGuestStore((s) => s.displayName);
  // v2.5.0: all counters are DISTINCT and REAL now — pending sync =
  // queued/in-flight/retrying work, failed sync = conflict/permanently-
  // failed ops awaiting user review, pending drafts = persisted drafts
  // in needs_review/ready. Previously the failed count was aliased to
  // the pending count ("2 changes failed to sync" for merely-pending
  // work) and NOTHING ever populated either.
  const pendingDraftCount = useAppState((s) => s.pendingDraftCount);
  const hasPendingDrafts = useAppState((s) => s.hasPendingDrafts);
  const hasFailedSync = useAppState((s) => s.hasFailedSync);
  const failedSyncCount = useAppState((s) => s.failedSyncCount);
  const groups = useGroupStore((s) => s.groups);
  // Recent groups: real store data — non-archived, most recently active
  // first, capped to the three the dashboard card list is designed for.
  const recentGroups: readonly GroupCardViewModel[] = groups
    .filter((g) => !g.archived)
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, RECENT_GROUP_LIMIT)
    .map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      userBalanceMinor: g.userBalanceMinor,
      currencyCode: g.currencyCode,
      lastActivityLabel: g.lastActivityLabel,
    }));

  // Balances: REAL — sourced from the dashboard-data hook. Per-currency
  // net balance for the current user, summed across all groups (positive =
  // the user is owed; negative = the user owes). Empty when no group has
  // a member whose `userId === 'local-user'` (the pre-identity default).
  const balances: readonly CurrencyBalanceEntry[] = dashboardData.userBalances;

  // Phase 4 — zero vs unavailable: when a group's balance query failed
  // (or the whole load errored), the empty balance list must NOT be
  // presented as an authoritative "all settled up".
  const balancesUnavailable: boolean =
    dashboardData.error !== null || dashboardData.balancesUnavailableGroupIds.length > 0;

  // Pending actions: REAL — sourced from the dashboard-data hook.
  const pendingActions: readonly PendingActionViewModel[] = buildPendingActions(dashboardData);

  return createHomeDashboardViewModel({
    displayName: displayName.trim().length > 0 ? displayName.trim() : 'there',
    balances,
    balancesUnavailable,
    degradedGroupCount: dashboardData.degradedGroupIds.length,
    recentGroups,
    pendingActions,
    hasPendingDrafts,
    pendingDraftCount,
    hasFailedSync,
    failedSyncCount,
  });
}

/**
 * Derive the dashboard's pending-action cards from the real
 * dashboard-data view model.
 *
 * Each action carries:
 *   - a stable `id` (so React can reconcile the list)
 *   - a `kind` (drives the icon — see `PENDING_ACTION_ICONS`)
 *   - a human-readable title + description
 *   - a `targetRoute` for the deep link when the user taps "Open"
 */
function buildPendingActions(
  data: ReturnType<typeof useHomeDashboardData>,
): readonly PendingActionViewModel[] {
  const actions: PendingActionViewModel[] = [];

  if (data.pendingConfirmationCount > 0) {
    const firstGroup = data.firstPendingGroup;
    const targetRoute =
      firstGroup !== null
        ? `/groups/${encodeURIComponent(firstGroup.groupId)}/balances`
        : '/groups';
    const countLabel =
      data.pendingConfirmationCount === 1
        ? '1 settlement awaiting confirmation'
        : `${data.pendingConfirmationCount} settlements awaiting confirmation`;
    const groupCount = data.pendingConfirmationGroups.length;
    const description =
      groupCount === 1
        ? `In ${data.pendingConfirmationGroups[0]!.groupName}.`
        : `Across ${groupCount} groups.`;
    actions.push({
      id: 'pending-confirmations',
      kind: 'receipt-waiting-for-review',
      title: countLabel,
      description,
      targetRoute,
    });
  }

  if (data.outstandingBalancesGroups.length > 0) {
    const total = data.suggestedTransferCount;
    const title =
      total === 1
        ? '1 outstanding settlement suggested'
        : `${total} outstanding settlements suggested`;
    const groupCount = data.outstandingBalancesGroups.length;
    const description =
      groupCount === 1
        ? `In ${data.outstandingBalancesGroups[0]!.groupName}.`
        : `Across ${groupCount} groups.`;
    actions.push({
      id: 'outstanding-balances',
      kind: 'duplicate-warning',
      title,
      description,
      targetRoute: '/groups',
    });
  }

  return actions;
}

export function HomeDashboardScreen(): JSX.Element {
  // Single dashboard-data instance — the view-model builder receives
  // it as a parameter so retry and data share ONE load loop (Phase 4:
  // no duplicate loads / re-renders).
  const dashboardData = useHomeDashboardData();
  const viewModel = useHomeDashboardViewModel(dashboardData);
  return (
    <HomeDashboardView viewModel={viewModel} onRetryLoad={dashboardData.retry} />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface HomeDashboardViewProps {
  readonly viewModel: HomeDashboardViewModel;
  /** Retry the dashboard data load (degraded / error state). */
  readonly onRetryLoad?: () => void;
}

export function HomeDashboardView({
  viewModel,
  onRetryLoad,
}: HomeDashboardViewProps): JSX.Element {
  const theme = useTheme();
  const greetingLine = `${viewModel.greeting}, ${viewModel.displayName}`;

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text
            variant="screenTitle"
            color="primary"
            accessibilityRole="header"
            accessibilityLabel={`${greetingLine}. Welcome to your BillLens dashboard.`}
          >
            {greetingLine}
          </Text>
          <Text variant="body" color="secondary">
            Here&apos;s a snapshot of your shared expenses.
          </Text>
        </Stack>

        <BalanceSummary viewModel={viewModel} onRetryLoad={onRetryLoad} />

        {/* Phase 4 — partial degradation notice (queries other than
            balances failed for some groups; data shown is partial). */}
        {viewModel.degradedWarning !== null && !viewModel.balancesUnavailable ? (
          <Card
            elevation="none"
            padding="md"
            accessibilityRole="alert"
            testID="degraded-warning"
          >
            <Row gap="sm" align="center">
              <Icon
                name="warning-outline"
                size={theme.iconSizes.md}
                color={theme.colors.warning}
              />
              <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                {viewModel.degradedWarning} Numbers shown may be incomplete.
              </Text>
            </Row>
          </Card>
        ) : null}

        <PendingDraftsAndSyncSection viewModel={viewModel} />

        <PendingActionsSection viewModel={viewModel} />

        <RecentGroupsSection viewModel={viewModel} />
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Balance summary.
// ---------------------------------------------------------------------------

interface BalanceSummaryProps {
  readonly viewModel: HomeDashboardViewModel;
  readonly onRetryLoad?: () => void;
}

function BalanceSummary({ viewModel, onRetryLoad }: BalanceSummaryProps): ReactNode {
  const theme = useTheme();

  // Phase 4 — zero vs unavailable: a failed balance query must NEVER
  // render as an authoritative "all settled up".
  if (viewModel.balancesUnavailable) {
    return (
      <Card
        elevation="sm"
        padding="lg"
        accessibilityRole="alert"
        testID="balances-unavailable"
      >
        <Stack gap="xs" align="center">
          <Icon
            name="cloud-offline-outline"
            size={theme.iconSizes.xl}
            color={theme.colors.warning}
          />
          <Text variant="cardTitle" color="primary">
            Balances unavailable
          </Text>
          <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
            Some of your groups’ balances could not be loaded right now.
          </Text>
          {onRetryLoad !== undefined ? (
            <Button
              label="Try again"
              variant="ghost"
              onPress={onRetryLoad}
              accessibilityLabel="Retry loading your balances"
            />
          ) : null}
        </Stack>
      </Card>
    );
  }

  if (viewModel.isAllSettledUp) {
    return (
      <Card elevation="sm" padding="lg" accessibilityRole="text">
        <Stack gap="xs" align="center">
          <Icon
            name="checkmark-circle"
            size={theme.iconSizes.xl}
            color={theme.colors.positive}
          />
          <Text variant="cardTitle" color="primary">
            You&apos;re all settled up
          </Text>
          <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
            No outstanding balances across your groups.
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Your balances
      </Text>
      <BentoGrid gap={spacing.md}>
        <Card elevation="sm" padding="lg">
          <Stack gap="xs" align="stretch">
            <Text variant="label" color="positive">
              You are owed
            </Text>
            {viewModel.owedByCurrency.length === 0 ? (
              <Text variant="amountMedium" color="secondary">
                —
              </Text>
            ) : (
              <Stack gap="xs" align="stretch">
                {viewModel.owedByCurrency.map((entry) => (
                  <AmountText
                    key={`owed-${entry.currencyCode}`}
                    amountMinor={entry.amountMinor}
                    currencyCode={entry.currencyCode}
                    variant="amountMedium"
                    accessibilityLabel={`You are owed in ${entry.currencyCode}: ${describeAmount(entry.amountMinor, entry.currencyCode, { includeDirection: false })}`}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
        <Card elevation="sm" padding="lg">
          <Stack gap="xs" align="stretch">
            <Text variant="label" color="negative">
              You owe
            </Text>
            {viewModel.owedToCurrency.length === 0 ? (
              <Text variant="amountMedium" color="secondary">
                —
              </Text>
            ) : (
              <Stack gap="xs" align="stretch">
                {viewModel.owedToCurrency.map((entry) => (
                  <AmountText
                    key={`owe-${entry.currencyCode}`}
                    amountMinor={-entry.amountMinor}
                    currencyCode={entry.currencyCode}
                    variant="amountMedium"
                    accessibilityLabel={`You owe in ${entry.currencyCode}: ${describeAmount(-entry.amountMinor, entry.currencyCode, { includeDirection: false })}`}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </BentoGrid>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Pending drafts / failed sync section.
// ---------------------------------------------------------------------------

function PendingDraftsAndSyncSection({ viewModel }: HomeDashboardViewProps): ReactNode {
  const theme = useTheme();

  if (!viewModel.hasPendingDrafts && !viewModel.hasFailedSync) {
    return null;
  }

  const handleRetrySync = (): void => {
    router.push('/settings');
  };

  const handleReviewDrafts = (): void => {
    router.push('/drafts');
  };

  return (
    <Stack gap="md" align="stretch">
      {viewModel.hasPendingDrafts ? (
        <Card
          elevation="sm"
          padding="lg"
          accessibilityRole="text"
          accessibilityLabel={`You have ${viewModel.pendingDraftCount} drafts waiting for review.`}
        >
          <Row gap="md" align="center">
            <Icon
              name="document-text-outline"
              size={theme.iconSizes.lg}
              color={theme.colors.warning}
            />
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="primary">
                You have {viewModel.pendingDraftCount}{' '}
                {viewModel.pendingDraftCount === 1 ? 'draft' : 'drafts'} waiting for review
              </Text>
              <Text variant="caption" color="secondary">
                Review extracted values before they are confirmed.
              </Text>
            </Stack>
            <Button
              label="Review"
              variant="secondary"
              size="sm"
              onPress={handleReviewDrafts}
              accessibilityLabel="Review your pending drafts"
            />
          </Row>
        </Card>
      ) : null}

      {viewModel.hasFailedSync ? (
        <Card
          elevation="sm"
          padding="lg"
          accessibilityRole="text"
          accessibilityLabel={`${viewModel.failedSyncCount} changes failed to sync.`}
        >
          <Row gap="md" align="center">
            <Icon
              name="cloud-offline-outline"
              size={theme.iconSizes.lg}
              color={theme.colors.negative}
            />
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="primary">
                {viewModel.failedSyncCount} changes failed to sync
              </Text>
              <Text variant="caption" color="secondary">
                Review your sync settings to retry.
              </Text>
            </Stack>
            <Button
              label="Retry"
              variant="secondary"
              size="sm"
              onPress={handleRetrySync}
              accessibilityLabel="Retry failed sync operations"
            />
          </Row>
        </Card>
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Pending actions section.
// ---------------------------------------------------------------------------

const PENDING_ACTION_ICONS: Readonly<Record<PendingActionViewModel['kind'], string>> = {
  'receipt-waiting-for-review': 'document-text-outline',
  'failed-sync-operation': 'cloud-offline-outline',
  'low-confidence-draft-field': 'warning-outline',
  'duplicate-warning': 'copy-outline',
};

function PendingActionsSection({ viewModel }: HomeDashboardViewProps): ReactNode {
  const theme = useTheme();

  const handleActionPress = (action: PendingActionViewModel): void => {
    router.push(action.targetRoute);
  };

  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Pending actions
      </Text>
      {!viewModel.hasPendingActions ? (
        <Card elevation="none" padding="lg">
          <Stack gap="xs" align="center">
            <Icon
              name="checkmark-done-outline"
              size={theme.iconSizes.xl}
              color={theme.colors.positive}
            />
            <Text variant="bodyStrong" color="primary">
              No pending actions
            </Text>
            <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
              You&apos;re all caught up.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="md" align="stretch">
          {viewModel.pendingActions.map((action) => (
            <Card key={action.id} elevation="sm" padding="lg">
              <Row gap="md" align="center">
                <Icon
                  name={PENDING_ACTION_ICONS[action.kind] ?? 'alert-circle-outline'}
                  size={theme.iconSizes.lg}
                  color={theme.colors.warning}
                />
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color="primary">
                    {action.title}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {action.description}
                  </Text>
                </Stack>
                <Button
                  label="Open"
                  variant="ghost"
                  size="sm"
                  onPress={() => handleActionPress(action)}
                  accessibilityLabel={action.title}
                />
              </Row>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Recent groups section + first-run empty state.
// ---------------------------------------------------------------------------

function RecentGroupsSection({ viewModel }: HomeDashboardViewProps): ReactNode {
  if (viewModel.hasNoGroups) {
    return <NoGroupsEmptyState />;
  }

  const handleViewAll = (): void => {
    router.push('/groups');
  };

  return (
    <Stack gap="md" align="stretch">
      <Row gap="sm" align="center">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Recent Groups
        </Text>
        <Button
          label="View all"
          variant="ghost"
          size="sm"
          onPress={handleViewAll}
          accessibilityLabel="View all groups"
        />
      </Row>
      <Stack gap="md" align="stretch">
        {viewModel.recentGroups.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </Stack>
    </Stack>
  );
}

function GroupCard({ group }: { readonly group: GroupCardViewModel }): ReactNode {
  const theme = useTheme();
  const handleOpen = (): void => {
    router.push(`/groups/${group.id}`);
  };

  // The whole card is the target. A chevron-only target made the card
  // look tappable while leaving most of its surface inert, and gave the
  // row two focus stops for one destination.
  return (
    <Pressable
      onPress={handleOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open group ${group.name}. ${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}.`}
      accessibilityHint="Opens the group dashboard"
    >
      {({ pressed }) => (
        <Card
          elevation={pressed ? 'none' : 'sm'}
          padding="lg"
          style={pressed ? { backgroundColor: theme.colors.surfaceMuted } : undefined}
        >
          <Row gap="md" align="center">
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="cardTitle" color="primary">
                {group.name}
              </Text>
              <Text variant="caption" color="muted">
                {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} ·{' '}
                {group.lastActivityLabel}
              </Text>
            </Stack>
            <Stack gap={0} align="flex-end">
              <AmountText
                amountMinor={group.userBalanceMinor}
                currencyCode={group.currencyCode}
                variant="amountSmall"
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
      )}
    </Pressable>
  );
}

function NoGroupsEmptyState(): ReactNode {
  const theme = useTheme();

  const handleCreateGroup = (): void => {
    router.push('/groups/new');
  };

  const handleScanReceipt = (): void => {
    router.push('/capture');
  };

  return (
    <Card elevation="md" padding="xxl" accessibilityRole="text">
      <Stack gap="lg" align="center">
        <Row
          gap="sm"
          align="center"
          accessibilityLabel="Welcome illustration"
          style={{
            width: 72,
            height: 72,
            borderRadius: theme.borderRadius.full,
            backgroundColor: theme.colors.surfaceMuted,
            justifyContent: 'center',
          }}
        >
          <Icon
            name="receipt-outline"
            size={theme.iconSizes.xl * 1.25}
            color={theme.colors.brandPrimary}
          />
        </Row>
        <Text variant="sectionTitle" color="primary" style={{ textAlign: 'center' }}>
          Welcome to BillLens!
        </Text>
        <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
          Create a group to start tracking expenses together.
        </Text>
        <Stack gap="sm" align="stretch" style={{ width: '100%' }}>
          <Button
            label="Create Group"
            variant="primary"
            size="md"
            onPress={handleCreateGroup}
            accessibilityLabel="Create your first group"
            icon="add-circle-outline"
          />
          <Button
            label="Scan First Receipt"
            variant="secondary"
            size="md"
            onPress={handleScanReceipt}
            accessibilityLabel="Scan your first receipt"
            icon="scan-outline"
          />
        </Stack>
      </Stack>
    </Card>
  );
}
