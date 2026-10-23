/**
 * NewExpenseScreen — the manual expense form (`/expenses/new`).
 *
 * Collects title, amount (decimal string parsed to integer minor units
 * with strict string arithmetic), currency, date, note, the payer, and
 * the participants. Shows a live split preview computed by the DOMAIN
 * split engine — the exact shares that will be persisted.
 *
 * On submit the screen calls `CreateExpenseManuallyUseCase` through the
 * services registry. The use case validates group membership, computes
 * the deterministic equal split, validates the full expense aggregate,
 * persists atomically (expense + payers + splits + offline-sync
 * operation in ONE transaction), and appends the audit entry.
 *
 * Architecture:
 *   - Thin container `NewExpenseScreen` holds form state and the
 *     service calls; the pure `NewExpenseView` renders ONLY from the
 *     view model + callbacks (unit-testable without services).
 *   - All validation lives in `view-models/expense-form.ts`.
 *   - No fake data — the form starts empty (title/amount/note blank,
 *     date = today, payer = first member, participants = all members).
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import type { CreateExpenseManuallyInput } from '@application/expenses';
import {
  AmountText,
  Button,
  Card,
  Icon,
  Row,
  Screen,
  Stack,
  Text,
  useTheme,
  spacing,
  describeAmount,
} from '@presentation/design-system';
import {
  type ExpenseFormMember,
  type ExpenseSplitMethod,
  type ManualExpenseFormState,
  currencyDecimals,
  parseAmountToMinor,
  parsePercentBasisPoints,
  parseShareUnits,
  type ManualExpenseFormViewModel,
  createManualExpenseFormViewModel,
  todayDateOnly,
} from '@presentation/view-models/expense-form';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMON_CURRENCIES: readonly string[] = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'];

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface NewExpenseScreenProps {
  readonly groupId: string;
  /** When present, the form edits this expense instead of creating one. */
  readonly expenseId?: string;
}

interface GroupFormData {
  readonly groupName: string;
  readonly currencyCode: string;
  readonly members: readonly ExpenseFormMember[];
}

