/**
 * GroupSettlementsScreen — per-group settlement history
 * (`/groups/[groupId]/settlements`).
 *
 * Closes the v2.26.2 remaining gap (KNOWN_LIMITATIONS KL-7/KL-8): the
 * complete settlement lifecycle (create, confirm, dispute, reverse) was
 * shipped, but `ListSettlementsUseCase` had no UI caller, so the only
 * way to see past settlements was the cross-group activity feed.
 *
 * Architecture:
 *   - The thin container loads members (for display names) and paged
 *     settlements through the services registry, then projects rows into
 *     a pure view model.
 *   - `SettlementHistoryView` reads ONLY from the view model + callbacks
 *     and renders a virtualised, cursor-paginated FlatList.
 *
 * Every row deep-links to `/settlements/[settlementId]` (facts, guarded
 * reversal). Status filter chips use the existing repository filter —
 * no new query, existing `(group_id, status)` index.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, View } from 'react-native';

import { asGroupId } from '@domain/entities/group';
import type { Settlement } from '@domain/entities/settlement';
import type { GroupMemberView } from '@application/groups/list-group-members.usecase';
import { AmountText } from '@presentation/design-system/components/AmountText';
import { Badge } from '@presentation/design-system/components/Badge';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Skeleton } from '@presentation/design-system/components/Skeleton';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { describeAmount } from '@presentation/design-system/financial-format';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type SettlementStatusFilter = 'all' | 'pending_confirmation' | 'completed' | 'disputed';

export interface SettlementRowViewModel {
  readonly id: string;
  readonly fromName: string;
  readonly toName: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly methodLabel: string;
  readonly statusLabel: string;
  readonly dateLabel: string;
  readonly note: string | null;
  readonly isReversal: boolean;
}

export interface SettlementHistoryViewModel {
  readonly groupName: string | null;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
  readonly rows: readonly SettlementRowViewModel[];
  readonly hasMore: boolean;
  readonly filter: SettlementStatusFilter;
}

const PAGE_SIZE = 20;

const STATUS_FILTERS: readonly {
  readonly value: SettlementStatusFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_confirmation', label: 'Awaiting confirmation' },
  { value: 'completed', label: 'Completed' },
  { value: 'disputed', label: 'Disputed' },
];

const STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: 'Draft',
  requested: 'Requested',
  pending_confirmation: 'Awaiting confirmation',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  reversed: 'Reversed',
};

/**
 * Date-only ISO strings (`YYYY-MM-DD`) parse as UTC midnight, which a
 * local zone behind UTC would render as the previous day. Parse them as
 * local calendar dates instead (same class of bug as AUDIT_OCT_2026 §2.4).
 */
