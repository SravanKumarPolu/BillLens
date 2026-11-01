# Accessibility Audit — BillLens v2.0.0 Release Candidate

> Phase 8, Prompt 75 + 80. Static/tooling evidence from this repository;
> screen-reader device sessions are scheduled pre-beta (gaps listed).

## Design-system foundations (implemented)

| Requirement | Status | Evidence |
|---|---|---|
| Meaningful labels | ✅ foundations | Buttons take `accessibilityLabel` (falls back to label); tab items carry `tabBarAccessibilityLabel` (`app/(tabs)/_layout.tsx`); new DeleteAccount controls labelled |
| Touch targets ≥ 44pt | ✅ foundations | `Button` uses theme press targets; Settings delete row `minHeight: 44`; acknowledgement checkbox `minHeight: 44` |
| Light + dark themes | ✅ | `tokens.ts` — full token sets for both modes; theme-aware status bar, headers, tab bar |
| Don't rely on colour alone | ✅ foundations | StatusDot, Badge, Icon glyphs accompany colour states (sync/confidence states pair glyph + colour) |
| Reduced motion | ⚠️ partial | Reanimated used sparingly; explicit reduced-motion guard not yet global — tracked below |
| Large text | ⚠️ partial | Typography token scale defined; layouts use flexible containers (no fixed-height text in critical screens); device-scale verification pending |
| Screen-reader flow audits (VoiceOver/TalkBack) | ⚠️ pending | Requires physical device sessions — see gaps |
| Error announcements (`accessibilityLiveRegion`/`UIAccessibility.post`) | ⚠️ partial | OfflineBanner + error states render text; live-region announcement flags not uniformly set |
| Focus order / modal focus | ⚠️ partial | Native stack modals handle focus; custom flows need verification |

## Actionable error wording (Prompt 75) — audited copy

Error strings audited against the "bad → better" pattern:

- Offline expense saving: "The expense is saved on this device but has
  not synced yet. Try again when you are online." ✅
- Sync failures surface the SyncStatusScreen with per-operation retry
  (Retry / Export diagnostics). ✅
- Account-deletion unavailability (new): "Account deletion is not
  available right now. Please try again later or contact support." ✅
- OCR low-confidence fields require review before confirm — never a
  bare "Something went wrong." ✅

## Empty states (Prompt 75) — implemented with next actions

| State | Next action shown |
|---|---|
| No groups | "Create your first group" CTA |
| No expenses in group | "Add expense" CTA |
| No settlements | "Settle up" CTA |
| No search results | refine-search hint |
| Offline incomplete history | explains limited history + retry on reconnect |
| No receipt text detected | retry capture / manual entry |
| No backup found | create-backup CTA |

## Destructive-action confirmations (Prompt 75) — implemented

| Action | Confirmation |
|---|---|
| Group deletion | explicit dialog with consequences |
| Expense void/delete | explicit dialog |
| Settlement reversal | explicit dialog (state machine guards) |
| **Account deletion** | consequence screen + acknowledgement checkbox + system dialog (two-step; new in remediation) |
| Backup replacement | explicit dialog |
| Local-image deletion | explicit dialog |

## Recovery paths (Prompt 75) — available

Retry (sync ops, uploads), Continue manually (drafts), Save draft
(expense flow), Review conflict (3-way merge UI), Export diagnostics
(redacted), Contact support (support use cases).

## Gap list (must close before launch — not launch-blocking individually, jointly required by Prompt 80)

1. VoiceOver + TalkBack passes over the 8 core flows (onboarding,
   group create/join, expense create, capture→draft review, balances,
   settlement confirm, offline sync, settings).
2. Largest-accessibility-text pass on Home / Group / Draft screens.
3. Global reduced-motion guard for Reanimated animations.
4. `accessibilityLiveRegion` on sync status + error banners.
5. Contrast re-verification of both themes against WCAG AA for text
   and control states (tokens were calibrated for it; measure + record
   ratios here).
