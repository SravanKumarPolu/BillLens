import React from 'react';
import { TextInput, StyleSheet, View, Text, ViewStyle, TextInputProps } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

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
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          error && styles.inputError,
          style,
        ]}
        placeholderTextColor={colors.textSecondary}
        {...textInputProps}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  input: {
    ...typography.body,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: 4,
  },
});

export default Input;

