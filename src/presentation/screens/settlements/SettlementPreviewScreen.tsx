/**
 * SettlementPreviewScreen (Prompt 19) — before / after balance preview.
 *
 * Renders a single suggested settlement transfer:
 *   - "Before settlement" balances summary (per member, signed)
 *   - Transfer details: from → to, amount, currency
 *   - "Why this transfer is suggested" plain-English explanation
 *   - "After settlement" projected balances (per member, signed)
 *   - "Confirm Settlement" button — calls `createSettlementDraft` +
 *     `recordSettlement` through the services registry (same flow as
 *     the NewSettlementScreen). The settlement lands in
 *     `pending_confirmation` status — the receiver must confirm.
 *   - "Cancel" button
 *
 * Architecture:
 *   - The thin container `SettlementPreviewScreen` accepts the from/to
 *     member ids + the amount + the `groupId` (required to load the
 *     group's members + balances via the services registry).
 *   - Loads the group's members via `services.groups.listGroupMembers`
 *     and the balances via `services.balances.getGroupBalances`, then
 *     builds a `SettlementPreviewViewModel` via
 *     `createSettlementPreviewViewModel` with real member names + real
 *     before-balances.
 *   - The pure presentational component `SettlementPreviewView` reads
 *     ONLY from the view model + callbacks. No business logic.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AmountText } from '@presentation/design-system/components/AmountText';
import { Avatar } from '@presentation/design-system/components/Avatar';
import { Badge } from '@presentation/design-system/components/Badge';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Divider } from '@presentation/design-system/components/Divider';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import {
  type MemberBalanceInput,
  type MemberBalancePreview,
  type SettlementPreviewViewModel,
  createEmptySettlementPreview,
  createSettlementPreviewViewModel,
} from '@presentation/view-models/balance-explanation';
import { tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface SettlementPreviewScreenProps {
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  /**
   * The group the settlement belongs to. Required to load the group's
   * members + balances via the services registry. When omitted (e.g.
   * a deep link without the param), the screen renders the empty-state
   * view model and the Confirm button is disabled.
   */
  readonly groupId?: string;
  /**
   * Optional override used by tests to inject a synthetic view model
   * directly without going through the builder.
   */
  readonly viewModelOverride?: SettlementPreviewViewModel;
}

interface LoadState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly members: readonly MemberBalanceInput[];
}

const INITIAL_LOAD: LoadState = { loading: true, error: null, members: [] };

