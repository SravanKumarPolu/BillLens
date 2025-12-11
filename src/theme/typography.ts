/**
 * BillLens Typography System
 * 
 * A comprehensive typographic hierarchy designed for clarity, readability, and visual balance.
 * Based on Inter/SF Pro design principles with mathematical scale relationships.
 * 
 * DESIGN PHILOSOPHY:
 * - Clear visual hierarchy through size, weight, and spacing
 * - Optimal readability with proper line heights (1.2x for headings, 1.5x for body)
 * - Consistent letter spacing for improved legibility
 * - Balanced spacing relationships using 4px base unit
 * 
 * TYPOGRAPHIC SCALE:
 * The scale follows a 1.25x (Major Third) ratio for harmonious size relationships:
 * - Display: 32px (largest, hero text)
 * - H1: 28px (screen titles)
 * - H2: 24px (section headers)
 * - H3: 20px (subsection headers)
 * - H4: 18px (card titles)
 * - Body Large: 16px (emphasized body)
 * - Body: 14px (primary body text)
 * - Body Small: 13px (secondary body)
 * - Caption: 12px (metadata, hints)
 * - Caption Small: 11px (fine print)
 * - Overline: 11px (labels above inputs)
 * 
 * LINE HEIGHT RATIOS:
 * - Headings: 1.2x (tighter for visual cohesion)
 * - Body: 1.5x (comfortable reading)
 * - Captions: 1.33x (compact but readable)
 * 
 * LETTER SPACING:
 * - Large text (28px+): -0.5px to -0.3px (tighter for elegance)
 * - Medium text (18-24px): -0.2px to 0px (neutral)
 * - Small text (<18px): 0px (natural spacing)
 * 
 * FONT WEIGHTS:
 * - 400: Regular (body text)
 * - 500: Medium (labels, emphasis)
 * - 600: Semibold (headings, buttons)
 * - 700: Bold (display, emphasis)
 */

// TextStyle type definition
// This matches React Native's TextStyle interface
// We define it here to avoid TypeScript module resolution issues
export interface TextStyle {
  fontSize?: number;
  fontWeight?: '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | 'normal' | 'bold';
  lineHeight?: number;
  letterSpacing?: number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textDecorationLine?: 'none' | 'underline' | 'line-through' | 'underline line-through';
  textAlign?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  color?: string;
  [key: string]: any; // Allow additional React Native style properties
}

/**
 * Font Family Note:
 * 
 * BillLens Brand Typography:
 * - Recommended: Inter or Satoshi (best for 2025 modern apps)
 * - React Native uses system fonts by default:
 *   - iOS: SF Pro (automatically uses correct weight variants)
 *   - Android: Roboto (automatically uses correct weight variants)
 * 
 * To use Inter or Satoshi:
 * 1. Install custom font: npm install react-native-fonts or use expo-font
 * 2. Add font files to assets/fonts/
 * 3. Configure in app.json or load programmatically
 * 4. Set fontFamily in typography tokens
 * 
 * System fonts are optimized for:
 * - Font smoothing (antialiasing)
 * - Subpixel rendering
 * - DPI scaling
 * - Platform-native appearance
 * 
 * The fontWeight prop handles weight variations, so we don't need to specify fontFamily
 * unless using custom fonts.
 * 
 * For external monitors:
 * - System fonts automatically adjust for DPI
 * - React Native handles font smoothing natively
 * - No additional CSS properties needed (unlike web)
 * 
 * Typography Scale (Tailwind-ready):
 * - App Title: text-3xl (28px) font-bold (700)
 * - Section Title: text-xl (20px) font-semibold (600)
 * - Body: text-base (16px) font-normal (400)
 * - Secondary: text-sm (14px) text-muted
 * - Caption: text-xs (12px) text-muted
 */

