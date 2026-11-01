/**
 * SettlementDetailScreen — the `/settlements/[settlementId]` screen.
 *
 * Shows one settlement record: amount, payer → receiver, date, method,
 * lifecycle status, note, and whether it is itself a reversal. A
 * `completed` settlement exposes a guarded "Reverse" action.
 *
 * Reversal never deletes or edits financial history: it writes a separate
 * compensating settlement and moves the original to `reversed` atomically
 * (see `ReverseSettlementUseCase`). The confirmation copy says so, because
 * the user is changing balances for everyone in the group.
 *
 * Architecture:
 *   - The thin container reads `services.settlements.getSettlement` and
 *     `services.groups.listGroupMembers` through the services registry.
 *   - `SettlementDetailView` is pure and reads only its view model.
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';

import type { SettlementStatus } from '@domain/services/settlements/settlement-state-machine';
import type { SettlementReminder } from '@domain/entities/settlement-reminder';
import { asSettlementId } from '@domain/entities/settlement';
import { asGroupId } from '@domain/entities/group';
import { asMemberId } from '@domain/entities/group-member';
import { asUserId } from '@domain/entities/user';
import { asDateTime } from '@domain/value-objects';
import { AmountText } from '@presentation/design-system/components/AmountText';
import { Badge } from '@presentation/design-system/components/Badge';
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
import { tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export interface SettlementDetailViewModel {
  readonly id: string;
  readonly groupId: string;
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly status: SettlementStatus;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly fromName: string;
  readonly toName: string;
  /** ISO date (or date-time) the settlement was made. */
  readonly settlementDate: string;
  readonly method: string;
  readonly note: string | null;
  /** True when this record is the compensating half of a reversal. */
  readonly isReversal: boolean;
  /** Reversal is only legal from `completed`. */
  readonly canReverse: boolean;
}

