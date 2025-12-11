/**
 * TypographyText Component
 * 
 * A wrapper component that ensures consistent typography usage across the app.
 * Provides type-safe access to typography tokens with automatic color application.
 * 
 * DESIGN PHILOSOPHY:
 * - Enforces typography system usage
 * - Prevents inline fontSize/fontWeight overrides
 * - Automatically applies theme colors
 * - Supports responsive typography
 * 
 * USAGE:
 * ```tsx
 * <TypographyText variant="h1" color="primary">
 *   Screen Title
 * </TypographyText>
 * 
 * <TypographyText variant="body" color="secondary">
 *   Description text
 * </TypographyText>
 * ```
 */

import React from 'react';
import { Text, TextProps, StyleSheet, TextStyle } from 'react-native';
import { typography, type TypographyKey } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsiveTypography } from '../hooks/useResponsiveTypography';

export interface TypographyTextProps extends Omit<TextProps, 'style'> {
  /**
   * Typography variant to use
   */
  variant: TypographyKey;
  
  /**
   * Color variant - uses theme colors automatically
   * - 'primary': textPrimary color
   * - 'secondary': textSecondary color
   * - 'accent': accent color
   * - 'error': error color
   * - 'success': success color
   * - 'white': white color
   * - Or any custom hex color
   */
  color?: 'primary' | 'secondary' | 'accent' | 'error' | 'success' | 'white' | string;
  
  /**
   * Whether to use responsive typography (adapts to screen size/DPI)
   * Default: true
   */
  responsive?: boolean;
  
  /**
   * Additional styles (merged with typography styles)
   */
  style?: TextStyle | TextStyle[];
  
  /**
   * Emphasis variant (bold, semibold, medium, italic)
   */
  emphasis?: 'bold' | 'semibold' | 'medium' | 'italic';
  
  /**
   * Text alignment
   */
  align?: 'left' | 'center' | 'right' | 'justify';
}

/**
 * TypographyText - Typography-aware text component
 * 
 * Automatically applies typography tokens, theme colors, and responsive scaling.
 * Prevents common mistakes like inline fontSize overrides.
 */
export const TypographyText: React.FC<TypographyTextProps> = ({
  variant,
  color = 'primary',
  responsive = true,
  style,
  emphasis,
  align,
  children,
  ...textProps
}) => {
  const { colors: themeColors } = useTheme();
  const responsiveTypography = useResponsiveTypography();
  
  // Get typography style (responsive or static)
  const typographyStyle = React.useMemo(() => {
    return responsive 
      ? responsiveTypography[variant] 
      : typography[variant];
  }, [responsive, variant, responsiveTypography]);
  
  // Resolve color
  const colorValue = React.useMemo(() => {
    if (typeof color === 'string' && color.startsWith('#')) {
      return color; // Custom hex color
    }
    
    const colorMap: Record<string, string> = {
      primary: themeColors.textPrimary,
      secondary: themeColors.textSecondary,
      accent: themeColors.accent,
      error: themeColors.error,
      success: themeColors.success,
      white: themeColors.white,
    };
    
    return colorMap[color] || themeColors.textPrimary;
  }, [color, themeColors]);
  
  // Build final style
  const finalStyle = React.useMemo(() => {
    const styles: TextStyle[] = [];
    
    // Add base typography style (ensure it's a TextStyle, not the emphasis object)
    if (typographyStyle && typeof typographyStyle === 'object' && 'fontSize' in typographyStyle) {
      styles.push(typographyStyle as TextStyle);
    }
    
    // Apply color
    if (colorValue) {
      styles.push({ color: colorValue });
    }
    
    // Apply emphasis
    if (emphasis) {
      const emphasisMap: Record<string, TextStyle> = {
        bold: { fontWeight: '700' as const },
        semibold: { fontWeight: '600' as const },
        medium: { fontWeight: '500' as const },
        italic: { fontStyle: 'italic' as const },
      };
      styles.push(emphasisMap[emphasis]);
    }
    
    // Apply alignment
    if (align) {
      styles.push({ textAlign: align });
    }
    
    // Apply custom styles (merged last)
    if (style) {
      if (Array.isArray(style)) {
        styles.push(...style);
      } else {
        styles.push(style);
      }
    }
    
    return styles.length === 1 ? styles[0] : styles;
  }, [typographyStyle, colorValue, emphasis, align, style]);
  
  return (
    <Text style={finalStyle} {...textProps}>
      {children}
    </Text>
  );
};

export default TypographyText;
