/**
 * ExpenseDetailScreen — the `/expenses/[expenseId]` screen.
 *
 * Renders:
 *   - The expense title + amount + currency + date.
 *   - The payer breakdown (single or multiple payers, with each
 *     contribution shown).
 *   - The participant share breakdown (each member's share, with the
 *     "also a payer" flag highlighted so the user understands offsets).
 *   - The split-type label + the invariants (sum of shares = total,
 *     sum of payers = total) — surfaced honestly so the user can
 *     verify the math themselves.
 *   - The note + category when present.
 *   - A "Reconciled" badge when the share total exactly equals the
 *     payer total (the normal happy path).
 *
 * Architecture:
 *   - The thin container `ExpenseDetailScreen` reads via
 *     `services.expenses.getExpenseDetail` through the services
 *     registry, and builds a pure presentational view model.
 *   - The pure presentational component `ExpenseDetailView` reads ONLY
 *     from the view model + callbacks. This keeps the layout fully
 *     unit-testable.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';

import type { ExpenseDetailView } from '@application/expenses/get-expense-detail.usecase';
import { AmountText } from '@presentation/design-system/components/AmountText';
import { Avatar } from '@presentation/design-system/components/Avatar';
import { Badge } from '@presentation/design-system/components/Badge';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface ExpenseDetailScreenProps {
  readonly expenseId: string;
}

export function ExpenseDetailScreen({ expenseId }: ExpenseDetailScreenProps): JSX.Element {
  const [view, setView] = useState<ExpenseDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) {
        if (!cancelled) {
          setError('Storage is still starting up. Pull the screen again in a moment.');
          setLoading(false);
        }
        return;
      }
      try {
        const result = await services.expenses.getExpenseDetail.execute({
          expenseId: expenseId as never,
        });
        if (cancelled) return;
        setView(result.view);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load this expense.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (loading) {
    return (
      <Screen scrollable safeArea>
        <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
          <Row gap="md" align="center">
            <ActivityIndicator size="small" color="#2B3A8C" />
            <Text variant="caption" color="secondary">
              Loading this expense…
            </Text>
          </Row>
        </Stack>
      </Screen>
    );
  }

  if (error !== null || view === null) {
    return (
      <Screen scrollable safeArea>
        <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
          <ErrorCard
            message={error ?? 'This expense could not be loaded.'}
            onBack={() => router.back()}
          />
        </Stack>
      </Screen>
    );
  }

  const handleVoid = (): void => {
    Alert.alert(
      'Void this expense?',
      'It will be removed from balances but kept in the audit history. This affects everyone in the group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void',
          style: 'destructive',
          onPress: (): void => {
            void (async () => {
              const services = tryGetAppServices();
              if (services === null) return;
              try {
                const expense = await services.repositories.expenses.findById(expenseId as never);
                if (expense === null) throw new Error('Expense not found.');
                const members = await services.groups.listGroupMembers.execute(
                  expense.groupId as never,
                );
                const actor =
                  members.members.find((m) => m.role === 'owner') ?? members.members[0];
                if (actor === undefined) throw new Error('No group member to act as.');
                await services.expenses.voidExpense.execute({
                  expenseId,
                  groupId: expense.groupId as string,
                  actorMemberId: actor.id,
                  actorUserId: expense.createdBy as string,
                  expectedVersion: expense.version as number,
                });
                router.back();
              } catch (err) {
                Alert.alert(
                  'Could not void expense',
                  err instanceof Error ? err.message : 'Unknown error.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ExpenseDetailScreenView
      view={view}
      onBack={() => router.back()}
      onEdit={() => router.push(`/expenses/edit/${encodeURIComponent(expenseId)}`)}
      onRepeat={() => router.push(`/recurring/new?expenseId=${encodeURIComponent(expenseId)}`)}
      onVoid={handleVoid}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface ExpenseDetailViewProps {
  readonly view: ExpenseDetailView;
  readonly onBack: () => void;
  /** Optional: omit in read-only previews/tests. */
  readonly onEdit?: () => void;
  readonly onRepeat?: () => void;
  readonly onVoid?: () => void;
}

