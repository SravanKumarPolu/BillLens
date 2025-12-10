import React, { memo } from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { createGlassStyle } from '../theme/glassmorphism';
import { useTheme } from '../theme/ThemeProvider';
import { semanticElevation, elevation, type ElevationLevel } from '../theme/elevation';
import { spacing } from '../theme/spacing';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  elevated?: boolean;
  glass?: boolean; // Glassmorphism effect
  elevationLevel?: keyof typeof elevation; // Custom elevation level (0-8)
}

const Card: React.FC<CardProps> = ({ 
  children, 
  onPress, 
  style, 
  elevated = false, 
  glass = false,
  elevationLevel,
}) => {
  const { colors: themeColors, theme } = useTheme();
  const isDark = theme === 'dark';
  
  // Determine elevation style
  let elevationStyle: ViewStyle = {};
  if (glass) {
    // Glassmorphism handles its own elevation
  } else if (elevationLevel !== undefined) {
    elevationStyle = elevation[elevationLevel];
  } else if (elevated) {
    elevationStyle = semanticElevation.card;
  }
  
  const cardStyle = [
    glass ? createGlassStyle(isDark) : styles.base,
    elevationStyle,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 16,
    padding: spacing[4], // 16px using spacing system
  },
});

export default memo(Card);

