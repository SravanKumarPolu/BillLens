/**
 * Capture modal layout.
 *
 * The capture flow is presented as a full-screen modal. This layout
 * applies the themed background so the camera viewfinder and the
 * placeholder both use the right colours before the real camera
 * surface mounts.
 */

import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { useTheme } from '@presentation/design-system';

export default function CaptureLayout(): ReactNode {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.textPrimary,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Capture' }} />
      <Stack.Screen name="camera" options={{ title: 'Camera' }} />
      <Stack.Screen name="gallery" options={{ title: 'Gallery' }} />
      <Stack.Screen name="image-quality" options={{ title: 'Review image', headerShown: false }} />
      <Stack.Screen name="processing" options={{ title: 'Processing', headerShown: false }} />
    </Stack>
  );
}
