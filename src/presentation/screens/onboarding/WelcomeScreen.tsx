/**
 * WelcomeScreen — first onboarding screen (Prompt 14).
 *
 * Presents the BillLens value proposition, four feature bullets that
 * communicate the offline-first / privacy-first / no-account-required
 * philosophy, and a single primary CTA ("Get Started") that advances
 * to /onboarding/guest-name.
 *
 * Layout uses ONLY design-system primitives (Screen, Stack, Card, Row,
 * Text, Button). All colours come from `useTheme()`. Each interactive /
 * informational element carries an `accessibilityLabel`.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';

interface FeatureBullet {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly accessibilityLabel: string;
}

const FEATURE_BULLETS: readonly FeatureBullet[] = [
  {
    icon: 'person-circle-outline',
    title: 'No account required',
    description: 'Start immediately as a guest — no sign-up, no email, no friction.',
    accessibilityLabel: 'Feature: no account required. Start immediately as a guest.',
  },
  {
    icon: 'cloud-offline-outline',
    title: 'Works offline',
    description: 'Your data stays on your device. Add expenses anytime, anywhere.',
    accessibilityLabel: 'Feature: works offline. Your data stays on your device.',
  },
  {
    icon: 'cloud-upload-outline',
    title: 'Cloud backup later',
    description: 'Add sync whenever you want — your data is portable, not locked in.',
    accessibilityLabel: 'Feature: cloud backup later. Add sync whenever you want.',
  },
  {
    icon: 'eye-outline',
    title: 'Always reviewable',
    description: 'Extracted values are never auto-confirmed — you see every field before it counts.',
    accessibilityLabel:
      'Feature: always reviewable. Extracted values are never auto-confirmed.',
  },
];

function FeatureBulletRow({ bullet }: { readonly bullet: FeatureBullet }): ReactNode {
  const theme = useTheme();
  return (
    <Row
      gap="md"
      align="flex-start"
      accessibilityRole="text"
      accessibilityLabel={bullet.accessibilityLabel}
    >
      <Icon name={bullet.icon} size={theme.iconSizes.xl} color={theme.colors.brandPrimary} />
      <Stack gap={0} style={{ flex: 1 }}>
        <Text variant="bodyStrong" color="primary">
          {bullet.title}
        </Text>
        <Text variant="caption" color="secondary">
          {bullet.description}
        </Text>
      </Stack>
    </Row>
  );
}

export function WelcomeScreen(): JSX.Element {
  const handleGetStarted = (): void => {
    router.push('/onboarding/guest-name');
  };

  return (
    <Screen scrollable safeArea>
      <Stack gap="xxl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="md" align="stretch">
          <Text variant="display" color="primary" accessibilityRole="header">
            BillLens
          </Text>
          <Text variant="body" color="secondary">
            Scan receipts. Split clearly. Know exactly who owes what.
          </Text>
        </Stack>

        <Card elevation="md" padding="xxl">
          <Stack gap="lg" align="stretch">
            {FEATURE_BULLETS.map((bullet) => (
              <FeatureBulletRow key={bullet.title} bullet={bullet} />
            ))}
          </Stack>
        </Card>

        <Stack gap="md" align="stretch">
          <Button
            label="Get Started"
            variant="primary"
            size="lg"
            onPress={handleGetStarted}
            accessibilityLabel="Get started with BillLens onboarding"
            icon="arrow-forward"
          />
        </Stack>
      </Stack>
    </Screen>
  );
}
