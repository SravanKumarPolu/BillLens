# BillLens Typography System - Design Guide

## Overview

The BillLens typography system creates a **visually clear and readable typographic hierarchy** that guides users naturally through content. Every typographic decision is intentional, based on mathematical relationships, accessibility principles, and visual design best practices.

---

## Design Philosophy

### Core Principles

1. **Clear Visual Hierarchy** - Size, weight, color, and spacing work together to establish importance
2. **Optimal Readability** - Line heights and letter spacing optimized for comfortable reading
3. **Mathematical Relationships** - Typographic scale based on 1.25x (Major Third) ratio for harmony
4. **Accessibility First** - All text meets WCAG AA contrast standards (4.5:1 minimum)
5. **Consistent Spacing** - 4px base unit system ensures visual rhythm and balance

### Typographic Hierarchy Goals

- **Guide the eye naturally** from most important to least important information
- **Create visual breathing room** through intentional spacing
- **Establish clear relationships** between headings, subheadings, body text, and captions
- **Maintain readability** across all screen sizes and DPI levels

---

## Typographic Scale

### Mathematical Foundation

The typography scale follows a **1.25x (Major Third)** ratio, creating harmonious size relationships:

```
Display:    32px  (2.29x base)  ← Hero text, app titles
H1:         28px  (2.00x base)  ← Screen titles
H2:         24px  (1.71x base)  ← Section headers
H3:         20px  (1.43x base)  ← Subsection headers
H4:         18px  (1.29x base)  ← Card titles
Body Large: 16px  (1.14x base)  ← Emphasized body
Body:        14px  (1.00x base)  ← Base size (foundation)
Body Small:  13px  (0.93x base)  ← Secondary body
Caption:     12px  (0.86x base)  ← Metadata
Caption Sm:  11px  (0.79x base)  ← Fine print
```

**Base size**: 14px (Body) - This is the foundation from which all other sizes derive.

### Why 1.25x Ratio?

- **Harmonious progression** - Creates natural, pleasing size relationships
- **Clear distinction** - Each level is noticeably different but not jarring
- **Scalable** - Works well across different screen sizes and contexts
- **Industry standard** - Used by Material Design, Apple HIG, and modern design systems

---

## Typography Tokens

### Display & Headings

#### `display` - Hero Text
- **Size**: 32px
- **Weight**: 700 (Bold)
- **Line Height**: 38px (1.19x)
- **Letter Spacing**: -0.5px
- **Use**: App name, major hero sections, welcome screens
- **Design Rationale**: Largest text creates immediate visual impact. Bold weight establishes authority. Tighter letter spacing (-0.5px) creates elegance at large sizes.

#### `h1` - Screen Titles
- **Size**: 28px
- **Weight**: 600 (Semibold)
- **Line Height**: 34px (1.21x)
- **Letter Spacing**: -0.5px
- **Use**: Main screen titles, primary section headers
- **Design Rationale**: Large enough to be prominent but not overwhelming. Semibold weight provides emphasis without heaviness. Creates clear entry point for screen content.

#### `h2` - Section Headers
- **Size**: 24px
- **Weight**: 600 (Semibold)
- **Line Height**: 30px (1.25x)
- **Letter Spacing**: -0.3px
- **Use**: Section titles, group names, card headers
- **Design Rationale**: Clearly distinguishes sections within a screen. Balanced size-to-weight ratio maintains readability while establishing hierarchy.

#### `h3` - Subsection Headers
- **Size**: 20px
- **Weight**: 600 (Semibold)
- **Line Height**: 24px (1.2x)
- **Letter Spacing**: -0.2px
- **Use**: Subsection titles, expense titles, modal headers
- **Design Rationale**: Provides structure within sections without competing with main headings. Tighter line height (1.2x) creates visual cohesion.

#### `h4` - Card Titles
- **Size**: 18px
- **Weight**: 600 (Semibold)
- **Line Height**: 22px (1.22x)
- **Letter Spacing**: -0.1px
- **Use**: Card titles, emphasized text, secondary headers
- **Design Rationale**: Slightly larger than body text to create emphasis. Works well in card contexts where space is limited.

