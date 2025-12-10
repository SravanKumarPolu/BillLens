/**
 * Responsive Typography System
 * 
 * Optimized for external monitors and various screen sizes/DPIs
 * 
 * Features:
 * - DPI-aware scaling for high-resolution displays
 * - Screen size responsive adjustments
 * - Contrast verification utilities
 * - Font smoothing and rendering optimizations
 * - Accessibility-first approach (WCAG AA compliant)
 * 
 * React Native handles font rendering automatically, but we provide
 * utilities for responsive scaling and contrast verification.
 */

import { Dimensions, PixelRatio, Platform } from 'react-native';
import { typography, type TypographyKey } from './typography';

/**
 * Get current screen dimensions (called dynamically)
 * Use this instead of static Dimensions.get() to support screen changes
 */
const getScreenDimensions = () => Dimensions.get('window');
const getPixelRatio = () => PixelRatio.get();

/**
 * Device type classification for responsive typography
 */
export enum DeviceType {
  SMALL = 'small',      // Phones < 375px
  MEDIUM = 'medium',    // Phones 375px - 428px
  LARGE = 'large',      // Tablets 428px - 768px
  XLARGE = 'xlarge',    // External monitors, tablets > 768px
}

/**
 * Determine device type based on screen width
 */
export const getDeviceType = (): DeviceType => {
  const { width } = getScreenDimensions();
  if (width < 375) return DeviceType.SMALL;
  if (width < 428) return DeviceType.MEDIUM;
  if (width < 768) return DeviceType.LARGE;
  return DeviceType.XLARGE;
};

/**
 * Scale factor for typography based on device and DPI
 * 
 * High-DPI displays (Retina, 4K monitors) need larger base sizes
 * External monitors often have lower DPI, requiring careful scaling
 */
export const getScaleFactor = (): number => {
  const deviceType = getDeviceType();
  const pixelRatio = getPixelRatio();
  const baseScale = pixelRatio;
  
  // Base scaling factors
  const scaleFactors: Record<DeviceType, number> = {
    [DeviceType.SMALL]: 1.0,      // Small phones: no scaling
    [DeviceType.MEDIUM]: 1.0,     // Standard phones: no scaling
    [DeviceType.LARGE]: 1.05,     // Tablets: slight increase
    [DeviceType.XLARGE]: 1.1,     // External monitors: increase for readability
  };
  
  // Adjust for high-DPI displays
  // High-DPI (Retina/4K) typically has pixelRatio > 2
  // Lower DPI external monitors typically have pixelRatio ~1-1.5
  let dpiAdjustment = 1.0;
  
  if (deviceType === DeviceType.XLARGE) {
    // For external monitors, scale up more if lower DPI
    if (pixelRatio < 1.5) {
      dpiAdjustment = 1.15; // Larger fonts for lower DPI external monitors
    } else if (pixelRatio > 2.5) {
      dpiAdjustment = 1.05; // Slight increase for 4K monitors
    }
  }
  
  return scaleFactors[deviceType] * dpiAdjustment;
};

/**
 * Get responsive font size for external monitor optimization
 * 
 * Scales typography tokens based on:
 * - Device type (phone/tablet/external monitor)
 * - Pixel ratio (DPI)
 * - Minimum readable sizes
 */
export const getResponsiveFontSize = (
  baseSize: number,
  minSize?: number,
  maxSize?: number
): number => {
  const scaleFactor = getScaleFactor();
  let scaledSize = baseSize * scaleFactor;
  
  // Apply minimum size constraint (accessibility)
  const effectiveMinSize = minSize || (baseSize >= 16 ? 16 : 14);
  if (scaledSize < effectiveMinSize) {
    scaledSize = effectiveMinSize;
  }
  
  // Apply maximum size constraint (readability)
  if (maxSize && scaledSize > maxSize) {
    scaledSize = maxSize;
  }
  
  // Round to nearest integer for pixel-perfect rendering
  return Math.round(scaledSize);
};

/**
 * Get responsive typography token (function-based for dynamic calculation)
 * 
 * Automatically scales base typography tokens based on device and DPI
 * Call this function to get current responsive values
 */
