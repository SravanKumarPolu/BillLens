/**
 * Glassmorphism Design Tokens
 * 
 * Modern glassmorphism effects for BillLens UI components
 * Provides subtle, elegant transparency effects
 */

import { ViewStyle } from 'react-native';

export interface GlassmorphismStyle {
  backgroundColor: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation?: number;
  overflow: 'hidden';
}

/**
 * Glassmorphism tokens (CSS variables equivalent)
 */
export const glassTokens = {
  // Background with transparency
  glassBg: 'rgba(255, 255, 255, 0.15)',
  glassBgDark: 'rgba(27, 27, 34, 0.6)',
  
  // Border
  glassBorder: 'rgba(255, 255, 255, 0.2)',
  glassBorderDark: 'rgba(255, 255, 255, 0.1)',
  
  // Border radius
  glassRadius: 18,
  
  // Shadow
  glassShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 25,
    elevation: 8,
  },
};

/**
 * Create glassmorphism style for light mode
 */
export const createGlassStyle = (isDark = false): GlassmorphismStyle => {
  return {
    backgroundColor: isDark ? glassTokens.glassBgDark : glassTokens.glassBg,
    borderWidth: 1,
    borderColor: isDark ? glassTokens.glassBorderDark : glassTokens.glassBorder,
    borderRadius: glassTokens.glassRadius,
    ...glassTokens.glassShadow,
    overflow: 'hidden',
  };
};

/**
 * Glassmorphism style for cards
 */
export const glassCard: ViewStyle = {
  backgroundColor: glassTokens.glassBg,
  borderWidth: 1,
  borderColor: glassTokens.glassBorder,
  borderRadius: glassTokens.glassRadius,
  ...glassTokens.glassShadow,
  overflow: 'hidden',
};

/**
 * Glassmorphism style for buttons
 */
export const glassButton: ViewStyle = {
  backgroundColor: glassTokens.glassBg,
  borderWidth: 1,
  borderColor: glassTokens.glassBorder,
  borderRadius: 999, // Fully rounded
  ...glassTokens.glassShadow,
  overflow: 'hidden',
};

/**
 * Glassmorphism style for modals
 */
export const glassModal: ViewStyle = {
  backgroundColor: glassTokens.glassBg,
  borderWidth: 1,
  borderColor: glassTokens.glassBorder,
  borderRadius: 24,
  ...glassTokens.glassShadow,
  overflow: 'hidden',
};
