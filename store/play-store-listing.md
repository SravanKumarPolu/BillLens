# Google Play Listing — BillLens

> Status: **DRAFT for submission preparation** (Phase 8, Prompt 77).

## Store listing

| Field | Value |
|---|---|
| App name | BillLens |
| Package name | `com.billlens.app` (production profile) |
| Category | Finance |
| Tags | Expense sharing, Receipt scanning, Budgeting |

### Short description (≤ 80 chars)

> Scan receipts, split shared expenses and settle up — offline-first.

### Full description

Same body as the iOS App Store description (see
`store/app-store-listing.md`) — maintained as a single source of truth.
The last paragraph (expense organisation tool disclaimer) must remain.

## Data Safety form (Play Console)

Answers must match the Privacy Policy and actual behaviour:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Data collected: email address | Yes — account auth only. Not shared. Transmitted over TLS. Deletable (account deletion). |
| Data collected: user content (receipts, expense data) | Yes — only when the user enables sync. Not shared with third parties. Deletable. |
| Data collected: app interactions (analytics) | Optional (user can opt out). Bucketed amounts only. Not linked to identity. |
| Data collected: crash logs | Optional. Automatically redacted (no receipt text, no tokens). Not linked to identity. |
| Data collected: device or other IDs | Pseudonymous device installation id for sync + push. Not linked to identity. |
| Data shared with third parties | None for advertising. Cloud hosting (Supabase) processes data on the developer's instructions. |
| All data is transmitted over a secure connection | Yes |
| Users can request data deletion | Yes — in-app deletion + support request |

## Content rating

IARC questionnaire: Finance utility, no ads, no user-generated content
sharing beyond private invited groups, no gambling. Expected rating:
Everyone / PEGI 3.

## Target API compliance

Expo SDK 51 targets Android 14 (API 34) — satisfies Play target-API
requirements at time of preparation. Verify against the current Play
policy before each submission.

## Financial-features declaration

BillLens **does not** enable financial transactions inside the app. It
organises records and can open an external UPI app with a pre-filled
payment intent. Declare "No" for loans/credit/wallet features. The UPI
assist is a deep link only (`upi://pay?...`) — no payment is processed,
verified, or completed by BillLens (the return handler structurally has
no "payment completed" state).

## Ads declaration

No ads.

## App access instructions (for review)

| Field | Value |
|---|---|
| Credentials | Demo account (see `store/reviewer-notes.md`) |
| Guest mode | Fully functional without any account — reviewer can skip sign-in entirely |

## Account deletion (Play requirement)

In-app deletion at Settings → Account → Delete account, plus a deletion
request via the account-deletion URL (support email). Recovery window:
14 days. See `docs/legal/account-deletion-policy.md`.

## Permission declarations (runtime)

| Permission | Purpose | User-visible justification |
|---|---|---|
| CAMERA | Scan receipts / payment screenshots | "BillLens uses the camera to scan receipts and payment screenshots." |
| READ_MEDIA_IMAGES (READ_EXTERNAL_STORAGE ≤ 32) | Import receipt/screenshot images from gallery | "BillLens needs access to your photo library to import receipt images." |
| POST_NOTIFICATIONS (13+) | Sync + reminder notifications | Optional; private mode available |
| INTERNET | Sync, auth | Core functionality |
| BIOMETRIC (if app lock enabled) | Optional app lock | Local-only convenience |

No location, no contacts, no microphone, no background location.
