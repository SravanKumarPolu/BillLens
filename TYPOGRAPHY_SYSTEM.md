# BillLens Typography System

## Overview

The BillLens typography system is designed to create a clear, readable, and visually harmonious hierarchy that guides users naturally through content. Every typographic decision is intentional and based on mathematical relationships, accessibility principles, and visual design best practices.

---

## Design Philosophy

### Core Principles

1. **Visual Hierarchy**: Clear distinction between headings, body text, and captions through size, weight, and spacing
2. **Readability First**: Optimal line heights and letter spacing for comfortable reading
3. **Mathematical Harmony**: Size relationships follow a 1.25x (Major Third) scale ratio
4. **Consistent Rhythm**: Spacing based on 4px base unit for visual consistency
5. **Accessibility**: Sufficient contrast and size for all users

---

## Typographic Scale

### Size Relationships

The typography scale follows a **1.25x (Major Third)** ratio, creating harmonious size relationships:

```
Display:  32px  (2.29x base)
H1:       28px  (2.00x base)
H2:       24px  (1.71x base)
H3:       20px  (1.43x base)
H4:       18px  (1.29x base)
Body Lg:  16px  (1.14x base)
Body:     14px  (1.00x base) ← Base size
Body Sm:  13px  (0.93x base)
Caption:  12px  (0.86x base)
Caption Sm: 11px (0.79x base)
```

**Base size**: 14px (Body) - This is the foundation from which all other sizes derive.

### Why 1.25x Ratio?

- **Harmonious**: Creates natural, pleasing size relationships
- **Distinct**: Each level is clearly different from adjacent levels
- **Scalable**: Works well across different screen sizes
- **Industry Standard**: Used by major design systems (Material Design, Human Interface Guidelines)

---

## Line Height Strategy

### Line Height Ratios

Line heights are calculated to optimize readability:

| Category | Ratio | Rationale |
|----------|-------|-----------|
| **Headings** | 1.2x | Tighter spacing creates visual cohesion and prevents headings from feeling disconnected |
| **Body Text** | 1.5x | Comfortable reading line height, prevents eye strain |
| **Captions** | 1.33x | Compact but still readable for secondary information |

### Examples

- **H1 (28px)**: Line height 34px (1.21x) - Tight but readable
- **Body (14px)**: Line height 21px (1.5x) - Comfortable reading
- **Caption (12px)**: Line height 16px (1.33x) - Compact metadata

---

## Letter Spacing

### Strategy by Size

Letter spacing is adjusted based on text size to improve legibility:

| Size Range | Letter Spacing | Rationale |
|------------|----------------|-----------|
| **28px+** | -0.5px to -0.3px | Large text benefits from tighter spacing for elegance |
| **18-24px** | -0.2px to 0px | Neutral spacing, slight tightening for medium text |
| **<18px** | 0px | Natural spacing, no adjustment needed |

### Why Negative Letter Spacing?

- **Visual Cohesion**: Tighter spacing makes large text feel more unified
- **Modern Aesthetic**: Creates a contemporary, refined look
- **Readability**: At larger sizes, negative spacing doesn't hurt readability
- **Balance**: Compensates for visual weight of larger text

---

## Font Weight Hierarchy

### Weight Usage

| Weight | Value | Use Cases |
|--------|-------|-----------|
| **Regular (400)** | Normal | Body text, captions, default content |
| **Medium (500)** | Slightly bold | Labels, links, subtle emphasis |
| **Semibold (600)** | Bold | Headings, buttons, money amounts |
| **Bold (700)** | Very bold | Display text, hero amounts, strong emphasis |

### Weight Guidelines

- **Headings**: Always 600 (semibold) for clear hierarchy
- **Body**: Always 400 (regular) for comfortable reading
- **Buttons**: 600 (semibold) for clear call-to-action
- **Money**: 600-700 depending on size for financial emphasis

---

## Typography Tokens Reference

### Display & Headings

#### `display` - Hero Text
- **Size**: 32px
- **Weight**: 700 (Bold)
- **Line Height**: 38px
- **Use**: App name, major hero sections, welcome screens
- **Example**: "BillLens" on welcome screen

#### `h1` - Screen Titles
- **Size**: 28px
- **Weight**: 600 (Semibold)
- **Line Height**: 34px
- **Use**: Main screen titles, primary section headers
- **Example**: "Your Groups" screen title

#### `h2` - Section Headers
- **Size**: 24px
- **Weight**: 600 (Semibold)
- **Line Height**: 30px
- **Use**: Section titles, group names, card headers
- **Example**: Group name in group detail screen

#### `h3` - Subsection Headers
- **Size**: 20px
- **Weight**: 600 (Semibold)
- **Line Height**: 24px
- **Use**: Subsection titles, expense titles, modal headers
- **Example**: "Recent Expenses" section title

