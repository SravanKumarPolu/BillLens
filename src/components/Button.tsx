import React, { memo, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, View, Animated } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { createGlassStyle } from '../theme/glassmorphism';
import { useTheme } from '../theme/ThemeProvider';
import { transitions, animationValues } from '../theme/transitions';

export type ButtonVariant = 'primary' | 'secondary' | 'positive' | 'outline' | 'ghost' | 'glass';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
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
  accessibilityLabel,
  accessibilityHint,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const buttonStyle = [
    styles.base,
    variant === 'glass' ? createGlassStyle(isDark) : styles[variant],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabledContainer,
    {
      transform: [{ scale: scaleAnim }],
    },
    style,
  ];

  // Fluid press animation with haptic-like feedback
  const handlePressIn = () => {
    if (disabled || loading) return;
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      damping: 15,
      stiffness: 400,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled || loading) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 400,
    }).start();
  };

  const handlePress = () => {
    if (!disabled && !loading) {
      onPress();
    }
  };

  const labelStyleMap: Record<ButtonVariant, TextStyle> = {
    primary: styles.primaryLabel,
    secondary: styles.secondaryLabel,
    positive: styles.positiveLabel,
    outline: styles.outlineLabel,
    ghost: styles.ghostLabel,
    glass: styles.glassLabel,
  };

  const labelStyle = [
    typography.button,
    labelStyleMap[variant],
    (disabled || loading) && styles.disabledLabel,
    textStyle,
  ];

  // For primary variant, create gradient effect
  // Note: For production-quality gradients, consider installing react-native-linear-gradient
  // This implementation uses a visual effect that works without dependencies
  if (variant === 'primary' && !disabled && !loading) {
    return (
      <Animated.View style={buttonStyle}>
        <TouchableOpacity
          style={[
            styles.base,
            styles.primaryGradientButton,
            { backgroundColor: colors.primary },
            fullWidth && styles.fullWidth,
          ]}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || loading}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || title}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled: disabled || loading }}
        >
          {/* Gradient effect using layered views */}
          <View style={styles.gradientBase} />
          <View style={[styles.gradientHighlight, { backgroundColor: colors.primaryLight }]} />
          <View style={styles.gradientContent}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={labelStyle}>{title}</Text>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={buttonStyle}>
      <TouchableOpacity
        style={[
          styles.base,
          variant === 'glass' ? createGlassStyle(isDark) : styles[variant],
          fullWidth && styles.fullWidth,
          (disabled || loading) && styles.disabled,
        ]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: disabled || loading }}
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
    </Animated.View>
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
  disabledContainer: {
    opacity: 0.6,
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

  // Glass (glassmorphism effect)
  glass: {
    // Style applied via createGlassStyle()
  },
  glassLabel: {
    color: colors.textPrimary,
  },

  disabledLabel: {},

  // Gradient effect for primary button (visual gradient simulation)
  primaryGradientButton: {
    overflow: 'hidden',
    position: 'relative',
  },
  gradientBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  gradientHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    opacity: 0.4,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  gradientContent: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(Button);