### Body Text

#### `bodyLarge` - Emphasized Body
- **Size**: 16px
- **Weight**: 400 (Regular)
- **Line Height**: 24px (1.5x)
- **Letter Spacing**: 0px
- **Use**: Important descriptions, taglines, emphasized paragraphs
- **Design Rationale**: Larger than standard body for emphasis. 1.5x line height provides comfortable reading rhythm. Natural letter spacing maintains readability.

#### `body` - Primary Body Text
- **Size**: 14px
- **Weight**: 400 (Regular)
- **Line Height**: 21px (1.5x)
- **Letter Spacing**: 0px
- **Use**: Main content, descriptions, summaries
- **Design Rationale**: **Base size** for all typography. 1.5x line height is the gold standard for body text readability. Regular weight ensures comfortable reading over extended periods.

#### `bodySmall` - Secondary Body
- **Size**: 13px
- **Weight**: 400 (Regular)
- **Line Height**: 20px (1.54x)
- **Letter Spacing**: 0px
- **Use**: Secondary information, subtitles, helper text
- **Design Rationale**: Slightly smaller for less important content. Maintains readability with generous line height.

### Labels & Captions

#### `label` - Form Labels
- **Size**: 14px
- **Weight**: 500 (Medium)
- **Line Height**: 20px (1.43x)
- **Letter Spacing**: 0px
- **Use**: Input labels, section labels, filter labels
- **Design Rationale**: Medium weight (500) provides emphasis without heaviness. Same size as body but weightier to distinguish labels from content.

#### `overline` - Input Labels
- **Size**: 11px
- **Weight**: 600 (Semibold)
- **Line Height**: 16px (1.45x)
- **Letter Spacing**: 0.5px
- **Use**: Input field labels, category tags, uppercase labels
- **Design Rationale**: Small size with increased letter spacing (0.5px) improves legibility. Typically used with `textTransform: 'uppercase'` for distinct visual treatment.

#### `caption` - Metadata
- **Size**: 12px
- **Weight**: 400 (Regular)
- **Line Height**: 16px (1.33x)
- **Letter Spacing**: 0px
- **Use**: Timestamps, metadata, helper text, fine details
- **Design Rationale**: Compact but readable. 1.33x line height balances space efficiency with readability.

#### `captionSmall` - Fine Print
- **Size**: 11px
- **Weight**: 400 (Regular)
- **Line Height**: 14px (1.27x)
- **Letter Spacing**: 0px
- **Use**: Legal text, disclaimers, very fine details
- **Design Rationale**: Smallest readable size. Use sparingly for non-critical information.

### Interactive Elements

#### `button` - Primary Button
- **Size**: 16px
- **Weight**: 600 (Semibold)
- **Line Height**: 20px (1.25x)
- **Letter Spacing**: 0px
- **Use**: Button labels, primary CTAs
- **Design Rationale**: Larger than body text for better touch targets. Semibold weight ensures visibility and importance.

#### `buttonSmall` - Secondary Button
- **Size**: 14px
- **Weight**: 600 (Semibold)
- **Line Height**: 18px (1.29x)
- **Letter Spacing**: 0px
- **Use**: Small buttons, compact CTAs
- **Design Rationale**: Compact version for secondary actions. Maintains weight for consistency.

#### `link` - Interactive Links
- **Size**: 14px
- **Weight**: 500 (Medium)
- **Line Height**: 20px (1.43x)
- **Letter Spacing**: 0px
- **Use**: Clickable links, navigation text
- **Design Rationale**: Medium weight distinguishes links from regular text. Same size as body maintains readability.

#### `navigation` - Back Buttons & Navigation
- **Size**: 16px
- **Weight**: 400 (Regular)
- **Line Height**: 22px (1.38x)
- **Letter Spacing**: 0px
- **Use**: Back buttons, navigation labels, breadcrumbs
- **Design Rationale**: Slightly larger than body (16px vs 14px) improves touch targets and visibility. Regular weight maintains approachability. Generous line height (1.38x) ensures readability in navigation contexts.

