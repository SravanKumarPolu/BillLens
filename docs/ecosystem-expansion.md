# Ecosystem Expansion

Phase 10 Prompt 99 — Expanding BillLens into a broader financial
collaboration ecosystem.

> **CRITICAL:** Every integration MUST:
> 1. Pass the security review (`isIntegrationSecure() === true`).
> 2. NOT send any of the 5 FORBIDDEN data types (`upi_id`,
>    `bank_password`, `otp`, `payment_pin`,
>    `full_receipt_image_without_consent`).
> 3. Require explicit user consent (no silent auto-connect).
> 4. Be revocable at any time.
> 5. Be audit-logged (every data exchange is recorded).
>
> Tests in `src/domain/ecosystem/__tests__/integration-security.test.ts`
> assert all 5 invariants. If any future integration violates them,
> the tests fail loudly.

## 1. Why this document exists

BillLens is more useful when it connects to the tools users already
use: their accounting software, cloud storage, calendar, email inbox,
collaboration tools, bank account, and payment apps. This document
covers the integration catalog, the security model, and the per-category
implementation details.

Every integration follows the same privacy + security standards
regardless of category. We do not give any integration "special
treatment" — even Stripe (which we use for billing) is treated the
same as a casual calendar sync.

## 2. Integration catalog

Module: `src/domain/ecosystem/integration-model.ts`

### 2.1 Categories

| Category | Count | Examples |
| --- | --- | --- |
| accounting | 4 | QuickBooks, Xero, Zoho Books, FreshBooks |
| cloud_storage | 3 | Google Drive, Dropbox, iCloud Drive |
| calendar | 3 | Google Calendar, Apple Calendar, Outlook |
| email | 1 | Gmail Receipt Import |
| collaboration | 2 | Slack, Microsoft Teams |
| banking | 2 | Plaid (US), TrueLayer (EU/UK) |
| payment | 4 | UPI, Stripe, PayPal, Wise |
| expense_system | 2 | SAP Concur, Expensify |

### 2.2 Each integration declares

- `dataSent`: what data BillLens sends TO the integration
  (e.g. `['expense_summary', 'category']`).
- `dataReceived`: what data BillLens receives FROM the integration
  (e.g. `['vendor', 'account']`).
- `requiredScopes`: OAuth scopes or API key permissions needed.
- `privacyLevel`: `read_only`, `read_write`, or `full_access`
  (we never use `full_access`).

This explicit declaration powers the user consent screen: before
connecting an integration, the user sees exactly what data will be
shared and what data will be received.

### 2.3 CRITICAL: no forbidden data

The list of data types we NEVER share:

| Forbidden type | Why |
| --- | --- |
| `upi_id` | UPI IDs are PII; use UPI deep links instead (the OS handles the VPA). |
| `bank_password` | We never see bank credentials; PSD2 aggregators (Plaid, TrueLayer) handle them. |
| `otp` | OTPs are for user auth only; never transmitted to third parties. |
| `payment_pin` | Same as OTP — never transmitted. |
| `full_receipt_image_without_consent` | Receipt images contain merchant names, locations, and possibly card last-4. We require explicit consent per receipt. |

`containsForbiddenData()` is called by the export pipeline before
every payload is sent. If any forbidden type is detected, the export
is blocked and an alert is raised.

## 3. Integration security review

Module: `src/domain/ecosystem/integration-security.ts`

### 3.1 The 7-point security check

Every integration must pass ALL 7 checks before being exposed to
users:

1. **dataMinimization** — only necessary data is sent (no
   over-collection).
2. **encryptedInTransit** — all traffic is HTTPS/TLS 1.2+ (no
   plaintext HTTP).
3. **noSensitiveDataShared** — no forbidden data types are shared.
4. **userConsentRequired** — user must explicitly connect the
   integration (no silent auto-connect).
5. **revocable** — user can disconnect at any time (no lock-in).
6. **auditLogged** — all data exchanges are written to the audit
   trail.
7. **privacyPolicyReviewed** — vendor's privacy policy has been
   reviewed by our DPO.

`isIntegrationSecure(review)` returns `true` only when all 7 are
true AND `securityReviewDate` is a valid ISO date.

### 3.2 Blocked vs approved integrations

- `getBlockedIntegrations(reviews)` — IDs with failed reviews.
  Hidden from the catalog UI.
- `getApprovedIntegrations(reviews)` — IDs with passing reviews.
  Shown in the catalog UI.

An integration with NO review is treated the same as a FAILED review
— the integration is hidden until a review is on file.

## 4. Accounting export

Module: `src/domain/ecosystem/accounting-export.ts`

### 4.1 Supported formats

| Format | Output | Notes |
| --- | --- | --- |
| `csv_generic` | CSV | RFC 4180-compliant, lowercase headers |
| `quickbooks` | CSV | Title-Case headers, QuickBooks-compatible |
| `xero` | CSV | Title-Case headers, Xero-compatible |
| `freshbooks` | CSV | lowercase headers, FreshBooks-compatible |
| `zoho_books` | CSV | Title-Case headers, Zoho Books-compatible |
| `wave` | CSV | Title-Case headers, Wave-compatible |
| `ofx` | OFX 2.2 | Open Financial Exchange format |