export function ExpenseDetailScreenView({
  view,
  onBack,
  onEdit,
  onRepeat,
  onVoid,
}: ExpenseDetailViewProps): JSX.Element {
  const theme = useTheme();
  const isReconciled = view.sharesTotalMinor === view.amountMinor && view.payersTotalMinor === view.amountMinor;

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        {/* Header */}
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header" numberOfLines={2}>
            {view.title}
          </Text>
          <Row gap="sm" align="center">
            <Icon name="calendar-outline" size={theme.iconSizes.sm} color={theme.colors.textMuted} />
            <Text variant="caption" color="muted">
              {formatDateLabel(view.expenseDate)} · {view.splitType.toUpperCase()} split
            </Text>
          </Row>
        </Stack>

        {/* Total amount hero card */}
        <Card elevation="sm" padding="xxl" accessibilityRole="text">
          <Stack gap="xs" align="center">
            <Text variant="label" color="secondary">
              Total
            </Text>
            <AmountText
              amountMinor={view.amountMinor}
              currencyCode={view.currencyCode}
              variant="amountLarge"
              showCurrencySymbol
              accessibilityLabel={`Total: ${view.amountMinor} ${view.currencyCode}`}
            />
            <Row gap="sm" align="center" style={{ paddingTop: spacing.xs }}>
              <Badge
                variant={isReconciled ? 'positive' : 'warning'}
                label={isReconciled ? 'Reconciled' : 'Out of balance'}
                accessibilityLabel={isReconciled ? 'Shares and payers match the total' : 'Shares or payers do not match the total'}
              />
              <Text variant="caption" color="muted">
                {view.participantCount} {view.participantCount === 1 ? 'participant' : 'participants'}
              </Text>
            </Row>
          </Stack>
        </Card>

        {/* Payer breakdown */}
        <Stack gap="md" align="stretch">
          <Text variant="sectionTitle" color="primary" accessibilityRole="header">
            {view.payers.length === 1 ? 'Paid by' : 'Payers'}
          </Text>
          {view.payers.map((payer) => (
            <Card key={payer.memberId} elevation="sm" padding="lg">
              <Row gap="md" align="center">
                <Avatar name={payer.displayName} size="sm" />
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color="primary">
                    {payer.displayName}
                  </Text>
                  {payer.isSinglePayer ? (
                    <Text variant="caption" color="muted">
                      Paid the full amount
                    </Text>
                  ) : (
                    <Text variant="caption" color="muted">
                      Contribution
                    </Text>
                  )}
                </Stack>
                <AmountText
                  amountMinor={payer.amountMinor}
                  currencyCode={view.currencyCode}
                  variant="amountSmall"
                  showCurrencySymbol
                  accessibilityLabel={`${payer.displayName} paid ${payer.amountMinor} ${view.currencyCode}`}
                />
              </Row>
            </Card>
          ))}
          <InvariantRow
            label="Payers total"
            amountMinor={view.payersTotalMinor}
            currencyCode={view.currencyCode}
            expected={view.amountMinor}
          />
        </Stack>

        {/* Share breakdown */}
        <Stack gap="md" align="stretch">
          <Text variant="sectionTitle" color="primary" accessibilityRole="header">
            Split breakdown
          </Text>
          {view.shares.map((share) => (
            <Card key={share.memberId} elevation="sm" padding="lg">
              <Row gap="md" align="center">
                <Avatar name={share.displayName} size="sm" />
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color="primary">
                    {share.displayName}
                  </Text>
                  <Text variant="caption" color={share.isPayer ? 'positive' : 'muted'}>
                    {share.isPayer ? 'Payer (offset by their contribution)' : 'Owes'}
                  </Text>
                </Stack>
                <AmountText
                  amountMinor={share.amountMinor}
                  currencyCode={view.currencyCode}
                  variant="amountSmall"
                  showCurrencySymbol
                  accessibilityLabel={`${share.displayName} share: ${share.amountMinor} ${view.currencyCode}`}
                />
              </Row>
            </Card>
          ))}
          <InvariantRow
            label="Shares total"
            amountMinor={view.sharesTotalMinor}
            currencyCode={view.currencyCode}
            expected={view.amountMinor}
          />
        </Stack>

        {/* Note + category */}
        {view.note !== null || view.category !== null ? (
          <Card elevation="none" padding="md">
            <Stack gap="xs" align="stretch">
              {view.category !== null ? (
                <Row gap="sm" align="center">
                  <Icon name="pricetag-outline" size={theme.iconSizes.sm} color={theme.colors.brandPrimary} />
                  <Text variant="caption" color="secondary">
                    {view.category}
                  </Text>
                </Row>
              ) : null}
              {view.note !== null ? (
                <Text variant="body" color="primary">
                  {view.note}
                </Text>
              ) : null}
            </Stack>
          </Card>
        ) : null}

        {/* Back / destructive action */}
        <Button
          label="Back"
          variant="ghost"
          size="md"
          onPress={onBack}
          accessibilityLabel="Go back"
          icon="arrow-back-outline"
        />
        {onEdit !== undefined ? (
          <Button
            label="Edit expense"
            variant="secondary"
            size="md"
            onPress={onEdit}
            accessibilityLabel="Edit this expense"
            icon="create-outline"
          />
        ) : null}
        {onRepeat !== undefined ? (
          <Button
            label="Repeat this expense"
            variant="secondary"
            size="md"
            onPress={onRepeat}
            accessibilityLabel="Repeat this expense on a schedule"
            icon="repeat-outline"
          />
        ) : null}
        {onVoid !== undefined ? (
          <Button
            label="Void expense"
            variant="ghost"
            size="md"
            onPress={onVoid}
            accessibilityLabel="Void this expense — removes it from balances and keeps an audit entry"
            icon="trash-outline"
          />
        ) : null}
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Invariant row — shows a total + the expected amount + a check/cross icon
// ---------------------------------------------------------------------------

interface InvariantRowProps {
  readonly label: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly expected: number;
}

function InvariantRow({ label, amountMinor, currencyCode, expected }: InvariantRowProps): ReactNode {
  const theme = useTheme();
  const matches = amountMinor === expected;
  return (
    <Row gap="sm" align="center" style={{ paddingTop: spacing.xs }}>
      <Icon
        name={matches ? 'checkmark-circle' : 'close-circle'}
        size={theme.iconSizes.sm}
        color={matches ? theme.colors.positive : theme.colors.negative}
      />
      <Text variant="caption" color="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <AmountText
        amountMinor={amountMinor}
        currencyCode={currencyCode}
        variant="amountSmall"
        showCurrencySymbol
        accessibilityLabel={`${label}: ${amountMinor} ${currencyCode}`}
      />
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Error card
// ---------------------------------------------------------------------------

function ErrorCard({ message, onBack }: { readonly message: string; readonly onBack: () => void }): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="xxl" accessibilityRole="alert">
      <Stack gap="lg" align="center">
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
          <Icon name="warning-outline" size={theme.iconSizes.xl} color={theme.colors.negative} />
        </Row>
        <Stack gap="xs" align="center">
          <Text variant="sectionTitle" color="primary">
            Could not load this expense
          </Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            {message}
          </Text>
        </Stack>
        <Button
          label="Back"
          variant="primary"
          size="md"
          onPress={onBack}
          accessibilityLabel="Go back"
          icon="arrow-back-outline"
        />
      </Stack>
    </Card>
  );
}

/** Format an ISO date-time as a compact "Mar 14" label. */
function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = months[date.getUTCMonth()] ?? '';
  const day = date.getUTCDate();
  return `${month} ${day}`;
}
