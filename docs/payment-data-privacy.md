# BillLens — Payment Data Privacy

> Status: **Phase 6 · Tracks 1, 4 — Privacy rules enforced by construction.**

## 1. Overview

The spec (Prompts 56, 57, 59) requires strict privacy for payment data:

- Payment references are masked; hashes are used where full references are unnecessary.
- Evidence attachments follow privacy preferences.
- Notifications hide amounts when configured.
- Lock-screen privacy is respected.
- Settlement notes are access-controlled.
- Removed users cannot access new evidence.
- Analytics excludes raw payment data.
- UPI IDs and bank details are excluded from logs.

## 2. VPA privacy

The `MemberPaymentHandle` entity (Track 4) stores the VPA in two forms:
- `maskedDisplayValue` — always present, safe for UI/audit (e.g. `jo***@oksbi`).
- `encryptedValue` — ciphertext, decrypted only at deep-link build time, then discarded from memory.

The full VPA is NEVER stored in plaintext on the entity, NEVER logged, NEVER included in audit entries.

## 3. Payment reference hashing

The `paymentReferenceHash` field on the `Settlement` entity (Track 1) is a sha256 hash — the raw reference (UPI UTR, bank RRN) is never stored. The hash is used for duplicate detection, not for display.

## 4. Evidence privacy

The `PaymentEvidence` entity (Phase 5) handles screenshot attachments. Access is controlled by the `PrivacyPreference` repository. Removed users lose access to new evidence.

## 5. Notification privacy

Reminders (Track 6) use four privacy modes:
- `private` — lock-screen hides the amount.
- `detailed` — lock-screen includes the amount and group name.
- `in_app_only` — no push notification.
- `disabled` — no notification at all.

Privacy mode is frozen at scheduling time.

## 6. Analytics redaction

The existing `analytics-redactor.ts` and `feedback-redactor.ts` strip sensitive keys and bucket amounts. The UPI module's `upi://` URIs are not logged. VPA strings are masked in all audit entries.

## 7. References

- `src/domain/entities/member-payment-handle.ts` — masked + encrypted VPA.
- `src/domain/entities/settlement.ts` — `paymentReferenceHash`, `evidenceHash`.
- `src/domain/services/upi/upi-vpa-validator.ts` — `maskUpiVpa`.
- `src/domain/services/reminders/reminder-scheduling-rules.ts` — privacy modes.
- [`upi-assisted-payments.md`](./upi-assisted-payments.md)
- [`settlement-reminders.md`](./settlement-reminders.md)
