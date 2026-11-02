/**
 * PrivacyNotice — non-intrusive indicator of the active storage mode.
 *
 * Shows the user, at a glance, how the receipt they're about to capture
 * will be stored. The icon + label is colour-blind safe (the icon is
 * always accompanied by a plain-language label — colour is never the
 * sole signal, per `docs/privacy-and-trust.md`).
 *
 * Reads the default from the capture store when no explicit `mode` prop
 * is provided, so screens that mount `<PrivacyNotice />` with no
 * arguments reflect the user's current global preference automatically.
 */

import type { ReactNode } from 'react';

import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import {
  PRIVACY_DEFAULT_DESCRIPTIONS,
  PRIVACY_DEFAULT_ICONS,
  PRIVACY_DEFAULT_LABELS,
  type StorageMode,
} from '@presentation/view-models/groups';
import { useCaptureStore } from '@store/capture-store';

export interface PrivacyNoticeProps {
  /**
   * Override the storage mode shown. Defaults to the capture store's
   * `defaultStorageMode` so screens without a specific preference
   * still reflect the current global setting.
   */
  readonly mode?: StorageMode;
  /** Hide the longer description line; show only the icon + label. */
  readonly compact?: boolean;
  /** Accessibility label override. */
  readonly accessibilityLabel?: string;
}

export function PrivacyNotice({
  mode,
  compact = false,
  accessibilityLabel,
}: PrivacyNoticeProps): JSX.Element {
  const theme = useTheme();
  const storeMode = useCaptureStore((s) => s.defaultStorageMode);
  const resolved = mode ?? storeMode;

  const label = PRIVACY_DEFAULT_LABELS[resolved];
  const description = PRIVACY_DEFAULT_DESCRIPTIONS[resolved];
  const iconName = PRIVACY_DEFAULT_ICONS[resolved];
  const a11y = accessibilityLabel ?? `Receipt privacy: ${label}. ${description}`;

  const body: ReactNode = (
    <Row gap="sm" align="center">
      <Icon name={iconName} size={theme.iconSizes.md} color={theme.colors.brandPrimary} />
      <Stack gap={0} style={{ flex: 1 }}>
        <Text variant="label" color="primary">
          {label}
        </Text>
        {!compact ? (
          <Text variant="caption" color="secondary">
            {description}
          </Text>
        ) : null}
      </Stack>
    </Row>
  );

  return (
    <Card
      elevation="none"
      padding="md"
      accessibilityRole="text"
      accessibilityLabel={a11y}
      style={{
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
      }}
    >
      {body}
    </Card>
  );
}
