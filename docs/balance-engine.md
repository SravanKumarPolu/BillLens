# BillLens — Balance Engine

> Status: **Phase 6 · Track 3 — Multi-currency separation implemented.**
> Companion documents: [`settlement-domain.md`](./settlement-domain.md) and [`settlement-lifecycle.md`](./settlement-lifecycle.md).

## 1. Overview

The balance engine is the pure mathematical core of BillLens. It computes per-member net balances from expenses and settlements, suggests transfers that would zero everyone out, and emits per-expense explanation entries for the UI. It has **no dependency on React Native, Supabase, SQLite, or any storage** — it operates entirely on in-memory domain data.

The engine has two entry points:

1. **`calculateGroupBalances(input)`** — Phase 1 single-currency entry point. Throws `BalanceValidationError` if any expense or settlement currency differs from the group currency. Unchanged from Phase 1.

2. **`calculateGroupBalancesByCurrency(input)`** — Phase 6 multi-currency entry point. Partitions the input by currency, runs the single-currency engine per currency, and returns one `CurrencyBalanceResult` per currency present in the input. Per-currency zero-sum invariant enforced.

The single-currency entry point is preserved for backwards compatibility — every existing caller and test continues to use it. The multi-currency entry point is the Phase 6 surface and the one new code should use.

## 2. The balance rule

For each member and currency:

```
Net balance
=
Amount paid for expenses
− Assigned expense share
+ Completed settlements received
− Completed settlements sent
```

Sign convention:

- `netBalanceMinor > 0` → member should **receive** money (creditor).
- `netBalanceMinor < 0` → member should **pay** money (debtor).
- `netBalanceMinor = 0` → member is settled.

The balance engine reads the `status` field on each settlement and only counts settlements where `contributesToCompletedBalance(status)` is true (i.e. only `completed` settlements). Pending, disputed, failed, cancelled, and reversed settlements are excluded. This is the Phase 6 safety rule, enforced by construction through the `contributesToCompletedBalance` contract defined in the state machine module.

## 3. The multi-currency separation rule

The spec (Prompt 51) is unambiguous:

> "Never combine £30 owed and ₹2,000 receivable into a single net amount. Return separate balance summaries per currency."

The multi-currency engine honours this by returning a separate `CurrencyBalanceResult` per currency. Each result is fully self-contained: its own `memberCurrencyBalances`, its own `suggestedTransfers` (always within the same currency — never "Pay £10 to offset ₹1,000"), its own zero-sum invariant, its own `validationStatus`.

Currencies are returned in alphabetical ISO-code order for stable test output and UI rendering (e.g. EUR before GBP before INR before USD). If the input has no expenses and no settlements, the result is an empty array (no currencies to compute).

## 4. The per-currency zero-sum invariant

For every group and currency:

```
Sum of all member net balances = 0
```

The spec rule (Prompt 51): "Fail loudly in development and record a safe integrity event in production if the invariant breaks. Do not silently insert a balancing adjustment."

The engine does NOT throw when the invariant breaks. Instead, it sets `validationStatus` on the result to one of:

- `'balanced'` — Σ memberBalances.netBalanceMinor === 0 and no unknown members were skipped.
- `'incomplete_membership'` — Σ ≠ 0 because some payers/splits referenced members not in the active `members` list (their share is "lost" to the engine).
- `'data_corruption'` — Σ ≠ 0 even though all referenced members were known — the input data is genuinely inconsistent.

The `validateBalanceInvariants(results)` function returns an array of `BalanceInvariantFailure` objects — one per currency that does not balance. Empty array means every currency honours the invariant. The `ValidateBalanceInvariantsUseCase` wraps this for the application layer.

The "fail loudly in development" half of the spec rule is the caller's responsibility: tests and dev builds should assert the failure list is empty after every financial mutation. The "record a safe integrity event in production" half is also the caller's responsibility: a non-empty failure list should be logged via the audit repository with no payment data or PII, and surfaced to the UI as a "balance integrity warning" — never silently fixed.

## 5. The interfaces

### 5.1 MemberBalance (Phase 1, unchanged)

```ts
interface MemberBalance {
  readonly memberId: MemberId;
  readonly paidMinor: number;
  readonly shareMinor: number;
  readonly settlementsSentMinor: number;
  readonly settlementsReceivedMinor: number;
  readonly netBalanceMinor: number;
}
```