// Base typography tokens with proper mathematical relationships
export const typography = {
  // ============================================
  // DISPLAY & HEADINGS
  // ============================================
  
  /**
   * Display - Hero text, onboarding titles
   * Size: 32px | Weight: 700 | Line Height: 38px (1.19x)
   * Use: App name, major hero sections, welcome screens
   */
  display: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 38,
    letterSpacing: -0.5,
  },

  /**
   * H1 - Screen titles, primary headings
   * Size: 28px | Weight: 600 | Line Height: 34px (1.21x)
   * Use: Main screen titles, primary section headers
   */
  h1: {
    fontSize: 28,
    fontWeight: '600' as const,
    lineHeight: 34,
    letterSpacing: -0.5,
  },

  /**
   * H2 - Section headers, card group titles
   * Size: 24px | Weight: 600 | Line Height: 30px (1.25x)
   * Use: Section titles, group names, card headers
   */
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 30,
    letterSpacing: -0.3,
  },

  /**
   * H3 - Subsection headers, list item titles
   * Size: 20px | Weight: 600 | Line Height: 24px (1.2x)
   * Use: Subsection titles, expense titles, modal headers
   */
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 24,
    letterSpacing: -0.2,
  },

  /**
   * H4 - Card titles, emphasized labels
   * Size: 18px | Weight: 600 | Line Height: 22px (1.22x)
   * Use: Card titles, emphasized text, secondary headers
   */
  h4: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 22,
    letterSpacing: -0.1,
  },

  // ============================================
  // BODY TEXT
  // ============================================

  /**
   * Body Large - Emphasized body text, descriptions
   * Size: 16px | Weight: 400 | Line Height: 24px (1.5x)
   * Use: Important descriptions, taglines, emphasized paragraphs
   */
  bodyLarge: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    letterSpacing: 0,
  },

  /**
   * Body - Primary body text, default content
   * Size: 14px | Weight: 400 | Line Height: 21px (1.5x)
   * Use: Main content, descriptions, summaries
   */
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 21,
    letterSpacing: 0,
  },

  /**
   * Body Small - Secondary body text, metadata
   * Size: 13px | Weight: 400 | Line Height: 20px (1.54x)
   * Use: Secondary information, subtitles, helper text
   */
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 20,
    letterSpacing: 0,
  },

  // ============================================
  // LABELS & CAPTIONS
  // ============================================

  /**
   * Label - Form labels, section labels
   * Size: 14px | Weight: 500 | Line Height: 20px (1.43x)
   * Use: Input labels, section labels, filter labels
   */
  label: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
    letterSpacing: 0,
  },

  /**
   * Overline - Labels above inputs, category labels
   * Size: 11px | Weight: 600 | Line Height: 16px (1.45x)
   * Use: Input field labels, category tags, uppercase labels
   * Note: Typically used with textTransform: 'uppercase'
   */
  overline: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 16,
    letterSpacing: 0.5,
  },

  /**
   * Caption - Metadata, hints, timestamps
   * Size: 12px | Weight: 400 | Line Height: 16px (1.33x)
   * Use: Timestamps, metadata, helper text, fine details
   */
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
    letterSpacing: 0,
  },

  /**
   * Caption Small - Fine print, smallest text
   * Size: 11px | Weight: 400 | Line Height: 14px (1.27x)
   * Use: Legal text, disclaimers, very fine details
   */
  captionSmall: {
    fontSize: 11,
    fontWeight: '400' as const,
    lineHeight: 14,
    letterSpacing: 0,
  },

  // ============================================
  // INTERACTIVE ELEMENTS
  // ============================================

  /**
   * Button - Primary button text
   * Size: 16px | Weight: 600 | Line Height: 20px (1.25x)
   * Use: Button labels, primary CTAs
   */
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 20,
    letterSpacing: 0,
  },

  /**
   * Button Small - Secondary button text
   * Size: 14px | Weight: 600 | Line Height: 18px (1.29x)
   * Use: Small buttons, compact CTAs
   */
  buttonSmall: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 18,
    letterSpacing: 0,
  },

  /**
   * Link - Interactive link text
   * Size: 14px | Weight: 500 | Line Height: 20px (1.43x)
   * Use: Clickable links, navigation text
   */
  link: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
    letterSpacing: 0,
  },

  /**
   * Navigation - Back buttons, navigation text
   * Size: 16px | Weight: 400 | Line Height: 22px (1.38x)
   * Use: Back buttons, navigation labels, breadcrumbs
   * Note: Slightly larger than body for better touch targets and visibility
   */
  navigation: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 22,
    letterSpacing: 0,
  },

  // ============================================
  // FINANCIAL / MONEY DISPLAY
  // ============================================

  /**
   * Money Large - Hero amounts, totals
   * Size: 28px | Weight: 700 | Line Height: 34px (1.21x)
   * Use: Large financial displays, total amounts, hero numbers
   */
  moneyLarge: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
    letterSpacing: -0.3,
  },

  /**
   * Money - Standard amounts
   * Size: 18px | Weight: 600 | Line Height: 22px (1.22x)
   * Use: Expense amounts, balances, standard money display
   */
  money: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 22,
    letterSpacing: -0.1,
  },

  /**
   * Money Small - Compact amounts
   * Size: 14px | Weight: 600 | Line Height: 18px (1.29x)
   * Use: Small amounts, inline money, compact displays
   */
  moneySmall: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 18,
    letterSpacing: 0,
  },

  // ============================================
  // EMPHASIS VARIANTS
  // ============================================
  
  /**
   * Emphasis variants for body text
   * Use these to add emphasis without changing size
   */
  emphasis: {
    /**
     * Bold - Strong emphasis
     */
    bold: {
      fontWeight: '700' as const,
    },
    /**
     * Semibold - Medium emphasis
     */
    semibold: {
      fontWeight: '600' as const,
    },
    /**
     * Medium - Light emphasis
     */
    medium: {
      fontWeight: '500' as const,
    },
    /**
     * Italic - Stylistic emphasis
     */
    italic: {
      fontStyle: 'italic' as const,
    },
  },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get typography style by key
 * 
 * NOTE: 'emphasis' is excluded because it's not a complete TextStyle (it's an object
 * containing emphasis variants like bold, semibold, etc.). Use the 'emphasis' prop
 * on TypographyText component instead, or access typography.emphasis directly.
 */
