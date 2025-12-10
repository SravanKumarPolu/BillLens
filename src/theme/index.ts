/**
 * Central theme export
 * Combines colors and typography for easy imports
 */

export { colors } from './colors';
export { typography, getTypography, type TypographyKey } from './typography';
export {
  responsiveTypography,
  getResponsiveTypography,
  getResponsiveTypographyStyle,
  getDeviceType,
  getScaleFactor,
  isExternalMonitor,
  isHighDPI,
  getScreenInfo,
  screenInfo,
  DeviceType,
} from './responsiveTypography';
export {
  getContrastRatio,
  meetsWCAGAA,
  verifyTextContrast,
  getAccessibleTextColor,
} from './contrastUtils';
export {
  glassTokens,
  createGlassStyle,
  glassCard,
  glassButton,
  glassModal,
  type GlassmorphismStyle,
} from './glassmorphism';
export {
  spacing,
  semanticSpacing,
  getResponsiveSpacing,
  spacingUtils,
  type SpacingKey,
  type SemanticSpacingKey,
} from './spacing';
export {
  elevation,
  semanticElevation,
  createElevation,
  type ElevationLevel,
  type ElevationStyle,
} from './elevation';
export {
  transitionDurations,
  easing,
  transitions,
  animationValues,
  type TransitionKey,
  type AnimationValueKey,
} from './transitions';

// Theme type for future dark mode support
export type Theme = 'light' | 'dark';

// Default theme
export const defaultTheme: Theme = 'light';

