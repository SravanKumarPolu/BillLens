/**
 * DraftsInboxScreen — the list of captured receipts still waiting for
 * confirmation.
 *
 * Why it exists: the capture pipeline persists a draft before the user
 * confirms it, and the dashboard shows "N drafts waiting for review".
 * Without a list route the only way back into a draft was to capture
 * another receipt, so closing the app mid-review stranded the draft.
 * This screen is the missing entry point (home card → /drafts →
 * /drafts/<id>).
 *
 * Architecture:
 *   - `DraftsInboxScreen` is a thin container over `usePendingDrafts`.
 *   - `DraftsInboxView` is pure: it renders the view model and calls
 *     `onOpenDraft`, so the layout is testable without services.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { AmountText } from '@presentation/design-system/components/AmountText';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Skeleton } from '@presentation/design-system/components/Skeleton';
import { Stack } from '@presentation/design-system/components/Stack';
import { StatusDot } from '@presentation/design-system/components/StatusDot';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { usePendingDrafts } from '@presentation/hooks/use-pending-drafts';
import type {
  DraftInboxRowViewModel,
  DraftsInboxViewModel,
} from '@presentation/view-models/drafts-inbox';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function DraftsInboxScreen(): JSX.Element {
  const inbox = usePendingDrafts();

  return (
    <DraftsInboxView
      viewModel={inbox}
      loading={inbox.loading && !inbox.loadedOnce}
      error={inbox.error}
      onRetry={inbox.retry}
      onOpenDraft={(draftId) => router.push(`/drafts/${encodeURIComponent(draftId)}`)}
      onCaptureReceipt={() => router.push('/capture')}
    />
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export interface DraftsInboxViewProps {
  readonly viewModel: DraftsInboxViewModel;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly onOpenDraft: (draftId: string) => void;
  readonly onCaptureReceipt?: () => void;
}

export function DraftsInboxView({
  viewModel,
  loading = false,
  error = null,
  onRetry,
  onOpenDraft,
  onCaptureReceipt,
}: DraftsInboxViewProps): JSX.Element {
  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            {viewModel.headline}
          </Text>
          <Text variant="body" color="secondary">
            {viewModel.summary}
          </Text>
        </Stack>

        {loading ? <LoadingState /> : null}

        {error !== null ? <ErrorState error={error} onRetry={onRetry} /> : null}

        {!loading && error === null && viewModel.isEmpty ? (
          <EmptyState onCaptureReceipt={onCaptureReceipt} />
        ) : null}

        {!loading && error === null && !viewModel.isEmpty ? (
          <Stack gap="md" align="stretch">
            {viewModel.rows.map((row) => (
              <DraftRow key={row.id} row={row} onOpen={() => onOpenDraft(row.id)} />
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Screen>
  );
}

function DraftRow({
  row,
  onOpen,
}: {
  readonly row: DraftInboxRowViewModel;
  readonly onOpen: () => void;
}): ReactNode {
  const theme = useTheme();

  return (
    <Card elevation="sm" padding="lg">
      <Row gap="md" align="center">
        <Stack gap="xs" style={{ flex: 1 }}>
          <Row gap="sm" align="center">
            <StatusDot
              variant={row.statusTone === 'ready' ? 'syncComplete' : 'syncPending'}
              accessibilityLabel={row.statusLabel}
            />
            <Text variant="cardTitle" color="primary" numberOfLines={1} style={{ flex: 1 }}>
              {row.title}
            </Text>
          </Row>
          <Text variant="caption" color="secondary">
            {row.subtitle}
          </Text>
          {row.issueCount > 0 ? (
            <Row gap="xs" align="center">
              <Icon
                name="warning-outline"
                size={theme.iconSizes.sm}
                color={theme.colors.warning}
              />
              <Text variant="caption" color="warning">
                {row.issueCount === 1
                  ? '1 field needs your attention'
                  : `${row.issueCount} fields need your attention`}
              </Text>
            </Row>
          ) : null}
        </Stack>

        {row.amountMinor !== null && row.currencyCode !== null ? (
          <AmountText
            amountMinor={row.amountMinor}
            currencyCode={row.currencyCode}
            variant="amountSmall"
            accessibilityLabel={row.accessibilityLabel}
          />
        ) : null}

        <Button
          label="Review"
          variant="secondary"
          size="sm"
          onPress={onOpen}
          accessibilityLabel={`Review draft ${row.title}`}
        />
      </Row>
    </Card>
  );
}

function LoadingState(): ReactNode {
  return (
    <Stack gap="md" align="stretch" accessibilityLabel="Loading drafts">
      {[0, 1, 2].map((i) => (
        <Card key={`draft-skeleton-${i}`} elevation="sm" padding="lg">
          <Stack gap="sm">
            <Skeleton width="60%" height={18} />
            <Skeleton width="40%" height={14} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  readonly error: string;
  readonly onRetry?: () => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="lg" accessibilityRole="alert">
      <Stack gap="sm" align="center">
        <Icon
          name="alert-circle-outline"
          size={theme.iconSizes.xl}
          color={theme.colors.negative}
        />
        <Text variant="cardTitle" color="primary">
          Couldn’t load your drafts
        </Text>
        <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
          {error}
        </Text>
        {onRetry !== undefined ? (
          <Button
            label="Try again"
            variant="secondary"
            size="sm"
            onPress={onRetry}
            accessibilityLabel="Retry loading drafts"
          />
        ) : null}
      </Stack>
    </Card>
  );
}

function EmptyState({
  onCaptureReceipt,
}: {
  readonly onCaptureReceipt?: () => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="xxl">
      <Stack gap="md" align="center">
        <Icon
          name="checkmark-done-outline"
          size={theme.iconSizes.xl}
          color={theme.colors.positive}
        />
        <Text variant="cardTitle" color="primary" style={{ textAlign: 'center' }}>
          Nothing waiting for review
        </Text>
        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          Scanned receipts you haven’t confirmed yet will show up here.
        </Text>
        {onCaptureReceipt !== undefined ? (
          <Button
            label="Scan a receipt"
            variant="primary"
            size="md"
            onPress={onCaptureReceipt}
            accessibilityLabel="Scan a receipt"
            icon="scan-outline"
          />
        ) : null}
      </Stack>
    </Card>
  );
}
