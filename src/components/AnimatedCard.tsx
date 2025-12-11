import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import Card, { CardProps } from './Card';
import { transitions, animationValues } from '../theme/transitions';

interface AnimatedCardProps extends CardProps {
  delay?: number;
  animation?: 'fadeIn' | 'slideUp' | 'scaleUp';
}

/**
 * Animated Card component with fade/slide/scale animations
 */
export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  delay = 0,
  animation = 'fadeIn',
  style,
  ...props
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(animationValues.slideUp.from)).current;
  const scale = useRef(new Animated.Value(animationValues.scaleUp.from)).current;

  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];

    if (animation === 'fadeIn' || animation === 'slideUp' || animation === 'scaleUp') {
      animations.push(
        Animated.timing(opacity, {
          ...transitions.standard,
          toValue: 1,
          delay,
          useNativeDriver: true,
        })
      );
    }

    if (animation === 'slideUp') {
      animations.push(
        Animated.timing(translateY, {
          ...transitions.standard,
          toValue: animationValues.slideUp.to,
          delay,
          useNativeDriver: true,
        })
      );
    }

    if (animation === 'scaleUp') {
      animations.push(
        Animated.timing(scale, {
          ...transitions.standard,
          toValue: animationValues.scaleUp.to,
          delay,
          useNativeDriver: true,
        })
      );
    }

    Animated.parallel(animations).start();
  }, [delay, animation, opacity, translateY, scale]);

  const animatedStyle: ViewStyle = {
    opacity,
    transform: [
      ...(animation === 'slideUp' ? [{ translateY }] : []),
      ...(animation === 'scaleUp' ? [{ scale }] : []),
    ],
  };

  return <Card {...props} style={[animatedStyle, style] as ViewStyle} />;
};
