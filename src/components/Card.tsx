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
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const Card: React.FC<CardProps> = ({ 
  children, 
  onPress, 
  style, 
  elevated = false, 
  glass = false,
  elevationLevel,
  accessibilityLabel,
  accessibilityHint,
  ...props
}) => {
  const { colors: themeColors, theme } = useTheme();
  const isDark = theme === 'dark';
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const mountAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Fade in animation on mount
  useEffect(() => {
    mountAnimationRef.current = Animated.timing(opacityAnim, {
      ...transitions.standard,
      toValue: 1,
      useNativeDriver: true,
    });
    mountAnimationRef.current.start(() => {
      mountAnimationRef.current = null;
    });

    // Cleanup on unmount
    return () => {
      if (mountAnimationRef.current) {
        mountAnimationRef.current.stop();
        mountAnimationRef.current = null;
      }
    };
  }, [opacityAnim]);

  const pressAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      if (pressAnimationRef.current) {
        pressAnimationRef.current.stop();
        pressAnimationRef.current = null;
      }
    };
  }, []);

  // Enhanced scale animation on press with better feedback
  const handlePressIn = () => {
    if (!onPress) return;
    if (pressAnimationRef.current) {
      pressAnimationRef.current.stop();
    }
    pressAnimationRef.current = Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        useNativeDriver: true,
        damping: 12,
        stiffness: 350,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.9,
        duration: transitions.fast.duration,
        useNativeDriver: true,
      }),
    ]);
    pressAnimationRef.current.start(() => {
      pressAnimationRef.current = null;
    });
  };

  const handlePressOut = () => {
    if (!onPress) return;
    if (pressAnimationRef.current) {
      pressAnimationRef.current.stop();
    }
    pressAnimationRef.current = Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 350,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: transitions.fast.duration,
        useNativeDriver: true,
      }),
    ]);
    pressAnimationRef.current.start(() => {
      pressAnimationRef.current = null;
    });
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
    !glass && { backgroundColor: themeColors.surfaceCard }, // Dynamic background color
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
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return <Animated.View style={cardStyle}>{children}</Animated.View>;
};

// Base styles (background color is set dynamically via style prop)
const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    padding: spacing[4], // 16px using spacing system
  },
});

export default memo(Card);

