/**
 * Onboarding stack layout.
 *
 * A dedicated Stack navigator for the onboarding flow. It is presented
 * without a header (each onboarding screen renders its own title) and
 * uses the theme already provided by the root layout.
 */

import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { useTheme } from '@presentation/design-system';

export default function OnboardingLayout(): ReactNode {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="guest-name" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="complete" />
    </Stack>
  );
}
