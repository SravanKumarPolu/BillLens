# BillLens — Navigation Map

> Status: **Phase 2 · Prompt 12 complete.**

## 1. Route structure

```
app/
├── _layout.tsx              # Root: ThemeProvider + ErrorBoundary + SafeArea
├── index.tsx                # Root redirect (onboarding vs main app)
├── onboarding/
│   ├── _layout.tsx          # Stack
│   ├── welcome.tsx          # Value proposition
│   ├── guest-name.tsx       # Display name input
│   ├── permissions.tsx      # Permission explanation
│   └── complete.tsx         # Success → enter app
├── (tabs)/
│   ├── _layout.tsx          # Tab bar: Home, Groups, Activity, Settings + FAB
│   ├── index.tsx            # Home dashboard
│   ├── groups.tsx           # Groups list
│   ├── activity.tsx         # Recent activity
│   └── settings.tsx         # Settings
├── groups/
│   ├── new.tsx              # Create group
│   ├── join.tsx             # Join via invite
│   └── [groupId]/
│       ├── _layout.tsx      # Group stack
│       ├── index.tsx        # Group home
│       ├── balances.tsx     # Balances + explanations
│       └── settings.tsx     # Group settings
├── capture/
│   ├── _layout.tsx          # Capture modal stack
│   ├── index.tsx            # Capture entry (4 options)
│   ├── camera.tsx           # Camera (placeholder)
│   ├── gallery.tsx          # Gallery (placeholder)
│   ├── image-quality.tsx    # Image quality review
│   └── processing.tsx       # Processing states
├── expenses/
│   ├── new.tsx              # Manual expense form (REAL since v2.1.0 — writes through CreateExpenseManuallyUseCase)
│   └── [expenseId].tsx      # Expense detail
├── settings/
│   ├── delete-account.tsx   # Account deletion flow (Phase 8)
│   ├── metrics.tsx          # App-health metrics dashboard (Phase 9 / Prompt 81, v2.1.0)
│   └── feedback.tsx         # Send-feedback form (Phase 9 / Prompt 82, v2.2.0)
├── drafts/
│   └── [draftId].tsx        # Draft review (Trust UI)
├── settlements/
│   ├── new.tsx              # New settlement
│   └── preview.tsx          # Settlement preview
└── modal/
    └── explanation.tsx      # Balance explanation modal
```

## 2. Navigation rules

- Root route decides between onboarding and main app via `requireOnboardingComplete()`
- Guest users access all core routes — authentication is never mandatory
- Deep links: `billlens://group/join/{token}`, `billlens://group/{id}`, `billlens://draft/{id}`, `billlens://expenses/new?groupId={id}`, `billlens://settings/metrics`, `billlens://settings/feedback`
- `/expenses/new` requires a `groupId` param (the group's members + default currency drive the form); without one it redirects to the groups list
- Invalid IDs show a recoverable error screen
- Draft processing routes survive app restart (drafts persisted in store)
- Modal dismissals with unsaved changes trigger confirmation dialog
- Android back button is predictable (uses default expo-router behavior)

## 3. Route guards

| Guard | Purpose |
|-------|---------|
| `requireOnboardingComplete()` | Redirects to `/onboarding/welcome` if not complete |
| `requireGroupExists(groupId)` | Shows error if group not found |
| `requireDraftExists(draftId)` | Shows error if draft not found |
