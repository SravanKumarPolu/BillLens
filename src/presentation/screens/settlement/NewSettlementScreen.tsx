/**
 * NewSettlementScreen — real form for recording a settlement.
 *
 * Phase 6 Track 1 + Phase 7 UI.
 *
 * Collects: payer, receiver, amount, currency, method, date, optional
 * note. Then calls `CreateSettlementDraftUseCase` followed by
 * `RecordSettlementUseCase` (via the `useSettlementForm` hook) to
 * create a settlement in `pending_confirmation` status. The receiver
 * must confirm explicitly before balances move (Phase 6 safety
 * principle).
 *
 * The screen is split into a thin container that reads group members
 * via `useGroupMembers` and submits via `useSettlementForm`, plus a
 * pure presentational component (`NewSettlementView`) that reads ONLY
 * from a view model + callbacks. This keeps the layout fully unit-
 * testable without rendering the hook tree.
 *
 * Architecture:
 *   - No `@infrastructure/*` imports. The hook reaches use cases
 *     through the services registry only.
 *   - Pre-fills `fromMemberId` / `toMemberId` / `amountMinor` from
 *     query params so the Suggested Settlements card can deep-link
 *     to a pre-filled form.
 *   - On success: refreshes the persisted group store (lastActivity
 *     label + sync state), then `router.back()`.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput } from 'react-native';

import { ALL_SETTLEMENT_METHODS, type SettlementMethod } from '@domain/entities/settlement';
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
import { useGroupMembers } from '@presentation/hooks/use-group-members';
import {
  useSettlementForm,
  type SettlementOverpaymentWarning,
} from '@presentation/hooks/use-settlement-form';
import { moneyDecimals, parseMoneyInput } from '@presentation/utils/parse-money-input';
import { useGroupStore } from '@store/group-store';

/** Integer-only minor → major string (no floats; respects JPY/KWD scale). */
function minorToMajorInput(minor: number, currencyCode: string): string {
  const decimals = moneyDecimals(currencyCode);
  const divisor = 10 ** decimals;
  const whole = Math.floor(minor / divisor);
  const fraction = minor % divisor;
  if (decimals === 0) return String(whole);
  return `${whole}.${fraction.toString().padStart(decimals, '0')}`;
}

/**
 * v2.26.0: the local SQLite schema only accepts these four methods
 * (`settlements.method` CHECK — see schema.ts). The domain also defines
 * `card` and `wallet`, but selecting either previously produced a
 * guaranteed CHECK-constraint failure on save. The picker therefore
 * offers only the locally persistable set; the wider domain list stays
 * available for future schema/remote expansion.
 */
const LOCAL_SETTLEMENT_METHODS: readonly SettlementMethod[] =
  ALL_SETTLEMENT_METHODS.filter(
    (method) => method === 'cash' || method === 'upi' || method === 'bank_transfer' || method === 'other',
  );

// ---------------------------------------------------------------------------
// View-model types
// ---------------------------------------------------------------------------

/** One member row in the payer / receiver picker. */
export interface SettlementMemberViewModel {
  readonly id: string;
  readonly displayName: string;
  readonly isCurrentUser: boolean;
}

/** Pure form state. The view-model is derived from this. */
export interface SettlementFormState {
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly amountMajor: string;
  readonly currencyCode: string;
  readonly method: SettlementMethod;
  readonly note: string;
}

