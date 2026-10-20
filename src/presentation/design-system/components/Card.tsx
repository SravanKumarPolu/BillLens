/**
 * Card — elevated surface container.
 *
 * Combines the theme's `surface` colour, a `borderRadius` token, optional
 * padding, and an elevation shadow. Use to group related content.
 */

import type { ViewProps } from 'react-native';
import { View } from 'react-native';

import { useTheme } from '../theme';
import { borderRadius, shadows, spacing, type BorderRadiusKey, type SpacingKey } from '../tokens';
import type { ShadowTokens } from '../tokens';

export type CardElevation = keyof ShadowTokens;

export interface CardProps extends ViewProps {
  /** Shadow level. 'none' renders a flat surface. */
  readonly elevation?: CardElevation;
  /** Inner padding. Accepts a token key or a raw pixel number. */
  readonly padding?: SpacingKey | number;
  /** Corner radius token. */
  readonly radius?: Exclude<BorderRadiusKey, 'none' | 'full'>;
}

function resolvePadding(value: SpacingKey | number | undefined): number {
  if (value === undefined) return spacing.lg;
  if (typeof value === 'number') return value;
  return spacing[value];
}

export function Card({
  elevation = 'sm',
  padding = 'lg',
  radius = 'lg',
  style,
  ...rest
}: CardProps): JSX.Element {
  const theme = useTheme();
  const shadowStyle = elevation === 'none' ? {} : shadows[elevation];
  const resolvedPadding = resolvePadding(padding);

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: borderRadius[radius],
          padding: resolvedPadding,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...shadowStyle,
        },
        style,
      ]}
      {...rest}
    />
  );
}
