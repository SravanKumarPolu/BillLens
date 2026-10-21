/**
 * +not-found — the branded 404 for web and deep links.
 *
 * Expo Router renders a bare "Unmatched Route" screen otherwise, which
 * looks like a crash to anyone landing on a stale link. This gives a
 * real way back and keeps the palette/typography consistent.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { PageHead } from '@presentation/web/PageHead';

export default function NotFoundRoute(): ReactNode {
  const theme = useTheme();

  return (
    <>
      <PageHead
        title="Page not found"
        description="This BillLens link does not point to a page."
        noindex
      />
      <Screen scrollable safeArea>
        <Stack
          gap="xl"
          align="stretch"
          style={{ padding: spacing.xl, flexGrow: 1, justifyContent: 'center' }}
        >
          <Card elevation="sm" padding="xxl">
            <Stack gap="md" align="center">
              <Icon
                name="compass-outline"
                size={theme.iconSizes.xl}
                color={theme.colors.brandPrimary}
              />
              <Text variant="screenTitle" color="primary" accessibilityRole="header">
                Page not found
              </Text>
              <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                This link doesn’t point anywhere in BillLens. It may be from an older
                version of the app.
              </Text>
              <Button
                label="Go to Home"
                variant="primary"
                size="md"
                onPress={() => router.replace('/(tabs)')}
                accessibilityLabel="Go to the home dashboard"
                icon="home-outline"
              />
              <Button
                label="View your groups"
                variant="ghost"
                size="md"
                onPress={() => router.replace('/(tabs)/groups')}
                accessibilityLabel="Go to your groups"
              />
            </Stack>
          </Card>
        </Stack>
      </Screen>
    </>
  );
}
