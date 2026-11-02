# BillLens — Settlement Confirmation

> Status: **Phase 6 · Track 5 — Receiver confirmation flow implemented.**
> Companion documents: [`settlement-domain.md`](./settlement-domain.md), [`settlement-lifecycle.md`](./settlement-lifecycle.md), [`settlement-disputes.md`](./settlement-disputes.md).

## 1. Overview

The receiver-confirmation flow is the MVP safety mechanism for BillLens settlements. When a payer records a payment, the settlement enters `pending_confirmation` status. The receiver then reviews the payment details and chooses one of five actions:

| Action | Use case | State change |
|---|---|---|
| **Confirm full amount** | `ConfirmSettlementUseCase` (Track 1) | `pending_confirmation → completed` |
| **Confirm different amount** | `CorrectSettlementAmountUseCase` (Track 5) | dispute original + create new draft |
| **Dispute payment** | `DisputeSettlementUseCase` (Track 5) | `pending_confirmation → disputed` |
| **Request more information** | `RequestMoreInfoUseCase` (Track 5) | no state change — audit entry only |
| **Mark duplicate** | `MarkDuplicateSettlementUseCase` (Track 5) | `pending_confirmation → disputed` (reason: `duplicate`) |

The receiver can also cancel their own pending settlement (via `CancelSettlementUseCase` from Track 1) where the group's permission policy allows.

## 2. The MVP confirmation policy

The spec (Prompt 56) defines the MVP policy:

```
User records settlement
       ↓
Status becomes pending confirmation
       ↓
Receiver confirms
       ↓
Status becomes completed
```

For trusted self-recorded cash settlements, the product policy may allow immediate completion with clear audit history (the `draft → completed` direct transition in the state machine). However, for shared settlements where the payer is not the receiver, the `pending_confirmation` intermediate state is the default.

## 3. The receiver review screen

The spec (Prompt 57) specifies the display fields for the receiver's review:

- Payer (`fromMemberId`)
- Receiver (`toMemberId`)
- Amount
- Currency
- Method
- Date
- Note
- Payment reference, masked
- Evidence attachment
- Expected balance impact
- Who created the record (`createdBy`)

The UI (to be wired in a future track) reads these fields from the `Settlement` entity and from the balance engine's impact preview. The use cases themselves are stateless — they take the settlement id and the receiver's action, validate it, apply the state transition, and append the audit trail.

## 4. The five confirmation actions

### 4.1 Confirm full amount

`ConfirmSettlementUseCase` (Track 1) transitions `pending_confirmation → completed`. It sets `confirmedByMemberId` (the receiver) and `confirmedAt` on the entity for the audit trail. After this transition, the settlement contributes to the completed balance (`contributesToCompletedBalance('completed') === true`).

Only the receiver (`toMemberId`) may confirm. The use case trusts the caller to enforce that permission check via the `GroupAuthorizationService`.

### 4.2 Confirm different amount

`CorrectSettlementAmountUseCase` (Track 5) implements the spec's correction-proposal flow:

> "If the receiver confirms a different amount: do not mutate the original amount silently. Create a revision proposal or corrected settlement version. Preserve original evidence. Require appropriate confirmation. Recalculate balance preview."

The flow:
1. The original settlement is disputed with reason `wrong_amount` and a note specifying the correct amount. The original's evidence (paymentReferenceHash, evidenceHash) is preserved.
2. A new draft settlement is created with the corrected amount, same from/to/currency/method, and a note linking back to the original.
3. The new draft starts at `draft` status and goes through the normal lifecycle.

The original is NOT mutated — its amount stays as recorded. Financial history is preserved. The corrected draft carries the correct amount and will replace the original in the balance once it reaches `completed`.

### 4.3 Dispute payment

`DisputeSettlementUseCase` (Track 5) transitions `pending_confirmation → disputed` with a structured dispute reason from the eight-value taxonomy. The disputed settlement does NOT contribute to the balance (`contributesToCompletedBalance('disputed') === false`).

### 4.4 Request more information

`RequestMoreInfoUseCase` (Track 5) is the gentlest action: it does NOT change the settlement's status. It appends an audit entry with the receiver's request, which the payer sees in their notification feed. The settlement stays in `pending_confirmation`.

### 4.5 Mark duplicate