### 5.2 MemberCurrencyBalance (Phase 6, extends MemberBalance)

```ts
interface MemberCurrencyBalance extends MemberBalance {
  readonly currencyCode: CurrencyCode;
  readonly expenseCount: number;       // # expenses this member contributed to in this currency
  readonly settlementCount: number;    // # settlements this member was a party to in this currency
}
```

### 5.3 CurrencyBalanceResult (Phase 6, extends BalanceResult)

```ts
interface CurrencyBalanceResult extends BalanceResult {
  readonly currencyCode: CurrencyCode;
  readonly memberCurrencyBalances: readonly MemberCurrencyBalance[];
  readonly calculatedAt: DateTime;       // when the calculation ran
  readonly sourceVersion: string;        // 8-char hex fingerprint of the input
}
```

The `sourceVersion` is an 8-character hex string derived from a FNV-1a hash of the sorted expense ids + versions, settlement ids + versions, and member ids. It is NOT a security hash — it is a cache key that lets a future balance cache detect staleness: if the sourceVersion changes, the cached result must be discarded. Two balance results with the same source version are guaranteed to have been computed from the same input data (modulo hash collisions, which are astronomically unlikely for groups with <10,000 expenses/settlements).

### 5.4 MultiCurrencyBalanceEngineInput

```ts
interface MultiCurrencyBalanceEngineInput {
  readonly groupId: string;
  readonly members: readonly MemberId[];
  readonly expenses: readonly Expense[];
  readonly payers: readonly ExpensePayer[];
  readonly splits: readonly ExpenseSplit[];
  readonly settlements: readonly Settlement[];
}
```

Same shape as `BalanceEngineInput` but WITHOUT the `currency` field. Each expense and settlement carries its own `currencyCode`. The engine detects currencies from the input.

## 6. The algorithm

`calculateGroupBalancesByCurrency(input)`:

1. **Detect currencies** — collect the set of distinct currency codes from non-deleted expenses and non-deleted settlements. If empty, return `[]`.
2. **Sort currencies alphabetically** — for deterministic output (EUR before GBP before INR before USD).
3. **For each currency**, partition the input: filter expenses by currency, filter payers/splits by their parent expense's currency, filter settlements by currency.
4. **Run the single-currency engine** on each partition. The single-currency engine's currency-mismatch check is unreachable for the filtered subset (we already filtered), so no `BalanceValidationError` can throw here.
5. **Build the per-member per-currency balances** by extending each `MemberBalance` with `currencyCode`, `expenseCount` (counted from the explanations map), and `settlementCount` (counted from the filtered settlements).
6. **Compute the source version** — a stable 8-char FNV-1a fingerprint of the input.
7. **Return** the array of `CurrencyBalanceResult` objects.

The per-currency zero-sum invariant is naturally enforced by the single-currency engine (which already enforces it per call). The multi-currency wrapper does not need to do anything additional — each result's `isBalanced` and `validationStatus` are already per-currency.

## 7. The use case surface

Phase 6 Prompt 51 requires seven use cases. Track 3 implements all seven in `src/application/balances/`:

| Use case | Purpose |
|---|---|
| `GetGroupBalancesUseCase` | Per-currency balances for the whole group. The foundation — every other use case composes with it. |
| `GetMemberBalanceUseCase` | Per-currency balances for one member. Filters the group result to the requested member. |
| `GetBalanceBreakdownUseCase` | Per-expense breakdown for one member, grouped by currency. Backs the explanation UI. |
| `GetGroupCurrencySummariesUseCase` | List of currencies with counts (members active, expenses, settlements, balanced flag). Backs the currency-chip header. |
| `GetUnsettledMembersUseCase` | Members with non-zero balances, with their position (creditor / debtor). One entry per (member, currency) pair. |
| `RecalculateGroupBalancesUseCase` | Force a recompute (today identical to `GetGroupBalancesUseCase`; future cache-invalidation hook). |
| `ValidateBalanceInvariantsUseCase` | Per-currency zero-sum check. Returns a list of failures (empty = healthy). |