function formatSettlementDate(iso: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return parsed.toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatMethod(method: string): string {
  return method.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function toRow(settlement: Settlement, names: Map<string, string>): SettlementRowViewModel {
  const status = settlement.status ?? 'completed';
  return {
    id: settlement.id as string,
    fromName: names.get(settlement.fromMemberId as string) ?? 'Someone',
    toName: names.get(settlement.toMemberId as string) ?? 'Someone',
    amountMinor: settlement.amountMinor,
    currencyCode: settlement.currencyCode as string,
    methodLabel: formatMethod(settlement.method),
    statusLabel: STATUS_LABELS[status] ?? status,
    dateLabel: formatSettlementDate(settlement.settlementDate as string),
    note: settlement.note ?? null,
    isReversal: settlement.reversalOfSettlementId !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface GroupSettlementsScreenProps {
  readonly groupId: string;
}

export function GroupSettlementsScreen({
  groupId,
}: GroupSettlementsScreenProps): JSX.Element {
  const [members, setMembers] = useState<readonly GroupMemberView[]>([]);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [items, setItems] = useState<readonly Settlement[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SettlementStatusFilter>('all');

  const nameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.displayName])),
    [members],
  );

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) {
      setError('Storage is still starting up. Try again in a moment.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [memberList, page] = await Promise.all([
        services.groups.listGroupMembers.execute(groupId),
        services.settlements.listSettlements.execute({
          groupId: asGroupId(groupId),
          ...(filter === 'all'
            ? {}
            : { filter: { status: filter as Settlement['status'] } }),
          pagination: { limit: PAGE_SIZE },
        }),
      ]);
      setMembers(memberList.members);
      setGroupName(memberList.groupName);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load settlements.');
    } finally {
      setLoading(false);
    }
  }, [groupId, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null || loadingMore || !hasMore || nextCursor === undefined) return;
    setLoadingMore(true);
    try {
      const page = await services.settlements.listSettlements.execute({
        groupId: asGroupId(groupId),
        ...(filter === 'all'
          ? {}
          : { filter: { status: filter as Settlement['status'] } }),
        pagination: { limit: PAGE_SIZE, cursor: nextCursor },
      });
      setItems((prev) => {
        const seen = new Set(prev.map((s) => s.id as string));
        return [...prev, ...page.items.filter((s) => !seen.has(s.id as string))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more settlements.');
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, filter, loadingMore, hasMore, nextCursor]);

  const viewModel = useMemo<SettlementHistoryViewModel>(
    () => ({
      groupName,
      loading,
      loadingMore,
      error,
      rows: items.map((s) => toRow(s, nameById)),
      hasMore,
      filter,
    }),
    [groupName, loading, loadingMore, error, items, nameById, hasMore, filter],
  );

  return (
    <SettlementHistoryView
      viewModel={viewModel}
      onFilterChange={(next) => {
        if (next !== filter) {
          setFilter(next);
        }
      }}
      onRetry={() => {
        void load();
      }}
      onLoadMore={() => void loadMore()}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface SettlementHistoryViewProps {
  readonly viewModel: SettlementHistoryViewModel;
  readonly onFilterChange: (filter: SettlementStatusFilter) => void;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
}

export function SettlementHistoryView({
  viewModel,
  onFilterChange,
  onRetry,
  onLoadMore,
}: SettlementHistoryViewProps): JSX.Element {
  const showList = !viewModel.loading && viewModel.error === null;

  return (
    <Screen safeArea>
      <FlatList
        data={showList ? viewModel.rows : []}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <SettlementRow row={item} />}
        ItemSeparatorComponent={HistorySeparator}
        contentContainerStyle={{ padding: spacing.xl }}
        ListHeaderComponent={
          <Stack gap="lg" align="stretch" style={{ marginBottom: spacing.lg }}>
            <Stack gap="xs" align="stretch">
              <Text variant="screenTitle" color="primary" accessibilityRole="header">
                Settlement history
              </Text>
              <Text variant="body" color="secondary">
                {viewModel.groupName !== null
                  ? `Every transfer recorded in ${viewModel.groupName}.`
                  : 'Every transfer recorded in this group.'}
              </Text>
            </Stack>
            <Row gap="xs" align="center" style={{ flexWrap: 'wrap' }}>
              {STATUS_FILTERS.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  active={viewModel.filter === option.value}
                  onPress={() => onFilterChange(option.value)}
                />
              ))}
            </Row>
            {viewModel.loading ? <LoadingCard /> : null}
            {viewModel.error !== null ? (
              <ErrorCard message={viewModel.error} onRetry={onRetry} />
            ) : null}
          </Stack>
        }
        ListEmptyComponent={
          showList ? (
            <EmptyState filtered={viewModel.filter !== 'all'} />
          ) : null
        }
        ListFooterComponent={
          showList && viewModel.hasMore ? (
            <Text
              variant="caption"
              color="muted"
              style={{ textAlign: 'center', marginTop: spacing.lg }}
            >
              {viewModel.loadingMore ? 'Loading more…' : 'Scroll for older settlements'}
            </Text>
          ) : null
        }
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'web'}
      />
    </Screen>
  );
}

function HistorySeparator(): ReactNode {
  return <View style={{ height: spacing.md }} />;
}

interface FilterChipProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}