#### `h4` - Card Titles
- **Size**: 18px
- **Weight**: 600 (Semibold)
- **Line Height**: 22px
- **Use**: Card titles, emphasized text, secondary headers
- **Example**: Expense item title in list

### Body Text

#### `bodyLarge` - Emphasized Body
- **Size**: 16px
- **Weight**: 400 (Regular)
- **Line Height**: 24px
- **Use**: Important descriptions, taglines, emphasized paragraphs
- **Example**: App tagline "Snap. Read. Settle."

#### `body` - Primary Body
- **Size**: 14px
- **Weight**: 400 (Regular)
- **Line Height**: 21px
- **Use**: Main content, descriptions, summaries
- **Example**: Group summary text, expense descriptions

#### `bodySmall` - Secondary Body
- **Size**: 13px
- **Weight**: 400 (Regular)
- **Line Height**: 20px
- **Use**: Secondary information, subtitles, helper text
- **Example**: "Paid by John · Split among 3" subtitle

### Labels & Captions

#### `label` - Form Labels
- **Size**: 14px
- **Weight**: 500 (Medium)
- **Line Height**: 20px
- **Use**: Input labels, section labels, filter labels
- **Example**: "Group Name" above input field

#### `overline` - Input Labels
- **Size**: 11px
- **Weight**: 600 (Semibold)
- **Line Height**: 16px
- **Letter Spacing**: 0.5px
- **Use**: Input field labels, category tags (typically uppercase)
- **Example**: "CATEGORY" label above dropdown

#### `caption` - Metadata
- **Size**: 12px
- **Weight**: 400 (Regular)
- **Line Height**: 16px
- **Use**: Timestamps, metadata, helper text, fine details
- **Example**: "2 hours ago" timestamp

#### `captionSmall` - Fine Print
- **Size**: 11px
- **Weight**: 400 (Regular)
- **Line Height**: 14px
- **Use**: Legal text, disclaimers, very fine details
- **Example**: Terms and conditions text

### Interactive Elements

#### `button` - Primary Button
- **Size**: 16px
- **Weight**: 600 (Semibold)
- **Line Height**: 20px
- **Use**: Button labels, primary CTAs
- **Example**: "Add from screenshot" button

#### `buttonSmall` - Secondary Button
- **Size**: 14px
- **Weight**: 600 (Semibold)
- **Line Height**: 18px
- **Use**: Small buttons, compact CTAs
- **Example**: "Cancel" in modal

#### `link` - Interactive Links
- **Size**: 14px
- **Weight**: 500 (Medium)
- **Line Height**: 20px
- **Use**: Clickable links, navigation text
- **Example**: "View all expenses →" link

### Financial Display

#### `moneyLarge` - Hero Amounts
- **Size**: 28px
- **Weight**: 700 (Bold)
- **Line Height**: 34px
- **Use**: Large financial displays, total amounts, hero numbers
- **Example**: Total balance on analytics screen

#### `money` - Standard Amounts
- **Size**: 18px
- **Weight**: 600 (Semibold)
- **Line Height**: 22px
- **Use**: Expense amounts, balances, standard money display
- **Example**: Expense amount in list item

#### `moneySmall` - Compact Amounts
- **Size**: 14px
- **Weight**: 600 (Semibold)
- **Line Height**: 18px
- **Use**: Small amounts, inline money, compact displays
- **Example**: Amount in settlement card

---

## Spacing System

### Base Unit: 4px

All spacing is based on a 4px grid system for visual consistency:

- **4px** (tight) - Between related elements
- **8px** (default) - Between body paragraphs
- **12px** (comfortable) - Between sections
- **16px** (loose) - Between major sections
- **24px** (extra loose) - Between major content blocks

### Recommended Spacing

#### After Headings
- **After H1**: 16px (loose) - Gives breathing room after major titles
- **After H2**: 12px (comfortable) - Comfortable spacing for sections
- **After H3**: 8px (default) - Standard spacing for subsections
- **After H4**: 8px (default) - Standard spacing for card titles

#### Body Text
- **Between paragraphs**: 8px (default) - Comfortable reading flow
- **After body before heading**: 16px (loose) - Clear separation

#### Lists
- **Between items**: 8px (default) - Consistent list rhythm
- **After list**: 12px (comfortable) - Separation from next content

---

## Color Integration

### Text Color Tokens

Typography works with the color system from `colors.ts`:

| Token | Use Case |
|-------|----------|
| `colors.textPrimary` | Headings, primary body text |
| `colors.textSecondary` | Body small, captions, subtitles |
| `colors.primary` | Links, interactive text |
| `colors.accent` | Positive amounts, success text |
| `colors.error` | Negative amounts, error text |

### Color Guidelines

