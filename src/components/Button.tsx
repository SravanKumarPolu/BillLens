import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type ButtonVariant = 'primary' | 'secondary' | 'positive' | 'outline' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
  textStyle,
}) => {
  const buttonStyle = [
    styles.base,
    styles[variant],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    style,
  ];

  const labelStyle = [
    typography.button,
    styles[variant + 'Label'],
    (disabled || loading) && styles.disabledLabel,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'positive' ? colors.white : colors.primary}
        />
      ) : (
        <Text style={labelStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },

  // Primary (Indigo)
  primary: {
    backgroundColor: colors.primary,
  },
  primaryLabel: {
    color: colors.white,
  },

  // Secondary (Neutral)
  secondary: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  secondaryLabel: {
    color: colors.textPrimary,
  },

  // Positive (Emerald - for Settle Up, success actions)
  positive: {
    backgroundColor: colors.accent,
  },
  positiveLabel: {
    color: colors.white,
  },

  // Outline (Primary border, transparent fill)
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  outlineLabel: {
    color: colors.primary,
  },

  // Ghost (minimal, for less important actions)
  ghost: {
    backgroundColor: 'transparent',
  },
  ghostLabel: {
    color: colors.textSecondary,
  },

  disabledLabel: {},
});

export default Button;

