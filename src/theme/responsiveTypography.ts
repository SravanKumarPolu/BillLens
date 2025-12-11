/**
 * Responsive Typography System
 * 
 * Optimized for external monitors and various screen sizes/DPIs
 * 
 * Features:
 * - Enhanced DPI-aware scaling for external monitors
 * - Screen size responsive adjustments with diagonal-based scaling
 * - Minimum readable sizes (WCAG AA compliant)
 * - Maximum size constraints to prevent text from becoming too large
 * - Automatic optimization for low-DPI, standard, and high-DPI external monitors
 * - Accessibility-first approach (WCAG AA compliant)
 * 
 * External Monitor Optimization:
 * - Low DPI (< 1.5): 1.15-1.25x scaling for readability
 * - Standard (1.5-2.0): 1.1-1.15x scaling
 * - High-DPI 4K (> 2.5): 1.05x scaling
 * - Maximum scaling capped at 1.35x to maintain hierarchy
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
 * Enhanced algorithm for external monitor readability:
 * - Low DPI external monitors (< 1.5): Aggressive scaling (1.15-1.25x)
 * - Standard external monitors (1.5-2.0): Moderate scaling (1.1-1.15x)
 * - High-DPI 4K monitors (> 2.5): Conservative scaling (1.05-1.1x)
 * 
 * This ensures optimal readability across all external monitor configurations
 * while maintaining visual hierarchy and preventing text from becoming too large.
 */
export const getScaleFactor = (): number => {
  const deviceType = getDeviceType();
  const pixelRatio = getPixelRatio();
  const { width, height } = getScreenDimensions();
  
  // Base scaling factors by device type
  const scaleFactors: Record<DeviceType, number> = {
    [DeviceType.SMALL]: 1.0,      // Small phones: no scaling
    [DeviceType.MEDIUM]: 1.0,     // Standard phones: no scaling
    [DeviceType.LARGE]: 1.05,     // Tablets: slight increase
    [DeviceType.XLARGE]: 1.0,     // External monitors: base (will be overridden by DPI-specific values)
  };
  
  // For external monitors, use DPI-specific scale factors directly (not multiplied by base)
  // These match the documented scale factors in TYPOGRAPHY_GUIDE.md
  if (deviceType === DeviceType.XLARGE) {
    // Calculate screen diagonal (approximate) for better scaling decisions
    // Account for pixel ratio: convert logical pixels to physical pixels, then to inches
    // Physical pixels = logical pixels * pixelRatio
    // Diagonal in inches = sqrt((width * pixelRatio)^2 + (height * pixelRatio)^2) / DPI
    // Using 96 DPI as standard reference, but accounting for pixel ratio
    const physicalWidth = width * pixelRatio;
    const physicalHeight = height * pixelRatio;
    const diagonal = Math.sqrt(physicalWidth * physicalWidth + physicalHeight * physicalHeight) / 96;
    
    // Low DPI external monitor (< 1.5 pixel ratio)
    // Common on older or budget external monitors
    if (pixelRatio < 1.5) {
      // Scale more aggressively for larger screens with low DPI
      if (diagonal > 27) {
        return 1.25; // Large low-DPI monitor (27"+)
      } else {
        return 1.15; // Standard low-DPI monitor
      }
    }
    // Standard external monitor (1.5 - 2.0 pixel ratio)
    // Most common external monitor configuration
    else if (pixelRatio >= 1.5 && pixelRatio <= 2.0) {
      if (diagonal > 27) {
        return 1.15; // Large standard monitor
      } else {
        return 1.1; // Standard monitor
      }
    }
    // High-DPI 4K monitor (> 2.5 pixel ratio)
    // Retina-class displays, 4K monitors
    else if (pixelRatio > 2.5) {
      // 4K monitors have high pixel density, less scaling needed
      return 1.05;
    }
    // Very high-DPI (2.0 - 2.5)
    // QHD+ or high-resolution displays
    else {
      return 1.08;
    }
  }
  
  // For non-XLARGE devices, use base scale factors
  const finalScale = scaleFactors[deviceType];
  
  // Cap maximum scaling to prevent text from becoming too large
  // Maximum 1.35x for very large, low-DPI external monitors
  return Math.min(finalScale, 1.35);
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
  navigation: {
    ...typography.navigation,
    fontSize: getResponsiveFontSize(16, 16, 20),
    lineHeight: getResponsiveFontSize(22, 22, 28),
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
    // Safely access emphasis - it should always be available, but add a fallback for safety
    emphasis: typography.emphasis || {
      bold: { fontWeight: '700' as const },
      semibold: { fontWeight: '600' as const },
      medium: { fontWeight: '500' as const },
      italic: { fontStyle: 'italic' as const },
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
 * 
 * NOTE: Lazily initialized to avoid module initialization order issues with typography.emphasis
 */
let _cachedResponsiveTypography: ReturnType<typeof getResponsiveTypography> | null = null;

function getCachedResponsiveTypography(): ReturnType<typeof getResponsiveTypography> {
  if (!_cachedResponsiveTypography) {
    _cachedResponsiveTypography = getResponsiveTypography();
  }
  return _cachedResponsiveTypography;
}

export const responsiveTypography = new Proxy({} as ReturnType<typeof getResponsiveTypography>, {
  get(target, prop) {
    const cached = getCachedResponsiveTypography();
    const value = cached[prop as keyof typeof cached];
    // If accessing a nested object (like emphasis), return it directly
    if (typeof value === 'object' && value !== null) {
      return value;
    }
    return value;
  },
  ownKeys() {
    return Object.keys(getCachedResponsiveTypography());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Object.getOwnPropertyDescriptor(getCachedResponsiveTypography(), prop);
  },
  has(target, prop) {
    return prop in getCachedResponsiveTypography();
  },
});

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