1. **Headings**: Always use `textPrimary` for maximum contrast
2. **Body**: Use `textPrimary` for main content, `textSecondary` for supporting text
3. **Captions**: Typically `textSecondary` for subtle metadata
4. **Links**: Use `primary` color for interactive elements
5. **Money**: Use semantic colors (`accent` for positive, `error` for negative)

---

## Usage Examples

### Basic Usage

```tsx
import { typography } from '../theme/typography';
import { colors } from '../theme/colors';

// Screen title
<Text style={[typography.h1, { color: colors.textPrimary }]}>
  Your Groups
</Text>

// Body text
<Text style={[typography.body, { color: colors.textPrimary }]}>
  Create your first group to start splitting expenses
</Text>

// Caption
<Text style={[typography.caption, { color: colors.textSecondary }]}>
  2 hours ago
</Text>
```

### With Utility Functions

```tsx
import { createTextStyle } from '../theme/typography';
import { colors } from '../theme/colors';

// Using utility function
<Text style={createTextStyle('h2', colors.textPrimary)}>
  Group Name
</Text>
```

### With Emphasis

```tsx
import { typography, emphasis } from '../theme/typography';

// Emphasized body text
<Text style={[typography.body, emphasis.semibold]}>
  Important information
</Text>
```

### With Text Transform

```tsx
import { typography, textTransform } from '../theme/typography';

// Uppercase label
<Text style={[typography.overline, textTransform.uppercase]}>
  Category
</Text>
```

---

## Best Practices

### Do's ✅

1. **Use semantic tokens**: Always use typography tokens instead of inline styles
2. **Maintain hierarchy**: Use appropriate heading levels (h1 → h2 → h3)
3. **Consistent spacing**: Follow recommended spacing guidelines
4. **Color contrast**: Ensure sufficient contrast for accessibility
5. **Appropriate weight**: Use weight to create emphasis, not size alone

### Don'ts ❌

1. **Don't override weights**: Avoid changing font weights on headings
2. **Don't skip levels**: Don't jump from h1 to h3 (use h2 in between)
3. **Don't mix sizes**: Don't use multiple sizes in the same text block
4. **Don't ignore spacing**: Don't use arbitrary spacing values
5. **Don't use inline fontSize**: Always use typography tokens

---

## Accessibility Considerations

### Minimum Sizes

- **Body text**: Minimum 14px (meets WCAG AA for normal text)
- **Captions**: Minimum 11px (use sparingly, ensure high contrast)
- **Interactive elements**: Minimum 14px with 44px touch target

### Contrast Ratios

- **Headings**: 4.5:1 minimum contrast (WCAG AA)
- **Body text**: 4.5:1 minimum contrast (WCAG AA)
- **Large text (18px+)**: 3:1 minimum contrast (WCAG AA)

### Readability

- **Line length**: 45-75 characters per line for optimal reading
- **Line height**: 1.5x for body text ensures comfortable reading
- **Letter spacing**: Adjusted for size to maintain legibility

---

## Migration Guide

### From Old System

If you're updating existing code:

1. **Replace inline fontSize**: Use typography tokens
2. **Update line heights**: Use provided line heights
3. **Add letter spacing**: Apply appropriate letter spacing
4. **Standardize weights**: Use consistent font weights
5. **Update spacing**: Use recommended spacing values

### Example Migration

```tsx
// Before
<Text style={{ fontSize: 24, fontWeight: '700' }}>
  Title
</Text>

// After
<Text style={[typography.h2, { color: colors.textPrimary }]}>
  Title
</Text>
```

---

## Design Rationale Summary

### Why This System Works

1. **Mathematical Harmony**: 1.25x scale creates natural size relationships
2. **Clear Hierarchy**: Size + weight + spacing = unmistakable hierarchy
3. **Readability**: Optimal line heights and letter spacing for comfort
4. **Consistency**: 4px base unit ensures visual rhythm
5. **Scalability**: Works across all screen sizes and contexts
6. **Accessibility**: Meets WCAG guidelines for contrast and size

### Visual Flow

The typography system guides the eye naturally:

1. **Display/H1** catches attention (largest, boldest)
2. **H2/H3** organizes content (clear sections)
3. **Body** provides information (comfortable reading)
4. **Captions** add context (subtle, non-intrusive)

This creates a clear information hierarchy that users can scan quickly and read comfortably.

---

## Future Enhancements

Potential additions to the system:

- [ ] Font family customization (Inter, SF Pro)
- [ ] Dynamic type scaling for accessibility
- [ ] Dark mode typography adjustments
- [ ] Responsive typography for tablets
- [ ] Additional emphasis variants (underline, strikethrough)

---

## Questions?

For typography questions or suggestions, refer to:
- `src/theme/typography.ts` - Implementation
- `DESIGN_TOKENS.md` - Overall design system
- `src/theme/colors.ts` - Color system integration

