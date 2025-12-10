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

// Theme type for future dark mode support
export type Theme = 'light' | 'dark';

// Default theme
export const defaultTheme: Theme = 'light';

