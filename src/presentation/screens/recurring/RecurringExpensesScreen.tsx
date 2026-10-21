/**
 * Recurring expenses — list and create-from-expense.
 *
 * Templates are created from a real expense so payer/split allocations are
 * copied exactly. This screen never edits a past occurrence; pause/resume and
 * soft-delete only affect future materialisation.
 */

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import type { RecurringExpense } from '@domain/repositories/recurring-expense.repository';
import type { RecurrenceFrequency } from '@domain/recurring/schedule';
import { AmountText } from '@presentation/design-system/components/AmountText';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { todayDateOnly } from '@presentation/view-models/expense-form';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices } from '@store/services-registry';

const FREQUENCIES: readonly { value: RecurrenceFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
  { value: 'yearly', label: 'Yearly' },
];

function groupNameFor(groupId: string): string {
  return useGroupStore.getState().groups.find((group) => group.id === groupId)?.name ?? 'Group';
}

export default function RecurringListScreen(): ReactNode {
  const [templates, setTemplates] = useState<readonly RecurringExpense[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) return;
    const groupIds = useGroupStore.getState().groups.map((group) => group.id);
    try {
      setTemplates(await services.recurring.list.execute(groupIds));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recurring expenses.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = (template: RecurringExpense): void => {
    const services = tryGetAppServices();
    if (services === null) return;
    void services.recurring.setPaused.execute(template.id, !template.paused).then(load, (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not update the schedule.');
    });
  };

  const remove = (template: RecurringExpense): void => {
    Alert.alert('Delete recurring expense?', 'Past expenses stay. Future occurrences stop.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: (): void => {
          const services = tryGetAppServices();
          if (services === null) return;
          void services.recurring.remove.execute(template.id).then(load, (err: unknown) => {
            setError(err instanceof Error ? err.message : 'Could not delete the schedule.');
          });
        },
      },
    ]);
  };

  return (
    <Screen safeArea scrollable>
      <Stack gap="lg" style={{ padding: spacing.xl }}>
        <Text variant="body" color="muted">
          Repeats create normal expenses when they become due. Pausing stops future dates only.
        </Text>

        {error !== null ? (
          <Text variant="caption" color="negative">
            {error}
          </Text>
        ) : null}

        {templates.length === 0 ? (
          <Card>
            <Stack gap="sm">
              <Text variant="bodyStrong">No recurring expenses</Text>
              <Text variant="caption" color="muted">
                Open an expense and choose “Repeat this expense” to create one.
              </Text>
            </Stack>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id}>
              <Stack gap="sm">
                <Row gap="sm" align="center">
                  <Stack gap={2} style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{template.title}</Text>
                    <Text variant="caption" color="muted">
                      {groupNameFor(template.groupId)} · {template.frequency} · next{' '}
                      {template.nextOccurrenceDate}
                    </Text>
                  </Stack>
                  <AmountText
                    amountMinor={template.amountMinor}
                    currencyCode={template.currencyCode}
                    variant="amountSmall"
                  />
                </Row>
                {template.paused ? <Text variant="caption" color="warning">Paused</Text> : null}
                <Row gap="sm">
                  <Button
                    label={template.paused ? 'Resume' : 'Pause'}
                    variant="secondary"
                    size="sm"
                    onPress={() => toggle(template)}
                    accessibilityLabel={`${template.paused ? 'Resume' : 'Pause'} ${template.title}`}
                  />
                  <Button
                    label="Delete"
                    variant="ghost"
                    size="sm"
                    onPress={() => remove(template)}
                    accessibilityLabel={`Delete recurring ${template.title}`}
                  />
                </Row>
              </Stack>
            </Card>
          ))
        )}

        <Button
          label="Back to settings"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Back to settings"
        />
      </Stack>
    </Screen>
  );
}

export function NewRecurringExpenseScreen(): ReactNode {
  const theme = useTheme();
  const params = useLocalSearchParams<{ expenseId?: string }>();
  const expenseId = params.expenseId ?? '';
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [startDate, setStartDate] = useState(todayDateOnly());
  const [endDate, setEndDate] = useState('');
  const [intervalCount, setIntervalCount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = (): void => {
    const services = tryGetAppServices();
    if (services === null) {
      setError('Local data is still starting. Try again in a moment.');
      return;
    }
    if (expenseId.length === 0) {
      setError('No expense was selected.');
      return;
    }
    const interval = Number(intervalCount);
    setSaving(true);
    setError(null);
    void services.recurring.createFromExpense
      .execute({
        expenseId,
        frequency,
        intervalCount: Number.isFinite(interval) ? interval : 1,
        startDate,
        ...(endDate.trim().length > 0 ? { endDate: endDate.trim() } : {}),
      })
      .then(
        () => router.replace('/recurring'),
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not create the schedule.');
          setSaving(false);
        },
      );
  };

  return (
    <Screen safeArea scrollable avoidKeyboard>
      <Stack gap="lg" style={{ padding: spacing.xl }}>
        <Text variant="body" color="muted">
          The expense’s payers and exact shares are copied. Each due date creates a new expense.
        </Text>

        <Text variant="bodyStrong">Repeat</Text>
        <Row gap="sm">
          {FREQUENCIES.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: frequency === option.value }}
              onPress={() => setFrequency(option.value)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: theme.borderRadius.full,
                borderWidth: 1,
                borderColor: frequency === option.value ? theme.colors.brandPrimary : theme.colors.border,
                backgroundColor:
                  frequency === option.value ? theme.colors.brandPrimary : theme.colors.surface,
              }}
            >
              <Text variant="caption" color={frequency === option.value ? 'onColor' : 'secondary'}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </Row>

        <Field label="Every N periods" value={intervalCount} onChangeText={setIntervalCount} />
        <Field label="Start date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />
        <Field
          label="End date (optional, YYYY-MM-DD)"
          value={endDate}
          onChangeText={setEndDate}
        />

        {error !== null ? (
          <Text variant="caption" color="negative">
            {error}
          </Text>
        ) : null}

        <Button
          label={saving ? 'Creating…' : 'Create recurring expense'}
          onPress={submit}
          disabled={saving}
          accessibilityLabel="Create recurring expense"
        />
      </Stack>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}): JSX.Element {
  const theme = useTheme();
  return (
    <View>
      <Text variant="caption" color="secondary" style={{ marginBottom: spacing.xs }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.surface,
          color: theme.colors.textPrimary,
          minHeight: 46,
          paddingHorizontal: spacing.md,
        }}
      />
    </View>
  );
}
