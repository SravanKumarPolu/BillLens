import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
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
  const { colors } = useTheme();

  const getChipStyle = () => {
    const baseStyle = [styles.base];
    
    if (selected) {
      baseStyle.push({ backgroundColor: colors.primary });
    } else {
      switch (variant) {
        case 'primary':
          baseStyle.push({ backgroundColor: colors.primaryLight });
          break;
        case 'accent':
          baseStyle.push({ backgroundColor: colors.accent + '20' });
          break;
        case 'amber':
          baseStyle.push({ backgroundColor: colors.accentAmber + '20' });
          break;
        case 'outline':
          baseStyle.push({ 
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: colors.borderSubtle,
          });
          break;
        default:
          baseStyle.push({ backgroundColor: colors.borderSubtle });
      }
    }
    
    return [...baseStyle, style];
  };

  const getLabelStyle = () => {
    const baseStyle = [typography.caption];
    
    if (selected) {
      baseStyle.push({ color: colors.white });
    } else {
      switch (variant) {
        case 'primary':
          baseStyle.push({ color: colors.primary });
          break;
        case 'accent':
          baseStyle.push({ color: colors.accent });
          break;
        case 'amber':
          baseStyle.push({ color: colors.accentAmber });
          break;
        case 'outline':
          baseStyle.push({ color: colors.textPrimary });
          break;
        default:
          baseStyle.push({ color: colors.textPrimary });
      }
    }
    
    return [...baseStyle, textStyle];
  };

  const Component = onPress ? TouchableOpacity : View;

  return (
    <Component
      style={getChipStyle()}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={getLabelStyle()}>{label}</Text>
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
});

export default Chip;

