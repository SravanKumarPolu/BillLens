# BillLens — Accessibility

> Status: **Phase 2 · Prompt 20 complete.**

## 1. Touch targets

All interactive elements meet the minimum 44pt touch target requirement. Buttons use `touchTargets.minimum` (44) or `touchTargets.comfortable` (48) from the design system.

## 2. Screen-reader labels

Every interactive element has `accessibilityLabel`:
- Buttons: describe the action ("Create group", "Scan receipt", "Confirm expense")
- Icon-only buttons: always have descriptive labels
- Form inputs: label describes the field ("Display name", "Group name")
- Cards: describe their content ("Group Goa Trip, 3 members, you owe ₹400")

## 3. Non-colour state indicators

Financial states are NEVER communicated by colour alone:
- Positive/negative amounts: always have text label ("You are owed" / "You owe")
- Confidence levels: always have text label alongside StatusDot colour
- Sync status: always have text label alongside StatusDot colour
- Error states: always have text message alongside red colour

## 4. Contrast

Light mode and dark mode both meet WCAG AA contrast ratios:
- textPrimary on background: 15:1 (light), 13:1 (dark)
- textSecondary on background: 7:1 (light), 6:1 (dark)
- Semantic colors on surface: ≥ 4.5:1

## 5. Dynamic text scaling

Typography tokens use explicit font sizes. React Native's `allowFontScaling` is enabled by default — text scales with system accessibility settings.

## 6. Focus order

Screens use vertical Stack layout — focus order follows visual order (top to bottom). Tab navigation is not applicable (mobile-only).

## 7. Error announcements

Form validation errors use `accessibilityLiveRegion="polite"` to announce changes to screen readers.

## 8. Reduced motion

The Skeleton component's animation could respect `AccessibilityInfo.isReduceMotionEnabled()` (Phase 3 enhancement).