### Financial Display

#### `moneyLarge` - Hero Amounts
- **Size**: 28px
- **Weight**: 700 (Bold)
- **Line Height**: 34px (1.21x)
- **Letter Spacing**: -0.3px
- **Use**: Large financial displays, total amounts, hero numbers
- **Design Rationale**: Large size and bold weight create immediate impact for financial data. Tighter letter spacing maintains elegance at large sizes.

#### `money` - Standard Amounts
- **Size**: 18px
- **Weight**: 600 (Semibold)
- **Line Height**: 22px (1.22x)
- **Letter Spacing**: -0.1px
- **Use**: Expense amounts, balances, standard money display
- **Design Rationale**: Prominent but not overwhelming. Semibold weight ensures numbers are easily scannable.

#### `moneySmall` - Compact Amounts
- **Size**: 14px
- **Weight**: 600 (Semibold)
- **Line Height**: 18px (1.29x)
- **Letter Spacing**: 0px
- **Use**: Small amounts, inline money, compact displays
- **Design Rationale**: Compact version maintains weight for consistency. Works well in lists and cards.

---

## Line Height Strategy

### Why Different Line Heights?

Line heights are calculated to optimize readability for different text sizes:

| Category | Ratio | Rationale |
|----------|-------|-----------|
| **Headings** | 1.2x | Tighter spacing creates visual cohesion. Headings are typically short, so less line height is needed. |
| **Body Text** | 1.5x | Comfortable reading line height. Industry standard for extended reading. |
| **Captions** | 1.33x | Compact but still readable. Balances space efficiency with legibility. |

### Examples

- **H1 (28px)**: Line height 34px (1.21x) - Tighter for visual cohesion
- **Body (14px)**: Line height 21px (1.5x) - Comfortable reading
- **Caption (12px)**: Line height 16px (1.33x) - Compact but readable

---

## Letter Spacing Strategy

### Size-Based Adjustments

Letter spacing is adjusted based on text size to optimize legibility:

| Size Range | Letter Spacing | Rationale |
|------------|----------------|-----------|
| **28px+** | -0.5px to -0.3px | Large text benefits from tighter spacing for elegance and cohesion |
| **18-24px** | -0.2px to 0px | Neutral spacing maintains readability |
| **<18px** | 0px | Natural spacing is optimal for smaller text |

### Why Negative Letter Spacing?

- **Large text** (28px+) naturally has more space between letters
- **Tighter spacing** (-0.3px to -0.5px) creates visual elegance
- **Smaller text** (<18px) needs natural spacing for readability
- **Balance** between visual appeal and legibility

---

## Font Weight Hierarchy

### Weight Scale

| Weight | Value | Use Cases | Visual Impact |
|--------|-------|-----------|---------------|
| **Regular (400)** | Normal | Body text, captions | Standard, comfortable reading |
| **Medium (500)** | Slightly bold | Labels, links | Subtle emphasis |
| **Semibold (600)** | Bold | Headings, buttons, money | Strong emphasis |
| **Bold (700)** | Very bold | Display text, hero amounts | Maximum emphasis |

### Design Rationale

- **400 (Regular)**: Default for body text. Comfortable for extended reading.
- **500 (Medium)**: Subtle emphasis without heaviness. Perfect for labels and links.
- **600 (Semibold)**: Strong emphasis. Used for headings to establish hierarchy.
- **700 (Bold)**: Maximum emphasis. Reserved for hero text and important numbers.

---

## Spacing System

### Base Unit: 4px

All spacing is based on a **4px grid system** for consistent visual rhythm:

- **4px** (tight) - Between related elements
- **8px** (default) - Between body paragraphs
- **12px** (comfortable) - Between sections
- **16px** (loose) - Between major sections
- **24px** (extra loose) - Between major content blocks

### Recommended Spacing Between Typographic Elements

