/**
 * BillLens Spacing System
 * 
 * Tailwind/DaisyUI-inspired spacing tokens for consistent, pixel-perfect layouts
 * Based on 4px base unit for harmonious spacing relationships
 * 
 * Usage:
 * import { spacing } from '../theme/spacing';
 * 
 * padding: spacing[4]  // 16px
 * marginBottom: spacing[6]  // 24px
 */

/**
 * Spacing scale (4px base unit)
 * Matches Tailwind spacing scale for familiarity
 */
export const spacing = {
  0: 0,
  1: 4,    // 4px - tight spacing
  2: 8,    // 8px - default spacing
  3: 12,   // 12px - comfortable spacing
  4: 16,   // 16px - loose spacing
  5: 20,   // 20px - extra loose
  6: 24,   // 24px - section spacing
  8: 32,   // 32px - large section spacing
  10: 40,  // 40px - extra large spacing
  12: 48,  // 48px - hero spacing
  16: 64,  // 64px - maximum spacing
  20: 80,  // 80px - extreme spacing
} as const;

/**
 * Semantic spacing tokens (DaisyUI-inspired)
 * Use these for consistent spacing patterns
 */
export const semanticSpacing = {
  // Component spacing
  componentPadding: spacing[4],      // 16px - standard component padding
  componentGap: spacing[3],          // 12px - gap between components
  cardPadding: spacing[4],            // 16px - card internal padding
  cardGap: spacing[4],                // 16px - gap between cards
  
  // Section spacing
  sectionSpacing: spacing[6],         // 24px - between major sections
  subsectionSpacing: spacing[4],     // 16px - between subsections
  contentSpacing: spacing[3],         // 12px - between content items
  
  // Screen spacing
  screenPadding: spacing[6],          // 24px - screen horizontal padding
  screenTopPadding: spacing[8],      // 32px - screen top padding (safe area)
  screenBottomPadding: spacing[6],   // 24px - screen bottom padding
  
  // List spacing
  listItemSpacing: spacing[3],       // 12px - between list items
  listSectionSpacing: spacing[6],   // 24px - between list sections
  
  // Form spacing
  formFieldSpacing: spacing[4],      // 16px - between form fields
  formGroupSpacing: spacing[6],     // 24px - between form groups
  inputPadding: spacing[3],          // 12px - input internal padding
  
  // Button spacing
  buttonPadding: spacing[4],          // 16px - button padding
  buttonGap: spacing[2],              // 8px - gap between buttons
  buttonGroupGap: spacing[3],         // 12px - gap in button groups
  
  // Navigation spacing
  navItemSpacing: spacing[2],         // 8px - between nav items
  navSectionSpacing: spacing[6],     // 24px - between nav sections
  
  // Modal/Dialog spacing
  modalPadding: spacing[6],           // 24px - modal padding
  modalHeaderSpacing: spacing[4],     // 16px - modal header spacing
  modalFooterSpacing: spacing[4],    // 16px - modal footer spacing
} as const;

/**
 * Responsive spacing (adjusts for screen size)
 */
export const getResponsiveSpacing = (baseSpacing: number, scaleFactor = 1.0): number => {
  return Math.round(baseSpacing * scaleFactor);
};

/**
 * Spacing utilities for common patterns
 */
export const spacingUtils = {
  /**
   * Get spacing for container padding
   */
  container: {
    padding: semanticSpacing.screenPadding,
    paddingHorizontal: semanticSpacing.screenPadding,
    paddingVertical: semanticSpacing.sectionSpacing,
  },
  
  /**
   * Get spacing for card
   */
  card: {
    padding: semanticSpacing.cardPadding,
    marginBottom: semanticSpacing.cardGap,
  },
  
  /**
   * Get spacing for section
   */
  section: {
    marginBottom: semanticSpacing.sectionSpacing,
    paddingHorizontal: semanticSpacing.screenPadding,
  },
  
  /**
   * Get spacing for form
   */
  form: {
    fieldSpacing: semanticSpacing.formFieldSpacing,
    groupSpacing: semanticSpacing.formGroupSpacing,
  },
  
  /**
   * Get spacing for list
   */
  list: {
    itemSpacing: semanticSpacing.listItemSpacing,
    sectionSpacing: semanticSpacing.listSectionSpacing,
  },
} as const;

export type SpacingKey = keyof typeof spacing;
export type SemanticSpacingKey = keyof typeof semanticSpacing;
