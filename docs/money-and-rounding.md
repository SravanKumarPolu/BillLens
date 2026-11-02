# BillLens — Money and Rounding

> Status: **Phase 1 · Prompts 3 & 4 complete.**

This document explains how BillLens represents money, performs arithmetic,
and handles rounding. Every rule here is enforced by code — either in
the `Money` value object (`src/domain/value-objects/money.ts`) or in the
split strategies (`src/domain/services/splits/`).

## 1. Why integer minor units?

JavaScript uses IEEE 754 double-precision floating point for all numbers.
This format cannot exactly represent most decimal fractions:

```js
0.1 + 0.2          // → 0.30000000000000004
1.005 * 100        // → 100.49999999999999 (not 100.5)
```

If BillLens stored money as decimal major units (e.g. `1250.50`), these
representation errors would compound across arithmetic operations and
eventually produce visibly wrong balances. Instead, we store money as
**integer minor units**:

| Currency | Major unit | Minor unit | Example |
|----------|-----------|-----------|---------|
| INR | ₹1 | 1 paise = ₹0.01 | ₹1,250.50 → `125050` |
| USD | $1 | 1 cent = $0.01 | $9.99 → `999` |
| JPY | ¥1 | (no minor unit) | ¥1,000 → `1000` |

Phase 1 always uses `amountMinor = minorUnitsPerMajor × 100` for the
common 2-decimal currencies. JPY (0-decimal) is supported by storing
yen directly as the minor unit (so ¥1,000 = `1000` minor units — the
"minor unit" IS the major unit). Future phases will add proper
`decimalPlaces` handling per currency.

## 2. The `Money` value object

All money is wrapped in a `Money` instance created via one of:

- `Money.fromMinor(125050, 'INR')` — preferred for all data sourced from
  DB, API, or OCR (these should already be in minor units).
- `Money.fromMajor(1250.5, 'INR')` — convenience for tests / human input.
  Parses the decimal string and rounds half-up to the nearest minor unit
  (avoids IEEE 754 precision loss from `amount × 100`).
- `Money.zero('INR')` — zero-value money in a given currency.
- `Money.sum([...])` — sum a list (must be same currency). Returns `null`
  for an empty list.

The constructor validates:

1. The amount is not `NaN` (throws `InvalidMoneyError`).
2. The amount is finite (throws on `Infinity` / `-Infinity`).
3. The amount is an integer (throws on `1250.5`).
4. The amount is within `Number.isSafeInteger` range (throws on overflow).

Money is **immutable** — `add`, `subtract`, `multiply`, `divide`,
`allocate` all return new `Money` instances.

## 3. Currency safety

Every `Money` instance carries a `CurrencyCode`. Arithmetic operations
throw `CurrencyMismatchError` if you try to mix currencies:

```ts
Money.fromMinor(100, 'INR').add(Money.fromMinor(50, 'USD'));
// → throws CurrencyMismatchError
```

Phase 1 is single-currency-per-group: an expense's currency must match
its parent group's currency. Multi-currency support is a Phase 2 feature.

## 4. Allocation with deterministic remainder

The hardest problem in money math is dividing an amount that doesn't
divide evenly. BillLens uses a single, deterministic rule:

> **When a remainder exists, distribute it one minor unit at a time to
> the earliest indices (after deterministic sorting).**

### `Money.allocate(count)`

Splits the amount into `count` equal shares. Remainder goes to indices
`0, 1, 2, ...` until exhausted.

```ts
Money.fromMinor(1000, 'INR').allocate(3);
// → [Money(334), Money(333), Money(333)]
```

Edge case: `Money.fromMinor(1, 'INR').allocate(3)` → `[1, 0, 0]`. The
first recipient gets the single minor unit.

### `Money.allocateByWeights(weights)`

Splits the amount proportionally to integer weights. Remainder goes to
the largest fractional-share indices (tie-break by index ascending).

```ts
Money.fromMinor(1000, 'INR').allocateByWeights([1, 1, 1]);
// → [Money(334), Money(333), Money(333)]
// raw: 333.33, 333.33, 333.33
// fractions: 0.33, 0.33, 0.33
// tie → earliest index (0) gets the extra unit
```

```ts
Money.fromMinor(1000, 'INR').allocateByWeights([1, 1, 2]);
// → [Money(250), Money(250), Money(500)]
// raw: 250, 250, 500 — no remainder
```

## 5. Split strategies

Each split type has its own strategy class implementing the
`SplitStrategy<TInput>` interface. All strategies:

- Reject empty participant lists.
- Reject duplicate participant IDs.
- Sort participant IDs deterministically (ascending string order) before
  distributing remainder.
