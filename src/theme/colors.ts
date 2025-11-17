export const lightColors = {
  // Brand primary (Indigo)
  primary: '#2563EB', // Primary Indigo-500
  primaryDark: '#1D4ED8', // Indigo-600
  primaryLight: '#DBEAFE', // Indigo-100

  // Accent colors
  accent: '#22C55E', // Emerald-500, used for success / settle up
  accentAmber: '#F59E0B', // Amber-500, used for soft warnings / analytics
  accentPink: '#EC4899', // Pink-500, used for supporter badge / premium

  // Neutrals - light mode
  surfaceLight: '#F9FAFB', // Background
  surfaceCard: '#FFFFFF', // Card / elevated surface
  borderSubtle: '#E5E7EB',

  textPrimary: '#020617', // Slate-950
  textSecondary: '#6B7280', // Gray-500

  // Semantic
  success: '#16A34A', // Green-600
  error: '#EF4444', // Red-500
  info: '#3B82F6', // Blue-500

  white: '#FFFFFF',
  black: '#000000',
};

export const darkColors = {
  // Brand primary (Indigo) - same in dark mode
  primary: '#3B82F6', // Lighter Indigo for dark mode
  primaryDark: '#2563EB', // Primary Indigo-500
  primaryLight: '#1E3A8A', // Darker Indigo for dark mode

  // Accent colors - same
  accent: '#22C55E',
  accentAmber: '#F59E0B',
  accentPink: '#EC4899',

  // Neutrals - dark mode
  surfaceLight: '#0F172A', // Dark background (Slate-900)
  surfaceCard: '#1E293B', // Dark card (Slate-800)
  borderSubtle: '#334155', // Dark border (Slate-700)

  textPrimary: '#F1F5F9', // Light text (Slate-100)
  textSecondary: '#94A3B8', // Light secondary (Slate-400)

  // Semantic - same
  success: '#16A34A',
  error: '#EF4444',
  info: '#3B82F6',

  white: '#FFFFFF',
  black: '#000000',
};

// Default export for backward compatibility (light mode)
export const colors = lightColors;

export type ColorScheme = typeof lightColors;
