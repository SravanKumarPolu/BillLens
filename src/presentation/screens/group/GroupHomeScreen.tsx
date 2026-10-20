/**
 * GroupHomeScreen — per-group home (Prompt 16), POLISHED with real data.
 *
 * Renders:
 *   - Group name in the header.
 *   - A balance-summary card (you owe / are owed / settled up, with an
 *     honest "outstanding balances" state when the GROUP still has
 *     suggested transfers but the user-scoped balance is zero).
 *   - A row of 4 primary actions: Add Expense, Scan Receipt, Record
 *     Settlement, Invite Member.
 *   - A recent-expenses section (list of cards, or empty state).
 *   - A suggested-settlements section (list of transfer suggestions
 *     from the multi-currency balance engine, or empty state).
 *   - A member-summary row of avatars.
 *
 * Data sources (composition-root era):
 *   - Group name / currency / members / recent expenses / suggested
 *     transfers → `useGroupDashboardData` (real repository reads through
 *     the services registry — the same SQLite tables the manual expense
 *     form writes to).
 *   - The user-scoped `userBalanceMinor` → the persisted group store
 *     (honest zero until the identity adapters land — no fake numbers).
 *
 * Architecture:
 *   - The thin container `GroupHomeScreen` reads `useGroupStore` +
 *     `useGroupDashboardData` and builds a `GroupDetailViewModel` via
 *     `createGroupDetailViewModel`.
 *   - The pure presentational component `GroupHomeView` reads ONLY
 *     from the view model (+ optional loading / error states).
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { AmountText } from '@presentation/design-system/components/AmountText';
import { Avatar } from '@presentation/design-system/components/Avatar';
import { BentoGrid } from '@presentation/design-system/components/BentoGrid';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useGroupDashboardData } from '@presentation/hooks/use-group-dashboard';
import {
  type GroupDetailViewModel,
  createGroupDetailViewModel,
} from '@presentation/view-models/groups';
import { useGroupStore } from '@store/group-store';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface GroupHomeScreenProps {
  readonly groupId: string;
}

export function GroupHomeScreen({ groupId }: GroupHomeScreenProps): JSX.Element {
  const group = useGroupStore((s) => s.groups.find((g) => g.id === groupId));
  const dashboard = useGroupDashboardData(groupId);

  // Prefer the store for the user-scoped fields it owns; fall back to the
  // repository's group header when the store has not hydrated yet
  // (e.g. deep link on cold start).
  const memberCount =
    dashboard.members.length > 0 ? dashboard.members.length : (group?.memberCount ?? 0);

  const viewModel = createGroupDetailViewModel({
    id: groupId,
    name: group?.name ?? dashboard.groupName ?? 'Group',
    currencyCode: group?.currencyCode ?? dashboard.groupCurrencyCode ?? 'USD',
    memberCount,
    userBalanceMinor: group?.userBalanceMinor ?? 0,
    recentExpenses: dashboard.recentExpenses,
    suggestedTransfers: dashboard.suggestedTransfers,
    members: dashboard.members,
  });

  return (
    <GroupHomeView
      viewModel={viewModel}
      isLoading={dashboard.loading}
      loadError={dashboard.error}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface GroupHomeViewProps {
  readonly viewModel: GroupDetailViewModel;
  /** True while the first repository load is in flight. */
  readonly isLoading?: boolean;
  /** Non-null when the repository load failed. */
  readonly loadError?: string | null;
}

export function GroupHomeView({
  viewModel,
  isLoading = false,
  loadError = null,
}: GroupHomeViewProps): JSX.Element {
  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header" numberOfLines={1}>
            {viewModel.name}
          </Text>
          <Text variant="caption" color="muted">
            {viewModel.memberCount}{' '}
            {viewModel.memberCount === 1 ? 'member' : 'members'} · {viewModel.currencyCode}
          </Text>
        </Stack>

        {loadError !== null ? <LoadErrorCard message={loadError} /> : null}

        {isLoading ? <LoadingCard /> : null}

        <BalanceSummary viewModel={viewModel} />

        <PrimaryActions groupId={viewModel.id} />

        <RecentExpensesSection viewModel={viewModel} />

        <SuggestedSettlementsSection viewModel={viewModel} />

        <MembersSection viewModel={viewModel} />
      </Stack>
    </Screen>
  );
}