export const getResponsiveTypography = (): typeof typography => {
  return {
    display: {
      ...typography.display,
      fontSize: getResponsiveFontSize(32, 28, 40),
      lineHeight: getResponsiveFontSize(38, 34, 46),
    },
  h1: {
    ...typography.h1,
    fontSize: getResponsiveFontSize(28, 24, 36),
    lineHeight: getResponsiveFontSize(34, 30, 42),
  },
  h2: {
    ...typography.h2,
    fontSize: getResponsiveFontSize(24, 20, 32),
    lineHeight: getResponsiveFontSize(30, 26, 38),
  },
  h3: {
    ...typography.h3,
    fontSize: getResponsiveFontSize(20, 18, 28),
    lineHeight: getResponsiveFontSize(24, 22, 32),
  },
  h4: {
    ...typography.h4,
    fontSize: getResponsiveFontSize(18, 16, 24),
    lineHeight: getResponsiveFontSize(22, 20, 28),
  },
  bodyLarge: {
    ...typography.bodyLarge,
    fontSize: getResponsiveFontSize(16, 16, 20), // Minimum 16px for readability
    lineHeight: getResponsiveFontSize(24, 24, 30),
  },
  body: {
    ...typography.body,
    fontSize: getResponsiveFontSize(14, 14, 18), // Minimum 14px (WCAG AA)
    lineHeight: getResponsiveFontSize(21, 21, 27),
  },
  bodySmall: {
    ...typography.bodySmall,
    fontSize: getResponsiveFontSize(13, 13, 16),
    lineHeight: getResponsiveFontSize(20, 20, 24),
  },
  label: {
    ...typography.label,
    fontSize: getResponsiveFontSize(14, 14, 18),
    lineHeight: getResponsiveFontSize(20, 20, 26),
  },
  overline: {
    ...typography.overline,
    fontSize: getResponsiveFontSize(11, 11, 14), // Minimum 11px
    lineHeight: getResponsiveFontSize(16, 16, 20),
  },
  caption: {
    ...typography.caption,
    fontSize: getResponsiveFontSize(12, 12, 16),
    lineHeight: getResponsiveFontSize(16, 16, 22),
  },
  captionSmall: {
    ...typography.captionSmall,
    fontSize: getResponsiveFontSize(11, 11, 14), // Minimum 11px
    lineHeight: getResponsiveFontSize(14, 14, 18),
  },
  button: {
    ...typography.button,
    fontSize: getResponsiveFontSize(16, 16, 20),
    lineHeight: getResponsiveFontSize(20, 20, 26),
  },
  buttonSmall: {
    ...typography.buttonSmall,
    fontSize: getResponsiveFontSize(14, 14, 18),
    lineHeight: getResponsiveFontSize(18, 18, 24),
  },
  link: {
    ...typography.link,
    fontSize: getResponsiveFontSize(14, 14, 18),
    lineHeight: getResponsiveFontSize(20, 20, 26),
  },
  moneyLarge: {
    ...typography.moneyLarge,
    fontSize: getResponsiveFontSize(28, 24, 36),
    lineHeight: getResponsiveFontSize(34, 30, 42),
  },
  money: {
    ...typography.money,
    fontSize: getResponsiveFontSize(18, 16, 24),
    lineHeight: getResponsiveFontSize(22, 20, 28),
  },
    moneySmall: {
      ...typography.moneySmall,
      fontSize: getResponsiveFontSize(14, 14, 18),
      lineHeight: getResponsiveFontSize(18, 18, 24),
    },
  };
};

/**
 * Get responsive typography token by key
 * 
 * @param key - Typography token key
 * @returns Responsive typography style object
 */
export const getResponsiveTypographyStyle = (key: TypographyKey) => {
  const responsive = getResponsiveTypography();
  return responsive[key];
};

/**
 * Cached responsive typography (calculated once, use getResponsiveTypography() for dynamic)
 * Use this for static components that don't need real-time updates
 */
export const responsiveTypography = getResponsiveTypography();

/**
 * Get current screen information for debugging and testing
 * Call this function to get up-to-date screen information
 */
export const getScreenInfo = () => {
  const { width, height } = getScreenDimensions();
  return {
    width,
    height,
    pixelRatio: getPixelRatio(),
    deviceType: getDeviceType(),
    scaleFactor: getScaleFactor(),
    platform: Platform.OS,
  };
};

/**
 * Cached screen info (use getScreenInfo() for dynamic)
 */
export const screenInfo = getScreenInfo();

/**
 * Check if device is an external monitor or large display
 */
export const isExternalMonitor = (): boolean => {
  const { width } = getScreenDimensions();
  return getDeviceType() === DeviceType.XLARGE || width >= 768;
};

/**
 * Check if device is high-DPI (Retina, 4K)
 */
export const isHighDPI = (): boolean => {
  return getPixelRatio() >= 2;
};

