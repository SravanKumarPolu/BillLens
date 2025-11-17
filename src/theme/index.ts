/**
 * Central theme export
 * Combines colors and typography for easy imports
 */

export { colors } from './colors';
export { typography, getTypography, type TypographyKey } from './typography';

// Theme type for future dark mode support
export type Theme = 'light' | 'dark';

// Default theme
export const defaultTheme: Theme = 'light';

