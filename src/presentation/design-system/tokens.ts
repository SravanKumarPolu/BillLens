/**
 * BillLens design tokens.
 *
 * Single source of truth for colour, typography, spacing, radius, shadow,
 * motion and layout constants. Tokens are framework-agnostic plain objects
 * so they can be consumed by the theme, by tests, and (in future) by a
 * web dashboard without pulling in React Native.
 *
 * Hard rules:
 *   - Components MUST NOT hard-code raw colour/spacing values — they read
 *     everything from the theme, which is built from these tokens.
 *   - Financial amounts always use `tabular-nums` (see typography.amount*).
 *   - Touch targets respect `touchTargets.minimum` (44pt) for accessibility.
 */

import type { TextStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Colour tokens
// ---------------------------------------------------------------------------

/**
 * Resolved colour palette for a single theme (light or dark).
 *
 * Semantic colours (positive / negative / warning / critical / info) are
 * identical in both themes — they are chosen to remain legible on both
 * light surfaces and dark surfaces. Only the neutral scaffolding
 * (background / surface / text / border) flips between themes.
 */
export interface ColorTokens {
  // Surfaces
  readonly background: string;
  readonly surface: string;
  readonly surfaceElevated: string;
  readonly surfaceMuted: string;

  // Text
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textOnColor: string;

  // Borders
  readonly border: string;
  readonly borderStrong: string;

  // Semantic
  readonly positive: string;
  readonly negative: string;
  readonly warning: string;
  readonly critical: string;
  readonly info: string;

  // Confidence (extraction confidence bands)
  readonly confidenceHigh: string;
  readonly confidenceMedium: string;
  readonly confidenceLow: string;
  readonly confidenceUnknown: string;

  // Sync state
  readonly syncPending: string;
  readonly syncFailed: string;
  readonly syncComplete: string;

  // Brand
  readonly brandPrimary: string;
  readonly brandSecondary: string;

  // Overlays
  readonly overlay: string;
  readonly scrim: string;
}

/**
 * Light theme colours.
 *
 * The neutrals lean warm (ivory + slate) rather than cool (pure white +
 * gray) — the "classic and elegant" intent of the brief: refined
 * typography over balanced whitespace, a palette that conveys quality
 * rather than flash. Backgrounds are a warm off-white; text is deep
 * slate; the brand accent is a deeper indigo than a typical SaaS
 * app — closer to ink than to neon.
 */
export const lightColors: ColorTokens = {
  background: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F2EEE8',

  textPrimary: '#1A1B25',
  textSecondary: '#5A5D6B',
  textMuted: '#9B9EA8',
  textOnColor: '#FFFFFF',

  border: '#E8E2D8',
  borderStrong: '#D6CFC2',

  positive: '#3F7A5E',
  negative: '#A8323C',
  warning: '#B07A1E',
  critical: '#7A1E26',
  info: '#2E5B9A',

  confidenceHigh: '#3F7A5E',
  confidenceMedium: '#B07A1E',
  confidenceLow: '#A8323C',
  confidenceUnknown: '#5A5D6B',

  syncPending: '#B07A1E',
  syncFailed: '#A8323C',
  syncComplete: '#3F7A5E',

  brandPrimary: '#2B3A8C',
  brandSecondary: '#5A3B92',

  overlay: 'rgba(26,27,37,0.4)',
  scrim: 'rgba(26,27,37,0.6)',
};

/**
 * Dark theme colours. Backgrounds are deep warm-slate; text is near-white
 * (a soft ivory, not pure white, so it does not glare at night).
 * Semantic / confidence / sync / brand colours are IDENTICAL to the
 * light mode — they are calibrated for legibility on both surfaces
 * (the same design invariant as the original palette). The dark mode
 * mirrors the light mode's "classic and elegant" intent: restrained,
 * not flashy.
 */
export const darkColors: ColorTokens = {
  background: '#15161D',
  surface: '#1F1F29',
  surfaceElevated: '#2A2A36',
  surfaceMuted: '#1A1A22',

  textPrimary: '#F4F1EA',
  textSecondary: '#C7C3B7',
  textMuted: '#84827D',
  textOnColor: '#FFFFFF',

  border: '#2D2D3A',
  borderStrong: '#3D3D4C',

  positive: '#3F7A5E',
  negative: '#A8323C',
  warning: '#B07A1E',
  critical: '#7A1E26',
  info: '#2E5B9A',

  confidenceHigh: '#3F7A5E',
  confidenceMedium: '#B07A1E',
  confidenceLow: '#A8323C',
  confidenceUnknown: '#84827D',

  syncPending: '#B07A1E',
  syncFailed: '#A8323C',
  syncComplete: '#3F7A5E',

  brandPrimary: '#2B3A8C',
  brandSecondary: '#5A3B92',

  overlay: 'rgba(21,22,29,0.4)',
  scrim: 'rgba(21,22,29,0.6)',
};

// ---------------------------------------------------------------------------
// Typography tokens
// ---------------------------------------------------------------------------

/**
 * Named text styles. Each entry is a full React Native `TextStyle` so it can
 * be spread directly onto a `<Text>` element.
 *
 * Amount styles carry `fontVariant: ['tabular-nums']` so that figures align
 * in columns — critical for financial lists where digits must stack.
 */
export interface TypographyTokens {
  readonly display: TextStyle;
  readonly screenTitle: TextStyle;
  readonly sectionTitle: TextStyle;
  readonly cardTitle: TextStyle;
  readonly body: TextStyle;
  readonly bodyStrong: TextStyle;
  readonly caption: TextStyle;
  readonly label: TextStyle;
  readonly amountLarge: TextStyle;
  readonly amountMedium: TextStyle;
  readonly amountSmall: TextStyle;
  readonly button: TextStyle;
  readonly input: TextStyle;
  readonly error: TextStyle;
}

export const typography: TypographyTokens = {
  display: { fontSize: 36, fontWeight: '700', letterSpacing: -0.5, lineHeight: 40 },
  screenTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3, lineHeight: 34 },
  sectionTitle: { fontSize: 20, fontWeight: '600', lineHeight: 26 },
  cardTitle: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, lineHeight: 16 },
  amountLarge: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
  amountMedium: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  amountSmall: { fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  button: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  input: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  error: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
};

