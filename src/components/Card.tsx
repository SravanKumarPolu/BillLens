import React, { memo, useEffect, useRef } from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity, Animated } from 'react-native';
import { colors } from '../theme/colors';
import { createGlassStyle } from '../theme/glassmorphism';
import { useTheme } from '../theme/ThemeProvider';
import { semanticElevation, elevation, type ElevationLevel } from '../theme/elevation';
import { spacing } from '../theme/spacing';
import { transitions, animationValues } from '../theme/transitions';

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
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Fade in animation on mount
  useEffect(() => {
    Animated.timing(opacityAnim, {
      ...transitions.standard,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [opacityAnim]);

  // Scale animation on press
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      damping: 15,
      stiffness: 300,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 300,
    }).start();
  };
  
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
    {
      opacity: opacityAnim,
      transform: [{ scale: scaleAnim }],
    },
    style,
  ];

  if (onPress) {
    return (
      <Animated.View style={cardStyle}>
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
          style={{ flex: 1 }}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return <Animated.View style={cardStyle}>{children}</Animated.View>;
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 16,
    padding: spacing[4], // 16px using spacing system
  },
});

export default memo(Card);

