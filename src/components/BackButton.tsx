import React, { useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useNavigation } from '@react-navigation/native';

export interface BackButtonProps {
  onPress?: () => void;
  style?: ViewStyle;
  animated?: boolean;
}

/**
 * BackButton Component
 * 
 * A consistent, polished back button with:
 * - Circular white background
 * - Purple arrow icon
 * - Subtle elevation/shadow
 * - Smooth press animations
 * - Pixel-perfect design
 */
const BackButton: React.FC<BackButtonProps> = ({ 
  onPress, 
  style,
  animated = true,
}) => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handlePressIn = () => {
    if (!animated) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.92,
        useNativeDriver: true,
        damping: 15,
        stiffness: 300,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    if (!animated) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 350,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const buttonContent = (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.backButton, { backgroundColor: colors.white }, style]}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      activeOpacity={1}
    >
      <Text style={[styles.backButtonIcon, { color: colors.primary }]}>←</Text>
    </TouchableOpacity>
  );

  if (!animated) {
    return buttonContent;
  }

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
      }}
    >
      {buttonContent}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    // Subtle elevation/shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonIcon: {
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
});

export default BackButton;
