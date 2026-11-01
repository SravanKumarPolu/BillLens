/**
 * Group stack layout.
 *
 * A nested Stack navigator for the per-group routes
 * (home, balances, settings). Renders a themed header for each screen
 * with the group id as a fallback title.
 */

import { Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { useTheme } from '@presentation/design-system';

export default function GroupLayout(): ReactNode {
  const theme = useTheme();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = params.groupId ?? 'Group';

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: groupId }} />
      <Stack.Screen name="balances" options={{ title: 'Balances' }} />
      <Stack.Screen name="settings" options={{ title: 'Group settings' }} />
    </Stack>
  );
}