export function NewExpenseScreen({ groupId, expenseId }: NewExpenseScreenProps): JSX.Element {
  const [formTitle, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [dateInput, setDateInput] = useState(todayDateOnly());
  const [note, setNote] = useState('');
  const [payerMemberId, setPayerMemberId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<readonly string[]>([]);
  const [splitType, setSplitType] = useState<ExpenseSplitMethod>('equal');
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [multiPayer, setMultiPayer] = useState(false);
  const [payerRows, setPayerRows] = useState<
    readonly { readonly memberId: string; readonly amountInput: string }[]
  >([]);

  const [groupData, setGroupData] = useState<GroupFormData | null>(null);
  const servicesReady = useAppServicesReady();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  // Stable across retries of the same create attempt.
  const pendingCreateIdRef = useRef<string | null>(null);

  const upsertGroup = useGroupStore((s) => s.upsertGroup);
  const existingGroup = useGroupStore((s) => s.groups.find((g) => g.id === groupId));

  // Load the group's name, default currency, and active members.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) {
        // The registry hook triggers a retry when initialization completes.
        if (!cancelled) {
          setLoadError('Storage is still starting up. Pull the screen again in a moment.');
          setIsLoading(false);
        }
        return;
      }
      try {
        const result = await services.groups.listGroupMembers.execute(groupId);
        if (cancelled) return;
        const members: ExpenseFormMember[] = result.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
        }));
        setGroupData({
          groupName: result.groupName,
          currencyCode: result.currencyCode,
          members,
        });
        // Sensible defaults: payer = first member (the owner), split
        // across everyone — the user adjusts both before submitting.
        setPayerMemberId(members[0]?.id ?? null);
        setParticipantIds(members.map((m) => m.id));
        setCurrencyCode((current) => (current === '' ? result.currencyCode : current));
        setLoadError(null);

        if (expenseId !== undefined) {
          const [expense, splits, payers] = await Promise.all([
            services.repositories.expenses.findById(expenseId as never),
            services.repositories.expenses.listSplits(expenseId as never),
            services.repositories.expenses.listPayers(expenseId as never),
          ]);
          if (cancelled) return;
          if (expense === null || expense.deletedAt !== undefined) {
            setLoadError('This expense could not be found.');
            return;
          }
          setTitle(expense.title);
          setAmountInput(formatMinorInput(expense.amountMinor, expense.currencyCode));
          setCurrencyCode(expense.currencyCode);
          setDateInput(expense.expenseDate.slice(0, 10));
          setNote(expense.note ?? '');
          setParticipantIds(splits.map((split) => split.memberId as string));
          setSplitType(
            expense.splitType === 'equal' ||
              expense.splitType === 'exact' ||
              expense.splitType === 'percentage' ||
              expense.splitType === 'shares'
              ? expense.splitType
              : 'equal',
          );
          if (expense.splitType === 'exact') {
            setSplitValues(
              Object.fromEntries(
                splits.map((split) => [
                  split.memberId as string,
                  formatMinorInput(split.amountMinor, expense.currencyCode),
                ]),
              ),
            );
          } else if (expense.splitType === 'percentage') {
            setSplitValues(
              Object.fromEntries(
                splits.map((split) => [
                  split.memberId as string,
                  ((split.percentageBasisPoints ?? 0) / 100).toFixed(2),
                ]),
              ),
            );
          } else if (expense.splitType === 'shares') {
            setSplitValues(
              Object.fromEntries(
                splits.map((split) => [
                  split.memberId as string,
                  String(split.shareUnits ?? 1),
                ]),
              ),
            );
          }
          if (payers.length > 1) {
            setMultiPayer(true);
            setPayerRows(
              payers.map((payer) => ({
                memberId: payer.memberId as string,
                amountInput: formatMinorInput(payer.amountMinor, expense.currencyCode),
              })),
            );
          } else if (payers[0] !== undefined) {
            setPayerMemberId(payers[0].memberId as string);
          }
          setExpectedVersion(expense.version as number);
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : 'Could not load this group.',
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, expenseId, servicesReady]);

  const formState: ManualExpenseFormState = useMemo(
    () => ({
      title: formTitle,
      amountInput,
      currencyCode: currencyCode || groupData?.currencyCode || 'USD',
      dateInput,
      note,
      payerMemberId,
      ...(multiPayer ? { payerContributions: payerRows } : {}),
      participantIds,
      splitType,
      splitValues,
    }),
    [
      formTitle,
      amountInput,
      currencyCode,
      groupData,
      dateInput,
      note,
      payerMemberId,
      multiPayer,
      payerRows,
      participantIds,
      splitType,
      splitValues,
    ],
  );

  const viewModel = useMemo(
    () =>
      createManualExpenseFormViewModel({
        state: formState,
        members: groupData?.members ?? [],
        defaultCurrencyCode: groupData?.currencyCode ?? 'USD',
      }),
    [formState, groupData],
  );

  const handleToggleParticipant = useCallback((memberId: string) => {
    setParticipantIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setParticipantIds((current) =>
      current.length === (groupData?.members.length ?? 0)
        ? []
        : (groupData?.members ?? []).map((m) => m.id),
    );
  }, [groupData]);

  const handleToggleMultiPayer = useCallback(() => {
    if (multiPayer) {
      setMultiPayer(false);
      return;
    }
    const first = payerMemberId ?? groupData?.members[0]?.id ?? '';
    setPayerRows([{ memberId: first, amountInput: amountInput.trim() }]);
    setMultiPayer(true);
  }, [multiPayer, payerMemberId, groupData, amountInput]);

  const handleChangePayerRow = useCallback(
    (index: number, patch: { readonly memberId?: string; readonly amountInput?: string }) => {
      setPayerRows((rows) =>
        rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const handleAddPayerRow = useCallback(() => {
    setPayerRows((rows) => {
      const used = new Set(rows.map((row) => row.memberId));
      const next = groupData?.members.find((member) => !used.has(member.id));
      return [...rows, { memberId: next?.id ?? '', amountInput: '' }];
    });
  }, [groupData]);

  const handleRemovePayerRow = useCallback((index: number) => {
    setPayerRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  }, []);

  const handleSelectSplitType = useCallback(
    (next: ExpenseSplitMethod) => {
      setSplitType(next);
      if (next === 'equal') return;
      const members = participantIds;
      const minor = parseAmountToMinor(
        amountInput,
        currencyCode || groupData?.currencyCode || 'USD',
        { allowZero: true },
      ).minor;

      if (next === 'shares') {
        setSplitValues(Object.fromEntries(members.map((id) => [id, '1'])));
        return;
      }
      if (next === 'percentage') {
        const base = Math.floor(10_000 / Math.max(1, members.length));
        const values: Record<string, string> = {};
        members.forEach((id, index) => {
          const bp = index === members.length - 1 ? 10_000 - base * (members.length - 1) : base;
          values[id] = (bp / 100).toFixed(2);
        });
        setSplitValues(values);
        return;
      }
      // exact: prefill equal major-unit strings; the user adjusts them.
      if (minor !== null) {
        const base = Math.floor(minor / Math.max(1, members.length));
        const values: Record<string, string> = {};
        members.forEach((id, index) => {
          const share =
            index === members.length - 1 ? minor - base * (members.length - 1) : base;
          values[id] = formatMinorInput(share, currencyCode || groupData?.currencyCode || 'USD');
        });
        setSplitValues(values);
      }
    },
    [participantIds, amountInput, currencyCode, groupData],
  );

  const handleChangeSplitValue = useCallback((memberId: string, value: string) => {
    setSplitValues((current) => ({ ...current, [memberId]: value }));
  }, []);

  const handleSubmit = useCallback((): void => {
    if (!viewModel.canSubmit || isSubmitting || groupData === null) return;
    const services = tryGetAppServices();
    if (services === null) {
      setSubmitError('Storage is not ready yet. Try again in a moment.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    // Generate the NEW expense id once so a retry after a failure reuses it
    // (the repository's upsert semantics make the retry idempotent). In edit
    // mode the prop `expenseId` identifies the record to update.
    const newExpenseId = pendingCreateIdRef.current ?? generateExpenseId();
    pendingCreateIdRef.current = newExpenseId;

    const split =
      splitType === 'equal'
        ? undefined
        : splitType === 'exact'
          ? {
              splitType: 'exact' as const,
              allocations: participantIds.map((id) => ({
                memberId: id,
                amountMinor:
                  parseAmountToMinor(
                    splitValues[id] ?? '',
                    formState.currencyCode,
                    { allowZero: true },
                  ).minor ?? 0,
              })),
            }
          : splitType === 'percentage'
            ? {
                splitType: 'percentage' as const,
                allocations: participantIds.map((id) => ({
                  memberId: id,
                  basisPoints: parsePercentBasisPoints(splitValues[id] ?? '').basisPoints ?? 0,
                })),
              }
            : {
                splitType: 'shares' as const,
                allocations: participantIds.map((id) => ({
                  memberId: id,
                  units: parseShareUnits(splitValues[id] ?? '').units ?? 0,
                })),
              };

    const input: CreateExpenseManuallyInput = {
      groupId,
      title: formTitle,
      amountMinor: viewModel.amountMinor as number,
      currencyCode: formState.currencyCode,
      ...(dateInput.trim().length > 0 ? { expenseDate: dateInput } : {}),
      ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      payerContributions: multiPayer
        ? payerRows.map((row) => ({
            memberId: row.memberId,
            amountMinor:
              parseAmountToMinor(row.amountInput, formState.currencyCode, {
                allowZero: true,
              }).minor ?? 0,
          }))
        : [
            {
              memberId: payerMemberId as string,
              amountMinor: viewModel.amountMinor as number,
            },
          ],
      participantIds,
      ...(split !== undefined ? { split } : {}),
      createdBy: 'local-user',
      expenseId: newExpenseId,
    };

    void (async () => {
      try {
        if (expenseId !== undefined && expectedVersion !== null) {
          await services.expenses.updateExpense.execute({
            expenseId,
            title: input.title,
            amountMinor: input.amountMinor,
            currencyCode: input.currencyCode,
            ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
            ...(input.note !== undefined ? { note: input.note } : {}),
            payerContributions: input.payerContributions,
            participantIds: input.participantIds,
            ...(input.split !== undefined ? { split: input.split } : {}),
            expectedVersion,
            actorUserId: 'local-user',
          });
        } else {
          await services.expenses.createExpenseManually.execute(input);
        }
        // Keep the UI stores coherent with the write (label + freshness).
        upsertGroup({
          id: groupId,
          name: groupData.groupName,
          currencyCode: groupData.currencyCode,
          memberCount: groupData.members.length,
          userBalanceMinor: existingGroup?.userBalanceMinor ?? 0,
          lastActivityLabel: 'Just now',
          archived: false,
          syncState: 'pending',
          groupType: existingGroup?.groupType ?? 'General',
          privacyDefault: existingGroup?.privacyDefault ?? 'local_only',
          createdAt: existingGroup?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        pendingCreateIdRef.current = null;
        router.back();
      } catch (error) {
        // Diagnostics without logging financial values or payloads.
        console.warn(
          '[NewExpense] save failed:',
          error instanceof Error ? error.name : 'unknown',
          error instanceof Error ? error.message : '',
        );
        setSubmitError(
          error instanceof Error ? error.message : 'Could not save the expense.',
        );
        setIsSubmitting(false);
      }
    })();
  }, [
    viewModel,
    isSubmitting,
    groupData,
    groupId,
    formTitle,
    formState.currencyCode,
    dateInput,
    note,
    payerMemberId,
    multiPayer,
    payerRows,
    participantIds,
    splitType,
    splitValues,
    upsertGroup,
    existingGroup,
    expenseId,
    expectedVersion,
  ]);

  const handleCancel = useCallback((): void => {
    router.back();
  }, []);

  if (isLoading) {
    return (
      <Screen safeArea>
        <Stack gap="md" align="center" style={{ padding: spacing.xxl }}>
          <ActivityIndicator size="large" color="#2B3A8C" />
          <Text variant="body" color="secondary">
            Loading group…
          </Text>
        </Stack>
      </Screen>
    );
  }

  if (loadError !== null && groupData === null) {
    return (
      <Screen safeArea scrollable>
        <Stack gap="lg" align="stretch" style={{ padding: spacing.xl }}>
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            New expense
          </Text>
          <Card elevation="sm" padding="lg" accessibilityRole="alert">
            <Stack gap="sm" align="center">
              <Icon name="alert-circle-outline" size={32} color="#B91C1C" />
              <Text variant="bodyStrong" color="primary">
                This group could not be loaded
              </Text>
              <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                {loadError}
              </Text>
            </Stack>
          </Card>
          <Button
            label="Go back"
            variant="ghost"
            size="md"
            onPress={handleCancel}
            accessibilityLabel="Go back to the previous screen"
          />
        </Stack>
      </Screen>
    );
  }

  return (
    <NewExpenseView
      viewModel={viewModel}
      groupName={groupData?.groupName ?? 'Group'}
      members={groupData?.members ?? []}
      fieldValues={formState}
      submitError={submitError}
      isSubmitting={isSubmitting}
      onTitleChange={setTitle}
      onAmountChange={setAmountInput}
      onCurrencyChange={setCurrencyCode}
      onDateChange={setDateInput}
      onNoteChange={setNote}
      onPayerChange={setPayerMemberId}
      onToggleParticipant={handleToggleParticipant}
      onSelectAllParticipants={handleSelectAll}
      multiPayer={multiPayer}
      payerRows={payerRows}
      onToggleMultiPayer={handleToggleMultiPayer}
      onChangePayerRow={handleChangePayerRow}
      onAddPayerRow={handleAddPayerRow}
      onRemovePayerRow={handleRemovePayerRow}
      onSelectSplitType={handleSelectSplitType}
      onChangeSplitValue={handleChangeSplitValue}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      onOpenItemized={() =>
        router.replace(`/expenses/itemized/new?groupId=${encodeURIComponent(groupId)}`)
      }
      onOpenScan={() =>
        router.push(`/capture?mode=scan&groupId=${encodeURIComponent(groupId)}`)
      }
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component
// ---------------------------------------------------------------------------

export interface NewExpenseViewProps {
  readonly viewModel: ManualExpenseFormViewModel;
  readonly groupName: string;
  readonly members: readonly ExpenseFormMember[];
  readonly fieldValues: ManualExpenseFormState;
  readonly submitError: string | null;
  readonly isSubmitting: boolean;
  readonly onTitleChange: (value: string) => void;
  readonly onAmountChange: (value: string) => void;
  readonly onCurrencyChange: (code: string) => void;
  readonly onDateChange: (value: string) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onPayerChange: (memberId: string) => void;
  readonly multiPayer?: boolean;
  readonly payerRows?: readonly { readonly memberId: string; readonly amountInput: string }[];
  readonly onToggleMultiPayer?: () => void;
  readonly onChangePayerRow?: (index: number, patch: { readonly memberId?: string; readonly amountInput?: string }) => void;
  readonly onAddPayerRow?: () => void;
  readonly onRemovePayerRow?: (index: number) => void;
  readonly onToggleParticipant: (memberId: string) => void;
  readonly onSelectAllParticipants: () => void;
  readonly onSelectSplitType?: (method: ExpenseSplitMethod) => void;
  readonly onChangeSplitValue?: (memberId: string, value: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onOpenItemized?: () => void;
  readonly onOpenScan?: () => void;
}

export function NewExpenseView({
  viewModel,
  groupName,
  members,
  fieldValues,
  submitError,
  isSubmitting,
  onTitleChange,
  onAmountChange,
  onCurrencyChange,
  onDateChange,
  onNoteChange,
  onPayerChange,
  multiPayer = false,
  payerRows = [],
  onToggleMultiPayer,
  onChangePayerRow,
  onAddPayerRow,
  onRemovePayerRow,
  onToggleParticipant,
  onSelectAllParticipants,
  onSelectSplitType,
  onChangeSplitValue,
  onSubmit,
  onCancel,
  onOpenItemized,
  onOpenScan,
}: NewExpenseViewProps): JSX.Element {
  const theme = useTheme();
  const currencyCode = fieldValues.currencyCode;

  return (
    <Screen scrollable safeArea avoidKeyboard>
      <Stack gap="lg" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            New expense
          </Text>
          <Text variant="body" color="secondary">
            Add an expense to {groupName} without scanning a receipt.
          </Text>
        </Stack>

        <Row gap="sm" style={{ flexWrap: 'wrap' }}>
          <ModeChip label="Simple expense" selected />
          {onOpenItemized !== undefined ? (
            <ModeChip label="Itemized expense" selected={false} onPress={onOpenItemized} />
          ) : null}
          {onOpenScan !== undefined ? (
            <ModeChip label="Scan receipt" selected={false} onPress={onOpenScan} />
          ) : null}
        </Row>

        {submitError !== null ? (
          <Card elevation="sm" padding="md" accessibilityRole="alert">
            <Row gap="sm" align="center">
              <Icon name="alert-circle-outline" size={theme.iconSizes.lg} color={theme.colors.negative} />
              <Stack gap={0} style={{ flex: 1 }}>
                <Text variant="bodyStrong" color="primary">
                  Could not save the expense
                </Text>
                <Text variant="caption" color="secondary">
                  {submitError}
                </Text>
              </Stack>
            </Row>
          </Card>
        ) : null}

        <TitleField
          value={fieldValues.title}
          error={viewModel.titleError}
          onChangeText={onTitleChange}
        />

        <AmountField
          value={fieldValues.amountInput}
          error={viewModel.amountError}
          currencyCode={currencyCode}
          onChangeText={onAmountChange}
        />

        <CurrencyField value={currencyCode} onChange={onCurrencyChange} />

        <DateField value={fieldValues.dateInput} error={viewModel.dateError} onChangeText={onDateChange} />

        {multiPayer ? (
          <MultiPayerField
            members={members}
            rows={payerRows}
            error={viewModel.payerError}
            currencyCode={currencyCode}
            onChangeRow={onChangePayerRow ?? ((): void => undefined)}
            onAddRow={onAddPayerRow ?? ((): void => undefined)}
            onRemoveRow={onRemovePayerRow ?? ((): void => undefined)}
          />
        ) : (
          <PayerField
            members={members}
            selectedId={fieldValues.payerMemberId}
            error={viewModel.payerError}
            onSelect={onPayerChange}
          />
        )}
        <Button
          label={multiPayer ? 'Use a single payer' : 'Split payment across payers'}
          variant="ghost"
          size="sm"
          onPress={onToggleMultiPayer ?? ((): void => undefined)}
          accessibilityLabel={multiPayer ? 'Use a single payer' : 'Split the payment across multiple payers'}
        />

        <ParticipantsField
          members={members}
          selectedIds={fieldValues.participantIds}
          error={viewModel.participantsError}
          onToggle={onToggleParticipant}
          onSelectAll={onSelectAllParticipants}
        />

        <SplitMethodField
          members={members}
          splitType={fieldValues.splitType ?? 'equal'}
          values={fieldValues.splitValues ?? {}}
          error={viewModel.splitError}
          currencyCode={currencyCode}
          onChangeType={onSelectSplitType ?? ((): void => undefined)}
          onChangeValue={onChangeSplitValue ?? ((): void => undefined)}
        />

        <SplitPreviewCard
          viewModel={viewModel}
          currencyCode={currencyCode}
          splitType={fieldValues.splitType ?? 'equal'}
        />

        <NoteField value={fieldValues.note} onChangeText={onNoteChange} />

        <Stack gap="sm" align="stretch" style={{ marginTop: spacing.md }}>
          <Button
            label={isSubmitting ? 'Saving…' : 'Save expense'}
            variant="primary"
            size="lg"
            disabled={!viewModel.canSubmit || isSubmitting}
            onPress={onSubmit}
            accessibilityLabel="Save this expense to the group"
            icon="checkmark-circle-outline"
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            onPress={onCancel}
            accessibilityLabel="Cancel and discard this expense"
          />
        </Stack>
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

interface FieldShellProps {
  readonly label: string;
  readonly caption?: string;
  readonly error: string | null;
  readonly children: ReactNode;
}

function FieldShell({ label, caption, error, children }: FieldShellProps): ReactNode {
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Stack gap={0}>
          <Text variant="label" color="secondary">
            {label}
          </Text>
          {caption !== undefined ? (
            <Text variant="caption" color="muted">
              {caption}
            </Text>
          ) : null}
        </Stack>
        {children}
        {error !== null ? (
          <Text variant="error" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

interface TextFieldProps {
  readonly value: string;
  readonly error: string | null;
  readonly onChangeText: (value: string) => void;
  readonly label: string;
  readonly placeholder: string;
  readonly caption?: string;
  readonly maxLength: number;
  readonly keyboardType?: 'default' | 'decimal-pad' | 'numeric';
  readonly accessibilityLabel: string;
  readonly accessibilityHint: string;
  readonly multiline?: boolean;
}

function TextField({
  value,
  error,
  onChangeText,
  label,
  placeholder,
  caption,
  maxLength,
  keyboardType,
  accessibilityLabel,
  accessibilityHint,
  multiline,
}: TextFieldProps): ReactNode {
  const theme = useTheme();
  const showError = error !== null;
  return (
    <FieldShell label={label} caption={caption} error={showError ? error : null}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        maxLength={maxLength}
        keyboardType={keyboardType}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        autoCapitalize={multiline ? 'sentences' : 'none'}
        autoCorrect={multiline}
        multiline={multiline}
        // Phase 6: inputs scale with the user's font size up to 2x —
        // beyond that, form layouts (labels + input + error) break down
        // and hurt rather than help readability.
        maxFontSizeMultiplier={2}
        style={[
          theme.typography.input,
          {
            color: theme.colors.textPrimary,
            borderWidth: 1,
            borderColor: showError ? theme.colors.negative : theme.colors.border,
            borderRadius: theme.borderRadius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            minHeight: multiline ? 96 : 48,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
    </FieldShell>
  );
}

function ModeChip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress?: () => void;
}): ReactNode {
  const theme = useTheme();
  const style = {
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: theme.borderRadius.full,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surface,
  } as const;
  if (onPress === undefined) {
    return (
      <View accessibilityState={{ selected }} style={style}>
        <Text variant="caption" color={selected ? 'onColor' : 'secondary'}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={style}
    >
      <Text variant="caption" color={selected ? 'onColor' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

function TitleField(props: Omit<TextFieldProps, 'label' | 'placeholder' | 'maxLength' | 'accessibilityLabel' | 'accessibilityHint'>): ReactNode {
  return (
    <TextField
      {...props}
      label="Title"
      placeholder="e.g. Dinner at Rasa"
      maxLength={200}
      accessibilityLabel="Expense title"
      accessibilityHint="What was this expense for? (1–200 characters)"
    />
  );
}

function AmountField(
  props: Omit<TextFieldProps, 'label' | 'placeholder' | 'maxLength' | 'accessibilityLabel' | 'accessibilityHint'> & { currencyCode: string },
): ReactNode {
  const { currencyCode, ...rest } = props;
  return (
    <TextField
      {...rest}
      label={`Amount (${currencyCode})`}
      placeholder="0.00"
      maxLength={18}
      keyboardType="decimal-pad"
      accessibilityLabel="Expense amount"
      accessibilityHint={`Amount in ${currencyCode}. Decimals allowed.`}
    />
  );
}

function DateField(props: Omit<TextFieldProps, 'label' | 'placeholder' | 'maxLength' | 'accessibilityLabel' | 'accessibilityHint'>): ReactNode {
  return (
    <TextField
      {...props}
      label="Date"
      placeholder="YYYY-MM-DD"
      maxLength={10}
      keyboardType="numeric"
      accessibilityLabel="Expense date"
      accessibilityHint="The date the expense happened (YYYY-MM-DD)"
    />
  );
}

function NoteField(props: Omit<TextFieldProps, 'label' | 'placeholder' | 'maxLength' | 'accessibilityLabel' | 'accessibilityHint' | 'error'>): ReactNode {
  return (
    <TextField
      {...props}
      error={null}
      label="Note (optional)"
      placeholder="Anything worth remembering later"
      maxLength={1000}
      accessibilityLabel="Expense note"
      accessibilityHint="Optional note, up to 1000 characters"
      multiline
    />
  );
}

function CurrencyField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (code: string) => void;
}): ReactNode {
  return (
    <FieldShell
      label="Currency"
      caption="Used for this expense. The group default is preselected."
      error={null}
    >
      <Row gap="xs" align="center" style={{ flexWrap: 'wrap' }}>
        {COMMON_CURRENCIES.map((code) => (
          <Pill
            key={code}
            label={code}
            active={value === code}
            onPress={() => onChange(code)}
            accessibilityLabel={`Use ${code} for this expense`}
          />
        ))}
      </Row>
    </FieldShell>
  );
}

function PayerField({
  members,
  selectedId,
  error,
  onSelect,
}: {
  readonly members: readonly ExpenseFormMember[];
  readonly selectedId: string | null;
  readonly error: string | null;
  readonly onSelect: (memberId: string) => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <FieldShell label="Paid by" caption="Who fronted the money." error={error}>
      <Stack gap="sm" align="stretch">
        {members.map((member) => {
          const isSelected = selectedId === member.id;
          return (
            <Pressable
              key={member.id}
              onPress={() => onSelect(member.id)}
              accessibilityRole="button"
              accessibilityLabel={`${member.displayName} paid this expense`}
              accessibilityState={{ selected: isSelected }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                borderRadius: theme.borderRadius.md,
                borderWidth: 1,
                borderColor: isSelected ? theme.colors.brandPrimary : theme.colors.border,
                backgroundColor: isSelected ? theme.colors.surfaceMuted : theme.colors.surface,
              }}
            >
              <Icon
                name="person-outline"
                size={theme.iconSizes.md}
                color={theme.colors.brandPrimary}
              />
              <Text variant="body" color="primary" style={{ flex: 1 }}>
                {member.displayName}
              </Text>
              <Icon
                name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                size={theme.iconSizes.md}
                color={isSelected ? theme.colors.brandPrimary : theme.colors.textMuted}
              />
            </Pressable>
          );
        })}
      </Stack>
    </FieldShell>
  );
}

function ParticipantsField({
  members,
  selectedIds,
  error,
  onToggle,
  onSelectAll,
}: {
  readonly members: readonly ExpenseFormMember[];
  readonly selectedIds: readonly string[];
  readonly error: string | null;
  readonly onToggle: (memberId: string) => void;
  readonly onSelectAll: () => void;
}): ReactNode {
  const theme = useTheme();
  const allSelected = selectedIds.length === members.length && members.length > 0;
  return (
    <FieldShell
      label="Split between"
      caption="Everyone selected shares the cost equally."
      error={error}
    >
      <Button
        label={allSelected ? 'Clear all' : 'Select everyone'}
        variant="ghost"
        size="sm"
        onPress={onSelectAll}
        accessibilityLabel={
          allSelected ? 'Clear all selected participants' : 'Select every member as participant'
        }
      />
      <Stack gap="sm" align="stretch">
        {members.map((member) => {
          const isSelected = selectedIds.includes(member.id);
          return (
            <Pressable
              key={member.id}
              onPress={() => onToggle(member.id)}
              accessibilityRole="button"
              accessibilityLabel={`Include ${member.displayName} in the split`}
              accessibilityState={{ selected: isSelected }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                borderRadius: theme.borderRadius.md,
                borderWidth: 1,
                borderColor: isSelected ? theme.colors.brandPrimary : theme.colors.border,
                backgroundColor: isSelected ? theme.colors.surfaceMuted : theme.colors.surface,
              }}
            >
              <Icon
                name={isSelected ? 'checkbox-outline' : 'square-outline'}
                size={theme.iconSizes.md}
                color={isSelected ? theme.colors.brandPrimary : theme.colors.textMuted}
              />
              <Text variant="body" color="primary" style={{ flex: 1 }}>
                {member.displayName}
              </Text>
            </Pressable>
          );
        })}
      </Stack>
    </FieldShell>
  );
}

function MultiPayerField({
  members,
  rows,
  error,
  currencyCode,
  onChangeRow,
  onAddRow,
  onRemoveRow,
}: {
  readonly members: readonly ExpenseFormMember[];
  readonly rows: readonly { readonly memberId: string; readonly amountInput: string }[];
  readonly error: string | null;
  readonly currencyCode: string;
  readonly onChangeRow: (index: number, patch: { readonly memberId?: string; readonly amountInput?: string }) => void;
  readonly onAddRow: () => void;
  readonly onRemoveRow: (index: number) => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <FieldShell label="Paid by" error={error}>
      <Stack gap="md" align="stretch">
        {rows.map((row, index) => (
          <Stack
            // Payer rows are positional; the member is chosen inside the row.
            // eslint-disable-next-line react/no-array-index-key
            key={`payer-${index}`}
            gap="xs"
            align="stretch"
          >
            <Row gap="xs" align="center" style={{ flexWrap: 'wrap' }}>
              {members.map((member) => (
                <Pill
                  key={member.id}
                  label={member.displayName}
                  active={row.memberId === member.id}
                  onPress={() => onChangeRow(index, { memberId: member.id })}
                  accessibilityLabel={`Payer ${member.displayName} for row ${index + 1}`}
                />
              ))}
            </Row>
            <Row gap="sm" align="center">
              <View style={{ flex: 1 }}>
                <TextField
                  label={`Contribution (${currencyCode})`}
                  value={row.amountInput}
                  onChangeText={(value) => onChangeRow(index, { amountInput: value })}
                  keyboardType="decimal-pad"
                  maxLength={18}
                  error={null}
                  placeholder="0.00"
                  accessibilityLabel={`Payer ${index + 1} contribution`}
                  accessibilityHint="Amount this member paid; contributions must equal the total"
                />
              </View>
              {rows.length > 1 ? (
                <Pressable
                  onPress={() => onRemoveRow(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove payer row ${index + 1}`}
                  style={{ padding: spacing.sm }}
                >
                  <Icon name="close-circle-outline" size={theme.iconSizes.lg} color={theme.colors.negative} />
                </Pressable>
              ) : null}
            </Row>
          </Stack>
        ))}
        <Button
          label="Add payer"
          variant="secondary"
          size="sm"
          onPress={onAddRow}
          accessibilityLabel="Add another payer"
          icon="add-circle-outline"
        />
      </Stack>
    </FieldShell>
  );
}

const SPLIT_METHODS: readonly { readonly value: ExpenseSplitMethod; readonly label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'exact', label: 'Exact' },
  { value: 'percentage', label: 'Percent' },
  { value: 'shares', label: 'Shares' },
];

function SplitMethodField({
  members,
  splitType,
  values,
  error,
  currencyCode,
  onChangeType,
  onChangeValue,
}: {
  readonly members: readonly ExpenseFormMember[];
  readonly splitType: ExpenseSplitMethod;
  readonly values: Readonly<Record<string, string>>;
  readonly error: string | null;
  readonly currencyCode: string;
  readonly onChangeType: (method: ExpenseSplitMethod) => void;
  readonly onChangeValue: (memberId: string, value: string) => void;
}): ReactNode {
  const suffix =
    splitType === 'percentage' ? '%' : splitType === 'shares' ? 'shares' : currencyCode;
  return (
    <FieldShell label="Split" error={error}>
      <Stack gap="sm" align="stretch">
        <Row gap="sm" align="center" style={{ flexWrap: 'wrap' }}>
          {SPLIT_METHODS.map((method) => (
            <Pill
              key={method.value}
              label={method.label}
              active={splitType === method.value}
              onPress={() => onChangeType(method.value)}
              accessibilityLabel={`Split method: ${method.label}`}
            />
          ))}
        </Row>

        {splitType !== 'equal' ? (
          <Stack gap="sm" align="stretch">
            {members.map((member) => (
              <TextField
                key={member.id}
                label={`${member.displayName} (${suffix})`}
                value={values[member.id] ?? ''}
                onChangeText={(value) => onChangeValue(member.id, value)}
                keyboardType={splitType === 'shares' ? 'numeric' : 'decimal-pad'}
                maxLength={12}
                error={null}
                placeholder={splitType === 'percentage' ? '0.00' : splitType === 'shares' ? '1' : '0.00'}
                accessibilityLabel={`${member.displayName} split value in ${suffix}`}
                accessibilityHint={`Enter ${suffix} for ${member.displayName}`}
              />
            ))}
          </Stack>
        ) : (
          <Text variant="caption" color="muted">
            Everyone selected owes an equal share; remainders are allocated deterministically.
          </Text>
        )}

        {error !== null ? (
          <Text variant="error" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Stack>
    </FieldShell>
  );
}

function SplitPreviewCard({
  viewModel,
  currencyCode,
  splitType,
}: {
  readonly viewModel: ManualExpenseFormViewModel;
  readonly currencyCode: string;
  readonly splitType: ExpenseSplitMethod;
}): ReactNode {
  if (viewModel.splitPreview.length === 0) {
    return null;
  }
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Text variant="label" color="secondary">
          Split preview ({splitType})
        </Text>
        <Stack gap="xs" align="stretch">
          {viewModel.splitPreview.map((entry) => (
            <Row key={entry.memberId} gap="sm" align="center">
              <Text variant="body" color="primary" style={{ flex: 1 }}>
                {entry.displayName}
              </Text>
              <AmountText
                amountMinor={entry.amountMinor}
                currencyCode={currencyCode}
                variant="amountSmall"
                showCurrencySymbol
                accessibilityLabel={`${entry.displayName} owes ${describeAmount(entry.amountMinor, currencyCode, { includeDirection: false })}`}
              />
            </Row>
          ))}
        </Stack>
        <Text variant="caption" color="muted">
          Remainders from uneven splits are distributed deterministically —
          every device computes the identical shares.
        </Text>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared pill primitive (same shape as NewGroupScreen)
// ---------------------------------------------------------------------------

interface PillProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
}

function Pill({ label, active, onPress, accessibilityLabel }: PillProps): ReactNode {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: theme.borderRadius.full,
        backgroundColor: active ? theme.colors.brandPrimary : theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: active ? theme.colors.brandPrimary : theme.colors.border,
        minHeight: 32,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Client-generated expense id. Generated ONCE per submit attempt and
 * reused on retries, so the repository's upsert semantics make the
 * retry idempotent (no duplicate expense).
 */
/** Major-unit string for an exact-split input (no floats in the math). */
function formatMinorInput(amountMinor: number, currencyCode: string): string {
  // v2.26.0: domain currency decimals (0 for JPY/KRW/VND, 3 for KWD/BHD,
  // …) instead of the previous JPY/KRW-only special case, which
  // misformatted every other non-2-decimal currency on edit prefill.
  const decimals = currencyDecimals(currencyCode);
  if (decimals === 0) return String(amountMinor);
  const divisor = 10 ** decimals;
  return `${Math.floor(amountMinor / divisor)}.${String(amountMinor % divisor).padStart(decimals, '0')}`;
}

function generateExpenseId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
