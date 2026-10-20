/**
 * OfflineBanner — non-intrusive banner shown when the device is offline.
 *
 * Reads `isOnline` from the app-state store. When offline, renders a
 * slim banner at the top of the screen explaining that changes will
 * sync later. Dismissible — the user can hide it for the current
 * session; it reappears the next time the device goes offline.
 *
 * The store value is written by a NetInfo subscription (wired up in a
 * later prompt). Until then, the store defaults to `isOnline: true`,
 * so this banner is hidden — but the component itself is exercised by
 * the design-system preview and snapshot tests.
 */

import { useState } from 'react';
import { Pressable } from 'react-native';

import { useAppState } from '@store/app-state-store';

import { Card } from '../design-system/components/Card';
import { Icon } from '../design-system/components/Icon';
import { Row } from '../design-system/components/Row';
import { Stack } from '../design-system/components/Stack';
import { Text } from '../design-system/components/Text';
import { useTheme } from '../design-system/theme';

export interface OfflineBannerProps {
  /** Override the online check (useful for tests / preview). */
  readonly isOnlineOverride?: boolean;
}

export function OfflineBanner({ isOnlineOverride }: OfflineBannerProps): JSX.Element | null {
  const theme = useTheme();
  const storeIsOnline = useAppState((s) => s.isOnline);
  const isOnline = isOnlineOverride ?? storeIsOnline;
  const [dismissed, setDismissed] = useState(false);

  if (isOnline || dismissed) return null;

  return (
    <Pressable
      onPress={() => setDismissed(true)}
      accessibilityRole="button"
      accessibilityLabel="Dismiss offline banner"
    >
      <Card
        elevation="none"
        padding="sm"
        radius="sm"
        style={{
          backgroundColor: theme.colors.warning,
          borderColor: theme.colors.warning,
          borderRadius: 0,
        }}
      >
        <Row gap="sm" align="center">
          <Icon name="cloud-offline" size={theme.iconSizes.md} color={theme.colors.textOnColor} />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="label" color="onColor">
              You&apos;re offline
            </Text>
            <Text variant="caption" color="onColor">
              Changes will sync when you reconnect.
            </Text>
          </Stack>
          <Icon name="close" size={theme.iconSizes.md} color={theme.colors.textOnColor} />
        </Row>
      </Card>
    </Pressable>
  );
}
