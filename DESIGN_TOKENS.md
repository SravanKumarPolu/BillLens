## BillLens Design Tokens (App-Level Usage)

This document explains **how to use the `colors` theme** in UI components so Figma and React Native stay aligned.

### 1. Core Tokens (from `src/theme/colors.ts`)

- **Brand**
  - **`colors.primary`**: Primary Indigo (main CTAs, FABs, key highlights)
  - **`colors.primaryDark`**: Darker Indigo (pressed / active states, headers)
  - **`colors.primaryLight`**: Light Indigo (chip backgrounds, subtle highlights)

- **Accents**
  - **`colors.accent`**: Emerald – success / “Settle Up” / positive states
  - **`colors.accentAmber`**: Amber – soft warnings, “you paid more” analytics
  - **`colors.accentPink`**: Pink – Supporter badge, premium / fun elements

- **Neutrals (Light Mode)**
  - **`colors.surfaceLight`**: App background
  - **`colors.surfaceCard`**: Card / elevated surface background
  - **`colors.borderSubtle`**: Dividers, card borders, secondary outlines
  - **`colors.textPrimary`**: Main text
  - **`colors.textSecondary`**: Secondary text, helper text

- **Semantic**
  - **`colors.success`**: Strong success state (confirmations)
  - **`colors.error`**: Errors, destructive actions
  - **`colors.info`**: Neutral info, hints

---

### 2. Buttons

- **Primary Button (main CTA, e.g., “Add via Screenshot”, “Settle Up”)**
  - **Background**: `colors.primary`
  - **Background (pressed)**: `colors.primaryDark`
  - **Text**: `colors.white`
  - **Border**: none (or `colors.primaryDark` for high-contrast)  
  - **Examples**: FAB on Home, “Add Expense”, primary actions in modals.

- **Secondary Button (neutral actions, e.g., “Create group”, “Sign in later”)**
  - **Background**: `colors.surfaceCard`
  - **Border**: `colors.borderSubtle` (1 px)
  - **Text**: `colors.textPrimary`
  - **Text (muted)**: `colors.textSecondary` for less-important options.

- **Positive Button (explicit money flow, e.g., “Mark as settled”)**
  - **Background**: `colors.accent`
  - **Text**: `colors.white`
  - Use sparingly so “green = money / done” stays clear.

---

### 3. Cards & Surfaces

- **Base Screen Background**
  - **Color**: `colors.surfaceLight`

- **Content Cards (groups, expenses, analytics sections)**
  - **Background**: `colors.surfaceCard`
  - **Border**: `colors.borderSubtle` (optional, 1 px)
  - **Shadow**: subtle shadow only for key cards (e.g., primary group, current month summary).

- **Highlighted Card (primary group like “Our Home”)**
  - **Background**: `colors.primaryLight`
  - **Text**: `colors.textPrimary`
  - **Accent elements**: `colors.primary` (icon, border, badge).

---

### 4. Chips, Tags, Filters

- **Default Filter Chip (e.g., Food / Groceries / Utilities / Others)**
  - **Background (unselected)**: `colors.surfaceCard`
  - **Border (unselected)**: `colors.borderSubtle`
  - **Text (unselected)**: `colors.textSecondary`

- **Selected Filter Chip**
  - **Background**: `colors.primaryLight`
  - **Border**: `colors.primary`
  - **Text**: `colors.primary`

- **Analytics Insight Chip (e.g., “You paid more this month”)**
  - **Background**: `colors.accentAmber` at low opacity (e.g., 10–15% in Figma)
  - **Text**: `colors.textPrimary` or `colors.accentAmber` for emphasis.

---

### 5. Settle Up & Money Semantics

- **Amounts you owe**
  - **Text**: `colors.error` or `colors.accentAmber` (for softer tone)

- **Amounts others owe you**
  - **Text**: `colors.accent` or `colors.success`

- **Settled state**
  - **Pill / label background**: `colors.primaryLight` or a low-opacity `colors.accent`
  - **Text**: `colors.accent` or `colors.textSecondary` (for “All settled”).

---

### 6. Supporter Badge & Premium Touches

- **BillLens Supporter Badge**
  - **Background**: `colors.accentPink` (optionally with a soft gradient)
  - **Text**: `colors.white`
  - **Icon**: small “lens” / star icon in white or `colors.primaryLight`.

- **Premium / Themed Elements**
  - Neon / glass / gradient themes can be built by:
    - Keeping **text** on `colors.textPrimary` / `colors.white`
    - Using gradients built around `colors.primary`, `colors.accent`, `colors.accentPink`.

---

### 7. Practical Mapping (Figma ↔ React Native)

- **Figma color styles**:
  - `Brand/Primary` → `colors.primary`
  - `Brand/Primary-Dark` → `colors.primaryDark`
  - `Brand/Primary-Light` → `colors.primaryLight`
  - `Accent/Green` → `colors.accent`
  - `Accent/Amber` → `colors.accentAmber`
  - `Accent/Pink` → `colors.accentPink`
  - `Surface/Background` → `colors.surfaceLight`
  - `Surface/Card` → `colors.surfaceCard`
  - `Border/Subtle` → `colors.borderSubtle`
  - `Text/Primary` → `colors.textPrimary`
  - `Text/Secondary` → `colors.textSecondary`

