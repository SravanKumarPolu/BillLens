# BillLens — Settlement Disputes

> Status: **Phase 6 · Track 5 — Dispute taxonomy and resolution flow implemented.**
> Companion documents: [`settlement-confirmation.md`](./settlement-confirmation.md), [`settlement-lifecycle.md`](./settlement-lifecycle.md).

## 1. Overview

Disputes arise when the receiver of a pending settlement cannot confirm the payment. The Phase 6 dispute system provides a structured reason taxonomy, a resolution flow, and a correction-proposal mechanism. Disputes do NOT alter the completed balance — a disputed settlement is excluded by `contributesToCompletedBalance('disputed') === false`.

## 2. The dispute reason taxonomy

The spec (Prompt 57) defines eight structured dispute reasons:

| Reason | Code | Description |
|---|---|---|
| Payment not received | `not_received` | The receiver did not receive the payment. |
| Wrong amount | `wrong_amount` | The amount recorded does not match what was received. Use `CorrectSettlementAmountUseCase` for the correction flow. |
| Wrong currency | `wrong_currency` | The payment was in a different currency than expected. |
| Wrong sender | `wrong_sender` | The payment came from a different person than expected. |
| Duplicate settlement | `duplicate` | This settlement duplicates another one in the same group. Use `MarkDuplicateSettlementUseCase` for convenience. |
| Payment failed | `failed` | The payment was initiated but failed (bank decline, UPI timeout, etc.). |
| Payment reversed | `reversed` | The payment was later reversed externally (chargeback, UPI dispute, etc.). |
| Other | `other` | None of the above. A note is required. |

The reasons are deliberately enumerated (not free-text) so the UI can render consistent badges and analytics can aggregate cleanly. The `SettlementDisputeReason` type and `ALL_DISPUTE_REASONS` array are defined on the `Settlement` entity (Track 1).

## 3. The dispute flow

```
pending_confirmation
       ↓
   DisputeSettlementUseCase (reason + optional note)
       ↓
    disputed
       ↓
   ┌──────────────────┐
   │                  │
   ▼                  ▼
ResolveDisputeUseCase  ResolveDisputeUseCase
resolution: 'completed' resolution: 'cancelled'
   ↓                  ↓
completed             cancelled
(receiver confirms)    (payment rejected)
```

A disputed settlement does NOT contribute to the balance. On resolution:
- `completed` — the settlement begins contributing (the receiver accepted the payment after all). `confirmedByMemberId` and `confirmedAt` are set.
- `cancelled` — the settlement is terminal and never contributes. No `confirmedByMemberId`.

## 4. The correction-proposal flow

When the receiver confirms a different amount, the spec says:

> "If the receiver confirms a different amount: do not mutate the original amount silently. Create a revision proposal or corrected settlement version. Preserve original evidence. Require appropriate confirmation. Recalculate balance preview."

`CorrectSettlementAmountUseCase` implements this:

1. The original settlement is disputed with reason `wrong_amount` and a note specifying the correct amount. The original's `paymentReferenceHash` and `evidenceHash` are preserved — `disputeSettlement` does not touch them.
2. A NEW draft settlement is created with the corrected amount, the same `fromMemberId`/`toMemberId`/`currencyCode`/`method`, and a note: `Correction of settlement {originalId}`. The new draft also carries the original's `paymentReferenceHash` and `evidenceHash` so duplicate detection still works.
3. The new draft starts at `draft` status and goes through the normal lifecycle (request, record, confirm).

The original is NOT mutated — its amount stays as recorded. Financial history is preserved. The corrected draft carries the correct amount and will replace the original in the balance once it reaches `completed`.

## 5. The duplicate detection flow

`MarkDuplicateSettlementUseCase` is a convenience wrapper around `DisputeSettlementUseCase` with reason `duplicate`. The dispute note includes the id of the settlement this one duplicates (if provided).

The repository's `findByPaymentReferenceHash` and `findByOperationId` methods (Track 1) can be used by the caller to detect likely duplicates before invoking this use case. The unique indexes on `(group_id, payment_reference_hash)` and `(operation_id)` catch duplicates at the database level; the use case is for when the receiver detects a duplicate manually after the settlement was saved.

## 6. Audit trail

Every dispute and resolution produces two audit records (centralised in the `applySettlementTransition` helper):

1. **`settlement_state_history`** — the per-settlement state-transition trail: `pending_confirmation → disputed` and `disputed → completed|cancelled`.
2. **`audit_logs`** — the cross-entity audit log with `changeSummary: { status: { from, to } }`.

The `RequestMoreInfoUseCase` produces only an `audit_logs` entry (no state-history entry, since the status does not change).

All audit entries are append-only — no update or delete methods on either repository.

## 7. Resolution permissions

| Resolution | Who may perform it |
|---|---|
| `completed` (accept) | The receiver (`toMemberId`) only — requires `confirmedByMemberId` |
| `cancelled` (reject) | Either party, or an admin where policy allows |

The `ResolveDisputeUseCase` includes a defensive guard that verifies the settlement is actually in `disputed` status before calling the entity's `resolveDispute` function. This prevents the use case from being used as a normal confirmation path (since the entity's `resolveDispute` with `resolution: 'completed'` would accept `pending_confirmation → completed` as a valid transition).

## 8. What disputes do NOT do

- **Do not alter the balance.** `contributesToCompletedBalance('disputed') === false`. A disputed payment never alters the completed balance.
- **Do not delete the settlement.** Disputes preserve the settlement for audit. The disputed settlement stays in the database with its `disputeReason` and `disputeNote`.
- **Do not mutate the original amount.** The correction-proposal flow creates a new draft, not a mutation.
- **Do not prove payment failure.** A dispute is the receiver's statement that they cannot confirm. The payer may still have paid — the dispute just means BillLens cannot verify it.
- **Do not notify automatically.** The use cases append audit entries; the notification system (future track) reads those entries to produce user-facing messages.

## 9. Testing

The `confirmation-disputes.test.ts` suite covers:
- Dispute happy path with structured reason + note.
- Dispute state-history entry.
- Dispute invalid transition (from completed).
- Resolve to completed (accept) with confirmer.
- Resolve to cancelled (reject).
- Resolve without confirmer (error).
- Resolve on non-disputed settlement (error).
- Request more info (no state change, audit entry).
- Request more info on non-pending settlement (error).
- Mark duplicate with/without duplicateOfSettlementId.
- Mark duplicate on non-pending settlement (error).
- Correct amount: dispute + new draft.
- Correct amount: evidence preservation.
- Correct amount: same-amount error.
- Correct amount: non-pending error.
- Correct amount: non-positive error.
- List pending confirmations.
- List disputed settlements.
- Full lifecycle: pending → disputed → completed.
- Full lifecycle: pending → disputed → cancelled.

## 10. References

- `src/application/settlements/dispute-settlement.usecase.ts`
- `src/application/settlements/resolve-dispute.usecase.ts`
- `src/application/settlements/correct-settlement-amount.usecase.ts`
- `src/application/settlements/mark-duplicate-settlement.usecase.ts`
- `src/application/settlements/request-more-info.usecase.ts`
- `src/application/settlements/list-disputed-settlements.usecase.ts`
- `src/application/settlements/__tests__/confirmation-disputes.test.ts` — 24 tests.
- `src/domain/entities/settlement.ts` — `SettlementDisputeReason`, `ALL_DISPUTE_REASONS`, `disputeSettlement`, `resolveDispute`.
- [`settlement-confirmation.md`](./settlement-confirmation.md) — the confirmation flow.
- [`settlement-lifecycle.md`](./settlement-lifecycle.md) — the state machine.
