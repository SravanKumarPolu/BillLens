# BillLens — Partial Settlements

> Status: **Phase 6 · Track 1 + Track 2 — Partial settlement support via the state machine and impact preview.**

## 1. Overview

Partial settlements are settlements where the payer records an amount less than their total debt. The spec (Prompt 53) example:

```
Before settlement: owes £60
Payment recorded: £25
After completion: owes £35
```

The settlement is NOT marked as fully settling the relationship — the payer still owes the remaining £35.

## 2. How partial settlements work

BillLens handles partial settlements naturally: the `amountMinor` on a `Settlement` entity can be any positive integer. The balance engine sums all completed settlements when computing net balances, so a partial settlement simply reduces the debt by the amount paid:

```
net = paid − share + settlementsReceived − settlementsSent
```

A partial settlement of ₹200 from B to A (where B owes ₹400) changes B's net by +200 (from -400 to -200) and A's net by -200. The balance engine does not need a special "partial" flag — the amount IS the partial amount.

## 3. Multi-part payments

The spec supports multiple settlement records for one debt:

```
£20 cash
£25 bank transfer
£15 UPI
```

Each payment is a SEPARATE settlement record. The balance engine sums them all. This preserves the audit trail — each payment has its own method, date, and evidence.

## 4. The impact preview

`PreviewSettlementImpactUseCase` (Track 2) computes the before/after balances for a proposed settlement. It returns `isFullSettlement`, `isPartial`, and `isOverpayment` flags so the UI can show the correct label.

## 5. References

- `src/application/explanations/preview-settlement-impact.usecase.ts`
- `src/application/settlements/create-settlement-draft.usecase.ts`
- `src/application/settlements/record-settlement.usecase.ts`
- [`settlement-domain.md`](./settlement-domain.md)
- [`settlement-lifecycle.md`](./settlement-lifecycle.md)
