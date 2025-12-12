import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle, Animated } from 'react-native';
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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      damping: 15,
      stiffness: 400,
    }).start();
  };

  const handlePressOut = () => {
    if (!onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 400,
    }).start();
  };

  const getChipStyle = (): (ViewStyle | undefined)[] => {
    const baseStyle: ViewStyle[] = [styles.base];
    
    if (selected) {
      baseStyle.push({ backgroundColor: colors.primary } as ViewStyle);
    } else {
      switch (variant) {
        case 'primary':
          baseStyle.push({ backgroundColor: colors.primaryLight } as ViewStyle);
          break;
        case 'accent':
          baseStyle.push({ backgroundColor: colors.accent + '20' } as ViewStyle);
          break;
        case 'amber':
          baseStyle.push({ backgroundColor: colors.accentAmber + '20' } as ViewStyle);
          break;
        case 'outline':
          baseStyle.push({ 
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: colors.borderSubtle,
          } as ViewStyle);
          break;
        default:
          baseStyle.push({ backgroundColor: colors.borderSubtle } as ViewStyle);
      }
    }
    
    return [...baseStyle, style];
  };

  const getLabelStyle = (): (TextStyle | undefined)[] => {
    const baseStyle: TextStyle[] = [typography.caption];
    
    if (selected) {
      baseStyle.push({ color: colors.white } as TextStyle);
    } else {
      switch (variant) {
        case 'primary':
          baseStyle.push({ color: colors.primary } as TextStyle);
          break;
        case 'accent':
          baseStyle.push({ color: colors.accent } as TextStyle);
          break;
        case 'amber':
          baseStyle.push({ color: colors.accentAmber } as TextStyle);
          break;
        case 'outline':
          baseStyle.push({ color: colors.textPrimary } as TextStyle);
          break;
        default:
          baseStyle.push({ color: colors.textPrimary } as TextStyle);
      }
    }
    
    return [...baseStyle, textStyle];
  };

  const Component = onPress ? TouchableOpacity : View;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Component
        style={getChipStyle()}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <Text style={getLabelStyle()}>{label}</Text>
      </Component>
    </Animated.View>
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

