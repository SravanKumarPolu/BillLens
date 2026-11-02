# BillLens — Balance Explanation UI

> Status: **Phase 2 · Prompt 19 complete.**

## 1. Balance screen

Displays per-member:
- Amount paid
- Assigned share
- Settlements sent
- Settlements received
- Net balance
- Expense contributions (per-expense breakdown)
- Suggested transfers

## 2. Formula display

```
Paid:      ₹1,200
− Share:     ₹300
+ Received:  ₹200
− Sent:      ₹0
= You are owed: ₹700
```

## 3. Sign convention

| Sign | Label | Meaning |
|------|-------|---------|
| Positive | "You are owed" | Should receive money |
| Negative | "You owe" | Should pay money |
| Zero | "Settled" | No action needed |

Labels are always shown — colour is secondary reinforcement.

## 4. Settlement preview

Before recording a settlement:
- Who pays, who receives, amount, currency
- "Why this transfer is suggested" explanation
- Before/after projected balances
- "Confirm Settlement" button

## 5. Rounding explanation

Where applicable:
```
₹0.01 rounding adjustment applied consistently.
Distributed to: Member A (earliest index)
```

## 6. Rules

- All data comes from the domain Explanation Engine
- NO generative AI for explanations
- UI never recalculates domain amounts
- Multiple currencies remain separated (never combined into a misleading total)
- Expense contributions link back to the original expense
