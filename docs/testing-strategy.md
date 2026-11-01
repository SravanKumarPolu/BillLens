# BillLens — Testing Strategy

> Status: **Phase 1 · Prompt 10 complete.**

This document describes BillLens's testing strategy: what we test, how
we test it, and what each test layer is responsible for.

## 1. Test pyramid

```
                    ┌─────────────────┐
                    │   E2E (Maestro)  │   ← Phase 2 (no flows yet)
                    └─────────────────┘
                  ┌───────────────────────┐
                  │  Integration (SQLite) │   ← Phase 2 (real expo-sqlite)
                  └───────────────────────┘
              ┌───────────────────────────────────┐
              │  Unit (domain + application)       │   ← 473 tests in Phase 1
              └───────────────────────────────────┘
```

Phase 1 has 473 unit tests across 23 suites. Integration and E2E
tests are deferred to Phase 2 (require RN runtime + real SQLite +
Maestro setup).

## 2. Test layers

### 2.1 Unit tests (Phase 1 — present)

- **Domain layer**: entities, value objects, errors, services.
  - Framework: Jest + `@jest/globals`.
  - Location: `src/domain/**/__tests__/*.test.ts`.
  - Coverage: 280+ tests covering all entity factories, value object
    constructors, split strategies, balance engine, settlement engine,
    domain independence (programmatic test).

- **Application layer**: use cases, mappers, identity service.
  - Framework: Jest.
  - Location: `src/application/**/__tests__/*.test.ts`.
  - Coverage: 70+ tests covering in-memory repository doubles, mapper
    round-trips, UnitOfWork commit/rollback, identity service lifecycle,
    upgrade planner.

- **Infrastructure layer (sync)**: SQLite-backed sync repository.
  - Framework: Jest.
  - Location: `src/infrastructure/**/__tests__/*.test.ts`.
  - Coverage: 28 tests covering enqueue, markSyncing, markCompleted,
    markFailed, markConflict, resetForRetry, countPending, listFailed,
    listReadyForRetry, transaction rollback, atomic entity-write-with-
    sync-op pattern.

- **Config**: env validation.
  - Framework: Jest.
  - Location: `src/config/__tests__/env.test.ts`.
  - Coverage: 9 tests covering valid dev/staging/prod parse, default
    appEnv, invalid env value, invalid URL, empty key, missing URL,
    error message discoverability.

### 2.2 Integration tests (Phase 2 — deferred)

- **SQLite integration**: real `expo-sqlite` database, real migrations,
  real transactions. Verifies the InMemoryDatabase behavior matches
  production SQLite.
- **Supabase integration**: local Supabase instance via `supabase start`,
  real RLS policies, real Edge Function invocation.
- **Repository contract tests**: every repository implementation
  (SQLite, Supabase) must pass the same contract test suite.

### 2.3 E2E tests (Phase 2 — deferred)

- **Maestro flows**: real device/emulator, real user flows.
- Location: `e2e/maestro/*.yaml`.
- Phase 1 has the folder structure only — no flows yet.

## 3. What we test (per layer)

### 3.1 Domain layer — what to test

For each entity factory:
- ✅ Happy path: valid input produces valid entity.
- ✅ Each invariant violation throws the correct domain error.
- ✅ Edge cases: empty strings, max-length strings, zero/negative amounts,
  NaN/Infinity, unsafe integers, duplicate members, currency mismatches.

For each value object:
- ✅ Construction with valid input.
- ✅ Construction with invalid input throws.
- ✅ All arithmetic operations (add, subtract, multiply, divide, allocate).
- ✅ All comparison operations (equals, isGreaterThan, isLessThan, isZero).
- ✅ Currency mismatch throws.
- ✅ Allocation preserves total exactly (Σ shares = original).
- ✅ Allocation is deterministic (same input → same output).