function FilterChip({ label, active, onPress }: FilterChipProps): JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Filter settlements: ${label}`}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: theme.borderRadius.full,
        backgroundColor: active ? theme.colors.brandPrimary : theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: active ? theme.colors.brandPrimary : theme.colors.border,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="label" color={active ? 'onColor' : 'secondary'} style={{ fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const SettlementRow = ({ row }: { readonly row: SettlementRowViewModel }): ReactNode => {
  const theme = useTheme();
  const spokenAmount = describeAmount(row.amountMinor, row.currencyCode, {
    includeDirection: false,
  });
  return (
    <Pressable
      onPress={() => router.push(`/settlements/${row.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Settlement: ${row.fromName} paid ${row.toName} ${spokenAmount}. ${row.statusLabel}.`}
      accessibilityHint="Open this settlement"
    >
      <Card elevation="sm" padding="lg">
        <Row gap="md" align="center">
          <Row
            gap="sm"
            align="center"
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.borderRadius.full,
              backgroundColor: theme.colors.surfaceMuted,
              justifyContent: 'center',
            }}
          >
            <Icon
              name="swap-horizontal-outline"
              size={theme.iconSizes.md}
              color={theme.colors.brandPrimary}
            />
          </Row>
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="bodyStrong" color="primary" numberOfLines={1}>
              {row.fromName} → {row.toName}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {row.dateLabel} · {row.methodLabel}
            </Text>
            {row.note !== null ? (
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {row.note}
              </Text>
            ) : null}
          </Stack>
          <Stack gap="xs" align="flex-end">
            <AmountText
              amountMinor={row.amountMinor}
              currencyCode={row.currencyCode}
              variant="amountSmall"
              showCurrencySymbol
              accessibilityLabel={spokenAmount}
            />
            <Badge
              label={row.isReversal ? 'Reversal' : row.statusLabel}
              variant={row.isReversal ? 'neutral' : statusBadgeVariant(row.statusLabel)}
            />
          </Stack>
        </Row>
      </Card>
    </Pressable>
  );
};

function statusBadgeVariant(statusLabel: string): 'positive' | 'warning' | 'negative' | 'neutral' {
  switch (statusLabel) {
    case 'Completed':
      return 'positive';
    case 'Awaiting confirmation':
    case 'Requested':
    case 'Draft':
      return 'warning';
    case 'Disputed':
    case 'Failed':
      return 'negative';
    default:
      return 'neutral';
  }
}

function LoadingCard(): ReactNode {
  return (
    <Card elevation="none" padding="lg">
      <Stack gap="md">
        <Skeleton width="70%" height={16} />
        <Skeleton width="45%" height={14} />
        <Skeleton width="30%" height={12} />
      </Stack>
      <Text variant="caption" color="muted" style={{ marginTop: spacing.md }}>
        Loading settlements…
      </Text>
    </Card>
  );
}

function ErrorCard({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="md" accessibilityRole="alert">
      <Row gap="md" align="center">
        <Icon name="cloud-offline-outline" size={theme.iconSizes.lg} color={theme.colors.negative} />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            Could not load settlements
          </Text>
          <Text variant="caption" color="secondary">
            {message}
          </Text>
        </Stack>
      </Row>
      <Row gap="sm" style={{ marginTop: spacing.md }}>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading settlements"
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.surfaceMuted,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="label" color="primary">
            Try again
          </Text>
        </Pressable>
      </Row>
    </Card>
  );
}

function EmptyState({ filtered }: { readonly filtered: boolean }): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="xxl" accessibilityRole="text">
      <Stack gap="md" align="center">
        <Row
          gap="sm"
          align="center"
          style={{
            width: 72,
            height: 72,
            borderRadius: theme.borderRadius.full,
            backgroundColor: theme.colors.surfaceMuted,
            justifyContent: 'center',
          }}
        >
          <Icon name="swap-horizontal-outline" size={theme.iconSizes.xl} color={theme.colors.textMuted} />
        </Row>
        <Text variant="sectionTitle" color="primary">
          {filtered ? 'No settlements here' : 'No settlements yet'}
        </Text>
        <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
          {filtered
            ? 'Nothing matches this filter. Try another status.'
            : 'Recorded transfers will appear here once you settle up.'}
        </Text>
      </Stack>
    </Card>
  );
}
