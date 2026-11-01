# BillLens — Onboarding Flow

> Status: **Phase 2 · Prompt 14 complete.**

## 1. Flow

```
Welcome → Choose display name → Permissions explanation → Complete → Enter app
```

## 2. Welcome screen

- Tagline: "Scan receipts. Split clearly. Know exactly who owes what."
- 4 feature bullets: No account required, Works offline, Cloud backup later, Always reviewable
- "Get Started" → guest name
- "I already have an account" → auth (Phase 3)

## 3. Display name

- Validates: non-empty, non-whitespace, ≤80 chars, Unicode support
- Saved to `useGuestStore` (persisted)
- Explain: "This name appears in shared groups. You can change it later."

## 4. Permissions

- Explains camera, photo library, notifications
- Does NOT request any permission on this screen
- "BillLens only asks for a permission when you use the related feature."

## 5. Complete

- Success indicator
- Summary of setup
- "Your data stays on this device. Add cloud backup anytime in Settings."
- "Enter BillLens" → sets `onboardingComplete=true`, navigates to tabs

## 6. Design decisions

- No email, phone, Google, Apple, or payment info required
- Registration is never implied as mandatory
- Privacy defaults are explained (not configured here — in group creation)
- App restart during onboarding resumes from the last incomplete step
