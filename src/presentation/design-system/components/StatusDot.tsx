/**
 * StatusDot — small coloured circle for sync/confidence indicators.
 *
 * Pairs with a text label in real UI (the dot alone must never be the only
 * signal — it reinforces a nearby label). The colour is read from the
 * theme's semantic tokens so it adapts to light/dark automatically.
 */

import { View } from 'react-native';

import { useTheme } from '../theme';
import type { ColorTokens } from '../tokens';

export type StatusDotVariant =
  | 'syncComplete'
  | 'syncPending'
  | 'syncFailed'
  | 'confidenceHigh'
  | 'confidenceMedium'
  | 'confidenceLow'
  | 'confidenceUnknown';

export interface StatusDotProps {
  readonly variant: StatusDotVariant;
  /** Diameter in pixels. Default 8. */
  readonly size?: number;
  readonly accessibilityLabel?: string;
}

function resolveColor(variant: StatusDotVariant, colors: ColorTokens): string {
  switch (variant) {
    case 'syncComplete':
      return colors.syncComplete;
    case 'syncPending':
      return colors.syncPending;
    case 'syncFailed':
      return colors.syncFailed;
    case 'confidenceHigh':
      return colors.confidenceHigh;
    case 'confidenceMedium':
      return colors.confidenceMedium;
    case 'confidenceLow':
      return colors.confidenceLow;
    case 'confidenceUnknown':
      return colors.confidenceUnknown;
  }
}

export function StatusDot({
  variant,
  size = 8,
  accessibilityLabel,
}: StatusDotProps): JSX.Element {
  const theme = useTheme();
  const color = resolveColor(variant, theme.colors);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? variant}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}
