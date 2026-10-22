/** Receipt history — persisted receipt metadata and local images. */

import { useFocusEffect } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, View } from 'react-native';

import type { ReceiptHistoryRow } from '@application/receipts/receipt-history.usecases';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices } from '@store/services-registry';

export default function ReceiptHistoryScreen(): ReactNode {
  const theme = useTheme();
  const [rows, setRows] = useState<readonly ReceiptHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) return;
    try {
      const groupIds = useGroupStore.getState().groups.map((group) => group.id);
      setRows(await services.receipts.listHistory.execute(groupIds));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load receipts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = (row: ReceiptHistoryRow): void => {
    Alert.alert(
      'Delete this receipt?',
      'The receipt metadata and its image reference are removed. Linked expense records and balances are not changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete receipt',
          style: 'destructive',
          onPress: (): void => {
            const services = tryGetAppServices();
            if (services === null) return;
            void services.receipts.deleteReceipt.execute(row.id).then(
              () => void load(),
              (err: unknown) =>
                setError(err instanceof Error ? err.message : 'Could not delete the receipt.'),
            );
          },
        },
      ],
    );
  };

  return (
    <Screen safeArea scrollable>
      <Stack gap="md" style={{ padding: spacing.xl }}>
        <Text variant="screenTitle" accessibilityRole="header">
          Receipts
        </Text>
        <Text variant="caption" color="secondary">
          Images stay on this device. Deleting a receipt does not change its expense or balances.
        </Text>

        {loading ? <ActivityIndicator accessibilityLabel="Loading receipts" /> : null}
        {error !== null ? (
          <Text variant="caption" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {!loading && rows.length === 0 ? (
          <Card>
            <Stack gap="xs">
              <Text variant="bodyStrong">No saved receipts</Text>
              <Text variant="caption" color="muted">
                Capture a receipt and confirm the draft; it will appear here.
              </Text>
            </Stack>
          </Card>
        ) : null}

        {rows.map((row) => (
          <Card key={row.id}>
            <Row gap="md" align="center">
              {row.imageUri !== null ? (
                <Image
                  source={{ uri: row.imageUri }}
                  style={{ width: 56, height: 56, borderRadius: theme.borderRadius.sm }}
                  accessibilityLabel={`Receipt image from ${row.groupName}`}
                />
              ) : (
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: theme.borderRadius.sm,
                    backgroundColor: theme.colors.surfaceMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="caption" color="muted">
                    No img
                  </Text>
                </View>
              )}
              <Stack gap={2} style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {row.merchantName ?? 'Receipt'}
                </Text>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {row.groupName} · {(row.receiptDate ?? row.createdAt).slice(0, 10)}
                </Text>
                {row.totalAmountMinor !== null ? (
                  <Text variant="caption" color="secondary">
                    {(row.totalAmountMinor / 100).toFixed(2)} {row.currencyCode ?? ''}
                  </Text>
                ) : null}
              </Stack>
              <Button
                label="Delete"
                variant="ghost"
                size="sm"
                onPress={() => remove(row)}
                accessibilityLabel={`Delete receipt from ${row.groupName}`}
              />
            </Row>
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}
