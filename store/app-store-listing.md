# App Store (iOS) Listing — BillLens

> Status: **DRAFT for submission preparation** (Phase 8, Prompt 77).
> All claims below are limited to implemented behaviour. Positioning
> avoids unsupported claims (no guaranteed OCR accuracy, no payment
> verification, no "bank-level security").

## App identity

| Field | Value |
|---|---|
| App name | BillLens |
| Subtitle | Scan. Split. Settle with confidence. |
| Bundle ID | `com.billlens.app` (production profile) |
| Category | Finance |
| Secondary category | Productivity |
| Copyright | © 2026 BillLens |
| Support URL | https://billlens.app/support |
| Privacy Policy URL | https://billlens.app/privacy |
| Terms of Service URL | https://billlens.app/terms |
| Marketing URL | https://billlens.app |

## Promotional text (≤ 170 chars)

> Scan receipts, understand shared expenses and settle with confidence.
> Offline-first, receipt-aware, and private by default — your data stays
> on your device unless you choose to sync.

## Description

BillLens is an offline-first, receipt-aware shared expense app for
couples, roommates, travel groups and small events.

CAPTURE
- Scan paper receipts with your camera, or import screenshots from your
  gallery — including payment screenshots.
- BillLens reads the merchant, date, total and line items, then asks you
  to review every low-confidence field before anything is saved.

UNDERSTAND
- Transparent balance explanations show exactly why someone owes what
  they owe — every contributing expense, every payment, per currency.
- Multiple payers, itemised receipts, percentages, shares and exact
  amounts are all supported, with rounding explained, never hidden.

SETTLE
- Simplified settlement plans reduce the number of transfers needed.
- UPI-assisted flows open your UPI app with the amount pre-filled.
  BillLens never verifies the payment for you — the receiver confirms
  every settlement explicitly, and every confirmation is auditable.

OFFLINE-FIRST
- Create groups and expenses without a network. Everything queues
  locally and syncs safely when you reconnect, with explicit conflict
  review — never silent overwrites.

PRIVATE BY DEFAULT
- Receipts stay on your device unless you choose to sync them.
- Remote receipt reading requires your explicit opt-in per use.
- Optional analytics, redacted crash reports, and a full data export.

Note: BillLens is an expense organisation tool. It is not a bank, does
not hold funds, and cannot verify external payments. Always confirm
settlements with the receiving person.

## Keywords (≤ 100 chars)

`bill split,shared expenses,roommates,receipt scan,expense tracker,settle up,UPI,group expenses`

## Age rating

4+ (no objectionable content; no gambling; no user-generated content
shared beyond invited group members).

## App Privacy answers (App Store Connect)

| Data type | Collected | Linked to identity | Tracking |
|---|---|---|---|
| Contact info (email) | Yes, only for authenticated accounts | Yes | No |
| User content (receipts, expenses) | Yes, only when sync is used | Yes | No |
| Identifiers (device installation id) | Yes | No (pseudonymous) | No |
| Diagnostics (crash reports) | Optional, redacted | No | No |
| Usage data (analytics) | Optional, opt-out available, amount-bucketed | No | No |
| Location | **Not collected** | — | — |
| Payment info | **Never collected** (UPI flows open external apps) | — | — |

## Sign in with Apple

Apple sign-in is implemented (`signInWithApple`). Because BillLens also
offers email OTP and Google, Sign in with Apple is offered as a
third-party login option per guideline 4.8.

## Export compliance

Uses only standard HTTPS and platform-provided crypto (SecureStore /
Keychain). Export compliance: uses encryption exempt from French/Chinese
declaration requirements — standard ECC/AES via OS. `ITSAppUsesNonExemptEncryption: NO` to be set in Info.plist at submission.

## Account deletion

In-app deletion is available: Settings → Account → Delete account
(routes to `/settings/delete-account`), with a 14-day recovery window.
This satisfies App Review 5.1.1(v).

## Screenshot plan

See `store/screenshots-plan.md` — all screenshots must use the seeded
demo dataset (no real receipts, no real UPI IDs, no real names).
