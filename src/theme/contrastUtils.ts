/**
 * Contrast Utilities
 * 
 * WCAG AA Compliance: 4.5:1 for normal text, 3:1 for large text (18px+)
 * 
 * Functions to calculate and verify color contrast ratios for accessibility
 */

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  
  // Handle 3-digit hex
  if (cleanHex.length === 3) {
    return {
      r: parseInt(cleanHex[0] + cleanHex[0], 16),
      g: parseInt(cleanHex[1] + cleanHex[1], 16),
      b: parseInt(cleanHex[2] + cleanHex[2], 16),
    };
  }
  
  // Handle 6-digit hex
  if (cleanHex.length === 6) {
    return {
      r: parseInt(cleanHex.substring(0, 2), 16),
      g: parseInt(cleanHex.substring(2, 4), 16),
      b: parseInt(cleanHex.substring(4, 6), 16),
    };
  }
  
  return null;
}

/**
 * Calculate relative luminance (WCAG formula)
 * 
 * Normalize RGB values to 0-1, then apply gamma correction
 */
function getRelativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const normalize = (value: number) => {
    const val = value / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };
  
  const r = normalize(rgb.r);
  const g = normalize(rgb.g);
  const b = normalize(rgb.b);
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 * 
 * Formula: (L1 + 0.05) / (L2 + 0.05)
 * where L1 is the lighter color and L2 is the darker color
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  if (!rgb1 || !rgb2) {
    console.warn(`Invalid color format: ${color1} or ${color2}`);
    return 1; // Return minimum contrast if colors invalid
  }
  
  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);
  
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG AA standards
 * 
 * @param fontSize - Font size in pixels (determines if text is "large")
 * @param contrastRatio - Calculated contrast ratio
 * @returns Object with pass status and level achieved
 */
export function meetsWCAGAA(
  contrastRatio: number,
  fontSize: number = 14
): { pass: boolean; level: 'AAA' | 'AA' | 'AA-Large' | 'Fail'; ratio: number } {
  const isLargeText = fontSize >= 18; // Large text threshold (or 14px bold)
  
  // WCAG AAA
  const aaaNormal = contrastRatio >= 7;
  const aaaLarge = contrastRatio >= 4.5 && isLargeText;
  
  // WCAG AA
  const aaNormal = contrastRatio >= 4.5;
  const aaLarge = contrastRatio >= 3 && isLargeText;
  
  if (aaaNormal || aaaLarge) {
    return { pass: true, level: 'AAA', ratio: contrastRatio };
  }
  
  if (aaNormal) {
    return { pass: true, level: 'AA', ratio: contrastRatio };
  }
  
  if (aaLarge) {
    return { pass: true, level: 'AA-Large', ratio: contrastRatio };
  }
  
  return { pass: false, level: 'Fail', ratio: contrastRatio };
}

/**
 * Verify text color contrast against background
 */
export function verifyTextContrast(
  textColor: string,
  backgroundColor: string,
  fontSize: number = 14
): {
  contrastRatio: number;
  wcag: ReturnType<typeof meetsWCAGAA>;
  recommendation?: string;
} {
  const contrastRatio = getContrastRatio(textColor, backgroundColor);
  const wcag = meetsWCAGAA(contrastRatio, fontSize);
  
  let recommendation: string | undefined;
  
  if (!wcag.pass) {
    recommendation = `Contrast ratio ${contrastRatio.toFixed(2)}:1 is insufficient. `;
    if (fontSize < 18) {
      recommendation += `Increase contrast or use larger text (18px+) for better readability.`;
    } else {
      recommendation += `Increase contrast for accessibility compliance.`;
    }
  }
  
  return {
    contrastRatio,
    wcag,
    recommendation,
  };
}

/**
 * Get accessible text color for a background
 * 
 * Tries to find the best text color (primary or secondary) for a given background
 */
export function getAccessibleTextColor(
  backgroundColor: string,
  options: { primary: string; secondary: string }
): {
  color: string;
  variant: 'primary' | 'secondary';
  contrastRatio: number;
  wcag: ReturnType<typeof meetsWCAGAA>;
} {
  const primaryContrast = getContrastRatio(options.primary, backgroundColor);
  const secondaryContrast = getContrastRatio(options.secondary, backgroundColor);
  
  // Prefer primary if it meets WCAG AA, otherwise use secondary if it does
  const primaryWCAG = meetsWCAGAA(primaryContrast, 14);
  const secondaryWCAG = meetsWCAGAA(secondaryContrast, 14);
  
  if (primaryWCAG.pass) {
    return {
      color: options.primary,
      variant: 'primary',
      contrastRatio: primaryContrast,
      wcag: primaryWCAG,
    };
  }
  
  if (secondaryWCAG.pass) {
    return {
      color: options.secondary,
      variant: 'secondary',
      contrastRatio: secondaryContrast,
      wcag: secondaryWCAG,
    };
  }
  
  // If neither passes, use the one with higher contrast
  if (primaryContrast >= secondaryContrast) {
    return {
      color: options.primary,
      variant: 'primary',
      contrastRatio: primaryContrast,
      wcag: primaryWCAG,
    };
  }
  
  return {
    color: options.secondary,
    variant: 'secondary',
    contrastRatio: secondaryContrast,
    wcag: secondaryWCAG,
  };
}