export type TypographyKey = Exclude<keyof typeof typography, 'emphasis'>;
export const getTypography = (key: TypographyKey): TextStyle => typography[key] as TextStyle;

/**
 * Create text style with color
 */
export const createTextStyle = (
  typographyKey: TypographyKey,
  color?: string
): TextStyle => {
  const baseStyle = typography[typographyKey];
  return color ? { ...baseStyle, color } : baseStyle;
};

/**
 * Emphasis variants for body text (also available as typography.emphasis)
 * Use these to add emphasis without changing size
 */
export const emphasis = typography.emphasis;

/**
 * Text transform utilities
 */
export const textTransform = {
  uppercase: { textTransform: 'uppercase' as const },
  lowercase: { textTransform: 'lowercase' as const },
  capitalize: { textTransform: 'capitalize' as const },
  none: { textTransform: 'none' as const },
};

/**
 * Text decoration utilities
 */
export const textDecoration = {
  underline: { textDecorationLine: 'underline' as const },
  strikethrough: { textDecorationLine: 'line-through' as const },
  none: { textDecorationLine: 'none' as const },
};

/**
 * Text alignment utilities
 */
export const textAlign = {
  left: { textAlign: 'left' as const },
  center: { textAlign: 'center' as const },
  right: { textAlign: 'right' as const },
  justify: { textAlign: 'justify' as const },
};

// ============================================
// SPACING UTILITIES
// ============================================

/**
 * Vertical spacing between typographic elements
 * Based on 4px base unit for consistent rhythm
 */
export const typographySpacing = {
  /**
   * Tight spacing - 4px (between related elements)
   */
  tight: 4,
  /**
   * Default spacing - 8px (between body paragraphs)
   */
  default: 8,
  /**
   * Comfortable spacing - 12px (between sections)
   */
  comfortable: 12,
  /**
   * Loose spacing - 16px (between major sections)
   */
  loose: 16,
  /**
   * Extra loose spacing - 24px (between major content blocks)
   */
  extraLoose: 24,
};

/**
 * Recommended spacing between typographic elements
 * 
 * Headings:
 * - After H1: 16px
 * - After H2: 12px
 * - After H3: 8px
 * - After H4: 8px
 * 
 * Body:
 * - Between paragraphs: 8px
 * - After body before heading: 16px
 * 
 * Lists:
 * - Between items: 8px
 * - After list: 12px
 */
export const recommendedSpacing = {
  afterHeading1: typographySpacing.loose,
  afterHeading2: typographySpacing.comfortable,
  afterHeading3: typographySpacing.default,
  afterHeading4: typographySpacing.default,
  betweenParagraphs: typographySpacing.default,
  afterBodyBeforeHeading: typographySpacing.loose,
  betweenListItems: typographySpacing.default,
  afterList: typographySpacing.comfortable,
  // Direct access to spacing values for convenience
  ...typographySpacing,
};
