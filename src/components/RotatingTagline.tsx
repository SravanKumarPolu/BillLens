import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, ViewStyle, TextStyle, AppState, AppStateStatus } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, TypographyKey } from '../theme/typography';

export interface RotatingTaglineProps {
  /**
   * Array of taglines to rotate through
   */
  taglines: string[];
  /**
   * Rotation mode: 'daily' shows one tagline per day, 'interval' rotates every few seconds
   * Default: 'daily'
   */
  mode?: 'daily' | 'interval';
  /**
   * Duration in milliseconds each tagline should be displayed (only used when mode is 'interval')
   * Default: 3500ms (3.5 seconds)
   */
  duration?: number;
  /**
   * Transition duration in milliseconds for fade in/out
   * Default: 500ms
   */
  transitionDuration?: number;
  /**
   * Typography style to use for taglines
   * Default: h3
   */
  typographyStyle?: TypographyKey;
  /**
   * Custom style for the container
   */
  style?: ViewStyle;
  /**
   * Custom style for the text
   */
  textStyle?: TextStyle;
  /**
   * Whether to pause rotation on mount (only used when mode is 'interval')
   * Default: false
   */
  paused?: boolean;
}

/**
 * RotatingTagline Component
 * 
 * Displays taglines one at a time with smooth fade transitions.
 * Supports two modes:
 * - 'daily': Shows one tagline per day, changes automatically each day
 * - 'interval': Rotates through taglines every few seconds
 * 
 * Features:
 * - Smooth fade in/out transitions
 * - Daily rotation mode (one tagline per day)
 * - Configurable display duration for interval mode
 * - Responsive design
 * - Automatic looping
 * - Pause support (interval mode only)
 */
const RotatingTagline: React.FC<RotatingTaglineProps> = ({
  taglines,
  mode = 'daily',
  duration = 3500,
  transitionDuration = 500,
  typographyStyle = 'h3',
  style,
  textStyle,
  paused = false,
}) => {
  const { colors } = useTheme();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  /**
   * Calculate which tagline to show based on the current date
   * Uses days since epoch (Jan 1, 2024) modulo number of taglines
   * This ensures each day shows the same tagline, and it cycles through all taglines
   */
  const getDailyTaglineIndex = useCallback(() => {
    const epochDate = new Date('2024-01-01T00:00:00Z');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const daysSinceEpoch = Math.floor((today.getTime() - epochDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceEpoch % taglines.length;
  }, [taglines.length]);
  
  const [currentIndex, setCurrentIndex] = useState(() => {
    return mode === 'daily' ? getDailyTaglineIndex() : 0;
  });

  // Validate taglines array
  if (!taglines || taglines.length === 0) {
    return null;
  }

  // Update tagline when date changes (for daily mode)
  const updateDailyTagline = useCallback(() => {
    if (mode !== 'daily') return;
    
    const newIndex = getDailyTaglineIndex();
    if (newIndex !== currentIndex) {
      // Date changed, update tagline with fade transition
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: transitionDuration,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex(newIndex);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: transitionDuration,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [mode, getDailyTaglineIndex, currentIndex, transitionDuration, fadeAnim]);

  // Check for date changes periodically (for daily mode)
  useEffect(() => {
    if (mode !== 'daily') {
      return;
    }

    // Check immediately on mount
    updateDailyTagline();

    // Check every minute to catch date changes
    const checkInterval = setInterval(() => {
      updateDailyTagline();
    }, 60000); // Check every minute

    // Also check when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        updateDailyTagline();
      }
    });

    return () => {
      clearInterval(checkInterval);
      subscription.remove();
    };
  }, [mode, updateDailyTagline]);

  // If only one tagline, just display it without animation
  if (taglines.length === 1) {
    return (
      <View style={[styles.container, style]}>
        <Text
          style={[
            typography[typographyStyle],
            styles.text,
            { color: colors.textPrimary },
            textStyle,
          ]}
        >
          {taglines[0]}
        </Text>
      </View>
    );
  }

  // Rotate to next tagline (for interval mode)
  const rotateToNext = useCallback(() => {
    // Fade out
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: transitionDuration,
      useNativeDriver: true,
    }).start(() => {
      // Update index
      setCurrentIndex((prevIndex) => (prevIndex + 1) % taglines.length);
      
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: transitionDuration,
        useNativeDriver: true,
      }).start();
    });
  }, [taglines.length, transitionDuration, fadeAnim]);

  // Set up rotation interval (only for interval mode)
  useEffect(() => {
    if (mode !== 'interval' || paused) {
      return;
    }

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up new interval
    intervalRef.current = setInterval(() => {
      rotateToNext();
    }, duration);

    // Cleanup on unmount or when paused
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [mode, duration, paused, rotateToNext]);

  // Reset animation when paused state changes (interval mode only)
  useEffect(() => {
    if (mode === 'interval' && !paused) {
      fadeAnim.setValue(1);
    }
  }, [mode, paused, fadeAnim]);

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.animatedContainer,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Text
          style={[
            typography[typographyStyle],
            styles.text,
            { color: colors.textPrimary },
            textStyle,
          ]}
        >
          {taglines[currentIndex]}
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30, // Prevent layout shift during transitions
  },
  animatedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
});

export default RotatingTagline;

