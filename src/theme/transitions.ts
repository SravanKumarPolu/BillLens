/**
 * BillLens Transition System
 * 
 * Smooth transitions and animations for modern 2025 UI
 * Provides consistent timing and easing functions
 * 
 * Usage:
 * import { transitions } from '../theme/transitions';
 * 
 * Animated.timing(value, {
 *   ...transitions.standard,
 *   toValue: 1,
 * });
 */

/**
 * Transition durations (in milliseconds)
 */
export const transitionDurations = {
  instant: 0,
  fast: 150,      // Quick interactions (hover, focus)
  standard: 250, // Standard transitions
  slow: 350,     // Slower transitions (page transitions)
  verySlow: 500, // Very slow (complex animations)
} as const;

/**
 * Easing functions (React Native Animated compatible)
 */
export const easing = {
  // Standard easing
  easeInOut: 'ease-in-out',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  linear: 'linear',
  
  // Custom easing (for use with react-native-reanimated if available)
  standard: {
    type: 'ease-in-out',
    duration: transitionDurations.standard,
  },
  bounce: {
    type: 'spring',
    damping: 15,
    stiffness: 300,
  },
  smooth: {
    type: 'ease-out',
    duration: transitionDurations.slow,
  },
} as const;

/**
 * Common transition configurations
 */
export const transitions = {
  /**
   * Standard transition (250ms ease-in-out)
   */
  standard: {
    duration: transitionDurations.standard,
    useNativeDriver: true,
  },
  
  /**
   * Fast transition (150ms ease-out)
   */
  fast: {
    duration: transitionDurations.fast,
    useNativeDriver: true,
  },
  
  /**
   * Slow transition (350ms ease-in-out)
   */
  slow: {
    duration: transitionDurations.slow,
    useNativeDriver: true,
  },
  
  /**
   * Button press transition
   */
  buttonPress: {
    duration: transitionDurations.fast,
    useNativeDriver: true,
  },
  
  /**
   * Card hover transition
   */
  cardHover: {
    duration: transitionDurations.standard,
    useNativeDriver: true,
  },
  
  /**
   * Modal transition
   */
  modal: {
    duration: transitionDurations.slow,
    useNativeDriver: true,
  },
  
  /**
   * Page transition
   */
  page: {
    duration: transitionDurations.slow,
    useNativeDriver: true,
  },
} as const;

/**
 * Animation values for common properties
 */
export const animationValues = {
  // Opacity
  fadeIn: { from: 0, to: 1 },
  fadeOut: { from: 1, to: 0 },
  
  // Scale
  scaleUp: { from: 0.95, to: 1 },
  scaleDown: { from: 1, to: 0.95 },
  scalePress: { from: 1, to: 0.98 },
  
  // Translate
  slideUp: { from: 20, to: 0 },
  slideDown: { from: -20, to: 0 },
  slideLeft: { from: 20, to: 0 },
  slideRight: { from: -20, to: 0 },
} as const;

export type TransitionKey = keyof typeof transitions;
export type AnimationValueKey = keyof typeof animationValues;
