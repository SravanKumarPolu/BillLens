# Reviewer Notes — BillLens

> Paste into App Store Connect "App Review Information" / Play Console
> "App access". Phase 8, Prompt 77.

## What BillLens is

BillLens is an **offline-first, receipt-aware shared expense app**:
scan receipts, split expenses (equal, exact, percentage, shares,
itemised, multiple payers), understand balances with per-expense
explanations, and record settlements with explicit confirmation.

## Important: guest mode (no account needed)

The app is fully usable **without signing in**. On first launch:

1. Welcome screen → tap **Continue as guest** (or any onboarding step).
2. Create a group from the **Groups** tab → **New group**.
3. Add members by name (they can be invited later).
4. Add a manual expense → pick a split method → save.
5. Use the camera FAB to scan a receipt (any paper receipt; the app
   extracts fields and asks you to review low-confidence ones).
6. Open a group → **Balances** → tap a member to see the full
   explanation of what they owe.
7. **Settle up** to record a settlement. The receiver confirms it —
   settlements are never auto-completed.

## Demo account (if review requires a signed-in state)

| Field | Value |
|---|---|
| Email | `review-demo@billlens.test` |
| Sign-in method | Email OTP — the code will be forwarded to the reviewer inbox on request, or use the deterministic test code `000000` in the staging backend configured for review |
| Notes | Groups "Goa Trip" and "Flat 4B" are pre-seeded with expenses, balances and a pending settlement confirmation |

## UPI-assisted flow (India)

**Settle up → UPI** opens the user's UPI app with the amount pre-filled.
Please note:

- BillLens **does not process or verify payments**. It cannot confirm
  that a payment happened — that is intentional and disclosed in the
  Terms of Service.
- Returning from the UPI app never marks a settlement as paid. The
  settlement stays `pending_confirmation` until the receiver confirms.
- If no UPI app is installed (e.g. review device), the flow shows an
  explanatory empty state. This is expected.

## Offline mode

Airplane mode is fully supported: create groups/expenses offline; they
queue locally and sync on reconnect. A sync-status indicator appears in
the header. Conflicts (e.g. the same expense edited on two devices) are
surfaced for explicit review — never silently overwritten.

## Payment screenshots

A payment screenshot can be attached to a settlement as *evidence*.
It is imported from the gallery, stored locally, and (if sync is on)
uploaded to the payer's own private storage path. It is never used to
verify the payment automatically.

## Privacy controls to try

- Settings → Privacy: analytics opt-out, notification privacy
  (redacted lock-screen content), receipt cloud-sync opt-in.
- Settings → Account → Delete account: in-app deletion with a 14-day
  recovery window (Apple 5.1.1(v) / Play policy compliance).

## Background modes

None. BillLens does not use background location, background audio, or
VoIP. Notifications use standard APNs/FCM.