const STATUS_LABELS: Readonly<Record<SettlementStatus, string>> = {
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
 * Kept identical to the history screen's helper so both settlement
 * screens render the same stored date the same way.
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

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface SettlementDetailScreenProps {
  readonly settlementId: string;
}

export function SettlementDetailScreen({
  settlementId,
}: SettlementDetailScreenProps): JSX.Element {
  const [view, setView] = useState<SettlementDetailViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [reminders, setReminders] = useState<readonly SettlementReminder[]>([]);
  const [reminding, setReminding] = useState(false);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) {
        if (!cancelled) {
          setError('Storage is still starting up. Try again in a moment.');
          setLoading(false);
        }
        return;
      }
      try {
        const result = await services.settlements.getSettlement.execute({
          settlementId: asSettlementId(settlementId),
        });
        if (cancelled) return;
        if (result.settlement === null) {
          setView(null);
          setError('Settlement not found. It may have been deleted on this device.');
          return;
        }
        const settlement = result.settlement;
        // Names are a display nicety: if members cannot be read, show the
        // settlement with neutral labels instead of failing the screen.
        let nameById = new Map<string, string>();
        try {
          const members = await services.groups.listGroupMembers.execute(
            settlement.groupId as string,
          );
          nameById = new Map(members.members.map((m) => [m.id, m.displayName]));
        } catch {
          nameById = new Map();
        }
        if (cancelled) return;
        const status: SettlementStatus = settlement.status ?? 'completed';
        setView({
          id: settlement.id as string,
          groupId: settlement.groupId as string,
          fromMemberId: settlement.fromMemberId as string,
          toMemberId: settlement.toMemberId as string,
          status,
          amountMinor: settlement.amountMinor,
          currencyCode: settlement.currencyCode as string,
          fromName: nameById.get(settlement.fromMemberId as string) ?? 'Former member',
          toName: nameById.get(settlement.toMemberId as string) ?? 'Former member',
          settlementDate: settlement.settlementDate as string,
          method: settlement.method,
          note: settlement.note ?? null,
          isReversal: settlement.reversalOfSettlementId !== undefined,
          canReverse: status === 'completed',
        });
        setError(null);
        // Reminders are a pending-confirmation surface. Completed or
        // reversed settlements never load (or show) them.
        if (status === 'pending_confirmation' || status === 'requested') {
          try {
            const page = await services.reminders.listSettlementReminders.execute({
              groupId: asGroupId(settlement.groupId as string),
              pagination: { limit: 50 },
            });
            if (cancelled) return;
            setReminders(
              page.items.filter(
                (r) => r.settlementId !== undefined && r.settlementId === settlement.id,
              ),
            );
          } catch {
            if (!cancelled) setReminders([]);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load this settlement.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settlementId, reloadToken]);

  const handleReverse = (): void => {
    const current = view;
    if (current === null) return;
    Alert.alert(
      'Reverse this settlement?',
      'This writes a separate compensating entry and marks the original as reversed. History is kept, balances change for everyone in the group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reverse',
          style: 'destructive',
          onPress: (): void => {
            void (async () => {
              const services = tryGetAppServices();
              if (services === null) {
                setActionError('Storage is still starting up. Try again in a moment.');
                return;
              }
              setReversing(true);
              setActionError(null);
              try {
                const result = await services.settlements.getSettlement.execute({
                  settlementId: asSettlementId(settlementId),
                });
                if (result.settlement === null) {
                  throw new Error('Settlement not found.');
                }
                const members = await services.groups.listGroupMembers
                  .execute(result.settlement.groupId as string)
                  .catch(() => null);
                const actor =
                  members?.members.find((m) => m.role === 'owner') ?? members?.members[0];
                await services.settlements.reverseSettlement.execute({
                  settlementId: asSettlementId(settlementId),
                  expectedVersion: result.settlement.version as number,
                  actorId: asUserId('local-user'),
                  ...(actor !== undefined
                    ? { actorMemberId: asMemberId(actor.id) }
                    : {}),
                  reason: 'Reversed from the settlement detail screen',
                });
                setReloadToken((token) => token + 1);
              } catch (err) {
                setActionError(
                  err instanceof Error ? err.message : 'Could not reverse this settlement.',
                );
              } finally {
                setReversing(false);
              }
            })();
          },
        },
      ],
    );
  };

  /**
   * Schedule a local confirmation nudge for tomorrow and, when this
   * runtime can present notifications, a matching OS alarm. The row is
   * always persisted — Expo Go / web / denied permission store the
   * reminder and say so, they never pretend it will ring.
   */
  const handleRemind = (): void => {
    const current = view;
    if (current === null) return;
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) {
        setReminderNotice('Storage is still starting up. Try again in a moment.');
        return;
      }
      setReminding(true);
      setReminderNotice(null);
      try {
        const scheduledAt = asDateTime(
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        );
        const { reminder } = await services.reminders.createSettlementReminder.execute({
          groupId: asGroupId(current.groupId),
          settlementId: asSettlementId(current.id),
          payerMemberId: asMemberId(current.fromMemberId),
          receiverMemberId: asMemberId(current.toMemberId),
          currencyCode: current.currencyCode,
          amountMinor: current.amountMinor,
          reminderType: 'pending_confirmation',
          scheduledAt,
          privacyMode: 'private',
          createdBy: asUserId('local-user'),
        });

        const port = services.notifications.localNotifications;
        if (port.availability() === 'available') {
          const permission = await port.permission();
          const resolved =
            permission === 'undetermined' ? await port.requestPermission() : permission;
          if (resolved === 'granted') {
            await port.ensureChannel();
            await port.schedule({
              identifier: `settlement-reminder-${reminder.id as string}`,
              title: 'Settlement reminder',
              // Private mode: no amount on the lock screen.
              body: 'A settlement confirmation is still pending.',
              seconds: 24 * 60 * 60,
              data: { settlementId: current.id },
            });
            setReminderNotice('Reminder set for tomorrow.');
          } else {
            setReminderNotice(
              'Saved on this device. Notifications are turned off in system settings.',
            );
          }
        } else {
          setReminderNotice(
            'Saved on this device. This runtime cannot present notifications (Expo Go or web).',
          );
        }

        const page = await services.reminders.listSettlementReminders.execute({
          groupId: asGroupId(current.groupId),
          pagination: { limit: 50 },
        });
        setReminders(
          page.items.filter(
            (r) => r.settlementId !== undefined && r.settlementId === current.id,
          ),
        );
      } catch (err) {
        setReminderNotice(
          err instanceof Error ? err.message : 'Could not schedule the reminder.',
        );
      } finally {
        setReminding(false);
      }
    })();
  };

  const handleCancelReminder = (reminderId: string): void => {
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) return;
      try {
        await services.reminders.cancelSettlementReminder.execute({ reminderId });
        await services.notifications.localNotifications.cancel(
          `settlement-reminder-${reminderId}`,
        );
        setReminders((prev) => prev.filter((r) => r.id !== reminderId));
        setReminderNotice('Reminder cancelled.');
      } catch (err) {
        setReminderNotice(
          err instanceof Error ? err.message : 'Could not cancel the reminder.',
        );
      }
    })();
  };

  return (
    <SettlementDetailView
      view={view}
      loading={loading}
      error={error}
      actionError={actionError}
      reversing={reversing}
      onReverse={handleReverse}
      reminders={reminders.filter((r) => r.status === 'scheduled').map((r) => ({
        id: r.id as string,
        whenLabel: formatReminderWhen(r.scheduledAt as string),
      }))}
      reminding={reminding}
      reminderNotice={reminderNotice}
      onRemind={handleRemind}
      onCancelReminder={handleCancelReminder}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface ScheduledReminderRow {
  readonly id: string;
  readonly whenLabel: string;
}

export interface SettlementDetailViewProps {
  readonly view: SettlementDetailViewModel | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly actionError?: string | null;
  readonly reversing?: boolean;
  readonly onReverse?: () => void;
  readonly reminders?: readonly ScheduledReminderRow[];
  readonly reminding?: boolean;
  readonly reminderNotice?: string | null;
  readonly onRemind?: () => void;
  readonly onCancelReminder?: (reminderId: string) => void;
}

export function SettlementDetailView({
  view,
  loading,
  error,
  actionError,
  reversing = false,
  onReverse,
  reminders = [],
  reminding = false,
  reminderNotice = null,
  onRemind,
  onCancelReminder,
}: SettlementDetailViewProps): ReactNode {
  const theme = useTheme();

  if (loading) {
    return (
      <Screen scrollable safeArea>
        <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
          <Row gap="md" align="center">
            <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
            <Text variant="caption" color="secondary">
              Loading this settlement…
            </Text>
          </Row>
        </Stack>
      </Screen>
    );
  }

  if (view === null || error !== null) {
    return (
      <Screen scrollable safeArea>
        <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
          <Card elevation="sm" padding="md" accessibilityRole="alert">
            <Row gap="md" align="center">
              <Icon
                name="cloud-offline-outline"
                size={theme.iconSizes.lg}
                color={theme.colors.negative}
              />
              <Stack gap={0} style={{ flex: 1 }}>
                <Text variant="bodyStrong" color="primary">
                  Could not load settlement
                </Text>
                <Text variant="caption" color="secondary">
                  {error ?? 'This settlement could not be loaded.'}
                </Text>
              </Stack>
            </Row>
          </Card>
        </Stack>
      </Screen>
    );
  }

  const isReversed = view.status === 'reversed' || view.isReversal;

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Settlement
          </Text>
          <Text variant="body" color="secondary">
            {view.fromName} paid {view.toName}
          </Text>
        </Stack>

        <Card elevation="md" padding="lg">
          <Stack gap="md" align="stretch">
            <Row gap="md" align="center">
              <AmountText
                amountMinor={view.amountMinor}
                currencyCode={view.currencyCode}
                variant="amountLarge"
                showCurrencySymbol
                accessibilityLabel={describeAmount(view.amountMinor, view.currencyCode, {
                  includeDirection: false,
                })}              />
              <Badge
                label={STATUS_LABELS[view.status]}
                variant={isReversed ? 'neutral' : 'info'}
              />
            </Row>
            <Stack gap="xs" align="stretch">
              <Row gap="sm" align="center">
                <Text variant="caption" color="muted" style={{ width: 90 }}>
                  Date
                </Text>
                <Text variant="body" color="primary">
                  {formatSettlementDate(view.settlementDate)}
                </Text>
              </Row>
              <Row gap="sm" align="center">
                <Text variant="caption" color="muted" style={{ width: 90 }}>
                  Method
                </Text>
                <Text variant="body" color="primary">
                  {formatMethod(view.method)}
                </Text>
              </Row>
              <Row gap="sm" align="center">
                <Text variant="caption" color="muted" style={{ width: 90 }}>
                  From
                </Text>
                <Text variant="body" color="primary">
                  {view.fromName}
                </Text>
              </Row>
              <Row gap="sm" align="center">
                <Text variant="caption" color="muted" style={{ width: 90 }}>
                  To
                </Text>
                <Text variant="body" color="primary">
                  {view.toName}
                </Text>
              </Row>
            </Stack>
            {view.note !== null && view.note !== '' ? (
              <Stack gap="xs" align="stretch">
                <Text variant="caption" color="muted">
                  Note
                </Text>
                <Text variant="body" color="primary">
                  {view.note}
                </Text>
              </Stack>
            ) : null}
            {isReversed ? (
              <Text variant="caption" color="secondary">
                {view.isReversal
                  ? 'This entry cancels an earlier settlement; the original stays in history.'
                  : 'This settlement was reversed. A compensating entry keeps the balances correct.'}
              </Text>
            ) : null}
          </Stack>
        </Card>

        {actionError !== null && actionError !== undefined && actionError !== '' ? (
          <Text variant="caption" color="negative" accessibilityLiveRegion="polite">
            {actionError}
          </Text>
        ) : null}

        {view.canReverse && onReverse !== undefined ? (
          <Card elevation="none" padding="lg">
            <Stack gap="sm" align="stretch">
              <Text variant="bodyStrong" color="primary">
                Reverse this settlement
              </Text>
              <Text variant="caption" color="muted">
                Use this if the payment did not happen or was recorded twice. A separate
                compensating entry is created; nothing is deleted from history.
              </Text>
              <Button
                label="Reverse settlement"
                variant="destructive"
                size="sm"
                icon="arrow-undo-outline"
                onPress={onReverse}
                loading={reversing}
                disabled={reversing}
                accessibilityLabel="Reverse this settlement"
              />
            </Stack>
          </Card>
        ) : null}

        {view.status === 'pending_confirmation' || view.status === 'requested' ? (
          <RemindersCard
            reminders={reminders}
            reminding={reminding}
            notice={reminderNotice}
            onRemind={onRemind}
            onCancelReminder={onCancelReminder}
          />
        ) : null}
      </Stack>
    </Screen>
  );
}