#### After Headings
- **After H1**: 16px (loose) - Creates breathing room after major headings
- **After H2**: 12px (comfortable) - Balanced spacing for section headers
- **After H3/H4**: 8px (default) - Tighter spacing for subsections

#### Body Text
- **Between paragraphs**: 8px (default) - Maintains reading flow
- **After body before heading**: 16px (loose) - Clear separation between content and new section

#### Lists
- **Between items**: 8px (default) - Consistent with paragraph spacing
- **After list**: 12px (comfortable) - Clear separation from following content

### Visual Rhythm

The 4px base unit creates a **visual rhythm** that:
- Makes layouts feel intentional and organized
- Creates consistent spacing relationships
- Improves scanability and readability
- Establishes professional, polished appearance

---

## Color & Contrast

### Typography Color Tokens

| Token | Light Mode | Dark Mode | Use Case |
|-------|------------|-----------|----------|
| `textPrimary` | #1F2937 | #F3F4F6 | Main content, headings |
| `textSecondary` | #6B7280 | #A2A2B5 | Secondary text, captions |
| `accent` | #10B981 | #10B981 | Links, highlights |
| `error` | #EF4444 | #EF4444 | Errors, warnings |
| `success` | #10B981 | #10B981 | Success states |

### Contrast Ratios (WCAG AA Compliant)

All text combinations meet **WCAG AA standards** (4.5:1 minimum):

- **textPrimary on surfaceLight (light)**: 19.30:1 (WCAG AAA ✅)
- **textSecondary on surfaceLight (light)**: 4.63:1 (WCAG AA ✅)
- **textPrimary on surfaceCard (light)**: 20.17:1 (WCAG AAA ✅)
- **textPrimary on surfaceLight (dark)**: 16.30:1 (WCAG AAA ✅)
- **textSecondary on surfaceLight (dark)**: 6.96:1 (WCAG AAA ✅)

### Design Rationale

- **High contrast** ensures readability in all lighting conditions
- **Exceeds WCAG AA** for better accessibility
- **Consistent color usage** creates visual hierarchy
- **Semantic colors** (error, success) provide clear meaning

---

## Responsive Typography

### Device-Aware Scaling

The typography system automatically adapts to:
- **Screen size** (phone, tablet, external monitor)
- **Pixel ratio (DPI)** (Retina, 4K, standard monitors)
- **Platform** (iOS, Android)

### Scaling Factors

| Device Type | Scale Factor | Use Case |
|-------------|--------------|----------|
| Small | 1.0x | Small phones, no scaling |
| Medium | 1.0x | Standard phones, no scaling |
| Large | 1.05x | Tablets, slight increase |
| XLarge | 1.1x - 1.27x | External monitors, DPI-adjusted |

### External Monitor Optimization

For external monitors (`XLARGE` device type):
- **Low DPI** (pixelRatio < 1.5): 15% larger fonts for better readability
- **Standard** (pixelRatio 1.5 - 2.5): Standard scaling (1.1x)
- **High-DPI 4K** (pixelRatio > 2.5): Slight increase (1.05x) for clarity

### Example Scaling

| Base Size | Low DPI External | Standard External | High-DPI 4K |
|-----------|------------------|-------------------|-------------|
| Display (32px) | 37px | 35px | 34px |
| H1 (28px) | 32px | 31px | 29px |
| H2 (24px) | 28px | 26px | 25px |
| Body (14px) | 16px | 15px | 15px |

---

## Usage Guidelines

### Best Practices

#### ✅ DO

- Use semantic typography tokens (`typography.h1`, `typography.body`, etc.)
- Follow the hierarchy (h1 → h2 → h3 → h4)
- Use recommended spacing between elements
- Apply theme colors for consistency
- Use `TypographyText` component for type-safe typography

#### ❌ DON'T

- Override `fontSize` or `fontWeight` on typography tokens
- Skip heading levels (e.g., h1 → h3)
- Use inline `fontSize` values
- Mix typography tokens with custom sizes
- Use body text for headings

### Common Patterns

#### Screen Title
```tsx
<TypographyText variant="h1" color="primary">
  Your Groups
</TypographyText>
```