For each domain service:
- ✅ Happy path: valid input produces valid output.
- ✅ Conservation invariants (Σ splits = total, Σ balances = 0).
- ✅ Determinism (same input → same output, regardless of input order).
- ✅ Soft-deleted records are excluded from calculations.
- ✅ Empty inputs are handled gracefully (or throw clearly).
- ✅ Framework independence (programmatic test verifying no imports from
  React/RN/Expo/Supabase/SQLite).

### 3.2 Application layer — what to test

For each use case:
- ✅ Happy path: valid input produces expected output.
- ✅ Repository is called with the right arguments.
- ✅ In-memory test doubles are used (no infrastructure dependencies).
- ✅ Error propagation: domain errors from repositories bubble up.

For each mapper:
- ✅ Round-trip: entity → row → entity preserves all fields.
- ✅ Optional fields are handled (undefined ↔ null).
- ✅ Soft-deleted state is preserved.

For UnitOfWork:
- ✅ Commit: all writes persist when callback succeeds.
- ✅ Rollback: no writes persist when callback throws.
- ✅ `enqueueSync` helper delegates to sync repository.

### 3.3 Infrastructure layer — what to test

For each repository implementation:
- ✅ Each interface method behaves per the contract.
- ✅ Status transitions are correct (pending → syncing → completed/failed/conflict).
- ✅ JSON payloads are serialized and deserialized correctly.
- ✅ Pagination cursors work.
- ✅ Transaction rollback leaves no partial data.
- ✅ Crash recovery (stuck `syncing` rows are detected — Phase 2).

## 4. Test conventions

### 4.1 Naming

- Test files: `<unit-name>.test.ts` (co-located in `__tests__/`).
- `describe` blocks: the unit name or a scenario.
- `it` blocks: a sentence describing behavior, NO "should" prefix.
  - ✅ `it('adds two money values with matching currency', ...)`
  - ❌ `it('should add two money values', ...)`

### 4.2 Structure (Arrange-Act-Assert)

```ts
it('allocates remainder to earliest sorted indices', () => {
  // Arrange
  const total = Money.fromMinor(1000, 'INR');

  // Act
  const result = calculateEqualSplit(total, [a, b, c]);

  // Assert
  expect(result.entries.map((e) => e.amountMinor)).toEqual([334, 333, 333]);
});
```

### 4.3 Test data

- Use deterministic UUIDs (`'group-1'`, `'user-1'`) — not `crypto.randomUUID()`.
- Use deterministic timestamps (`asDateTime('2026-07-29T10:00:00.000Z')`) — not `new Date()`.
- Use branded ID constructors (`asGroupId('group-1')`) — not raw string casts.

### 4.4 What NOT to test

- ❌ Don't test framework code (React, Expo, Supabase SDK).
- ❌ Don't test types (TypeScript compiler does that).
- ❌ Don't test private implementation details — test public behavior.
- ❌ Don't test the database engine (SQLite/PostgreSQL) — test our use of it.

## 5. Coverage targets

| Layer | Target coverage | Phase 1 actual |
|-------|----------------|----------------|
| Domain (entities, value objects, services) | 95%+ | ~90% (key paths covered) |
| Application (use cases, mappers, identity) | 90%+ | ~85% |
| Infrastructure (sync repository) | 85%+ | ~80% |
| Presentation (not yet implemented) | 70%+ | N/A |

Coverage is measured by `npm run test:coverage` (Jest with `--coverage` flag).

## 6. Test execution