- **React Native usage**:
  - Import once per component: `import { colors } from '../theme/colors';`
  - Use in `StyleSheet` or inline styles according to the roles above (buttons, cards, chips, analytics, badges).

## BillLens Design Tokens (v1)

This document describes how to use the BillLens brand tokens from `src/theme/colors.ts` in React Native screens and components.

### Color Tokens

- **Primary**
  - `colors.primary` – Main brand color (Indigo-500). Use for primary actions, FABs, key highlights.
  - `colors.primaryDark` – For pressed states, headers, emphasis text accents.
  - `colors.primaryLight` – Subtle backgrounds, pills, selected states, analytics chips.

- **Accents**
  - `colors.accent` – Emerald-500. Use for **success**, “Settle Up”, positive balances.
  - `colors.accentAmber` – Amber-500. Use for soft warnings, “You paid more this month” labels.
  - `colors.accentPink` – Pink-500. Use for the **Supporter Badge** and premium touches.

- **Neutrals (Light Mode)**
  - `colors.surfaceLight` – App background.
  - `colors.surfaceCard` – Cards / sheets / elevated surfaces.
  - `colors.borderSubtle` – Dividers, card borders, secondary controls.
  - `colors.textPrimary` – Screen titles, primary labels.
  - `colors.textSecondary` – Subtitles, secondary labels, helper text.

- **Semantic**
  - `colors.success` – Success toasts, confirmation icons, positive trends.
  - `colors.error` – Errors, destructive actions (delete expense).
  - `colors.info` – Info banners and help hints.

### Component Recipes

#### Primary Button

- **Use when**: A main call to action on a screen (e.g., “Add via Screenshot”, “Settle Up”).
- **Styles**:
  - `backgroundColor: colors.primary`
  - `borderRadius: 999`
  - `paddingVertical: 14`
  - `textColor: colors.white`
  - `textWeight: '600'`

#### Secondary Button

- **Use when**: Secondary actions (e.g., "Create Group", "Sign in to sync later").
- **Styles**:
  - `backgroundColor: colors.surfaceCard`
  - `borderWidth: 1`
  - `borderColor: colors.borderSubtle`
  - `borderRadius: 999`
  - `textColor: colors.textPrimary`
  - `textWeight: '500'`

#### FAB (Add from Screenshot)

- **Use when**: Contextual "Add Expense" action (like in `HomeScreen`).
- **Styles**:
  - `backgroundColor: colors.primary`
  - `borderRadius: 999`
  - `paddingVertical: 14`
  - Icon + label row with center alignment
  - Label uses same text style as primary button.

#### Cards (Groups, Expenses, Ledger Items)

- **Use when**: Listing groups, expenses, ledger entries.
- **Styles**:
  - `backgroundColor: colors.surfaceCard`
  - `borderRadius: 16`
  - `padding: 14–16`
  - Optional border: `borderColor: colors.borderSubtle`, `borderWidth: 1`
  - Title: `color: colors.textPrimary`, `fontWeight: '600'`
  - Subtitle: `color: colors.textSecondary`, smaller size.

#### Analytics Chips / Tags

- **Use when**: Category filters, small analytics hints.
- **Styles**:
  - Backgrounds:
    - Default: `colors.primaryLight`
    - Success: `colors.accent` with opacity or lighter variant
    - Warning: `colors.accentAmber` with opacity
  - `borderRadius: 999`
  - `paddingHorizontal: 10–12`
  - `paddingVertical: 4–6`
  - Text: `fontSize: 12–13`, `fontWeight: '500'`

#### Supporter Badge

- **Use when**: Displaying “BillLens Supporter” status.
- **Styles**:
  - `backgroundColor: colors.accentPink`
  - Optional gradient overlay in Figma only.
  - `borderRadius: 999`
  - `paddingHorizontal: 12`
  - `paddingVertical: 4`
  - Text: `color: colors.white`, `fontWeight: '600'`, `fontSize: 12–13`

### Typography Guidelines (Implementation)

Use system fonts (or Inter if you add it later) with the following sizes:

- Screen title: `fontSize: 24–28`, `fontWeight: '700'`
- Section title: `fontSize: 16–18`, `fontWeight: '600'`
- Body: `fontSize: 14–16`, `fontWeight: '400'`
- Small label/chip: `fontSize: 12–13`, `fontWeight: '500'`

### Usage in Existing Screens

- `OnboardingWelcome`:
  - Uses `colors.primary` and `colors.accent` in the logo.
  - Primary CTA should align with the **Primary Button** recipe above.
- `HomeScreen`:
  - Uses `colors.surfaceLight` for background, `colors.surfaceCard` for group cards.
  - FAB uses `colors.primary` and should follow the **FAB** recipe above.

As you add new screens (Group Ledger, Expense Detail, Analytics), reuse these tokens so the app stays visually consistent and easily themeable later (e.g., adding dark mode or premium themes).


