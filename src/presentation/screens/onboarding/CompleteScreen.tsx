/**
 * CompleteScreen — final onboarding step (Prompt 14).
 *
 * Confirms the user has finished onboarding:
 *   - Renders a checkmark success indicator.
 *   - Summarises what was set up (the display name they entered).
 *   - Reminds them that data stays on-device with an option to add
 *     cloud backup later.
 *   - The "Enter BillLens" button sets `onboardingComplete=true` in
 *     the navigation store and replaces the navigation stack with
 *     the main app (`/(tabs)`).
 *
 * The redirect uses `router.replace` so the onboarding stack is not
 * preserved in the back stack — the user cannot press Back to return
 * to onboarding once they have completed it.
 */

import { router } from 'expo-router';
import { useEffect } from 'react';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useGuestStore } from '@store/guest-store';
import { useNavigationStore } from '@store/navigation-store';

export function CompleteScreen(): JSX.Element {
  const theme = useTheme();
  const displayName = useGuestStore((s) => s.displayName);
  const setOnboardingComplete = useNavigationStore((s) => s.setOnboardingComplete);

  const handleEnterApp = (): void => {
    setOnboardingComplete(true);
    router.replace('/(tabs)');
  };

  // Defensive: if onboarding was already marked complete (e.g. user
  // navigated back here), advance automatically.
  useEffect(() => {
    if (useNavigationStore.getState().onboardingComplete) {
      router.replace('/(tabs)');
    }
  }, []);

  const summaryName = displayName.trim().length > 0 ? displayName.trim() : 'Guest';

  return (
    <Screen scrollable safeArea>
      <Stack
        gap="xl"
        align="stretch"
        style={{ padding: spacing.xl, flex: 1, justifyContent: 'center' }}
      >
        <Card elevation="md" padding="xxl">
          <Stack gap="lg" align="center">
            <Row
              gap="sm"
              align="center"
              accessibilityRole="image"
              accessibilityLabel="Onboarding complete"
            >
              <Icon
                name="checkmark-circle"
                size={theme.iconSizes.xl * 1.5}
                color={theme.colors.positive}
              />
            </Row>
            <Text
              variant="sectionTitle"
              color="primary"
              style={{ textAlign: 'center' }}
              accessibilityRole="header"
            >
              You&apos;re all set!
            </Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              Your display name is set to &quot;{summaryName}&quot;.
            </Text>
            <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
              Your data stays on this device. Add cloud backup anytime in Settings.
            </Text>
          </Stack>
        </Card>

        <Button
          label="Enter BillLens"
          variant="primary"
          size="lg"
          onPress={handleEnterApp}
          accessibilityLabel="Finish onboarding and enter the app"
        />
      </Stack>
    </Screen>
  );
}
