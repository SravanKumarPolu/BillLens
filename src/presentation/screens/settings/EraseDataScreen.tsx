/** Guarded full local-data erasure. Irreversible without a backup. */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, TextInput } from 'react-native';

import type { LocalDataWipePreview } from '@application/retention/wipe-local-data.usecase';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useNavigationStore } from '@store/navigation-store';
import { useNotificationStore } from '@store/notification-store';
import { useRetentionStore } from '@store/retention-store';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices } from '@store/services-registry';

export default function EraseDataScreen(): ReactNode {
  const theme = useTheme();
  const [preview, setPreview] = useState<LocalDataWipePreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) return;
      try {
        setPreview(await services.data.wipeAll.preview());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read local data totals.');
      }
    })();
  }, []);

  const erase = (): void => {
    if (preview === null) return;
    Alert.alert(
      'Erase all local data?',
      `This permanently removes ${preview.groups} groups, ${preview.expenses} expenses, ${preview.settlements} settlements and ${preview.receipts} receipts from this device. There is no undo. Export a backup first if you may need it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase everything',
          style: 'destructive',
          onPress: (): void => {
            const services = tryGetAppServices();
            if (services === null) return;
            setBusy(true);
            void (async () => {
              try {
                await services.data.wipeAll.execute(confirmation);
                await services.groups.cleanup.execute().catch(() => undefined);
                await AsyncStorage.clear().catch(() => undefined);
                useGroupStore.getState().reset();
                useRetentionStore.getState().reset();
                useNotificationStore.getState().setOutstandingReminders(false);
                useNavigationStore.getState().setOnboardingComplete(false);
                router.replace('/');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Local data erasure failed.');
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen safeArea scrollable avoidKeyboard>
      <Stack gap="lg" style={{ padding: spacing.xl }}>
        <Text variant="screenTitle" accessibilityRole="header">
          Erase all local data
        </Text>
        <Text variant="body" color="secondary">
          This deletes every group, expense, split, settlement, receipt row and local preference
          on this device. Receipt images are queued for deletion. Cloud copies (if you ever
          enabled them) are not erased. This is not a forensic secure wipe of flash storage.
        </Text>

        {preview !== null ? (
          <Card>
            <Stack gap={2}>
              <Text variant="bodyStrong">{preview.groups} groups</Text>
              <Text variant="bodyStrong">{preview.expenses} expenses</Text>
              <Text variant="bodyStrong">{preview.settlements} settlements</Text>
              <Text variant="bodyStrong">{preview.receipts} receipts</Text>
            </Stack>
          </Card>
        ) : (
          <ActivityIndicator accessibilityLabel="Reading local data totals" />
        )}

        <Text variant="caption" color="muted">
          Type DELETE to confirm.
        </Text>
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Type DELETE to confirm erasure"
          placeholder="DELETE"
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

        {error !== null ? (
          <Text variant="caption" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label={busy ? 'Erasing…' : 'Erase all local data'}
          onPress={erase}
          disabled={busy || preview === null || confirmation.trim() !== 'DELETE'}
          accessibilityLabel="Erase all local data permanently"
        />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          disabled={busy}
          accessibilityLabel="Cancel local data erasure"
        />
      </Stack>
    </Screen>
  );
}
