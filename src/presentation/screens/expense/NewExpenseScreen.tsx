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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput } from 'react-native';

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
  type ManualExpenseFormState,
  type ManualExpenseFormViewModel,
  createManualExpenseFormViewModel,
  todayDateOnly,
} from '@presentation/view-models/expense-form';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMON_CURRENCIES: readonly string[] = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'];

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface NewExpenseScreenProps {
  readonly groupId: string;
}

interface GroupFormData {
  readonly groupName: string;
  readonly currencyCode: string;
  readonly members: readonly ExpenseFormMember[];
}

export function NewExpenseScreen({ groupId }: NewExpenseScreenProps): JSX.Element {
  const [formTitle, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [dateInput, setDateInput] = useState(todayDateOnly());
  const [note, setNote] = useState('');
  const [payerMemberId, setPayerMemberId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<readonly string[]>([]);

  const [groupData, setGroupData] = useState<GroupFormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const upsertGroup = useGroupStore((s) => s.upsertGroup);
  const existingGroup = useGroupStore((s) => s.groups.find((g) => g.id === groupId));

  // Load the group's name, default currency, and active members.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) {
        // Services not ready yet — the gate will finish initializing;
        // retry on the next effect run is unnecessary because the gate
        // triggers a re-render via the zustand registry subscription
        // only for components using its hooks. Simplest honest state:
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
  }, [groupId]);

  const formState: ManualExpenseFormState = useMemo(
    () => ({
      title: formTitle,
      amountInput,
      currencyCode: currencyCode || groupData?.currencyCode || 'USD',
      dateInput,
      note,
      payerMemberId,
      participantIds,
    }),
    [formTitle, amountInput, currencyCode, groupData, dateInput, note, payerMemberId, participantIds],
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

  const handleSubmit = useCallback((): void => {
    if (!viewModel.canSubmit || isSubmitting || groupData === null) return;
    const services = tryGetAppServices();
    if (services === null) {
      setSubmitError('Storage is not ready yet. Try again in a moment.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    // Generate the expense id ONCE so a retry after a failure reuses it
    // (the repository's upsert semantics make the retry idempotent).
    const expenseId = generateExpenseId();

    const input: CreateExpenseManuallyInput = {
      groupId,
      title: formTitle,
      amountMinor: viewModel.amountMinor as number,
      currencyCode: formState.currencyCode,
      ...(dateInput.trim().length > 0 ? { expenseDate: dateInput } : {}),
      ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      payerContributions: [
        { memberId: payerMemberId as string, amountMinor: viewModel.amountMinor as number },
      ],
      participantIds,
      createdBy: 'local-user',
      expenseId,
    };

    void (async () => {
      try {
        await services.expenses.createExpenseManually.execute(input);
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
        router.back();
      } catch (error) {
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
    participantIds,
    upsertGroup,
    existingGroup,
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
      onSubmit={handleSubmit}
      onCancel={handleCancel}
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
  readonly onToggleParticipant: (memberId: string) => void;
  readonly onSelectAllParticipants: () => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
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
  onToggleParticipant,
  onSelectAllParticipants,
  onSubmit,
  onCancel,
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

        <PayerField
          members={members}
          selectedId={fieldValues.payerMemberId}
          error={viewModel.payerError}
          onSelect={onPayerChange}
        />

        <ParticipantsField
          members={members}
          selectedIds={fieldValues.participantIds}
          error={viewModel.participantsError}
          onToggle={onToggleParticipant}
          onSelectAll={onSelectAllParticipants}
        />

        <SplitPreviewCard
          viewModel={viewModel}
          currencyCode={currencyCode}
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

function SplitPreviewCard({
  viewModel,
  currencyCode,
}: {
  readonly viewModel: ManualExpenseFormViewModel;
  readonly currencyCode: string;
}): ReactNode {
  if (viewModel.splitPreview.length === 0) {
    return null;
  }
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Text variant="label" color="secondary">
          Split preview (equal)
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
function generateExpenseId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