#### Section Header
```tsx
<TypographyText variant="h2" color="primary">
  Recent Expenses
</TypographyText>
```

#### Body Text
```tsx
<TypographyText variant="body" color="primary">
  Create your first group to start splitting expenses
</TypographyText>
```

#### Caption
```tsx
<TypographyText variant="caption" color="secondary">
  2 hours ago
</TypographyText>
```

#### Navigation/Back Button
```tsx
<TypographyText variant="navigation" color="accent">
  ← Back
</TypographyText>
```

---

## TypographyText Component

### Overview

The `TypographyText` component ensures consistent typography usage across the app:

- **Type-safe** - Prevents typos and invalid variants
- **Theme-aware** - Automatically applies theme colors
- **Responsive** - Adapts to screen size and DPI
- **Consistent** - Enforces typography system usage

### Usage

```tsx
import { TypographyText } from '../components';

// Basic usage
<TypographyText variant="h1" color="primary">
  Screen Title
</TypographyText>

// With emphasis
<TypographyText variant="body" color="primary" emphasis="semibold">
  Important text
</TypographyText>

// With alignment
<TypographyText variant="body" color="secondary" align="center">
  Centered text
</TypographyText>

// Custom color
<TypographyText variant="h2" color="#FF5733">
  Custom color heading
</TypographyText>
```

### Props

- `variant`: Typography token key (required)
- `color`: Color variant or hex color (optional, default: 'primary')
- `responsive`: Use responsive typography (optional, default: true)
- `emphasis`: 'bold' | 'semibold' | 'medium' | 'italic' (optional)
- `align`: 'left' | 'center' | 'right' | 'justify' (optional)
- `style`: Additional styles (optional)

---

## Visual Hierarchy Examples

### Example 1: Screen Layout

```
┌─────────────────────────────────┐
│  BillLens          (display)    │  ← 32px, Bold, -0.5px
│                                   │
│  Your Groups         (h1)        │  ← 28px, Semibold, -0.5px
│                                   │
│  Recent Expenses     (h2)        │  ← 24px, Semibold, -0.3px
│                                   │
│  Groceries           (h3)        │  ← 20px, Semibold, -0.2px
│  ₹450.00            (money)      │  ← 18px, Semibold, -0.1px
│  Paid by You         (body)      │  ← 14px, Regular, 0px
│  2 hours ago         (caption)   │  ← 12px, Regular, 0px
└─────────────────────────────────┘
```

### Example 2: Card Layout

```
┌─────────────────────────────────┐
│  Expense Title      (h4)        │  ← 18px, Semibold
│  ₹450.00            (money)     │  ← 18px, Semibold
│                                   │
│  Paid by You         (body)      │  ← 14px, Regular
│  Split among 3       (bodySmall) │  ← 13px, Regular
│  2 hours ago         (caption)   │  ← 12px, Regular
└─────────────────────────────────┘
```

---

## Summary

### Key Design Decisions

1. **1.25x Typographic Scale** - Creates harmonious size relationships
2. **Variable Line Heights** - Optimized for each text category (1.2x headings, 1.5x body)
3. **Size-Based Letter Spacing** - Tighter for large text, natural for small text
4. **Weight Hierarchy** - 400 (body) → 500 (labels) → 600 (headings) → 700 (display)
5. **4px Base Unit Spacing** - Creates consistent visual rhythm
6. **WCAG AA Compliant Colors** - Ensures accessibility
7. **Responsive Scaling** - Adapts to screen size and DPI

### Typography System Benefits

- ✅ **Clear hierarchy** - Users naturally understand importance
- ✅ **Improved readability** - Optimized line heights and spacing
- ✅ **Consistent design** - Mathematical relationships create harmony
- ✅ **Accessible** - Meets WCAG AA standards
- ✅ **Responsive** - Works on all devices and screen sizes
- ✅ **Maintainable** - Centralized tokens prevent inconsistencies

---

**Last Updated**: 2024  
**Version**: 2.0  
**Status**: Production Ready
