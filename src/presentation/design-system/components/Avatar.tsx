/**
 * Avatar — circular user/member representation.
 *
 * Shows the member's image when available, otherwise their initials derived
 * from `name`. The fallback uses the brand colour so unnamed/anonymous
 * members still get a distinct, on-brand glyph.
 */

import { Image, View } from 'react-native';

import { useTheme } from '../theme';
import { iconSizes } from '../tokens';

import { Text } from './Text';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  /** Display name — used for initials when no image is provided. */
  readonly name: string;
  readonly size?: AvatarSize;
  /** Optional remote image URL. When set, the image is shown instead of initials. */
  readonly imageUrl?: string;
  readonly accessibilityLabel?: string;
}

interface AvatarMetrics {
  readonly dimension: number;
  readonly fontSize: number;
}

function metricsFor(size: AvatarSize): AvatarMetrics {
  switch (size) {
    case 'sm':
      return { dimension: 32, fontSize: 12 };
    case 'lg':
      return { dimension: 56, fontSize: 20 };
    case 'md':
    default:
      return { dimension: 40, fontSize: iconSizes.md };
  }
}

/** Derive up to two uppercase initials from a display name. */
function initialsFrom(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  const parts = trimmed.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export function Avatar({
  name,
  size = 'md',
  imageUrl,
  accessibilityLabel,
}: AvatarProps): JSX.Element {
  const theme = useTheme();
  const metrics = metricsFor(size);
  const label = accessibilityLabel ?? `Avatar for ${name}`;

  const containerStyle = {
    width: metrics.dimension,
    height: metrics.dimension,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.brandPrimary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={containerStyle}
        accessibilityLabel={label}
        accessibilityRole="image"
      />
    );
  }

  return (
    <View style={containerStyle} accessibilityLabel={label} accessibilityRole="image">
      <Text
        variant={size === 'lg' ? 'cardTitle' : 'caption'}
        color="onColor"
        style={{ fontSize: metrics.fontSize, fontWeight: '700' }}
      >
        {initialsFrom(name)}
      </Text>
    </View>
  );
}
