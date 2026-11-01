/**
 * Skeleton — animated loading placeholder.
 *
 * A subtle opacity pulse signals "content is loading" without committing to
 * a specific layout. Use inside the same container shape as the real content
 * so the transition is non-jarring.
 */

import { useEffect, useRef } from 'react';
import type { DimensionValue } from 'react-native';
import { Animated, Easing } from 'react-native';

import { useTheme } from '../theme';
import { motion, opacity as opacityToken } from '../tokens';

export interface SkeletonProps {
  /** Width in pixels or a percentage string. Defaults to '100%'. */
  readonly width?: DimensionValue;
  /** Height in pixels. Defaults to 16. */
  readonly height?: number;
  /** Corner radius token. Default 'md'. */
  readonly radius?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  readonly accessibilityLabel?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'md',
  accessibilityLabel = 'Loading',
}: SkeletonProps): JSX.Element {
  const theme = useTheme();
  const value = useRef(new Animated.Value(opacityToken.muted)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: opacityToken.disabled,
          duration: motion.normal,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: opacityToken.muted,
          duration: motion.normal,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={{
        width,
        height,
        borderRadius: theme.borderRadius[radius],
        backgroundColor: theme.colors.surfaceMuted,
        opacity: value,
      }}
    />
  );
}
