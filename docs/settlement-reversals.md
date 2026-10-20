# BillLens — Settlement Reversals

> Status: **Phase 6 · Track 1 — Reversal pattern implemented.**

## 1. Overview

A completed settlement is corrected through reversal, NOT by mutating the original. The spec (Prompt 58) says: "Do not simply change `completed` to `cancelled`."

## 2. The reversal flow

```
Completed settlement
       ↓
Create reversal record (new settlement, swapped from/to, same amount, status=completed)
       ↓
Link original and reversal (reversesSettlementId / reversalOfSettlementId)
       ↓
Transition original: completed → reversed
       ↓
Balance engine excludes the reversed original; the reversal record cancels it out
```

## 3. Why not just cancel?

Mutating a completed settlement would erase financial history. The reversal pattern preserves:
- The original settlement record (status=`reversed`, amount unchanged).
- The reversal settlement record (status=`completed`, swapped from/to).
- The `settlement_state_history` entries for both transitions.
- The `audit_logs` entries.

A forensic audit can reconstruct what happened: original payment → reversal → corrected payment (if any).

## 4. The `ReverseSettlementUseCase`

The use case (Track 1):
1. Loads the original settlement; verifies it is `completed`.
2. Creates a new reversal record via `createSettlementReversal` (swaps from/to, same amount, status=`completed`).
3. Transitions the original to `reversed` via `reverseSettlement` (links `reversesSettlementId`).
4. Appends state-history and audit entries.

## 5. Balance impact

The balance engine counts a reversal pair as BOTH records:

- The reversal record has `status = 'completed'` with SWAPPED `from`/`to` and the same `amountMinor` — it contributes in the opposite direction.
- The original settlement keeps contributing after its status becomes `reversed` — the pair nets to exactly zero.

Net effect: the balance is as if the original settlement never happened, and both
records remain in the ledger for forensic reconstruction.

> **Why both?** With the swapped direction, the reversal record cancels the
> original only when both are counted. Excluding the reversed original while
> counting its reversal would INVERT the payment (the ledger would claim the
> money moved the opposite way). `contributesToCompletedBalance('reversed')`
> answers the per-record question ("is this record, alone, a completed
> payment?"); the balance engine composes it with the pair rule — see step 3
> of `calculateGroupBalances`.

## 6. References

- `src/application/settlements/reverse-settlement.usecase.ts`
- `src/domain/entities/settlement.ts` — `createSettlementReversal`, `reverseSettlement`.
- `src/domain/services/settlements/settlement-state-machine.ts` — `contributesToCompletedBalance`.
- [`settlement-lifecycle.md`](./settlement-lifecycle.md)
- [`settlement-domain.md`](./settlement-domain.md)
