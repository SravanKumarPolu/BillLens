import React, { useState, useRef } from 'react';
import { TextInput, StyleSheet, View, Text, ViewStyle, TextInputProps, Animated } from 'react-native';
import { colors } from '../theme/colors';
import { typography, recommendedSpacing } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { transitions } from '../theme/transitions';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  style,
  ...textInputProps
}) => {
  const { colors: themeColors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const borderColorAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleFocus = (e: any) => {
    setIsFocused(true);
    Animated.parallel([
      Animated.timing(borderColorAnim, {
        toValue: 1,
        duration: transitions.fast.duration,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1.01,
        useNativeDriver: true,
        damping: 15,
        stiffness: 300,
      }),
    ]).start();
    textInputProps.onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    Animated.parallel([
      Animated.timing(borderColorAnim, {
        toValue: 0,
        duration: transitions.fast.duration,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 300,
      }),
    ]).start();
    textInputProps.onBlur?.(e);
  };

  const borderColor = borderColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      error ? themeColors.error : themeColors.borderSubtle,
      error ? themeColors.error : themeColors.primary,
    ],
  });

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>
          {label}
        </Text>
      )}
      <Animated.View
        style={[
          styles.inputWrapper,
          {
            transform: [{ scale: scaleAnim }],
            borderColor,
            borderWidth: isFocused ? 2 : 1,
          },
        ]}
      >
      <TextInput
        style={[
          styles.input,
            { color: themeColors.textPrimary, backgroundColor: themeColors.surfaceCard },
          style,
        ]}
          placeholderTextColor={themeColors.textSecondary}
          onFocus={handleFocus}
          onBlur={handleBlur}
        {...textInputProps}
      />
      </Animated.View>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: themeColors.error }]}>
            {error}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: recommendedSpacing.loose,
  },
  label: {
    ...typography.label,
    marginBottom: recommendedSpacing.default,
  },
  inputWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    ...typography.body,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48, // Better touch target
  },
  errorContainer: {
    marginTop: recommendedSpacing.tight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    ...typography.caption,
    flex: 1,
  },
});

export default Input;

