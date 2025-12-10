export const lightColors = {
  // Brand primary (BillLens Indigo-600)
  primary: '#4F46E5', // --bl-primary: Primary brand color
  primaryDark: '#4338CA', // Indigo-700 for pressed states
  primaryLight: '#A5B4FC', // --bl-primary-light: Subtle accents

  // Accent colors
  accent: '#10B981', // --bl-success: Emerald-500, used for success / settle up
  accentAmber: '#F59E0B', // --bl-warning: Amber-500, used for soft warnings / analytics
  accentPink: '#EC4899', // Pink-500, used for supporter badge / premium

  // Neutrals - light mode
  surfaceLight: '#F7F8FE', // --bl-bg: Background
  surfaceCard: '#FFFFFF', // --bl-card: Card / elevated surface
  borderSubtle: '#E5E7EB',

  textPrimary: '#1F2937', // --bl-text: Primary text
  textSecondary: '#6B7280', // --bl-text-muted: Secondary text

  // Semantic
  success: '#10B981', // --bl-success: Settled, success states
  error: '#EF4444', // --bl-error: Errors, negative states
  warning: '#F59E0B', // --bl-warning: Alerts, warnings
  info: '#3B82F6', // Blue-500 for info

  white: '#FFFFFF',
  black: '#000000',
};

export const darkColors = {
  // Brand primary (BillLens - lighter for dark mode)
  primary: '#A5B4FC', // --bl-primary: Lighter Indigo for dark mode visibility
  primaryDark: '#4338CA', // --bl-primary-dark: Darker Indigo for contrast
  primaryLight: '#6366F1', // Indigo-500 for dark mode accents

  // Accent colors - same
  accent: '#10B981', // --bl-success
  accentAmber: '#F59E0B', // --bl-warning
  accentPink: '#EC4899',

  // Neutrals - dark mode
  surfaceLight: '#0F0F14', // --bl-bg: Dark background
  surfaceCard: '#1B1B22', // --bl-card: Dark card
  borderSubtle: '#2A2A35', // Dark border

  textPrimary: '#F3F4F6', // --bl-text: Light text
  textSecondary: '#A2A2B5', // --bl-text-muted: Light secondary text

  // Semantic - same
  success: '#10B981', // --bl-success
  error: '#EF4444', // --bl-error
  warning: '#F59E0B', // --bl-warning
  info: '#3B82F6',

  white: '#FFFFFF',
  black: '#000000',
};

// Default export for backward compatibility (light mode)
export const colors = lightColors;

export type ColorScheme = typeof lightColors;
