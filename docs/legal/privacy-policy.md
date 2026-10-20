# Privacy Policy — BillLens

> **DRAFT — NOT LEGAL ADVICE.** Prepared for review by a qualified
> legal professional before publication (Phase 8, Prompt 78). Version:
> 2026-10-10-draft-1. Effective date: TBD upon legal sign-off.

**Last updated:** [TBD]

This Privacy Policy explains how BillLens ("we", "us") handles your
information when you use the BillLens mobile application and related
services. It is written to match the app's actual behaviour; if the app
and this document ever disagree, the app's behaviour governs what we
fix first, and we update this document in the same release.

## 1. Who we are

BillLens is operated by [OPERATOR LEGAL NAME], [ADDRESS]. Contact:
privacy@billlens.app.

## 2. The short version

- Your receipts and expense data live **on your device** by default.
- Nothing leaves your device unless you create a cloud account and use
  sync, or you explicitly opt in to a remote feature.
- We never sell your data. We run **no advertising** and include **no
  third-party ad trackers**.
- You can delete your account and data from inside the app at any time.

## 3. Data we collect

### 3.1 Guest mode (no account)

When you use BillLens as a guest, all of your data — groups, expenses,
receipt images, drafts, preferences — is stored locally on your device.
We do not receive a copy. A random device installation identifier
(stored in your device's secure storage) is created on first launch; it
is pseudonymous and not linked to your identity.

### 3.2 Account data

If you create an account (email one-time code, Google, or Apple sign-in)
we collect:

- Your **email address** (for authentication and essential service
  communications).
- A **cloud profile** (display name, account id).
- Authentication metadata (provider subject id, session timestamps).

Sessions are stored in your device's secure storage. We do not store
passwords (email sign-in uses one-time codes).

### 3.3 Groups, expenses and settlements

If you use sync, the content you create — groups, members, expenses,
splits, settlements, reminders, dispute notes — is stored on our cloud
hosting provider (Supabase) so your invited group members can see it.
This content is financial **bookkeeping**, not payment credentials.

### 3.4 Receipt images and OCR

- Receipt images are stored locally. They are uploaded to cloud storage
  **only** if you enable receipt cloud sync for that receipt (default
  privacy preference: local-only for sensitive receipts).
- Text extraction (OCR) happens on-device where available. If a remote
  OCR provider is used, you are asked for **explicit, per-use consent**
  first; the image is sent only for the purpose of extraction and is
  deleted after extraction when you choose "delete after extraction".
- Payment screenshots are treated like receipt images, with the same
  privacy controls.

### 3.5 UPI handles

If you choose to save a UPI ID (VPA) for settlement assistance, it is
stored locally and shown **masked** (e.g. `jo***@oksbi`) in the
interface. You can delete it at any time. BillLens never initiates
payments and never receives payment confirmations from UPI apps.

### 3.6 Analytics (optional)

If you consent, we collect privacy-reduced product analytics: feature
usage counters and error rates. **Monetary amounts are bucketed, never
exact**; names, notes, receipt text, merchant names and identifiers are
stripped before leaving the device. You can withdraw consent at any
time in Settings; withdrawal stops future collection.

### 3.7 Crash reports

If you consent, crash reports are collected and **automatically
redacted** — they contain no receipt text, no tokens, no financial
values, no emails.

### 3.8 Notifications

Push notification tokens are stored to deliver reminders and sync
notices. Notification content supports a **private mode** that shows
only "BillLens — new activity" without financial details.

### 3.9 What we never collect

We do not collect or infer: precise or coarse location; your contacts;
your phone number; your bank credentials; card numbers; advertising
identifiers for tracking; or browsing history.

## 4. Third-party processors

Only services actually used are listed:

| Provider | Purpose | Data processed |
|---|---|---|
| Supabase (cloud hosting, auth, storage, Postgres) | Account, sync, storage | As described in §3.2–3.5 |
| Google / Apple (sign-in) | Authentication | Provider identity subject id, email |
| Email delivery (transactional OTP mail) | Send sign-in codes | Email address |
| [OCR PROVIDER — only if remote OCR is enabled and consented] | Receipt text extraction | Receipt image, deleted after extraction |
| Apple / Google (app distribution, crash reporting plumbing) | Store services, OS-level crash plumbing | Device/OS diagnostics per their policies |

Any addition to this list changes the store disclosures and this
policy in the same release.

## 5. Legal bases (EEA/UK users)

- **Contract**: storing and syncing the content you create, providing
  the service you asked for.
- **Consent**: analytics, crash reporting, remote OCR, push
  notifications, receipt cloud sync — each withdrawable independently.
- **Legitimate interests**: fraud/abuse prevention, security auditing,
  aggregate product improvement.
- **Legal obligation**: retaining records we are legally required to
  keep.

## 6. Retention

| Data | Retention |
|---|---|
| Guest data | On-device only; removed when you delete guest data or wipe the app |
| Account & synced content | Until you delete it or delete your account |
| Deleted groups/expenses | 30-day soft-delete period, then purged |
| Receipt images | Until you delete them, or account deletion |
| OCR text | Until the receipt is deleted, or account deletion |
| Analytics | [RETENTION PERIOD — legal to confirm] |
| Crash reports | [RETENTION PERIOD — legal to confirm] |
| Audit records | Retained for financial-integrity and dispute resolution; contain change summaries only |
| Backups | User-created and stored locally; we do not receive them |
| Temporary files | Removed automatically after processing |

## 7. Your rights

Depending on your jurisdiction you may have rights to: access your
data, correct it, export it, delete it, object to or restrict
processing, and lodge a complaint with a supervisory authority.

In-app controls that implement these rights:

- **Export**: full data export (JSON/CSV) from Settings.
- **Correct**: edit any group, expense, or settlement.
- **Delete receipt image**: per-receipt deletion.
- **Withdraw analytics consent**: Settings → Privacy.
- **Disable notifications**: OS settings or in-app.
- **Delete account**: Settings → Account → Delete account (14-day
  recovery window, then cloud deletion completes). Guests delete all
  local data immediately from the same screen.
- **Request support**: support@billlens.app.

## 8. Children

BillLens is not directed at children under 13 (or the equivalent
minimum age in your jurisdiction). We do not knowingly collect data
from children.

## 9. International processing

Our hosting provider may process data in multiple regions. Where
required, transfers rely on appropriate safeguards (such as Standard
Contractual Clauses). [REGIONAL DETAIL — legal to confirm.]

## 10. Security

We use TLS in transit, platform secure storage for tokens, per-user
database row-level security, hashed invite tokens, and signed URLs for
file access. No system is perfectly secure; we document known
limitations honestly in our Security Overview
(`docs/legal/security-overview.md`).

## 11. Changes to this policy

We will notify you of material changes in-app before they take effect
and update the version below.

| Version | Date | Notes |
|---|---|---|
| 2026-10-10-draft-1 | 2026-10-10 | Initial draft for legal review |
