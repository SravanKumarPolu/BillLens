/**
 * Permanent group deletion.
 *
 * Shows member/expense/settlement counts and requires the exact group name.
 * Groups with financial records need a second explicit acknowledgement, then a
 * final native confirm dialog. Deletion is transactional and idempotent.
 */

import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, TextInput } from 'react-native';

import type { GroupDeletionSummary } from '@application/groups/group-management.usecases';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices } from '@store/services-registry';

export default function GroupDeleteScreen(): ReactNode {
  const theme = useTheme();
  const { groupId = '' } = useLocalSearchParams<{ groupId?: string }>();
  const [summary, setSummary] = useState<GroupDeletionSummary | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) return;
      try {
        setSummary(await services.groups.deletionSummary.execute(groupId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the group.');
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]);

  if (loading || summary === null) {
    return (
      <Screen safeArea>
        <ActivityIndicator style={{ marginTop: spacing.xl }} accessibilityLabel="Loading group summary" />
      </Screen>
    );
  }

  const hasFinancialRecords = summary.expenses > 0 || summary.settlements > 0;
  const canDelete =
    confirmation.trim() === summary.name && (!hasFinancialRecords || acknowledged) && !busy;

  const performDelete = (): void => {
    const services = tryGetAppServices();
    if (services === null) return;
    setBusy(true);
    setError(null);
    void services.groups.deleteGroup
      .execute({
        groupId,
        confirmationName: confirmation,
        secondConfirmation: true,
      })
      .then(
        async () => {
          useGroupStore.setState((state) => ({
            groups: state.groups.filter((group) => group.id !== groupId),
          }));
          // Durable queue already holds cleanup intent; process it now and
          // leave retries to the startup worker if this fails.
          await services.groups.cleanup.execute().catch(() => undefined);
          router.replace('/(tabs)/groups');
        },
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not delete the group.');
          setBusy(false);
        },
      );
  };

  const confirm = (): void => {
    Alert.alert(
      `Delete “${summary.name}” permanently?`,
      'This removes every member, expense, split, settlement and recurring rule in this group. It cannot be undone without a separate backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: performDelete },
      ],
    );
  };

  return (
    <Screen safeArea scrollable avoidKeyboard>
      <Stack gap="lg" style={{ padding: spacing.xl }}>
        <Card>
          <Stack gap="sm">
            <Text variant="cardTitle">{summary.name}</Text>
            <Text variant="caption" color="secondary">
              {summary.members} members · {summary.expenses} expenses · {summary.settlements}{' '}
              settlements · {summary.receiptFiles} receipt files
            </Text>
            <Text variant="caption" color="warning">
              {hasFinancialRecords
                ? 'This group has financial history. A second acknowledgement is required.'
                : 'This group has no expenses or settlements.'}
            </Text>
          </Stack>
        </Card>

        <Text variant="body" color="secondary">
          Type the group name to confirm:
        </Text>
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder={summary.name}
          accessibilityLabel="Type the group name to confirm deletion"
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

        {hasFinancialRecords ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledged }}
            accessibilityLabel="Acknowledge permanent deletion of financial records"
            onPress={() => setAcknowledged((value) => !value)}
            style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}
          >
            <Text variant="body" color={acknowledged ? 'negative' : 'secondary'}>
              {acknowledged ? '☑' : '☐'}
            </Text>
            <Text variant="caption" color="secondary" style={{ flex: 1 }}>
              I understand that expenses, splits, settlements and recurring rules will be permanently
              deleted and this cannot be undone.
            </Text>
          </Pressable>
        ) : null}

        {busy ? (
          <Text variant="caption" color="secondary" accessibilityRole="alert">
            Deleting records and queueing receipt-file cleanup. Keep the app open until this
            finishes.
          </Text>
        ) : null}

        {error !== null ? (
          <Text variant="caption" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label={busy ? 'Deleting…' : 'Permanently delete group'}
          onPress={confirm}
          disabled={!canDelete}
          accessibilityLabel="Permanently delete group"
        />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          disabled={busy}
          accessibilityLabel="Cancel group deletion"
        />
      </Stack>
    </Screen>
  );
}
