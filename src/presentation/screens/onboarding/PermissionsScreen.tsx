/**
 * PermissionsScreen — third onboarding step (Prompt 14).
 *
 * Explains the permissions BillLens MAY ask for later and why. The
 * actual permission requests are NOT made here — they are requested
 * lazily, only when the user invokes the related feature (camera scan,
 * photo import, etc.). This screen sets expectations so the user is
 * never surprised by a permission prompt.
 *
 * Each permission is shown as an icon + description inside a Card. A
 * note reinforces the lazy-request philosophy.
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

interface PermissionExplanation {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly accessibilityLabel: string;
}

const PERMISSIONS: readonly PermissionExplanation[] = [
  {
    icon: 'camera-outline',
    title: 'Camera',
    description: 'To scan receipts and payment screenshots.',
    accessibilityLabel: 'Camera permission: to scan receipts and payment screenshots.',
  },
  {
    icon: 'images-outline',
    title: 'Photo library',
    description: 'To import existing receipt images.',
    accessibilityLabel: 'Photo library permission: to import existing receipt images.',
  },
  {
    icon: 'notifications-outline',
    title: 'Notifications',
    description: 'To remind you about pending drafts and settlements.',
    accessibilityLabel:
      'Notifications permission: to remind you about pending drafts and settlements.',
  },
];

function PermissionRow({ permission }: { readonly permission: PermissionExplanation }): ReactNode {
  const theme = useTheme();
  return (
    <Row
      gap="md"
      align="flex-start"
      accessibilityRole="text"
      accessibilityLabel={permission.accessibilityLabel}
    >
      <Icon name={permission.icon} size={theme.iconSizes.xl} color={theme.colors.brandPrimary} />
      <Stack gap={0} style={{ flex: 1 }}>
        <Text variant="bodyStrong" color="primary">
          {permission.title}
        </Text>
        <Text variant="caption" color="secondary">
          {permission.description}
        </Text>
      </Stack>
    </Row>
  );
}

export function PermissionsScreen(): JSX.Element {
  const theme = useTheme();
  const handleContinue = (): void => {
    router.push('/onboarding/complete');
  };

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="sm" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Permissions
          </Text>
          <Text variant="body" color="secondary">
            BillLens may ask for the following permissions. Each one only enables a specific feature —
            you can deny any of them and the rest of the app keeps working.
          </Text>
        </Stack>

        <Card elevation="sm" padding="lg">
          <Stack gap="lg" align="stretch">
            {PERMISSIONS.map((perm) => (
              <PermissionRow key={perm.title} permission={perm} />
            ))}
          </Stack>
        </Card>

        <Card elevation="none" padding="md">
          <Row gap="sm" align="flex-start">
            <Icon
              name="information-circle-outline"
              size={theme.iconSizes.md}
              color={theme.colors.info}
            />
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="caption" color="secondary">
                BillLens only asks for a permission when you use the related feature.
              </Text>
            </Stack>
          </Row>
        </Card>

        <Button
          label="Continue"
          variant="primary"
          size="lg"
          onPress={handleContinue}
          accessibilityLabel="Continue to the final onboarding step"
        />
      </Stack>
    </Screen>
  );
}