### 6.1 Local development

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run a specific test suite
npx jest src/domain/value-objects/__tests__/money.test.ts
```

### 6.2 CI (Phase 2)

- PRs trigger: lint + typecheck + unit tests.
- Main branch push triggers: lint + typecheck + unit tests + integration tests.
- Release tags trigger: full suite including E2E.

### 6.3 Pre-commit hook

The Husky pre-commit hook runs:
- `npm run typecheck` (tsc --noEmit)
- `npm run lint` (eslint)
- `npm run db:validate` (SQL structural validation)
- `npm test -- --silent` (jest)

Any failure blocks the commit.

## 7. Test data fixtures

Phase 1 uses inline test data (constructed in each test). Phase 2 will
introduce shared fixtures:

```
src/__fixtures__/
├── groups.ts          # Group factory functions
├── expenses.ts        # Expense factory functions
├── settlements.ts     # Settlement factory functions
├── receipts.ts        # Receipt factory functions
└── users.ts           # User + GuestIdentity factory functions
```

Fixtures will use deterministic UUIDs and timestamps so tests are
reproducible.

## 8. Mocking strategy

### 8.1 In-memory test doubles (preferred)

For repository interfaces, we use in-memory test doubles that implement
the full interface. These are NOT mocks — they're real implementations
backed by a Map.

Example: `InMemoryExampleExpenseRepositoryDouble` in
`src/application/groups/__tests__/in-memory-example-expense-repository.double.ts`.

### 8.2 Mocks (sparingly)

For one-off stubs (e.g. `MockAuthProvider` in identity-service tests),
we use simple class-based mocks. We do NOT use Jest's `jest.mock()` for
module mocking because it makes tests brittle.

### 8.3 What we don't mock

- ❌ Domain entities and value objects — these are pure, no need to mock.
- ❌ Domain services (balance engine, split strategies) — pure, no need.
- ❌ Mappers — pure functions, no need.

## 9. Testing the tests

The `domain-independence.test.ts` is a meta-test: it verifies that the
domain layer has no framework imports. This is a "test of the tests" —
it catches violations that would otherwise only be caught at build time
in production.

## 10. Phase 1 test summary

| Suite | Tests | Focus |
|-------|-------|-------|
| `env.test.ts` | 9 | Env validation (Zod schema, defaults, errors) |
| `utils.test.ts` | 16 | Pure utilities (assertDefined, clamp, fingerprint) |
| `domain-independence.test.ts` | ~79 | Programmatic check that domain has no framework imports |
| `money.test.ts` | 70+ | Money arithmetic, allocation, comparison, edge cases |
| `currency-code.test.ts` | 12 | CurrencyCode construction + type guard |
| `other-value-objects.test.ts` | 40+ | DisplayName, EmailAddress, VersionNumber, Percentage, BasisPoints, ShareUnits |
| `entities.test.ts` | 30+ | Group, GroupMember, Expense, ExpenseSplit invariants |
| `settlement.test.ts` | 10+ | Settlement entity invariants + soft-delete |
| `equal-split-strategy.test.ts` | 10 | Equal split: divisibility, remainder, determinism |
| `exact-split-strategy.test.ts` | 9 | Exact split: sum validation, currency mismatch |
| `percentage-split-strategy.test.ts` | 12 | Percentage split: basis points, remainder distribution |
| `share-split-strategy.test.ts` | 13 | Share split: weights, remainder distribution |
| `item-split-strategy.test.ts` | 14 | Item split: per-item allocation, charges, total validation |
| `split-engine.test.ts` | 14 | Unified dispatcher + total preservation invariant |
| `balance-engine.test.ts` | 25+ | Balance calculation, settlements, soft-delete, explanations |
| `settlement-engine.test.ts` | 20+ | Settlement simplification, transfer verification |
| `application-independence.test.ts` | ~18 | Programmatic check that application has no framework imports |
| `mappers.test.ts` | 5 | Group + Settlement mapper round-trips |
| `unit-of-work.test.ts` | 5 | Commit/rollback semantics, enqueueSync helper |
| `sqlite-sync-repository.test.ts` | 16 | Sync queue: enqueue, markSyncing/Failed/Completed/Conflict |
| `transaction-rollback.test.ts` | 6 | Transaction atomicity, multi-statement rollback |
| `guest-upgrade-planner.test.ts` | 8 | Upgrade plan production, duplicate detection, validation |
| `identity-service.test.ts` | 15 | Guest identity lifecycle, upgrade flow, SecureStore |
| **Total** | **473** | |