function LoadingCard(): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="md" accessibilityRole="text">
      <Row gap="md" align="center">
        <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
        <Text variant="caption" color="secondary">
          Loading this group&apos;s expenses and balances…
        </Text>
      </Row>
    </Card>
  );
}

function LoadErrorCard({ message }: { readonly message: string }): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="md" accessibilityRole="alert">
      <Row gap="md" align="center">
        <Icon
          name="cloud-offline-outline"
          size={theme.iconSizes.lg}
          color={theme.colors.negative}
        />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            Some content could not load
          </Text>
          <Text variant="caption" color="secondary">
            {message}
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Balance summary
// ---------------------------------------------------------------------------

function BalanceSummary({ viewModel }: GroupHomeViewProps): ReactNode {
  const theme = useTheme();

  if (viewModel.isAllSettledUp) {
    // The user-scoped balance is zero — but the GROUP may still have
    // outstanding member-to-member debts. Rendering "all settled up"
    // while transfers are suggested below would be misleading, so the
    // honest state names the outstanding balances instead.
    if (viewModel.hasSuggestedTransfers) {
      return (
        <Card elevation="sm" padding="lg" accessibilityRole="text">
          <Stack gap="xs" align="center">
            <Icon
              name="swap-horizontal-outline"
              size={theme.iconSizes.xl}
              color={theme.colors.warning}
            />
            <Text variant="cardTitle" color="primary">
              Outstanding balances in this group
            </Text>
            <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
              {viewModel.suggestedTransfers.length}{' '}
              {viewModel.suggestedTransfers.length === 1
                ? 'settlement is'
                : 'settlements are'}{' '}
              suggested below to even things out.
            </Text>
          </Stack>
        </Card>
      );
    }
    return (
      <Card elevation="sm" padding="lg" accessibilityRole="text">
        <Stack gap="xs" align="center">
          <Icon name="checkmark-circle" size={theme.iconSizes.xl} color={theme.colors.positive} />
          <Text variant="cardTitle" color="primary">
            All settled up
          </Text>
          <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
            No outstanding balances in this group.
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="xs" align="stretch">
        <Text variant="label" color={viewModel.userIsOwed ? 'positive' : 'negative'}>
          {viewModel.userIsOwed ? 'You are owed' : 'You owe'}
        </Text>
        <AmountText
          amountMinor={viewModel.userBalanceMinor}
          currencyCode={viewModel.currencyCode}
          variant="amountLarge"
          accessibilityLabel={`Your balance in this group is ${viewModel.userBalanceMinor} minor units in ${viewModel.currencyCode}`}
        />
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Primary actions — row of 4 IconButtons.
// ---------------------------------------------------------------------------

interface PrimaryActionsProps {
  readonly groupId: string;
}

function PrimaryActions({ groupId }: PrimaryActionsProps): ReactNode {
  const handleAddExpense = (): void => {
    router.push(`/expenses/new?groupId=${encodeURIComponent(groupId)}`);
  };
  const handleScanReceipt = (): void => {
    router.push(`/capture?groupId=${encodeURIComponent(groupId)}`);
  };
  const handleRecordSettlement = (): void => {
    router.push(`/settlements/new?groupId=${encodeURIComponent(groupId)}`);
  };
  const handleInviteMember = (): void => {
    // Phase 2: invite link generation lives in GroupSettingsScreen.
    router.push(`/groups/${encodeURIComponent(groupId)}/settings`);
  };

  return (
    <BentoGrid gap={spacing.sm}>
      <ActionCard
        icon="cash-outline"
        label="Add Expense"
        onPress={handleAddExpense}
        accessibilityLabel="Add a new expense to this group"
      />
      <ActionCard
        icon="scan-outline"
        label="Scan Receipt"
        onPress={handleScanReceipt}
        accessibilityLabel="Scan a receipt for this group"
      />
      <ActionCard
        icon="swap-horizontal-outline"
        label="Record Settlement"
        onPress={handleRecordSettlement}
        accessibilityLabel="Record a settlement in this group"
      />
      <ActionCard
        icon="person-add-outline"
        label="Invite Member"
        onPress={handleInviteMember}
        accessibilityLabel="Invite a member to this group"
      />
    </BentoGrid>
  );
}

interface ActionCardProps {
  readonly icon: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
}

function ActionCard({ icon, label, onPress, accessibilityLabel }: ActionCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ flex: 1, minWidth: 140 }}
    >
      {({ pressed }) => (
        <Card
          elevation={pressed ? 'none' : 'sm'}
          padding="md"
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
          }}
        >
          <Stack gap="xs" align="center">
            <Icon name={icon} size={theme.iconSizes.xl} color={theme.colors.brandPrimary} />
            <Text variant="caption" color="primary" style={{ textAlign: 'center' }}>
              {label}
            </Text>
          </Stack>
        </Card>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Recent expenses
// ---------------------------------------------------------------------------

function RecentExpensesSection({ viewModel }: GroupHomeViewProps): ReactNode {
  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Recent expenses
      </Text>
      {!viewModel.hasRecentExpenses ? (
        <EmptySectionCard
          icon="receipt-outline"
          title="No expenses yet"
          message="Add an expense or scan a receipt to get started."
        />
      ) : (
        <Stack gap="md" align="stretch">
          {viewModel.recentExpenses.map((expense) => (
            <Card key={expense.id} elevation="sm" padding="lg">
              <Row gap="md" align="center">
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color="primary">
                    {expense.description}
                  </Text>
                  <Text variant="caption" color="muted">
                    {expense.payerName} · {expense.dateLabel}
                  </Text>
                </Stack>
                <AmountText
                  amountMinor={expense.amountMinor}
                  currencyCode={expense.currencyCode}
                  variant="amountSmall"
                  showCurrencySymbol
                  accessibilityLabel={`${expense.description}: ${expense.amountMinor} ${expense.currencyCode}`}
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
// Suggested settlements
// ---------------------------------------------------------------------------

function SuggestedSettlementsSection({ viewModel }: GroupHomeViewProps): ReactNode {
  if (!viewModel.hasSuggestedTransfers) {
    return (
      <Stack gap="md" align="stretch">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Suggested settlements
        </Text>
        <EmptySectionCard
          icon="checkmark-done-outline"
          title="Nothing to settle"
          message="Balances are zero — everyone is even."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Suggested settlements
      </Text>
      <Stack gap="md" align="stretch">
        {viewModel.suggestedTransfers.map((transfer) => (
          <Card key={transfer.id} elevation="sm" padding="lg">
            <Row gap="md" align="center">
              <Stack gap={0} style={{ flex: 1 }}>
                <Text variant="body" color="primary">
                  {transfer.fromMemberName} pays {transfer.toMemberName}
                </Text>
                <Text variant="caption" color="muted">
                  Settlement suggestion
                </Text>
              </Stack>
              <AmountText
                amountMinor={transfer.amountMinor}
                currencyCode={transfer.currencyCode}
                variant="amountSmall"
                accessibilityLabel={`Suggested settlement of ${transfer.amountMinor} ${transfer.currencyCode} from ${transfer.fromMemberName} to ${transfer.toMemberName}`}
              />
            </Row>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Members row
// ---------------------------------------------------------------------------

function MembersSection({ viewModel }: GroupHomeViewProps): ReactNode {
  if (!viewModel.hasMembers) {
    return null;
  }
  // Cap the avatar row at 5 visible avatars — overflow falls back to
  // a "+N" pill rendered by the screen. Phase 2: empty members list.
  const visible = viewModel.members.slice(0, 5);
  const overflow = viewModel.members.length - visible.length;

  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Members
      </Text>
      <Row gap="sm" align="center">
        {visible.map((member) => (
          <Avatar
            key={member.id}
            name={member.displayName}
            size="md"
            accessibilityLabel={`${member.displayName}${member.isCurrentUser ? ' (you)' : ''}`}
          />
        ))}
        {overflow > 0 ? (
          <Card elevation="none" padding="sm" style={{ borderRadius: 9999 }}>
            <Text variant="caption" color="secondary">
              +{overflow}
            </Text>
          </Card>
        ) : null}
      </Row>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Empty-section card
// ---------------------------------------------------------------------------

interface EmptySectionCardProps {
  readonly icon: string;
  readonly title: string;
  readonly message: string;
}

function EmptySectionCard({ icon, title, message }: EmptySectionCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="lg" accessibilityRole="text">
      <Stack gap="xs" align="center">
        <Icon name={icon} size={theme.iconSizes.lg} color={theme.colors.textMuted} />
        <Text variant="bodyStrong" color="primary">
          {title}
        </Text>
        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          {message}
        </Text>
      </Stack>
    </Card>
  );
}