`MarkDuplicateSettlementUseCase` (Track 5) is a convenience wrapper around `DisputeSettlementUseCase` with reason `duplicate`. The dispute note includes the id of the settlement this one duplicates (if provided). The disputed settlement can then be resolved via `ResolveDisputeUseCase` with `resolution: 'cancelled'`.

## 5. Notifications

The spec (Prompt 57) requires notifications for:

- Settlement awaiting confirmation
- Settlement confirmed
- Settlement disputed
- More information requested
- Settlement corrected
- Settlement cancelled

These notifications are delivered via the notification system (a future track). The use cases append audit entries with structured `changeSummary` fields that the notification system reads to produce user-facing messages. Respect for notification preferences (quiet hours, privacy modes) is handled by the notification layer, not by the confirmation use cases.

## 6. Permission model

| Action | Who may perform it |
|---|---|
| Confirm full amount | The receiver (`toMemberId`) only |
| Confirm different amount | The receiver only |
| Dispute | The receiver only |
| Request more info | The receiver only |
| Mark duplicate | The receiver or an admin |
| Cancel own pending | The creator (`createdBy`) where policy allows |

Admins MUST NOT be able to fabricate confirmation silently. The `confirmedByMemberId` field on the entity preserves who actually confirmed, enabling later audit if a permission violation is suspected.

The `GroupAuthorizationService` (from Phase 3) should be extended with settlement-specific permission checks. The use cases trust the caller to enforce permissions before invoking.

## 7. Evidence handling

Evidence (payment screenshots, receipts, bank references, UPI transaction references) does NOT automatically prove completion. The spec is explicit:

> "Evidence must not automatically prove completion."

The receiver reviews the evidence as part of their confirmation decision. The `paymentReferenceHash` and `evidenceHash` fields on the settlement entity (Track 1) are used for duplicate detection, not for status changes. The receiver can still dispute a settlement that has evidence attached — the evidence is preserved through the dispute for the resolution flow.

## 8. Privacy

The spec (Prompt 57) requires:

> "Restrict evidence access to authorised members. Mask sensitive transaction details in UI and logs."

The `paymentReferenceHash` is a sha256 hash — the raw reference is never stored on the entity. The evidence attachment (managed by the `PaymentEvidence` entity from Phase 5) follows the attachment-privacy preferences. The audit entries contain only the masked form of payment references, never the raw reference.

## 9. Testing

- **`confirmation-disputes.test.ts`** — 24 tests covering all 7 Track 5 use cases:
  - `DisputeSettlementUseCase`: happy path (reason + note), state-history entry, invalid transition from completed, not-found.
  - `ResolveDisputeUseCase`: completed resolution (with confirmer), cancelled resolution, missing confirmer error, non-disputed settlement error.
  - `RequestMoreInfoUseCase`: audit entry without state change, empty note error, non-pending-confirmation error.
  - `MarkDuplicateSettlementUseCase`: with/without duplicateOfSettlementId, non-pending-confirmation error.
  - `CorrectSettlementAmountUseCase`: dispute + new draft, evidence preservation, same-amount error, non-pending-confirmation error, non-positive amount error.
  - `ListPendingConfirmationsUseCase`: lists pending only, empty when none.
  - `ListDisputedSettlementsUseCase`: lists disputed only.
  - Full dispute lifecycle: pending → disputed → completed, pending → disputed → cancelled.

## 10. References

- `src/application/settlements/confirm-settlement.usecase.ts` — confirm full amount (Track 1).
- `src/application/settlements/correct-settlement-amount.usecase.ts` — confirm different amount (Track 5).
- `src/application/settlements/dispute-settlement.usecase.ts` — dispute (Track 5).
- `src/application/settlements/request-more-info.usecase.ts` — request more info (Track 5).
- `src/application/settlements/mark-duplicate-settlement.usecase.ts` — mark duplicate (Track 5).
- `src/application/settlements/resolve-dispute.usecase.ts` — resolve dispute (Track 5).
- `src/application/settlements/list-pending-confirmations.usecase.ts` — receiver inbox (Track 5).
- `src/application/settlements/list-disputed-settlements.usecase.ts` — dispute queue (Track 5).
- `src/application/settlements/__tests__/confirmation-disputes.test.ts` — 24 tests.
- [`settlement-lifecycle.md`](./settlement-lifecycle.md) — the state machine.
- [`settlement-disputes.md`](./settlement-disputes.md) — the dispute taxonomy and resolution flow.
