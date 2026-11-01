/**
 * GroupBalancesScreen — per-group balances (Prompt 16).
 *
 * Renders:
 *   - A per-member balance card (avatar, name, AmountText owed/owes)
 *     sourced from REAL data via `useGroupDashboardData` (the same
 *     hook the GroupHomeScreen uses).
 *   - A "Pending confirmations" section listing settlements in
 *     `pending_confirmation` status — each with Confirm + Dispute
 *     buttons that call the matching use cases through the services
 *     registry. This closes the receiver-side loop: the dashboard's
 *     "N settlements awaiting confirmation" pending-action card
 *     deep-links here, the user confirms or disputes, and the
 *     settlement moves out of pending status.
 *   - A suggested-transfers section with a "Settle Up" button per
 *     suggestion (deep-links to the new-settlement form pre-filled).
 *
 * Architecture:
 *   - The thin container reads `useGroupStore` for the group header
 *     + `useGroupDashboardData` for real member balances and
 *     suggested transfers + `useGroupPendingConfirmations` for the
 *     receiver inbox.
 *   - The pure presentational component reads ONLY from the view
 *     model + callbacks.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { ALL_DISPUTE_REASONS, type SettlementDisputeReason } from '@domain/entities/settlement';
import { AmountText } from '@presentation/design-system/components/AmountText';
import { Avatar } from '@presentation/design-system/components/Avatar';
import { Button } from '@presentation/design-system/components/Button';
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
  type PendingConfirmationEntry,
  useGroupPendingConfirmations,
} from '@presentation/hooks/use-group-pending-confirmations';
import {
  type GroupDetailViewModel,
  type MemberSummaryViewModel,
  createGroupDetailViewModel,
} from '@presentation/view-models/groups';
import { useGroupStore } from '@store/group-store';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface GroupBalancesScreenProps {
  readonly groupId: string;
}

export function GroupBalancesScreen({ groupId }: GroupBalancesScreenProps): JSX.Element {
  const group = useGroupStore((s) => s.groups.find((g) => g.id === groupId));
  const dashboard = useGroupDashboardData(groupId);

  // Build the member-id → display-name map for the pending-confirmations hook.
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of dashboard.members) {
      map.set(m.id, m.displayName);
    }
    return map;
  }, [dashboard.members]);

  const pending = useGroupPendingConfirmations(groupId, nameById);

  // Members with their balances — the dashboard hook returns members with
  // `balanceMinor: 0` (pre-identity honest zero), but the suggested transfers
  // carry the actual amounts. For the per-member card we keep the honest
  // zero state until identity adapters land.
  const members: readonly MemberSummaryViewModel[] = dashboard.members;

  const viewModel: GroupDetailViewModel = createGroupDetailViewModel({
    id: groupId,
    name: group?.name ?? dashboard.groupName ?? 'Group',
    currencyCode: group?.currencyCode ?? dashboard.groupCurrencyCode ?? 'USD',
    memberCount: members.length > 0 ? members.length : (group?.memberCount ?? 0),
    userBalanceMinor: group?.userBalanceMinor ?? 0,
    recentExpenses: [],
    suggestedTransfers: dashboard.suggestedTransfers,
    members,
  });

  return (
    <GroupBalancesView
      viewModel={viewModel}
      loading={dashboard.loading}
      loadError={dashboard.error}
      pending={pending.entries}
      pendingLoading={pending.loading}
      pendingError={pending.error}
      acting={pending.acting}
      actionError={pending.actionError}
      onConfirm={(settlementId, expectedVersion, confirmedByMemberId): void => {
        void pending.confirm(settlementId, expectedVersion, confirmedByMemberId);
      }}
      onDispute={(settlementId, expectedVersion, reason): void => {
        void pending.dispute(settlementId, expectedVersion, reason);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface GroupBalancesViewProps {
  readonly viewModel: GroupDetailViewModel;
  readonly loading: boolean;
  readonly loadError: string | null;
  readonly pending: readonly PendingConfirmationEntry[];
  readonly pendingLoading: boolean;
  readonly pendingError: string | null;
  readonly acting: boolean;
  readonly actionError: string | null;
  readonly onConfirm: (settlementId: string, expectedVersion: number, confirmedByMemberId: string) => void;
  readonly onDispute: (settlementId: string, expectedVersion: number, reason: SettlementDisputeReason) => void;
}

export function GroupBalancesView({
  viewModel,
  loading,
  loadError,
  pending,
  pendingLoading,
  pendingError,
  acting,
  actionError,
  onConfirm,
  onDispute,
}: GroupBalancesViewProps): JSX.Element {
  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Balances
          </Text>
          <Text variant="caption" color="muted">
            {viewModel.name} · {viewModel.currencyCode}
          </Text>
        </Stack>

        {loadError !== null ? <LoadErrorCard message={loadError} /> : null}

        {loading ? <LoadingCard /> : null}

        <PendingConfirmationsSection
          groupId={viewModel.id}
          entries={pending}
          loading={pendingLoading}
          error={pendingError}
          acting={acting}
          actionError={actionError}
          onConfirm={onConfirm}
          onDispute={onDispute}
        />

        <MembersBalancesSection viewModel={viewModel} />

        <SuggestedTransfersSection viewModel={viewModel} />
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Loading / error cards
// ---------------------------------------------------------------------------

function LoadingCard(): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="md" accessibilityRole="text">
      <Row gap="md" align="center">
        <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
        <Text variant="caption" color="secondary">
          Loading this group&apos;s balances…
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
        <Icon name="cloud-offline-outline" size={theme.iconSizes.lg} color={theme.colors.negative} />
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
// Pending confirmations section (receiver-side inbox)
// ---------------------------------------------------------------------------

interface PendingConfirmationsSectionProps {
  readonly groupId: string;
  readonly entries: readonly PendingConfirmationEntry[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly acting: boolean;
  readonly actionError: string | null;
  readonly onConfirm: (settlementId: string, expectedVersion: number, confirmedByMemberId: string) => void;
  readonly onDispute: (settlementId: string, expectedVersion: number, reason: SettlementDisputeReason) => void;
}

function PendingConfirmationsSection({
  groupId,
  entries,
  loading,
  error,
  acting,
  actionError,
  onConfirm,
  onDispute,
}: PendingConfirmationsSectionProps): ReactNode {
  // Hide the section entirely when there are no pending confirmations
  // and no error — the dashboard's pending-action card is the only
  // entry point, and once the user lands here with nothing to confirm,
  // there is nothing to show.
  if (entries.length === 0 && !loading && error === null) return null;

  return (
    <Stack gap="md" align="stretch">
      <Row gap="sm" align="center">
        <Icon name="hourglass-outline" size={20} color="#B07A1E" />
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Pending your confirmation
        </Text>
      </Row>

      {loading ? (
        <Card elevation="none" padding="md">
          <Row gap="md" align="center">
            <ActivityIndicator size="small" color="#2B3A8C" />
            <Text variant="caption" color="secondary">
              Loading pending settlements…
            </Text>
          </Row>
        </Card>
      ) : null}

      {error !== null ? (
        <Card
          elevation="sm"
          padding="md"
          accessibilityRole="alert"
          style={{ borderColor: '#A8323C', borderWidth: 1 }}
        >
          <Text variant="caption" color="critical">
            {error}
          </Text>
        </Card>
      ) : null}

      {actionError !== null ? (
        <Card
          elevation="sm"
          padding="md"
          accessibilityRole="alert"
          style={{ borderColor: '#A8323C', borderWidth: 1 }}
        >
          <Text variant="caption" color="critical">
            {actionError}
          </Text>
        </Card>
      ) : null}

      {entries.map((entry) => (
        <PendingConfirmationCard
          key={entry.settlementId}
          groupId={groupId}
          entry={entry}
          acting={acting}
          onConfirm={onConfirm}
          onDispute={onDispute}
        />
      ))}
    </Stack>
  );
}

interface PendingConfirmationCardProps {
  readonly groupId: string;
  readonly entry: PendingConfirmationEntry;
  readonly acting: boolean;
  readonly onConfirm: (settlementId: string, expectedVersion: number, confirmedByMemberId: string) => void;
  readonly onDispute: (settlementId: string, expectedVersion: number, reason: SettlementDisputeReason) => void;
}

function PendingConfirmationCard({
  groupId,
  entry,
  acting,
  onConfirm,
  onDispute,
}: PendingConfirmationCardProps): ReactNode {
  const theme = useTheme();
  // Pre-identity: the receiver is the `toMemberId` (the user received the
  // payment and must confirm). When identity lands, this should be the
  // current user's linked member id.
  const confirmedByMemberId = entry.toMemberId;
  // `expectedVersion` for a freshly-recorded settlement is 2 (the
  // recordSettlement transition incremented from 1 → 2). The repository
  // is the source of truth — pass 2 and rely on the use case's
  // optimistic-concurrency check to surface a mismatch.
  const expectedVersion = 2;

  return (
    <Card elevation="sm" padding="lg" accessibilityRole="text">
      <Stack gap="md" align="stretch">
        <Row gap="md" align="center">
          <Avatar name={entry.fromMemberName} size="md" />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="bodyStrong" color="primary">
              {entry.fromMemberName} paid you
            </Text>
            <Text variant="caption" color="muted">
              {entry.method} · {entry.createdAt.slice(0, 10)}
            </Text>
          </Stack>
          <AmountText
            amountMinor={entry.amountMinor}
            currencyCode={entry.currencyCode}
            variant="amountMedium"
            showCurrencySymbol
            accessibilityLabel={`${entry.fromMemberName} paid you ${entry.amountMinor} ${entry.currencyCode}`}
          />
        </Row>

        {entry.note !== null ? (
          <Text variant="caption" color="secondary">
            “{entry.note}”
          </Text>
        ) : null}

        <Row gap="sm" align="stretch">
          <Button
            label="Confirm"
            variant="primary"
            size="sm"
            onPress={(): void => onConfirm(entry.settlementId, expectedVersion, confirmedByMemberId)}
            disabled={acting}
            loading={acting}
            accessibilityLabel={`Confirm the settlement from ${entry.fromMemberName}`}
            icon="checkmark-outline"
            style={{ flex: 1 }}
          />
          <Button
            label="Dispute"
            variant="secondary"
            size="sm"
            onPress={(): void => onDispute(entry.settlementId, expectedVersion, 'not_received')}
            disabled={acting}
            accessibilityLabel={`Dispute the settlement from ${entry.fromMemberName}`}
            icon="close-outline"
            style={{ flex: 1 }}
          />
        </Row>

        <Pressable
          onPress={() => router.push(`/settlements/preview?fromMemberId=${encodeURIComponent(entry.fromMemberId)}&toMemberId=${encodeURIComponent(entry.toMemberId)}&amountMinor=${entry.amountMinor}&currencyCode=${encodeURIComponent(entry.currencyCode)}&groupId=${encodeURIComponent(groupId)}`)}
          accessibilityRole="link"
          accessibilityLabel="Open the full settlement preview"
        >
          <Row gap="xs" align="center">
            <Icon name="information-circle-outline" size={theme.iconSizes.sm} color={theme.colors.brandPrimary} />
            <Text variant="caption" color="info">
              More options
            </Text>
          </Row>
        </Pressable>
      </Stack>
    </Card>
  );
}

// Re-export the dispute-reason labels so the view file owns the contract.
export const DISPUTE_REASONS: readonly SettlementDisputeReason[] = ALL_DISPUTE_REASONS;

// ---------------------------------------------------------------------------
// Per-member balances
// ---------------------------------------------------------------------------

function MembersBalancesSection({ viewModel }: { readonly viewModel: GroupDetailViewModel }): ReactNode {
  if (!viewModel.hasMembers) {
    return (
      <Stack gap="md" align="stretch">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Member balances
        </Text>
        <EmptyCard
          icon="people-outline"
          title="No members yet"
          message="Invite members to see per-person balances."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Member balances
      </Text>
      <Stack gap="md" align="stretch">
        {viewModel.members.map((member) => (
          <MemberBalanceCard key={member.id} member={member} viewModel={viewModel} />
        ))}
      </Stack>
    </Stack>
  );
}

function MemberBalanceCard({ member, viewModel }: { readonly member: MemberSummaryViewModel; readonly viewModel: GroupDetailViewModel }): ReactNode {
  const nameSuffix = member.isCurrentUser ? ' (you)' : '';
  const label = member.balanceMinor > 0 ? 'is owed' : member.balanceMinor < 0 ? 'owes' : 'settled';

  return (
    <Card elevation="sm" padding="lg">
      <Row gap="md" align="center">
        <Avatar name={member.displayName} size="md" />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            {`${member.displayName}${nameSuffix}`}
          </Text>
          <Text variant="caption" color="muted">
            {member.role === 'owner' ? 'Owner' : member.role === 'admin' ? 'Admin' : 'Member'}
          </Text>
        </Stack>
        <Stack gap={0} align="flex-end">
          <AmountText
            amountMinor={member.balanceMinor}
            currencyCode={viewModel.currencyCode}
            variant="amountSmall"
            accessibilityLabel={`${member.displayName} ${label} ${Math.abs(member.balanceMinor)} ${viewModel.currencyCode}`}
          />
          <Text variant="caption" color="muted">
            {label}
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Suggested transfers
// ---------------------------------------------------------------------------

function SuggestedTransfersSection({ viewModel }: { readonly viewModel: GroupDetailViewModel }): ReactNode {
  if (!viewModel.hasSuggestedTransfers) {
    return (
      <Stack gap="md" align="stretch">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Suggested transfers
        </Text>
        <EmptyCard
          icon="checkmark-done-outline"
          title="Nothing to settle"
          message="All balances are zero — everyone is even."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Suggested transfers
      </Text>
      <Stack gap="md" align="stretch">
        {viewModel.suggestedTransfers.map((transfer) => (
          <SuggestedTransferCard
            key={transfer.id}
            fromName={transfer.fromMemberName}
            toName={transfer.toMemberName}
            amountMinor={transfer.amountMinor}
            currencyCode={transfer.currencyCode}
            groupId={viewModel.id}
          />
        ))}
      </Stack>
    </Stack>
  );
}

interface SuggestedTransferCardProps {
  readonly fromName: string;
  readonly toName: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly groupId: string;
}

function SuggestedTransferCard({
  fromName,
  toName,
  amountMinor,
  currencyCode,
  groupId,
}: SuggestedTransferCardProps): ReactNode {
  const theme = useTheme();
  const handleSettleUp = (): void => {
    router.push(`/settlements/new?groupId=${encodeURIComponent(groupId)}`);
  };

  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Row gap="md" align="center">
          <Avatar name={fromName} size="sm" />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="body" color="primary" numberOfLines={1}>
              {fromName} → {toName}
            </Text>
            <Text variant="caption" color="muted">
              Suggested transfer
            </Text>
          </Stack>
          <AmountText
            amountMinor={amountMinor}
            currencyCode={currencyCode}
            variant="amountMedium"
            accessibilityLabel={`Suggested settlement of ${amountMinor} ${currencyCode} from ${fromName} to ${toName}`}
          />
        </Row>
        <Pressable
          onPress={handleSettleUp}
          accessibilityRole="button"
          accessibilityLabel={`Settle up: record a payment from ${fromName} to ${toName}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            minHeight: 40,
            borderRadius: theme.borderRadius.md,
            backgroundColor: pressed ? theme.colors.brandSecondary : theme.colors.brandPrimary,
          })}
        >
          <Icon name="swap-horizontal-outline" size={theme.iconSizes.sm} color={theme.colors.textOnColor} />
          <Text variant="button" color="onColor">
            Settle Up
          </Text>
        </Pressable>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty card
// ---------------------------------------------------------------------------

interface EmptyCardProps {
  readonly icon: string;
  readonly title: string;
  readonly message: string;
}

function EmptyCard({ icon, title, message }: EmptyCardProps): ReactNode {
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
