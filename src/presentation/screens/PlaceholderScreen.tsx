/**
 * PlaceholderScreen — shared layout for not-yet-implemented screens.
 *
 * Every Phase 2 route file renders a thin placeholder so the
 * navigation graph is fully walkable end-to-end. The placeholder shows
 * a title, an optional subtitle / message, and any optional children
 * (e.g. a single primary CTA). It uses `Screen`, `Card`, `Stack`, and
 * `Text` from the design system exclusively.
 *
 * The placeholder does NOT render fake data — it makes the absence of
 * real content obvious so it is never mistaken for a finished screen.
 */

import type { ReactNode } from 'react';

import { Card } from '@presentation/design-system/components/Card';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { spacing } from '@presentation/design-system/tokens';

export interface PlaceholderScreenProps {
  readonly title: string;
  readonly message?: string;
  /** Optional node rendered below the message (e.g. a CTA button). */
  readonly children?: ReactNode;
  /** Make the screen content scrollable. Default false. */
  readonly scrollable?: boolean;
}

export function PlaceholderScreen({
  title,
  message,
  children,
  scrollable = false,
}: PlaceholderScreenProps): JSX.Element {
  return (
    <Screen scrollable={scrollable}>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Text variant="screenTitle" color="primary">
          {title}
        </Text>
        <Card elevation="sm" padding="xxl">
          <Stack gap="md" align="stretch">
            <Text variant="body" color="secondary">
              {message ?? 'This screen is part of the BillLens shell and will be populated in a later phase.'}
            </Text>
            <Text variant="caption" color="muted">
              Placeholder · no data is shown here yet.
            </Text>
          </Stack>
        </Card>
        {children}
      </Stack>
    </Screen>
  );
}