- Guarantee `Σ entries.amountMinor === totalAmount.toMinor()` (verified
  by `assertTotalPreserved` after every calculation).

### Equal split

```ts
SplitEngine.equal({
  totalAmount: Money.fromMinor(1000, 'INR'),
  participantIds: [a, b, c],
});
// → entries: [334, 333, 333]
```

### Exact split

```ts
SplitEngine.exact({
  totalAmount: Money.fromMinor(1000, 'INR'),
  participantIds: [a, b],
  amounts: [Money.fromMinor(600, 'INR'), Money.fromMinor(400, 'INR')],
});
// → entries: [600, 400]
```

Under- and over-allocation are rejected with `InvalidSplitError`.

### Percentage split

Percentages are stored as **basis points** (1% = 100 bp, 100% = 10,000 bp)
to avoid floating-point. The sum of all participants' basis points MUST
equal exactly 10,000.

```ts
SplitEngine.percentage({
  totalAmount: Money.fromMinor(100000, 'INR'),
  participantIds: [a, b, c],
  basisPoints: [3333, 3333, 3334],
});
// → entries: [33330, 33330, 33340]
```

Remainder (from floor rounding) goes to largest fractional-share indices
with deterministic tie-break.

### Share split

```ts
SplitEngine.shares({
  totalAmount: Money.fromMinor(30000, 'INR'),
  participantIds: [a, b, c],
  shareUnits: [1, 1, 2],
});
// → entries: [7500, 7500, 15000]
```

### Item split

Each line item is assigned to one or more members. Items are split
equally across their assigned members (with deterministic remainder).
Receipt-level charges (tax, service charge, tip, delivery, discount) are
distributed proportionally across members who ordered items (members
with 0 item share pay 0 of the charge).

```ts
SplitEngine.items({
  totalAmount: Money.fromMinor(4400, 'INR'),
  participantIds: [a, b, c],
  lineItems: [
    { id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [a] },
    { id: 'i2', totalAmountMinor: 3000, assignedMemberIds: [b] },
  ],
  charges: [{ type: 'tax', amountMinor: 400, label: 'GST' }],
});
// a paid 1/4 of items → pays 1/4 of tax = 100
// b paid 3/4 of items → pays 3/4 of tax = 300
// c paid 0 of items → pays 0 of tax
// → entries: [1100, 3300, 0]
```

Charges can be negative (discounts). The strategy validates
`Σ items + Σ charges === totalAmount.toMinor()`.

## 6. Floating-point is forbidden in financial calculations

The hard rule: **no floating-point arithmetic in financial code**.

- All money values are integers (`Money.amountMinor: MinorUnit`).
- All allocations use integer arithmetic with floor + remainder distribution.
- Percentages are basis points (integers), not floats.
- Share units are positive integers.
- Quantities are positive integers.

The only place floating-point appears is `Money.fromMajor`, used to
convert human-typed decimal input (`1250.50`) to minor units (`125050`)
at the boundary. After that conversion, all subsequent math is integer.

## 7. Safe integer range

JavaScript's `Number.isSafeInteger` range is `[-(2^53 - 1), 2^53 - 1]`,
which is ±9,007,199,254,740,991. For minor units in INR (paise), this
allows balances up to roughly ₹90 trillion — far beyond any realistic
personal-expense scenario. The `Money` constructor enforces
`Number.isSafeInteger` and throws on overflow.

For JPY (no minor unit), the limit is ¥9 trillion — still safe.

## 8. Test coverage

Money and rounding are tested in 5 test suites totaling 130+ cases:

- `src/domain/value-objects/__tests__/money.test.ts` — Money arithmetic,
  allocation, edge cases (₹1 split 3 ways, large safe integers, NaN/Infinity
  rejection, currency mismatch).
- `src/domain/services/splits/__tests__/equal-split-strategy.test.ts`
- `src/domain/services/splits/__tests__/exact-split-strategy.test.ts`
- `src/domain/services/splits/__tests__/percentage-split-strategy.test.ts`
- `src/domain/services/splits/__tests__/share-split-strategy.test.ts`
- `src/domain/services/splits/__tests__/item-split-strategy.test.ts`
- `src/domain/services/splits/__tests__/split-engine.test.ts` — unified
  dispatcher tests, total-preservation invariant across all strategies.

The single most important invariant — verified after every strategy
calculation — is:

```ts
expect(sum(entries.map(e => e.amountMinor))).toBe(totalAmount.toMinor());
```

No strategy ever returns a result where the sum of shares doesn't equal
the original total. This is the foundation of trust in BillLens's
balance calculations.