export function SettlementPreviewScreen({
  fromMemberId,
  toMemberId,
  amountMinor,
  currencyCode,
  groupId,
  viewModelOverride,
}: SettlementPreviewScreenProps): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>(INITIAL_LOAD);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load the group's members + balances for the before/after projection.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (viewModelOverride !== undefined) {
        if (!cancelled) setLoadState({ loading: false, error: null, members: [] });
        return;
      }
      if (groupId === undefined || groupId.length === 0 || amountMinor <= 0) {
        if (!cancelled) setLoadState({ loading: false, error: null, members: [] });
        return;
      }
      const services = tryGetAppServices();
      if (services === null) {
        if (!cancelled) {
          setLoadState({
            loading: false,
            error: 'Storage is still starting up. Pull the screen again in a moment.',
            members: [],
          });
        }
        return;
      }
      try {
        const balanceResult = await services.balances.getGroupBalances.execute({
          groupId: groupId as never,
        });
        if (cancelled) return;
        if (balanceResult.notFound) {
          setLoadState({
            loading: false,
            error: 'This group could not be found.',
            members: [],
          });
          return;
        }
        // Find the currency's per-member balances. If multiple currencies,
        // pick the one matching the settlement's currency.
        const currencyResult =
          balanceResult.results.find((r) => (r.currencyCode as string) === currencyCode) ??
          balanceResult.results[0];
        if (currencyResult === undefined) {
          setLoadState({ loading: false, error: null, members: [] });
          return;
        }
        // Resolve member names via the member list use case.
        const memberList = await services.groups.listGroupMembers.execute(groupId);
        if (cancelled) return;
        const nameById = new Map<string, string>(
          memberList.members.map((m) => [m.id, m.displayName]),
        );
        const members: MemberBalanceInput[] = currencyResult.memberBalances.map((mb) => ({
          memberId: mb.memberId,
          memberName: nameById.get(mb.memberId as string) ?? 'Unknown member',
          balanceMinor: mb.netBalanceMinor,
        }));
        setLoadState({ loading: false, error: null, members });
      } catch (err) {
        if (cancelled) return;
        setLoadState({
          loading: false,
          error: err instanceof Error ? err.message : 'Could not load this group.',
          members: [],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, amountMinor, currencyCode, viewModelOverride]);

  const viewModel = useMemo<SettlementPreviewViewModel>(() => {
    if (viewModelOverride) return viewModelOverride;
    if (amountMinor <= 0) {
      return createEmptySettlementPreview(fromMemberId, toMemberId, currencyCode);
    }
    return createSettlementPreviewViewModel({
      fromMemberId,
      toMemberId,
      amountMinor,
      currencyCode,
      members: loadState.members,
    });
  }, [viewModelOverride, fromMemberId, toMemberId, amountMinor, currencyCode, loadState.members]);

  const handleConfirm = useCallback(async (): Promise<void> => {
    if (submitting) return;
    if (groupId === undefined || groupId.length === 0) {
      setSubmitError('This settlement is not linked to a group.');
      return;
    }
    const services = tryGetAppServices();
    if (services === null) {
      setSubmitError('Storage is not ready yet. Try again in a moment.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // 1. Create the draft (idempotent on operationId).
      const operationId = generateOperationId();
      const draft = await services.settlements.createSettlementDraft.execute({
        groupId,
        fromMemberId,
        toMemberId,
        amountMinor,
        currencyCode,
        method: 'upi', // sensible default for a deep-linked settlement
        createdBy: 'local-user',
        operationId,
      });
      // 2. Record the payment → pending_confirmation.
      await services.settlements.recordSettlement.execute({
        settlementId: draft.settlementId,
        expectedVersion: 1,
        actorMemberId: fromMemberId as never,
      });
      // 3. Navigate back — the receiver will confirm via the
      // GroupBalances pending-confirmation section.
      router.back();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not record the settlement.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [submitting, groupId, fromMemberId, toMemberId, amountMinor, currencyCode]);

  const handleCancel = (): void => {
    router.back();
  };

  if (loadState.loading) {
    return (
      <Screen scrollable safeArea>
        <Stack gap="md" align="center" style={{ padding: spacing.xxl }}>
          <ActivityIndicator size="large" color="#2B3A8C" />
          <Text variant="body" color="secondary">
            Loading settlement preview…
          </Text>
        </Stack>
      </Screen>
    );
  }

  return (
    <SettlementPreviewView
      viewModel={viewModel}
      loadError={loadState.error}
      submitError={submitError}
      submitting={submitting}
      canConfirm={
        amountMinor > 0 &&
        groupId !== undefined &&
        groupId.length > 0 &&
        !submitting
      }
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}

/** Generate a v4 UUID for the offline-idempotency operationId. */
function generateOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// View — pure presentational component
// ---------------------------------------------------------------------------

export interface SettlementPreviewViewProps {
  readonly viewModel: SettlementPreviewViewModel;
  readonly loadError: string | null;
  readonly submitError: string | null;
  readonly submitting: boolean;
  readonly canConfirm: boolean;
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel: () => void;
}

export function SettlementPreviewView({
  viewModel,
  loadError,
  submitError,
  submitting,
  canConfirm,
  onConfirm,
  onCancel,
}: SettlementPreviewViewProps): JSX.Element {
  const theme = useTheme();
  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="caption" color="muted">
            Settlement preview
          </Text>
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Settle up
          </Text>
        </Stack>

        {loadError !== null ? (
          <Card
            elevation="sm"
            padding="md"
            accessibilityRole="alert"
            style={{ borderColor: theme.colors.negative, borderWidth: 1 }}
          >
            <Row gap="sm" align="center">
              <Icon name="warning-outline" size={theme.iconSizes.md} color={theme.colors.negative} />
              <Text variant="caption" color="critical" style={{ flex: 1 }}>
                {loadError}
              </Text>
            </Row>
          </Card>
        ) : null}

        <TransferDetailsCard viewModel={viewModel} />

        <ReasonCard viewModel={viewModel} />

        <BalancesCard
          title="Before settlement"
          balances={viewModel.beforeBalances}
          emptyMessage="No member balances available."
        />

        <BalancesCard
          title="After settlement"
          balances={viewModel.afterBalances}
          emptyMessage="No projected balances available."
        />

        {submitError !== null ? (
          <Card
            elevation="sm"
            padding="md"
            accessibilityRole="alert"
            style={{ borderColor: theme.colors.negative, borderWidth: 1 }}
          >
            <Row gap="sm" align="center">
              <Icon name="warning-outline" size={theme.iconSizes.md} color={theme.colors.negative} />
              <Text variant="caption" color="critical" style={{ flex: 1 }}>
                {submitError}
              </Text>
            </Row>
          </Card>
        ) : null}

        <Stack gap="sm" align="stretch">
          <Button
            label="Confirm Settlement"
            variant="primary"
            size="lg"
            disabled={!canConfirm}
            loading={submitting}
            onPress={onConfirm}
            accessibilityLabel="Confirm the settlement transfer"
            icon="checkmark-circle-outline"
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            onPress={onCancel}
            accessibilityLabel="Cancel and go back without recording the settlement"
          />
        </Stack>

        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          The receiver must confirm this payment before it affects balances.
        </Text>
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Transfer details card
// ---------------------------------------------------------------------------

interface TransferDetailsCardProps {
  readonly viewModel: SettlementPreviewViewModel;
}

function TransferDetailsCard({ viewModel }: TransferDetailsCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Text variant="label" color="secondary">
          Transfer details
        </Text>
        <Row gap="md" align="center">
          <Stack gap="xs" align="center" style={{ flex: 1 }}>
            <Avatar
              name={viewModel.fromMemberName}
              size="md"
              accessibilityLabel={`Sender: ${viewModel.fromMemberName}`}
            />
            <Text variant="caption" color="primary" numberOfLines={1}>
              {viewModel.fromMemberName}
            </Text>
            <Badge variant="warning" label="Pays" icon="arrow-up-circle" />
          </Stack>
          <Stack gap="xs" align="center">
            <Icon
              name="arrow-forward"
              size={theme.iconSizes.lg}
              color={theme.colors.brandPrimary}
            />
            <AmountText
              amountMinor={viewModel.amountMinor}
              currencyCode={viewModel.currencyCode}
              variant="amountMedium"
              showSign={false}
              accessibilityLabel={`Transfer amount: ${viewModel.amountMinor} ${viewModel.currencyCode}`}
            />
          </Stack>
          <Stack gap="xs" align="center" style={{ flex: 1 }}>
            <Avatar
              name={viewModel.toMemberName}
              size="md"
              accessibilityLabel={`Recipient: ${viewModel.toMemberName}`}
            />
            <Text variant="caption" color="primary" numberOfLines={1}>
              {viewModel.toMemberName}
            </Text>
            <Badge variant="positive" label="Receives" icon="arrow-down-circle" />
          </Stack>
        </Row>
        <Divider />
        <Row gap="sm" align="center">
          <Icon name="cash-outline" size={theme.iconSizes.md} color={theme.colors.textSecondary} />
          <Text variant="body" color="secondary" style={{ flex: 1 }}>
            {viewModel.currencyCode}
          </Text>
          <AmountText
            amountMinor={viewModel.amountMinor}
            currencyCode={viewModel.currencyCode}
            variant="amountMedium"
            showSign={false}
            accessibilityLabel={`Total transfer: ${viewModel.amountMinor} ${viewModel.currencyCode}`}
          />
        </Row>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reason card
// ---------------------------------------------------------------------------

interface ReasonCardProps {
  readonly viewModel: SettlementPreviewViewModel;
}

function ReasonCard({ viewModel }: ReasonCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Row gap="sm" align="center">
          <Icon name="information-circle-outline" size={theme.iconSizes.md} color={theme.colors.info} />
          <Text variant="label" color="secondary" style={{ flex: 1 }}>
            Why this transfer is suggested
          </Text>
        </Row>
        <Text variant="body" color="primary">
          {viewModel.reason}
        </Text>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Balances card (before / after)
// ---------------------------------------------------------------------------

interface BalancesCardProps {
  readonly title: string;
  readonly balances: readonly MemberBalancePreview[];
  readonly emptyMessage: string;
}

function BalancesCard({ title, balances, emptyMessage }: BalancesCardProps): ReactNode {
  if (balances.length === 0) {
    return (
      <Card elevation="sm" padding="lg">
        <Stack gap="sm" align="stretch">
          <Text variant="label" color="secondary">
            {title}
          </Text>
          <Text variant="caption" color="muted">
            {emptyMessage}
          </Text>
        </Stack>
      </Card>
    );
  }
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Text variant="label" color="secondary">
          {title}
        </Text>
        <Stack gap="sm" align="stretch">
          {balances.map((b) => (
            <BalanceRow key={`${b.memberId}-${title}`} balance={b} />
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

interface BalanceRowProps {
  readonly balance: MemberBalancePreview;
}

function BalanceRow({ balance }: BalanceRowProps): ReactNode {
  const theme = useTheme();
  const tag = balance.isSender
    ? 'Sender'
    : balance.isRecipient
      ? 'Recipient'
      : null;
  return (
    <Row gap="sm" align="center">
      <Avatar
        name={balance.memberName}
        size="sm"
        accessibilityLabel={`Avatar for ${balance.memberName}`}
      />
      <Stack gap={0} style={{ flex: 1 }}>
        <Text variant="bodyStrong" color="primary" numberOfLines={1}>
          {balance.memberName}
        </Text>
        {tag ? (
          <Text variant="caption" color="muted">
            {tag}
          </Text>
        ) : null}
      </Stack>
      {tag ? (
        <Badge
          variant={balance.isSender ? 'warning' : 'positive'}
          label={tag}
          icon={balance.isSender ? 'arrow-up-circle' : 'arrow-down-circle'}
        />
      ) : null}
      <Stack gap={0} align="flex-end" style={{ minWidth: 96 }}>
        <AmountText
          amountMinor={balance.afterBalanceMinor}
          currencyCode={balance.currencyCode}
          variant="amountSmall"
          accessibilityLabel={`Balance: ${balance.afterBalanceMinor} ${balance.currencyCode}`}
        />
        {balance.afterBalanceMinor !== balance.beforeBalanceMinor ? (
          <Text variant="caption" color="muted" style={{ fontSize: 11 }}>
            was {balance.beforeBalanceMinor}
          </Text>
        ) : null}
      </Stack>
      {/* Spacer to keep the row aligned even when no badge is shown. */}
      <View style={{ width: theme.spacing.sm }} />
    </Row>
  );
}
