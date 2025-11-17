import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type ChipVariant = 'default' | 'primary' | 'accent' | 'amber' | 'outline';

export interface ChipProps {
  label: string;
  onPress?: () => void;
  variant?: ChipVariant;
  selected?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const Chip: React.FC<ChipProps> = ({
  label,
  onPress,
  variant = 'default',
  selected = false,
  style,
  textStyle,
}) => {
  const chipStyle = [
    styles.base,
    styles[variant],
    selected && styles.selected,
    style,
  ];

  const labelStyle = [
    typography.caption,
    styles[variant + 'Label'],
    selected && styles.selectedLabel,
    textStyle,
  ];

  const Component = onPress ? TouchableOpacity : View;

  return (
    <Component
      style={chipStyle}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={labelStyle}>{label}</Text>
    </Component>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },

  // Default (subtle gray)
  default: {
    backgroundColor: colors.borderSubtle,
  },
  defaultLabel: {
    color: colors.textPrimary,
  },

  // Primary (Indigo)
  primary: {
    backgroundColor: colors.primaryLight,
  },
  primaryLabel: {
    color: colors.primary,
  },

  // Accent (Emerald)
  accent: {
    backgroundColor: colors.accent + '20', // 20% opacity
  },
  accentLabel: {
    color: colors.accent,
  },

  // Amber (warnings, analytics)
  amber: {
    backgroundColor: colors.accentAmber + '20',
  },
  amberLabel: {
    color: colors.accentAmber,
  },

  // Outline
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  outlineLabel: {
    color: colors.textPrimary,
  },

  selected: {
    backgroundColor: colors.primary,
  },
  selectedLabel: {
    color: colors.white,
  },
});

export default Chip;

