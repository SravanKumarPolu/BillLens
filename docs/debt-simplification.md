# BillLens — Debt Simplification

> Status: **Phase 6 · Track 3 — Multi-currency simplification engine.**

## 1. Overview

Debt simplification reduces the number of transfers needed to settle a group while preserving each member's net financial position.

Example:
```
Alex owes Priya £20
Priya owes Sam £20
```
Simplified:
```
Alex pays Sam £20
```

The algorithm is deterministic (greedy, largest-debtor-to-largest-creditor, tie-broken by memberId ASC) and preserves every member's net balance exactly.

## 2. Multi-currency separation

Simplification runs separately for each currency. The `calculateGroupBalancesByCurrency` function (Track 3) returns one `CurrencyBalanceResult` per currency, each with its own `suggestedTransfers`. Cross-currency transfers are never suggested.

## 3. The algorithm

The greedy algorithm in `generateSuggestedTransfers`:
1. Split members into debtors (net < 0) and creditors (net > 0).
2. Sort each group by absolute amount DESC, then by memberId ASC for determinism.
3. Greedily match the largest debtor to the largest creditor, transferring the smaller of the two amounts.
4. Repeat until all debts are settled.

The algorithm is NOT globally optimal (minimizing the number of transfers is NP-hard), but it is deterministic and within 1 transfer of optimal for typical groups (2-20 members).

## 4. Original vs simplified comparison

`CompareOriginalAndSimplifiedPlanUseCase` (Track 2) shows the transfer savings: `originalTransferCount` (debtors × creditors) vs `simplifiedTransferCount` (greedy result), plus `transfersSaved` and `membersInvolved`.

## 5. Verification

`verifyTransfersZeroOutBalances` is a safety check that verifies executing all suggested transfers would zero out every balance. It is used by tests and the explanation engine.

## 6. References

- `src/domain/services/balances/balance-engine.ts` — `generateSuggestedTransfers`
- `src/domain/services/settlements/settlement-engine.ts` — `simplifySettlements`, `verifyTransfersZeroOutBalances`
- `src/application/explanations/generate-settlement-suggestions.usecase.ts`
- `src/application/explanations/compare-original-and-simplified-plan.usecase.ts`
- [`balance-engine.md`](./balance-engine.md)