### 4.2 Exported fields

Only summary data is exported:

- `date`
- `amount` (minor → major units, 2 decimals)
- `currency`
- `description` (the user-edited expense title — NOT the raw OCR text)
- `category` (defaults to "Uncategorised")

We do NOT export:

- User PII (names, emails, phone numbers)
- Raw receipt images (only summary data)
- Bank account numbers
- UPI IDs

### 4.3 OFX notes

OFX (Open Financial Exchange) is a legacy SGML-ish format used by
desktop accounting software (Quicken, MS Money, GnuCash). Our OFX
export:

- Uses OFX 2.2 (SGML, not XML — most parsers expect SGML).
- Includes a `FITID` (financial institution transaction ID) per
  transaction, computed as a deterministic hash of the date+amount+title.
- Escapes `<`, `>`, `&` in titles by replacing with spaces (OFX SGML
  doesn't have proper XML escaping).

## 5. Calendar sync

Module: `src/domain/ecosystem/calendar-sync.ts`

### 5.1 Settlement reminders

`createSettlementReminderEvent(settlement)` creates a calendar event:

- Title: "Settle up: Alice → Bob 12.50 USD"
- Description: includes amount, currency, and a BillLens deep link
- Starts at the due date (all-day in the user's timezone, computed
  by the application layer)
- No attendees by default (the user can add the recipient's email
  if they explicitly choose to notify)

### 5.2 Expense events

`createExpenseEvent(expense)` creates a calendar event:

- Title: "Lunch at Starbucks — 12.50 USD"
- Description: includes amount, currency, and a BillLens deep link
- No merchant name in the description (it's in the title only if the
  user put it there — the user controls what to write in the title)

### 5.3 Privacy

Calendar events often end up in shared calendars (work calendars,
family calendars). We deliberately keep the description minimal —
no merchant names beyond what's in the user-edited title, no
categories, no receipt text.

## 6. Payment providers

Module: `src/domain/ecosystem/payment-provider.ts`

### 6.1 Provider catalog

| Provider | Currencies | Countries | Fees | Instant |
| --- | --- | --- | --- | --- |
| UPI | INR | IN | 0% + ₹0 | ✅ |
| Razorpay | INR, USD, EUR, GBP | IN, US, GB, DE, FR, SG, AE | 2% + ₹0 | ❌ |
| Stripe | USD, EUR, GBP, CAD, AUD, JPY, SGD | US, GB, CA, AU, DE, FR, JP, SG | 2.9% + $0.30 | ❌ |
| PayPal | USD, EUR, GBP, CAD, AUD, JPY | US, GB, CA, AU, DE, FR, JP | 3.49% + $0.49 | ❌ |
| PayPal.me | USD, EUR, GBP, CAD, AUD | US, GB, CA, AU, DE, FR | 0% (P2P) | ❌ |
| Wise | USD, EUR, GBP, CAD, AUD, JPY, SGD, INR, AED | US, GB, CA, AU, DE, FR, JP, SG, IN, AE | 0.5% | ❌ |
| Venmo | USD | US | 0% (P2P) | ❌ |

### 6.2 Payment link generation

`generatePaymentLink(provider, params)` returns a URL or deep link
that the user can tap to initiate payment. The `recipient` field is
a provider-specific reference (VPA, payment link ID, username) — it
is NOT a raw UPI ID, bank account, or card number.

UPI deep links use the NPCI-standard format:

```
upi://pay?pa=<recipient>&pn=BillLens&am=<amount>&cu=INR&tn=<note>
```

The OS handles the deep link — the user's preferred UPI app opens
with the payment pre-filled. BillLens never sees the user's UPI PIN
or the transaction result (the recipient confirms offline).

### 6.3 Fee calculation

`computePaymentFee(provider, amountMinor)` returns the fee in minor
units of the transaction currency. Useful for showing the user
"You'll pay $X including $Y fee" at checkout.

## 7. Banking integrations — RESTRICTED

BillLens does NOT directly connect to bank accounts. Bank transaction
import is provided ONLY via regulated PSD2/Open Banking aggregators:

- **Plaid** (US, Canada) — NACHA-compliant, SOC 2 Type II certified.
- **TrueLayer** (EU, UK) — PSD2-compliant, FCA-regulated.

The aggregators hold the bank credentials (via OAuth or their own
secure flow). BillLens receives only:

- `bank_transaction` (date, amount, description)
- `account_metadata` (account type, masked account number)

We never see:

- Bank login credentials
- Full account numbers
- Card numbers
- CVVs

### 7.1 Consent flow

1. User clicks "Import bank transactions" in BillLens.
2. They're redirected to Plaid/TrueLayer's hosted Link flow.
3. They authenticate with their bank on the aggregator's domain.
4. The aggregator issues a short-lived access token to BillLens.
5. BillLens fetches the last 30 days of transactions.
6. The user reviews and categorises each transaction as a BillLens
   expense.

### 7.2 Revocation

The user can disconnect the bank at any time from the BillLens
settings. This invalidates the access token at the aggregator —
BillLens can no longer fetch new transactions. Previously imported
transactions remain (they are now BillLens expenses, not bank data).

## 8. Email receipt import

Module: `src/domain/ecosystem/integration-model.ts` (gmail_receipts
integration).

### 8.1 Consent model

Gmail receipt import requires DUAL consent:

1. The user connects Gmail (OAuth scope: `gmail.readonly`).
2. For EACH email that looks like a receipt, the user is asked
   "Import this receipt from Starbucks, dated 2026-07-01, $12.50?"
   They can approve or skip.

We do NOT bulk-import emails without per-email consent. This is a
deliberate privacy choice — your inbox is the most sensitive document
you own.

### 8.2 Receipt detection

The Gmail integration scans the inbox for emails matching heuristics:

- From: known merchant domains (starbucks.com, amazon.com, uber.com, etc.)
- Subject: contains "receipt", "order", "invoice", "confirmation"
- Body: contains a total amount in a supported currency

False positives are filtered out by the OCR pipeline (if the receipt
doesn't have a sensible amount/date, it's dropped).

### 8.3 Retention

Imported receipts become BillLens expenses — they follow the same
retention rules as user-created expenses. The original Gmail email is
NOT modified, NOT deleted, and NOT marked as read.

## 9. Collaboration tools (Slack, Microsoft Teams)

### 9.1 Notification model

BillLens sends notifications to Slack/Teams channels for:

- Settlement reminders (daily digest at 9am user time)
- New group expenses (optional, off by default)
- Group balance summaries (weekly digest on Mondays)

### 9.2 Privacy

Notifications contain ONLY:

- Settlement amount + currency + payer/payee names
- Expense title + amount + currency (no merchant name, no category)
- Group name + a BillLens deep link

We do NOT send:

- Receipt images
- Bank details
- UPI IDs
- Personal contact info beyond what's in the group member list

### 9.3 Channel consent

The user picks which Slack/Teams channel receives notifications. We
do not auto-pick a channel. The user can mute specific notification
types (e.g. "settlement reminders only, no new-expense pings").

## 10. Audit logging

Every integration data exchange is written to the audit trail with:

- `actorId`: the user who triggered the exchange
- `resourceType`: the integration ID (e.g. 'quickbooks')
- `resourceId`: the exported record ID (e.g. expense ID)
- `action`: 'export' / 'import' / 'sync'
- `result`: 'success' / 'failure' / 'denied'
- `metadata`: redacted summary (no PII — see `analytics-redactor.ts`)

This is enforced by the application layer's integration adapter —
the domain module only declares that audit logging is required
(via the `auditLogged` flag in `IntegrationSecurityReview`).

## 11. Vendor management

Every integration vendor is registered in the vendor management
system (`src/domain/compliance/vendor-management.ts`) with:

- Risk level (low/medium/high/critical)
- Data access level (none/limited/extensive/full)
- DPIA status (required for extensive/full data access)
- Contract expiry date
- SOC 2 report link (if vendor has one)
- ISO 27001 certification status

High-risk vendors (Plaid, TrueLayer, Google Vision, Supabase) are
reviewed quarterly. See `docs/compliance-governance.md` for the full
vendor inventory.

## 12. User controls

### 12.1 Connection management

Users can see all their connected integrations in Settings →
Integrations. For each connection they can:

- View what data is being shared (the `dataSent` list)
- View the last sync time
- Pause sync (temporarily disconnect without losing config)
- Disconnect permanently (revokes OAuth token + deletes config)
- View the audit log of all data exchanges

### 12.2 Data export

Users can export a complete record of what data has been shared with
each integration:

- Date/time of each exchange
- Direction (sent / received)
- Record count (e.g. "15 expenses exported to QuickBooks")
- Per-record detail (with PII redacted per the analytics redactor)

This export is generated as a JSON file and downloadable from the
Settings → Privacy → Data Export screen.

### 12.3 Right to be forgotten

When a user deletes their BillLens account:

1. All OAuth tokens are revoked at the integration providers.
2. All cached integration data is purged from BillLens servers.
3. The user is informed that previously-exported data (e.g. expenses
   already in QuickBooks) is NOT automatically deleted at the
   integration — they must request deletion from each provider
   directly. We provide a list of providers + their deletion URLs.

## 13. References

- `src/domain/ecosystem/integration-model.ts` — catalog of 19 integrations.
- `src/domain/ecosystem/integration-security.ts` — 7-point security review + FORBIDDEN_DATA_TYPES.
- `src/domain/ecosystem/accounting-export.ts` — CSV / OFX exporters.
- `src/domain/ecosystem/calendar-sync.ts` — settlement + expense events.
- `src/domain/ecosystem/payment-provider.ts` — payment link generators.
- `src/domain/compliance/vendor-management.ts` — vendor risk + DPIA.
- `src/domain/compliance/audit-trail-management.ts` — audit event store.
- `src/domain/analytics/analytics-redactor.ts` — PII redaction for metadata.
- `docs/compliance-governance.md` — compliance framework.
- `docs/privacy-and-trust.md` — privacy commitments.
