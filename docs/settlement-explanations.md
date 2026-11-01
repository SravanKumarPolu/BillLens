# BillLens — Settlement Explanations

> Status: **Phase 6 · Track 2 — Explanation engine implemented.**

## 1. Overview

The explanation engine provides transparent reasoning for every suggested settlement. The spec (Prompt 55) requires:

- Payer's current balance
- Receiver's current balance
- Suggested amount
- Whether full or partial
- Expected balances afterwards
- Why this pairing was chosen
- Whether debt simplification was applied

**Critical rule:** "Do not use generative AI to invent amounts, participants, causes, settlement status, or rounding explanations." Every explanation is generated from structured domain data — never from a language model.

## 2. The six use cases

| Use case | Purpose |
|---|---|
| `GenerateSettlementSuggestionsUseCase` | Suggested transfers per currency, with `reasonCode: 'direct_debt' \| 'simplified_debt'` |
| `PreviewSettlementImpactUseCase` | Before/after balances for a proposed settlement, with `isFullSettlement`, `isPartial`, `isOverpayment` flags |
| `ExplainMemberDebtUseCase` | Per-expense breakdown for a debtor: which expenses, how much paid, how much share, net per expense |
| `ExplainMemberCreditUseCase` | Same but filtered to currencies where the member should receive |
| `GetSuggestedTransferExplanationUseCase` | Structured reasoning for a single transfer, with a human-readable message |
| `CompareOriginalAndSimplifiedPlanUseCase` | Side-by-side: original transfer count vs simplified, transfers saved, members involved |

## 3. Direct vs simplified debt

A transfer is classified as `'direct_debt'` if the payer and receiver share at least one expense in this currency (one paid, the other has a share). Otherwise it's `'simplified_debt'` — the greedy algorithm paired them even though they have no direct expense relationship.

The spec's example for a direct debt:
> "You owe £42. Maya should receive £42. Paying Maya £42 settles both balances."

The spec's example for a simplified debt:
> "You did not necessarily share an expense directly with Maya. This transfer is suggested because BillLens simplified the group's debts while preserving everyone's final balance."

## 4. Source contribution explanation

`ExplainMemberDebtUseCase` returns the per-expense breakdown from the balance engine's `explanations` map:

```
Restaurant — Your share: £24
Taxi — Your share: £10
Hotel — Your share: £18
You paid for groceries — Credit: £10
Current amount owed: £42
```

This is structured data — the UI renders it; no generative AI invents the amounts.

## 5. Impact preview

`PreviewSettlementImpactUseCase` computes:

```
Before:
  You owe: £42
  Maya receives: £42

After paying £25:
  You owe: £17
  Maya receives: £17
```

The preview is a pure computation — it does NOT mutate any settlement.

## 6. References

- `src/application/explanations/` — the six use cases.
- `src/application/explanations/__tests__/explanation-usecases.test.ts` — 9 tests.
- `src/domain/services/balances/balance-engine.ts` — `BalanceExplanationEntry`, `explainMemberBalance`.
- [`balance-engine.md`](./balance-engine.md)