export interface NewSettlementViewModel {
  readonly groupName: string;
  readonly currencyCode: string;
  readonly members: readonly SettlementMemberViewModel[];
  readonly form: SettlementFormState;
  readonly canSubmit: boolean;
  readonly sameMemberSelected: boolean;
  /** Non-null while an overpayment warning awaits explicit confirmation. */
  readonly overpayment: SettlementOverpaymentWarning | null;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly loading: boolean;
  readonly loadError: string | null;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface NewSettlementScreenProps {
  readonly groupId?: string;
}

export function NewSettlementScreen({ groupId }: NewSettlementScreenProps): JSX.Element {
  const params = useLocalSearchParams<{
    groupId?: string;
    fromMemberId?: string;
    toMemberId?: string;
    amountMinor?: string;
  }>();
  const gid = (groupId ?? params.groupId ?? '').trim();

  const groupMembers = useGroupMembers(gid);
  const form = useSettlementForm();
  const upsertGroup = useGroupStore((s) => s.upsertGroup);
  const existingGroup = useGroupStore((s) => s.groups.find((g) => g.id === gid));

  // Pre-fill from query params (deep link from the Suggested Settlements
  // card on the group home screen).
  // v2.4.0: integer-only minor → major conversion (the old
  // parseInt/100 + toFixed(2) corrupted JPY (÷100) and KWD (÷1000)). The
  // currency arrives async via groupMembers, so the prefill re-renders
  // through useMemo once it resolves.
  const prefillCurrency = groupMembers.currencyCode ?? existingGroup?.currencyCode ?? 'USD';
  const [amountMajor, setAmountMajor] = useState<string>(() =>
    params.amountMinor
      ? minorToMajorInput(Number.parseInt(params.amountMinor, 10), prefillCurrency)
      : '',
  );
  const [fromMemberId, setFromMemberId] = useState<string>(params.fromMemberId ?? '');
  const [toMemberId, setToMemberId] = useState<string>(params.toMemberId ?? '');
  const [method, setMethod] = useState<SettlementMethod>('upi');
  const [note, setNote] = useState<string>('');

  const currencyCode = groupMembers.currencyCode ?? existingGroup?.currencyCode ?? 'USD';
  const groupName = groupMembers.groupName ?? existingGroup?.name ?? 'Group';

  const sameMemberSelected =
    fromMemberId.length > 0 && toMemberId.length > 0 && fromMemberId === toMemberId;

  // v2.4.0: shared currency-aware parser — the old regex hardcoded
  // 2 decimals and used parseFloat (float anti-pattern).
  const amountValid = parseMoneyInput(amountMajor, currencyCode).ok;

  // A pending overpayment warning is about one specific
  // (payer, receiver, amount) triple — dismiss it as soon as the user
  // edits any leg of that triple, so a stale warning can never be
  // confirmed for values it does not describe.
  const dismissOverpayment = form.dismissOverpayment;
  useEffect(() => {
    dismissOverpayment();
  }, [dismissOverpayment, amountMajor, fromMemberId, toMemberId]);

  const canSubmit =
    fromMemberId.length > 0 &&
    toMemberId.length > 0 &&
    !sameMemberSelected &&
    amountValid &&
    !form.submitting;

  const viewModel: NewSettlementViewModel = useMemo(
    () => ({
      groupName,
      currencyCode,
      members: groupMembers.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        isCurrentUser: m.isCurrentUser,
      })),
      form: { fromMemberId, toMemberId, amountMajor, currencyCode, method, note },
      canSubmit,
      sameMemberSelected,
      overpayment: form.overpayment,
      submitting: form.submitting,
      error: form.error,
      loading: groupMembers.loading,
      loadError: groupMembers.error,
    }),
    [
      groupName,
      currencyCode,
      groupMembers.members,
      groupMembers.loading,
      groupMembers.error,
      fromMemberId,
      toMemberId,
      amountMajor,
      method,
      note,
      canSubmit,
      sameMemberSelected,
      form.overpayment,
      form.submitting,
      form.error,
    ],
  );

  const handleSubmit = useCallback(async (confirmOverpayment: boolean): Promise<void> => {
    if (!canSubmit || gid.length === 0) return;
    try {
      await form.submit({
        groupId: gid,
        fromMemberId,
        toMemberId,
        amountMajor,
        currencyCode,
        method,
        note,
        createdBy: 'local-user', // pre-identity synthetic id, same as manual expense form
        actorMemberId: fromMemberId, // the payer records the payment
        ...(confirmOverpayment ? { confirmOverpayment: true } : {}),
      });
      // Keep the persisted group store fresh — the balances screen reads
      // `lastActivityLabel` + `syncState` to show the pending sync badge.
      upsertGroup({
        id: gid,
        name: groupName,
        currencyCode,
        memberCount: existingGroup?.memberCount ?? groupMembers.members.length,
        userBalanceMinor: existingGroup?.userBalanceMinor ?? 0,
        lastActivityLabel: 'Just now',
        archived: false,
        syncState: 'pending',
        groupType: existingGroup?.groupType ?? 'General',
        privacyDefault: existingGroup?.privacyDefault ?? 'local_only',
        createdAt: existingGroup?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      router.back();
    } catch {
      // The hook already stored the error in `form.error` — the view
      // renders it. No additional handling here.
    }
  }, [
    canSubmit,
    gid,
    form,
    fromMemberId,
    toMemberId,
    amountMajor,
    currencyCode,
    method,
    note,
    upsertGroup,
    groupName,
    existingGroup,
    groupMembers.members.length,
  ]);

  const handleCancel = useCallback((): void => {
    router.back();
  }, []);

  const handleDismissOverpayment = useCallback((): void => {
    form.dismissOverpayment();
  }, [form]);

  return (
    <NewSettlementView
      viewModel={viewModel}
      onSelectFrom={(id) => setFromMemberId(id)}
      onSelectTo={(id) => setToMemberId(id)}
      onAmountChange={(v) => setAmountMajor(v.replace(/[^0-9.]/g, ''))}
      onSelectMethod={(m) => setMethod(m)}
      onNoteChange={setNote}
      onSubmit={() => void handleSubmit(false)}
      onConfirmOverpayment={() => void handleSubmit(true)}
      onDismissOverpayment={handleDismissOverpayment}
      onCancel={handleCancel}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface NewSettlementViewProps {
  readonly viewModel: NewSettlementViewModel;
  readonly onSelectFrom: (memberId: string) => void;
  readonly onSelectTo: (memberId: string) => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSelectMethod: (method: SettlementMethod) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onSubmit: () => void | Promise<void>;
  /** User tapped "Record anyway" on the overpayment warning. */
  readonly onConfirmOverpayment: () => void | Promise<void>;
  /** User tapped "Edit amount" on the overpayment warning. */
  readonly onDismissOverpayment: () => void;
  readonly onCancel: () => void;
}

export function NewSettlementView({
  viewModel,
  onSelectFrom,
  onSelectTo,
  onAmountChange,
  onSelectMethod,
  onNoteChange,
  onSubmit,
  onConfirmOverpayment,
  onDismissOverpayment,
  onCancel,
}: NewSettlementViewProps): JSX.Element {
  const theme = useTheme();

  const inputStyle = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 48,
      fontSize: 16,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
    }),
    [theme],
  );

  const labelStyle = useMemo(
    () => ({
      fontSize: 12,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      color: theme.colors.textSecondary,
      marginBottom: spacing.xs,
    }),
    [theme],
  );

  return (
    <Screen scrollable safeArea avoidKeyboard>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        {/* Header */}
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Settle up
          </Text>
          <Text variant="caption" color="muted">
            {viewModel.groupName} · {viewModel.currencyCode}
          </Text>
        </Stack>

        {/* Loading / load-error state */}
        {viewModel.loading ? (
          <Card elevation="none" padding="md" accessibilityRole="text">
            <Row gap="md" align="center">
              <Text variant="caption" color="secondary">
                Loading this group&apos;s members…
              </Text>
            </Row>
          </Card>
        ) : null}

        {viewModel.loadError !== null ? (
          <Card elevation="sm" padding="md" accessibilityRole="alert">
            <Row gap="md" align="center">
              <Icon
                name="cloud-offline-outline"
                size={theme.iconSizes.lg}
                color={theme.colors.negative}
              />
              <Stack gap={0} style={{ flex: 1 }}>
                <Text variant="bodyStrong" color="primary">
                  Could not load this group
                </Text>
                <Text variant="caption" color="secondary">
                  {viewModel.loadError}
                </Text>
              </Stack>
            </Row>
          </Card>
        ) : null}

        {/* Payer */}
        <Stack gap="xs" align="stretch">
          <Text style={labelStyle}>PAYER</Text>
          <Card elevation="sm" padding="md">
            {viewModel.members.length === 0 && !viewModel.loading ? (
              <Text variant="caption" color="muted">
                No members in this group yet. Invite a member from the group settings first.
              </Text>
            ) : (
              viewModel.members.map((m) => {
                const selected = viewModel.form.fromMemberId === m.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => onSelectFrom(m.id)}
                    accessibilityRole="radio"
                    accessibilityLabel={`Select ${m.displayName} as payer`}
                    accessibilityState={{ selected }}
                  >
                    <Row gap="md" align="center" style={{ paddingVertical: spacing.sm }}>
                      <Avatar name={m.displayName} size="sm" />
                      <Text
                        variant="body"
                        color={selected ? 'primary' : 'secondary'}
                        style={{ flex: 1, fontWeight: selected ? '600' : '400' }}
                      >
                        {m.displayName}
                        {m.isCurrentUser ? ' (you)' : ''}
                      </Text>
                      {selected ? (
                        <Icon
                          name="checkmark-circle"
                          size={theme.iconSizes.md}
                          color={theme.colors.brandPrimary}
                        />
                      ) : null}
                    </Row>
                  </Pressable>
                );
              })
            )}
          </Card>
        </Stack>

        {/* Receiver */}
        <Stack gap="xs" align="stretch">
          <Text style={labelStyle}>RECEIVER</Text>
          <Card elevation="sm" padding="md">
            {viewModel.members.length === 0 && !viewModel.loading ? (
              <Text variant="caption" color="muted">
                No members in this group yet.
              </Text>
            ) : (
              viewModel.members
                .filter((m) => m.id !== viewModel.form.fromMemberId)
                .map((m) => {
                  const selected = viewModel.form.toMemberId === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => onSelectTo(m.id)}
                      accessibilityRole="radio"
                      accessibilityLabel={`Select ${m.displayName} as receiver`}
                      accessibilityState={{ selected }}
                    >
                      <Row gap="md" align="center" style={{ paddingVertical: spacing.sm }}>
                        <Avatar name={m.displayName} size="sm" />
                        <Text
                          variant="body"
                          color={selected ? 'primary' : 'secondary'}
                          style={{ flex: 1, fontWeight: selected ? '600' : '400' }}
                        >
                          {m.displayName}
                          {m.isCurrentUser ? ' (you)' : ''}
                        </Text>
                        {selected ? (
                          <Icon
                            name="checkmark-circle"
                            size={theme.iconSizes.md}
                            color={theme.colors.brandPrimary}
                          />
                        ) : null}
                      </Row>
                    </Pressable>
                  );
                })
            )}
          </Card>
        </Stack>

        {/* Amount */}
        <Stack gap="xs" align="stretch">
          <Text style={labelStyle}>AMOUNT ({viewModel.form.currencyCode})</Text>
          <TextInput
            value={viewModel.form.amountMajor}
            onChangeText={onAmountChange}
            placeholder="0.00"
            keyboardType="decimal-pad"
            style={inputStyle}
            accessibilityLabel="Settlement amount"
            accessibilityHint="Enter the amount to settle"
            // Phase 6: money entry scales to 1.5x, matching the
            // AmountText display cap — a wrapped/overgrown figure is
            // harder to verify, and amount verification is the core
            // safety act of this screen.
            maxFontSizeMultiplier={1.5}
          />
        </Stack>

        {/* Method */}
        <Stack gap="xs" align="stretch">
          <Text style={labelStyle}>METHOD</Text>
          <Row gap="sm" align="center" style={{ flexWrap: 'wrap' }}>
            {LOCAL_SETTLEMENT_METHODS.map((method) => {
              const selected = viewModel.form.method === method;
              return (
                <Pressable
                  key={method}
                  onPress={() => onSelectMethod(method)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Select ${method} as payment method`}
                  accessibilityState={{ selected }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    minHeight: 44,
                    borderRadius: theme.borderRadius.md,
                    backgroundColor: selected
                      ? theme.colors.brandPrimary
                      : theme.colors.surfaceMuted,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                  }}
                >
                  <Text
                    variant="caption"
                    color={selected ? 'onColor' : 'secondary'}
                    style={{ fontWeight: '500' }}
                  >
                    {method.replace('_', ' ').toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </Row>
        </Stack>

        {/* Note */}
        <Stack gap="xs" align="stretch">
          <Text style={labelStyle}>NOTE (OPTIONAL)</Text>
          <TextInput
            value={viewModel.form.note}
            onChangeText={onNoteChange}
            placeholder="e.g. Dinner split"
            style={inputStyle}
            accessibilityLabel="Optional settlement note"
            multiline
          />
        </Stack>

        {/* Same-member warning */}
        {viewModel.sameMemberSelected ? (
          <Text variant="error" color="negative" accessibilityRole="alert">
            Payer and receiver cannot be the same member.
          </Text>
        ) : null}

        {/* Overpayment warning (Phase 3) — requires explicit confirm */}
        {viewModel.overpayment !== null ? (
          <OverpaymentWarningCard
            warning={viewModel.overpayment}
            payerName={
              viewModel.members.find((m) => m.id === viewModel.form.fromMemberId)
                ?.displayName ?? 'The payer'
            }
            submitting={viewModel.submitting}
            onConfirm={onConfirmOverpayment}
            onEditAmount={onDismissOverpayment}
          />
        ) : null}

        {/* Submit error */}
        {viewModel.error !== null ? (
          <Card
            elevation="sm"
            padding="md"
            accessibilityRole="alert"
            style={{ borderColor: theme.colors.negative, borderWidth: 1 }}
          >
            <Row gap="md" align="center">
              <Icon name="warning-outline" size={theme.iconSizes.lg} color={theme.colors.negative} />
              <Stack gap={0} style={{ flex: 1 }}>
                <Text variant="bodyStrong" color="primary">
                  Could not record the settlement
                </Text>
                <Text variant="caption" color="secondary">
                  {viewModel.error}
                </Text>
              </Stack>
            </Row>
          </Card>
        ) : null}

        {/* Actions */}
        <Row gap="md" align="center" style={{ paddingTop: spacing.md }}>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={onCancel}
            accessibilityLabel="Cancel and go back"
            style={{ flex: 1 }}
          />
          <Button
            label="Record payment"
            variant="primary"
            icon="arrow-forward"
            onPress={onSubmit}
            loading={viewModel.submitting}
            disabled={!viewModel.canSubmit}
            accessibilityLabel="Record this settlement"
            accessibilityHint="Creates a draft settlement and marks it as pending receiver confirmation"
            style={{ flex: 2 }}
          />
        </Row>

        {/* Safety note */}
        <Text variant="caption" color="muted" style={{ textAlign: 'center', paddingTop: spacing.sm }}>
          The receiver must confirm this payment before it affects balances.
        </Text>
      </Stack>
    </Screen>
  );
}

// Re-export for callers / tests.
export type { SettlementMethod } from '@domain/entities/settlement';

// ---------------------------------------------------------------------------
// Overpayment warning card
// ---------------------------------------------------------------------------

interface OverpaymentWarningCardProps {
  readonly warning: SettlementOverpaymentWarning;
  readonly payerName: string;
  readonly submitting: boolean;
  readonly onConfirm: () => void | Promise<void>;
  readonly onEditAmount: () => void;
}

/**
 * Blocking confirmation card shown when the typed amount exceeds what
 * the payer owes (or the payer is a creditor). Integer-only amount
 * formatting — no floats (JPY/KWD safe).
 */
export function OverpaymentWarningCard({
  warning,
  payerName,
  submitting,
  onConfirm,
  onEditAmount,
}: OverpaymentWarningCardProps): JSX.Element {
  const theme = useTheme();
  const amountText = `${warning.currencyCode} ${minorToMajorInput(
    warning.amountMinor,
    warning.currencyCode,
  )}`;
  const outstandingText = `${warning.currencyCode} ${minorToMajorInput(
    warning.outstandingMinor,
    warning.currencyCode,
  )}`;
  const message =
    warning.reason === 'payer_is_owed'
      ? `${payerName} is currently owed money in this group, not owing it. ` +
        `Recording this payment will reduce what ${payerName} is owed. ` +
        `Continue only if this is an off-ledger reimbursement.`
      : `This payment (${amountText}) is more than ${payerName} owes ` +
        `(${outstandingText}). After it is confirmed, ${payerName} will be ` +
        `owed the difference.`;
  return (
    <Card
      elevation="sm"
      padding="md"
      accessibilityRole="alert"
      testID="overpayment-warning"
      style={{ borderColor: theme.colors.negative, borderWidth: 1 }}
    >
      <Row gap="md" align="center">
        <Icon name="warning-outline" size={theme.iconSizes.lg} color={theme.colors.negative} />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            Overpayment warning
          </Text>
          <Text variant="caption" color="secondary">
            {message}
          </Text>
        </Stack>
      </Row>
      <Row gap="md" align="center" style={{ paddingTop: spacing.md }}>
        <Button
          label="Edit amount"
          variant="ghost"
          onPress={onEditAmount}
          accessibilityLabel="Dismiss warning and edit the amount"
          style={{ flex: 1 }}
        />
        <Button
          label="Record anyway"
          variant="primary"
          onPress={onConfirm}
          loading={submitting}
          disabled={submitting}
          accessibilityLabel="Record this payment despite the overpayment warning"
          accessibilityHint="Records the settlement even though it exceeds what the payer owes"
          style={{ flex: 1 }}
        />
      </Row>
    </Card>
  );
}

/** Helper used by tests to build a synthetic view model. */
export function buildSettlementViewModel(
  overrides: Partial<NewSettlementViewModel> = {},
): NewSettlementViewModel {
  const defaults: NewSettlementViewModel = {
    groupName: 'Group',
    currencyCode: 'USD',
    members: [],
    form: {
      fromMemberId: '',
      toMemberId: '',
      amountMajor: '',
      currencyCode: 'USD',
      method: 'upi',
      note: '',
    },
    canSubmit: false,
    sameMemberSelected: false,
    overpayment: null,
    submitting: false,
    error: null,
    loading: false,
    loadError: null,
  };
  return { ...defaults, ...overrides, form: { ...defaults.form, ...overrides.form } };
}