All seven use cases depend on the `BalanceQueryPort` interface (defined in `balance-query.port.ts`). The port loads everything the balance engine needs for a group in a single round trip: members, expenses, payers, splits, settlements. The concrete implementations (`SqliteBalanceQueryPort`, `SupabaseBalanceQueryPort`) live in the infrastructure layer and are not in scope for Track 3 — the use cases are tested with `InMemoryBalanceQueryPort`.

## 8. What the engine does NOT do

- **Currency conversion.** The spec is explicit: "Do not convert currencies automatically." If a group has GBP and INR activity, the engine returns two results — never a single combined figure. FX conversion is a UI concern (if the user wants a "total in my home currency" view, they ask for it explicitly; the engine never makes that choice for them).
- **Caching.** The engine is pure and recomputes on every call. A balance cache is deferred — the `sourceVersion` field on each result is the cache-key contract that a future cache would use.
- **Soft-delete cleanup.** Soft-deleted expenses and settlements are excluded from the calculation, but they are not removed from the input. The caller (the repository) is responsible for what to load; the engine is responsible for what to count.
- **Permission checks.** The engine is pure math. Permission checks ("can the actor view this group's balances?") belong in the application layer (the use case or a wrapper).
- **Synthetic balancing adjustments.** If the zero-sum invariant breaks, the engine reports it via `validationStatus` — it does NOT silently insert a balancing row. The spec rule is unambiguous: "Do not silently insert a balancing adjustment."

## 9. Backwards compatibility

The single-currency `calculateGroupBalances` function is unchanged. Every existing caller (the balance screen, the suggested-transfers view-model, the existing 21 tests in `balance-engine.test.ts`) continues to work. The new multi-currency surface is purely additive — no existing type was renamed, no existing function signature changed, no existing test was modified.

The `MemberBalance` interface is unchanged. The new `MemberCurrencyBalance` extends it with three additional fields, so any code that consumes `MemberBalance` also accepts `MemberCurrencyBalance` (Liskov substitution).

The `BalanceResult` interface is unchanged. The new `CurrencyBalanceResult` extends it with four additional fields, so any code that consumes `BalanceResult` also accepts `CurrencyBalanceResult`.

## 10. Testing

- **`balance-engine.test.ts`** — the original 21 tests for the single-currency engine. Unchanged.
- **`balance-engine-multi-currency.test.ts`** — 17 new tests for the multi-currency engine, including the spec's exact example (£30 owed in GBP and ₹2,000 receivable in INR kept separate, never combined into a single net), per-currency zero-sum invariant, source-version stability and change detection, soft-delete exclusion, and empty-input handling.
- **`balance-usecases.test.ts`** — 13 new tests for the seven Prompt 51 use cases, covering happy paths, not-found handling, settled-member exclusion, and the integrity-failure detection.

Total: +30 tests, +2 suites. Zero regressions on the existing 117 suites / 3,694 tests.

## 11. What is NOT in scope for Track 3

- The `SqliteBalanceQueryPort` and `SupabaseBalanceQueryPort` concrete implementations. They live in the infrastructure layer and are deferred to a later batch (they require wiring into the existing database connection and Supabase client).
- The balance cache (with `sourceVersion`-based invalidation). The `sourceVersion` field is computed and exposed; the cache that consumes it is deferred.
- The "fail loudly in development" assertion helper. The engine reports `validationStatus`; tests and dev builds should assert via `validateBalanceInvariants`. A centralised dev-mode assertion is deferred.
- The UI wiring. The `GroupBalancesScreen` and `BalanceExplanationScreen` continue to use the single-currency engine until the UI is updated to render per-currency results.

## 12. References

- `src/domain/services/balances/balance-engine.ts` — the engine (single-currency and multi-currency).
- `src/domain/services/balances/__tests__/balance-engine.test.ts` — single-currency tests.
- `src/domain/services/balances/__tests__/balance-engine-multi-currency.test.ts` — multi-currency tests.
- `src/application/balances/` — the seven Prompt 51 use cases.
- `src/application/balances/__tests__/balance-usecases.test.ts` — use case tests.
- `src/application/balances/balance-query.port.ts` — the port that loads data for the engine.
- [`settlement-domain.md`](./settlement-domain.md) — the Settlement entity (the engine consumes settlements).
- [`settlement-lifecycle.md`](./settlement-lifecycle.md) — the state machine (the `contributesToCompletedBalance` contract).
