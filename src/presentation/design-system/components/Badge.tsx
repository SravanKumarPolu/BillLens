/**
 * Badge — compact status pill.
 *
 * A tinted background reinforces the semantic colour, while the label text
 * carries the meaning (colour is secondary, never the sole signal).
 */

import { View } from 'react-native';

import { useTheme } from '../theme';
import { spacing } from '../tokens';
import type { ColorTokens } from '../tokens';

import { Icon } from './Icon';
import { Text } from './Text';

export type BadgeVariant = 'positive' | 'negative' | 'warning' | 'info' | 'neutral';

export interface BadgeProps {
  readonly variant?: BadgeVariant;
  readonly label: string;
  /** Optional Ionicons name rendered to the left of the label. */
  readonly icon?: string;
  readonly accessibilityLabel?: string;
}

interface BadgeColors {
  readonly text: 'positive' | 'negative' | 'warning' | 'info' | 'primary';
  readonly tintHex: string;
}

function resolveColors(variant: BadgeVariant, colors: ColorTokens): BadgeColors {
  switch (variant) {
    case 'positive':
      return { text: 'positive', tintHex: colors.positive };
    case 'negative':
      return { text: 'negative', tintHex: colors.negative };
    case 'warning':
      return { text: 'warning', tintHex: colors.warning };
    case 'info':
      return { text: 'info', tintHex: colors.info };
    case 'neutral':
      return { text: 'primary', tintHex: colors.border };
  }
}

/** Resolve a Badge text-token to a concrete hex colour from the theme. */
function resolveIconColor(text: BadgeColors['text'], colors: ColorTokens): string {
  if (text === 'primary') return colors.textPrimary;
  return colors[text];
}

/**
 * Append a 2-digit alpha channel to a #RRGGBB hex colour. Non-hex inputs
 * (e.g. rgba strings) are returned unchanged so the badge still renders.
 */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const clamped = Math.max(0, Math.min(1, alpha));
  const a = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

export function Badge({
  variant = 'neutral',
  label,
  icon,
  accessibilityLabel,
}: BadgeProps): JSX.Element {
  const theme = useTheme();
  const resolved = resolveColors(variant, theme.colors);
  const iconColor = resolveIconColor(resolved.text, theme.colors);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: theme.borderRadius.full,
        backgroundColor: withAlpha(resolved.tintHex, 0.12),
        alignSelf: 'flex-start',
      }}
    >
      {icon ? <Icon name={icon} size={12} color={iconColor} /> : null}
      <Text variant="label" color={resolved.text}>
        {label}
      </Text>
    </View>
  );
}
