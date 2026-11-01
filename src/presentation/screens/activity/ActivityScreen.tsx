/**
 * ActivityScreen — the recent-activity tab.
 *
 * Renders a unified timeline of expenses and settlements across all
 * the user's groups, ordered by timestamp DESC (most recent first).
 * Each entry shows: a kind icon (expense vs settlement), the
 * description, the optional subtitle (payer name / payment method),
 * the relative timestamp, and the amount.
 *
 * Architecture:
 *   - The thin container `ActivityScreen` reads from `useActivityFeed`
 *     and builds a pure presentational view model.
 *   - The pure presentational component `ActivityView` reads ONLY from
 *     the view model + callbacks. This keeps the layout fully unit-
 *     testable.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, View } from 'react-native';

import type { ActivityEntry, ActivityKind } from '@application/activity/list-recent-activity.usecase';
import { AmountText } from '@presentation/design-system/components/AmountText';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useActivityFeed } from '@presentation/hooks/use-activity-feed';
import { formatRelativeTime } from '@presentation/utils/relative-time';

// ---------------------------------------------------------------------------
// View-model
// ---------------------------------------------------------------------------

export interface ActivityEntryViewModel {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly description: string;
  readonly subtitle: string | null;
  /** Pre-formatted relative label, e.g. "2 hours ago". */
  readonly relativeTimeLabel: string;
  readonly currencyCode: string;
  readonly amountMinor: number;
  readonly targetRoute: string;
}

export interface ActivityScreenViewModel {
  readonly loading: boolean;
  readonly error: string | null;
  readonly entries: readonly ActivityEntryViewModel[];
  /** True when there are more entries available beyond the page. */
  readonly hasMore: boolean;
  /** True once at least one load attempt has completed (even if it failed). */
  readonly loadedOnce: boolean;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function ActivityScreen(): JSX.Element {
  const feed = useActivityFeed();
  const viewModel = useMemo<ActivityScreenViewModel>(
    () => ({
      loading: feed.loading,
      error: feed.error,
      loadedOnce: feed.loadedOnce,
      hasMore: feed.hasMore,
      entries: feed.entries.map((e) => toViewModel(e)),
    }),
    [feed],
  );
  return <ActivityView viewModel={viewModel} />;
}

function toViewModel(entry: ActivityEntry): ActivityEntryViewModel {
  return {
    id: entry.id,
    kind: entry.kind,
    description: entry.description,
    subtitle: entry.subtitle,
    relativeTimeLabel: formatRelativeTime(entry.timestamp),
    currencyCode: entry.currencyCode,
    amountMinor: entry.amountMinor,
    targetRoute: entry.targetRoute,
  };
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface ActivityViewProps {
  readonly viewModel: ActivityScreenViewModel;
}

export function ActivityView({ viewModel }: ActivityViewProps): JSX.Element {
  const showTimeline =
    !viewModel.loading && viewModel.loadedOnce && viewModel.error === null;

  // FlatList (not ScrollView + map): the feed is paginated but unbounded over
  // time, and mounting every historical row is the dominant cost on long
  // accounts. Only the visible window is rendered.
  return (
    <Screen safeArea>
      <FlatList
        data={showTimeline ? viewModel.entries : []}
        keyExtractor={(entry) => entry.id}
        renderItem={({ item }) => <ActivityCard entry={item} />}
        ItemSeparatorComponent={ActivitySeparator}
        contentContainerStyle={{ padding: spacing.xl }}
        ListHeaderComponent={
          <Stack gap="xl" align="stretch" style={{ marginBottom: spacing.xl }}>
            <Stack gap="xs" align="stretch">
              <Text variant="screenTitle" color="primary" accessibilityRole="header">
                Activity
              </Text>
              <Text variant="body" color="secondary">
                A unified timeline of expenses and settlements across your groups.
              </Text>
            </Stack>

            {viewModel.loading && !viewModel.loadedOnce ? <LoadingCard /> : null}

            {viewModel.error !== null ? <ErrorCard message={viewModel.error} /> : null}
          </Stack>
        }
        ListEmptyComponent={
          showTimeline ? (
            <EmptyState />
          ) : null
        }
        ListFooterComponent={
          showTimeline && viewModel.hasMore ? (
            <Text
              variant="caption"
              color="muted"
              style={{ textAlign: 'center', marginTop: spacing.lg }}
            >
              Showing the most recent entries. Older activity is available per-group.
            </Text>
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

function ActivitySeparator(): ReactNode {
  return <View style={{ height: 12 }} />;
}


// ---------------------------------------------------------------------------
// Activity card
// ---------------------------------------------------------------------------

const ACTIVITY_ICONS: Readonly<Record<ActivityKind, string>> = {
  expense: 'receipt-outline',
  settlement: 'swap-horizontal-outline',
};

interface ActivityCardProps {
  readonly entry: ActivityEntryViewModel;
}

const ActivityCard = memo(function ActivityCard({ entry }: ActivityCardProps): ReactNode {
  const theme = useTheme();
  const handlePress = (): void => {
    router.push(entry.targetRoute);
  };
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.kind === 'expense' ? 'Expense' : 'Settlement'}: ${entry.description}`}
      accessibilityHint={`Open this ${entry.kind}`}
    >
      {({ pressed }) => (
        <Card
          elevation={pressed ? 'none' : 'sm'}
          padding="lg"
          style={{
            backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
          }}
        >
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
                name={ACTIVITY_ICONS[entry.kind] ?? 'ellipse-outline'}
                size={theme.iconSizes.md}
                color={theme.colors.brandPrimary}
              />
            </Row>
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="primary" numberOfLines={1}>
                {entry.description}
              </Text>
              {entry.subtitle !== null ? (
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {entry.subtitle}
                </Text>
              ) : null}
              <Text variant="caption" color="muted">
                {entry.relativeTimeLabel}
              </Text>
            </Stack>
            <AmountText
              amountMinor={entry.amountMinor}
              currencyCode={entry.currencyCode}
              variant="amountSmall"
              showCurrencySymbol
              accessibilityLabel={`${entry.amountMinor} ${entry.currencyCode}`}
            />
          </Row>
        </Card>
      )}
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Loading / error / empty states
// ---------------------------------------------------------------------------

function LoadingCard(): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="md" accessibilityRole="text">
      <Row gap="md" align="center">
        <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
        <Text variant="caption" color="secondary">
          Loading recent activity…
        </Text>
      </Row>
    </Card>
  );
}

function ErrorCard({ message }: { readonly message: string }): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="md" accessibilityRole="alert">
      <Row gap="md" align="center">
        <Icon name="cloud-offline-outline" size={theme.iconSizes.lg} color={theme.colors.negative} />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            Could not load recent activity
          </Text>
          <Text variant="caption" color="secondary">
            {message}
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}

function EmptyState(): ReactNode {
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
          <Icon name="time-outline" size={theme.iconSizes.xl} color={theme.colors.textMuted} />
        </Row>
        <Stack gap="xs" align="center">
          <Text variant="sectionTitle" color="primary">
            No activity yet
          </Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            Recent expenses and settlements across your groups will appear here.
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