function formatReminderWhen(iso: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return parsed.toLocaleString();
  } catch {
    return iso;
  }
}

function RemindersCard({
  reminders,
  reminding,
  notice,
  onRemind,
  onCancelReminder,
}: {
  readonly reminders: readonly ScheduledReminderRow[];
  readonly reminding: boolean;
  readonly notice: string | null;
  readonly onRemind?: () => void;
  readonly onCancelReminder?: (reminderId: string) => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="lg">
      <Stack gap="sm" align="stretch">
        <Text variant="bodyStrong" color="primary">
          Remind to confirm
        </Text>
        <Text variant="caption" color="muted">
          One quiet nudge tomorrow. No amount on the lock screen.
        </Text>
        {reminders.map((reminder) => (
          <Row key={reminder.id} gap="md" align="center">
            <Icon
              name="notifications-outline"
              size={theme.iconSizes.md}
              color={theme.colors.brandPrimary}
            />
            <Text variant="body" color="primary" style={{ flex: 1 }}>
              {reminder.whenLabel}
            </Text>
            <Button
              label="Cancel"
              variant="ghost"
              size="sm"
              onPress={() => onCancelReminder?.(reminder.id)}
              accessibilityLabel={`Cancel reminder ${reminder.whenLabel}`}
            />
          </Row>
        ))}
        <Button
          label="Remind me tomorrow"
          variant="secondary"
          size="sm"
          icon="notifications-outline"
          onPress={onRemind}
          loading={reminding}
          disabled={reminding}
          accessibilityLabel="Remind me to confirm this settlement tomorrow"
        />
        {notice !== null && notice !== '' ? (
          <Text variant="caption" color="secondary" accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
