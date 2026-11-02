/**
 * Button — primary call-to-action primitive.
 *
 * Variants:
 *   - primary:     brand fill, white label (default, high emphasis)
 *   - secondary:   muted surface fill with border (medium emphasis)
 *   - ghost:       transparent, brand-coloured label (low emphasis)
 *   - destructive: negative (red) fill, white label (irreversible actions)
 *
 * All sizes meet the 44pt minimum touch target (`touchTargets.minimum`).
 * Loading state swaps the label/icon for a spinner and disables presses.
 */

import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable } from 'react-native';

import { useTheme } from '../theme';
import { iconSizes, spacing, touchTargets } from '../tokens';

import { Icon } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Button label (always shown as text — icon buttons use `IconButton`). */
  readonly label: string;
  readonly onPress: PressableProps['onPress'];
  readonly disabled?: boolean;
  /** Show a spinner and ignore presses. */
  readonly loading?: boolean;
  /** Optional Ionicons name rendered to the left of the label. */
  readonly icon?: string;
  /** Accessibility label (falls back to `label`). */
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: PressableProps['accessibilityRole'];
  readonly style?: StyleProp<ViewStyle>;
}

interface SizeStyle {
  readonly minHeight: number;
  readonly paddingHorizontal: number;
  readonly iconSize: number;
}

const SIZE_STYLES: Record<ButtonSize, SizeStyle> = {
  sm: { minHeight: touchTargets.minimum, paddingHorizontal: spacing.md, iconSize: iconSizes.sm },
  md: { minHeight: touchTargets.comfortable, paddingHorizontal: spacing.lg, iconSize: iconSizes.md },
  lg: { minHeight: 56, paddingHorizontal: spacing.xl, iconSize: iconSizes.lg },
};

interface VariantStyle {
  readonly backgroundColor: string;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly labelColor: 'onColor' | 'primary' | 'negative';
}

function resolveVariant(
  variant: ButtonVariant,
  colors: ReturnType<typeof useTheme>['colors'],
): VariantStyle {
  switch (variant) {
    case 'primary':
      return { backgroundColor: colors.brandPrimary, labelColor: 'onColor' };
    case 'secondary':
      return {
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
        borderWidth: 1,
        labelColor: 'primary',
      };
    case 'ghost':
      return { backgroundColor: 'transparent', labelColor: 'primary' };
    case 'destructive':
      return { backgroundColor: colors.negative, labelColor: 'onColor' };
  }
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  accessibilityLabel,
  accessibilityRole = 'button',
  style,
  ...rest
}: ButtonProps): JSX.Element {
  const theme = useTheme();
  const sizeStyle = SIZE_STYLES[size];
  const variantStyle = resolveVariant(variant, theme.colors);
  const isDisabled = disabled || loading;

  const iconColor =
    variantStyle.labelColor === 'onColor'
      ? theme.colors.textOnColor
      : variantStyle.labelColor === 'negative'
        ? theme.colors.negative
        : theme.colors.brandPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          minHeight: sizeStyle.minHeight,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          borderRadius: theme.borderRadius.md,
          backgroundColor: variantStyle.backgroundColor,
          borderColor: variantStyle.borderColor,
          borderWidth: variantStyle.borderWidth,
          opacity: isDisabled ? theme.opacity.disabled : theme.opacity.active,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={sizeStyle.iconSize} color={iconColor} /> : null}
          <Text variant="button" color={variantStyle.labelColor}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
