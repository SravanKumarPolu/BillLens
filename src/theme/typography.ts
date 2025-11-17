/**
 * BillLens Typography System
 * 
 * Based on Inter/SF Pro design principles:
 * - Clean, geometric sans-serif
 * - Compact and trustworthy
 * - No decorative quirks
 */

export const typography = {
  // Headings
  h1: {
    fontSize: 28,
    fontWeight: '600' as const,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  h4: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
  },

  // Body text
  bodyLarge: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
  },

  // Labels and captions
  label: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
  },
  captionSmall: {
    fontSize: 11,
    fontWeight: '500' as const,
    lineHeight: 14,
  },

  // Special cases
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 20,
  },
  buttonSmall: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  money: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  moneyLarge: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 30,
  },
};

// Helper to get text style
export type TypographyKey = keyof typeof typography;
export const getTypography = (key: TypographyKey) => typography[key];

