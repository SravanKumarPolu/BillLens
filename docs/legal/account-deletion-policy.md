# Account Deletion Policy — BillLens

> **DRAFT — NOT LEGAL ADVICE.** For review by a qualified legal
> professional before publication (Phase 8, Prompt 77/78). The
> in-app flow is implemented by `RequestAccountDeletionUseCase` /
> `CancelAccountDeletionUseCase` (application layer) and
> `/settings/delete-account` (screen).

**Last updated:** [TBD]

## 1. How to delete your account

1. Open BillLens → **Settings → Account → Delete account**.
2. Read the consequences screen (what is deleted, what is preserved).
3. Tick the acknowledgement, tap **Delete my account**, then confirm
   in the system dialog.
4. Deletion is **scheduled** — you get a 14-day recovery window.

Guest users (no account): the same screen performs an **immediate,
permanent wipe of all local BillLens data** — there is no cloud
account to delete. This cannot be undone.

A deletion request can also be submitted by email from the address on
the account: privacy@billlens.app (used by Play Console's
"account deletion URL" requirement).

## 2. What happens immediately

- Your sessions are **revoked**: you are signed out on this device and
  the stored session is cleared. Other devices are signed out at next
  sync attempt.
- The deletion is recorded and scheduled; **no cloud data is destroyed
  yet**.
- Your local data is **preserved** during the recovery window so you
  can cancel, and so nothing is lost if you change your mind.

## 3. Recovery window (14 days)

- Sign in again and choose **Cancel deletion** (or contact support)
  before the deadline to restore your account unchanged.
- The Settings screen shows the exact deadline while a deletion is
  pending.
- After 14 days the deletion **cannot** be cancelled or reversed.

## 4. What is deleted when the window closes

- Your cloud profile, auth linkages, and account email association.
- All content you synced: groups you own, expenses, splits,
  settlements, reminders, disputes, notification tokens.
- Your receipt images and payment evidence in cloud storage.
- Your privacy consents (recorded, then deleted with the account).

## 5. What is preserved (and why)

- **Group history for other members**: expenses you participated in
  remain in groups you don't solely own, shown with your display name
  (and attributed as appropriate), because deleting them would corrupt
  other members' balances. Your profile content is reduced to the
  minimum needed for ledger integrity.
- **Audit records**: append-only change summaries required for
  financial integrity and dispute resolution. They contain no receipt
  content, no tokens, no financial values.

## 6. Receipt deletion

Receipt images can be deleted at any time without deleting the
account (per-receipt delete). Account deletion removes any remaining
receipts as part of the purge.

## 7. Local data choice

During the recovery window you may also wipe local data manually
(sign out + delete app data). After the cloud purge completes, any
remaining local copy on a signed-out device is orphaned and can be
removed by deleting the app.

| Version | Date | Notes |
|---|---|---|
| 2026-10-10-draft-1 | 2026-10-10 | Initial draft for legal review |
