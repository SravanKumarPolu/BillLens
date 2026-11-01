# BillLens — Design System

> Status: **Phase 2 · Prompt 11 complete.**

## 1. Design principles

BillLens feels: Clear, Fast, Trustworthy, Financially precise, Friendly, Calm, Modern, Accessible.

**Avoids**: Excessive glassmorphism, heavy visual effects, overuse of gradients, unclear icons, very small text, low-contrast financial values, decorative cards with no purpose, animations that delay financial tasks.

## 2. Design tokens

All tokens are typed in `src/presentation/design-system/tokens.ts`:

| Token type | Examples |
|-----------|---------|
| Colour | background, surface, surfaceElevated, surfaceMuted, textPrimary/Secondary/Muted, border, borderStrong |
| Semantic | positive, negative, warning, critical, info |
| Confidence | confidenceHigh (green), confidenceMedium (amber), confidenceLow (red), confidenceUnknown (grey) |
| Sync | syncPending (amber), syncFailed (red), syncComplete (green) |
| Typography | display (36px/700), screenTitle (28px/700), sectionTitle (20px/600), cardTitle (16px/600), body (15px/400), bodyStrong (15px/600), caption (13px/400), label (12px/600), amountLarge/Medium/Small (tabular-nums), button, input, error |
| Spacing | xs(4), sm(8), md(12), lg(16), xl(20), xxl(24), xxxl(32) |
| Border radius | sm(6), md(10), lg(14), xl(20), full(9999) |
| Shadows | none, sm, md, lg (with elevation for Android) |
| Motion | fast(150ms), normal(250ms), slow(400ms), spring config |
| Opacity | disabled(0.4), muted(0.6), active(1) |
| Icon sizes | sm(16), md(20), lg(24), xl(32) |
| Touch targets | minimum(44), comfortable(48) |
| Z-index | base(0), dropdown(1000), sticky(1100), modal(1200), toast(1300) |

## 3. Financial display rules

- Amounts owed: negative sign + "You owe" label + red text (secondary)
- Amounts receivable: positive sign + "You are owed" label + green text (secondary)
- Settled: "Settled" label + checkmark icon
- **Never rely only on red/green** — always include label, icon, and sign convention
- Currency symbol always shown (₹, $, £, €, ¥)
- JPY and other 0-decimal currencies: no decimal point shown
- Tabular-nums for alignment in lists

## 4. Theme support

- Light mode, Dark mode, System mode
- Persistent preference via Zustand + AsyncStorage
- Theme-aware StatusBar (light/dark)
- All components read colors via `useTheme()` hook — zero hardcoded colors

## 5. Foundational components

Screen, Text, Stack, Row, Card, Button, IconButton, Badge, Avatar, AmountText, StatusDot, Skeleton, Divider, Spacer, Icon.

All components:
- Accept theme tokens (no raw values)
- Have accessibilityLabel where interactive
- Meet minimum 44pt touch targets
- Support light and dark themes automatically
