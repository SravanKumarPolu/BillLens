# BillLens — Explanation Engine

> Status: **Phase 1 · Revised Prompt 5 complete.**

This document describes the Explanation Engine — BillLens's deterministic,
auditable system for explaining WHY balances are what they are.

## 1. Purpose

BillLens's balance engine calculates WHO owes WHOM. The Explanation
Engine answers WHY:

- Why does this member owe money?
- Why should this member receive money?
- Which expenses contributed to this balance?
- What changed after an edit?
- What changed after a settlement?
- Where did rounding occur?

**Critical rule**: Explanations are built from verified financial records
ONLY. No uncontrolled AI/LLMs are used. Every explanation is deterministic
and auditable.

## 2. Architecture

```
Financial Records (Expenses, Payers, Splits, Settlements)
              ↓
      Balance Engine
         (calculates net balances)
              ↓
    Explanation Engine
         (translates math into text)
              ↓
   BalanceExplanation
   (structured + human-readable)
```

The Explanation Engine is a PURE domain service. It imports from:
- Balance engine output (`MemberBalance`, `BalanceResult`)
- Financial records (`Expense`, `Settlement`, `ExpenseSplit`)
- Domain value objects (`Money`, `CurrencyCode`, `DateTime`)

It does NOT import from:
- React, React Native, Expo
- Presentation layer
- Application layer
- Infrastructure layer

## 3. Output types

### BalanceExplanation

```ts
interface BalanceExplanation {
  memberId: MemberId;
  paidMinor: number;              // Total amount paid across all expenses
  shareMinor: number;             // Total allocated share
  settlementsSentMinor: number;   // Total sent via settlements
  settlementsReceivedMinor: number; // Total received via settlements
  netBalanceMinor: number;        // Net: paid - share - received + sent
  expenseContributions: ExpenseContribution[];
  settlementImpact: SettlementExplanation[];
  roundingNotes: RoundingExplanation[];
  summaryKey: 'creditor' | 'debtor' | 'settled';
  summaryText: string;            // Human-readable summary
}
```

### ExpenseContribution

For each expense the member participated in:
```ts
interface ExpenseContribution {
  expenseId: string;
  expenseTitle: string;
  paidByMemberId?: MemberId;
  memberPaidMinor: number;       // How much this member paid
  memberShareMinor: number;      // How much this member owes
  memberNetForExpenseMinor: number; // Net impact of this expense
  expenseDate: string;
}
```

### SettlementExplanation

For each settlement involving the member:
```ts
interface SettlementExplanation {
  settlementId: string;
  fromMemberId: MemberId;
  toMemberId: MemberId;
  amountMinor: number;
  date: string;
  impactOnMember: 'reduced_debt' | 'reduced_credit' | 'no_impact';
}
```

### RoundingExplanation

For expenses where split amounts don't divide evenly:
```ts
interface RoundingExplanation {
  expenseId: string;
  totalAmountMinor: number;
  splitSumMinor: number;
  remainderMinor: number;
  distributionMethod: string;
  membersReceivingExtra: MemberId[];
}
```

## 4. Balance formula

```
net = paid - share - settlementsReceived + settlementsSent
```

- **Positive** → member should RECEIVE money (creditor)
- **Negative** → member should PAY money (debtor)
- **Zero** → member is settled

### Note on the formula

The revised spec document states: `net = paid - share + received - sent`.
This is **economically incorrect** — receiving a settlement should REDUCE
a creditor's outstanding balance, not increase it. The implementation uses
the correct formula: `net = paid - share - received + sent`.

## 5. Summary text examples

### Creditor (positive balance)
```
Paid INR 1,200.00, share INR 300.00. Should receive INR 900.00.
```

### Debtor (negative balance)
```
Paid INR 0.00, share INR 400.00. Owes INR 400.00.
```

### Settled (zero balance)
```
Paid INR 500.00, share INR 500.00. Settled.
```

## 6. Settlement impact

When a settlement is recorded, the Explanation Engine classifies its
impact on each member:

| Member role | Impact | Explanation |
|-------------|--------|-------------|
| Payer (`fromMemberId`) | `reduced_debt` | "You paid ₹200 to Alice, reducing your debt" |
| Payee (`toMemberId`) | `reduced_credit` | "You received ₹200 from Bob, reducing what you're owed" |
| Uninvolved | `no_impact` | Not included in the member's explanation |

## 7. Rounding explanations

When an expense amount doesn't divide evenly among participants, the
split engine distributes the remainder deterministically. The Explanation
Engine identifies these cases:

```
Expense: ₹10.00 split between 3 people
Splits: [₹3.34, ₹3.33, ₹3.33]
Sum: ₹10.00 ✓ (no rounding needed)
```

```
Expense: ₹10.00 split between 3 people (buggy splits)
Splits: [₹3.33, ₹3.33, ₹3.33]
Sum: ₹9.99
Remainder: ₹0.01 — distributed to member A (earliest index)
```

## 8. What changed after an edit

When an expense is edited (amount changed, splits re-divided), the
Explanation Engine recomputes all explanations. The UI can diff the
old and new explanations to show:

```
Expense "Dinner" was edited:
  Amount changed: ₹1,200.00 → ₹1,500.00
  Your share changed: ₹300.00 → ₹375.00
  Your balance changed: +₹900.00 → +₹1,125.00
```

## 9. What changed after a settlement

When a settlement is recorded:

```
Settlement recorded:
  Bob paid Alice ₹200.00
  Bob's balance: -₹400.00 → -₹200.00 (debt reduced)
  Alice's balance: +₹900.00 → +₹700.00 (credit reduced)
```

## 10. Integration with UI

The Explanation Engine produces structured data (`BalanceExplanation`),
not UI components. The presentation layer is responsible for rendering
the explanation in a user-friendly way (cards, expandable sections, etc.).

The application layer orchestrates:
1. Call `calculateGroupBalances()` to get `BalanceResult`
2. For each member, call `explainMemberBalance()` to get `BalanceExplanation`
3. Pass the structured explanation to the presentation layer

The presentation layer NEVER calls the Explanation Engine directly.
