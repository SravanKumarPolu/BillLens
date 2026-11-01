/**
 * IconButton — icon-only tappable control.
 *
 * Always provide an `accessibilityLabel` — there is no visible text to fall
 * back on. All variants meet the 44pt minimum touch target.
 */

import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';

import { useTheme } from '../theme';
import { iconSizes, touchTargets } from '../tokens';

import { Icon } from './Icon';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'default' | 'primary' | 'ghost';

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Ionicons glyph name. */
  readonly icon: string;
  readonly onPress: PressableProps['onPress'];
  readonly size?: IconButtonSize;
  readonly variant?: IconButtonVariant;
  /** Required: no visible label otherwise. */
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

interface ResolvedStyle {
  readonly dimension: number;
  readonly iconSize: number;
  readonly backgroundColor: string;
  readonly iconColor: string;
}

function resolveStyle(
  size: IconButtonSize,
  variant: IconButtonVariant,
  colors: ReturnType<typeof useTheme>['colors'],
): ResolvedStyle {
  const dimension =
    size === 'sm' ? touchTargets.minimum : size === 'md' ? touchTargets.comfortable : 56;
  const iconPixel = size === 'sm' ? iconSizes.sm : size === 'md' ? iconSizes.md : iconSizes.lg;

  switch (variant) {
    case 'primary':
      return {
        dimension,
        iconSize: iconPixel,
        backgroundColor: colors.brandPrimary,
        iconColor: colors.textOnColor,
      };
    case 'ghost':
      return {
        dimension,
        iconSize: iconPixel,
        backgroundColor: 'transparent',
        iconColor: colors.textPrimary,
      };
    case 'default':
    default:
      return {
        dimension,
        iconSize: iconPixel,
        backgroundColor: colors.surfaceMuted,
        iconColor: colors.textPrimary,
      };
  }
}

export function IconButton({
  icon,
  onPress,
  size = 'md',
  variant = 'default',
  accessibilityLabel,
  disabled = false,
  style,
  ...rest
}: IconButtonProps): JSX.Element {
  const theme = useTheme();
  const resolved = resolveStyle(size, variant, theme.colors);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[
        {
          width: resolved.dimension,
          height: resolved.dimension,
          borderRadius: theme.borderRadius.full,
          backgroundColor: resolved.backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? theme.opacity.disabled : theme.opacity.active,
        },
        style,
      ]}
      {...rest}
    >
      <Icon name={icon} size={resolved.iconSize} color={resolved.iconColor} />
    </Pressable>
  );
}