// ---------------------------------------------------------------------------
// Spacing tokens
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export type SpacingKey = keyof typeof spacing;

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

export const borderRadius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export type BorderRadiusKey = keyof typeof borderRadius;

// ---------------------------------------------------------------------------
// Shadows (elevation)
// ---------------------------------------------------------------------------

export interface ShadowTokens {
  readonly none: { shadowOpacity: 0; shadowRadius: 0; elevation: 0 };
  readonly sm: {
    shadowOpacity: 0.05;
    shadowRadius: 3;
    shadowOffset: { width: 0; height: 1 };
    elevation: 2;
  };
  readonly md: {
    shadowOpacity: 0.08;
    shadowRadius: 6;
    shadowOffset: { width: 0; height: 2 };
    elevation: 4;
  };
  readonly lg: {
    shadowOpacity: 0.12;
    shadowRadius: 12;
    shadowOffset: { width: 0; height: 4 };
    elevation: 8;
  };
}

export const shadows: ShadowTokens = {
  none: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  sm: {
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  lg: {
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
};

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export const motion = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: { damping: 15, stiffness: 150 },
} as const;

// ---------------------------------------------------------------------------
// Other tokens
// ---------------------------------------------------------------------------

export const opacity = {
  disabled: 0.4,
  muted: 0.6,
  active: 1,
} as const;

export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export const touchTargets = {
  minimum: 44,
  comfortable: 48,
} as const;

export const layoutWidth = {
  maxContent: 600,
  maxForm: 480,
} as const;

export const breakpoints = {
  small: 320,
  medium: 375,
  large: 414,
  tablet: 768,
} as const;

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  modal: 1200,
  toast: 1300,
} as const;
