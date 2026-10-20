# Performance Optimisation

This document describes the BillLens performance optimisation system
(Phase 9 Prompt 86). The system covers startup, search, sync, OCR,
memory, battery, database, and attachments optimisation.

## CRITICAL contracts

1. **Optimisations MUST NOT violate the zero-sum invariant.** The
   `balance-cache-safety.ts` module verifies that the sum of all member
   net balances in a cache entry is exactly 0 on EVERY retrieval. If the
   sum is non-zero, the cache entry is discarded and re-computed.
2. **Optimisations MUST NOT introduce floating-point math.** All amounts
   are integer minor units (e.g. paise, cents). The `floating-point-guard.ts`
   module rejects any non-integer amount.
3. **The balance cache invalidates on ANY financial mutation.** The 5
   mutations that always invalidate the cache are: `expense_create`,
   `expense_edit`, `settlement_create`, `settlement_reverse`,
   `settlement_confirm`. There are NO exceptions.
4. **The performance profiler is a PASSIVE OBSERVER.** It does NOT
   trigger garbage collection, does NOT modify the heap, and does NOT
   affect financial computations.

## Optimization targets (18 across 8 areas)

| Area | Count | Examples |
|---|---|---|
| startup | 3 | cold_start_ms, warm_start_ms, time_to_first_expense_ms |
| search | 2 | expense_search_p95_ms, group_search_p95_ms |
| sync | 3 | sync_duration_p95_ms, sync_conflict_rate, sync_retry_count_p95 |
| ocr | 2 | ocr_extraction_p95_ms, ocr_accuracy_rate |
| memory | 3 | peak_memory_mb, memory_leak_growth_mb_per_hour, gc_pause_p95_ms |
| battery | 1 | battery_drain_percent_per_hour |
| database | 2 | db_query_p95_ms, db_n_plus_one_query_count |
| attachments | 2 | image_load_p95_ms, image_cache_hit_rate |
| **Total** | **18** | |

Each target has a `target` value (what the team aims for) and an
`alertThreshold` (the value at which an alert fires).

## Balance cache safety

```ts
interface BalanceCacheEntry {
  readonly groupId: string;
  readonly currencyCode: string;
  readonly sourceVersion: string;  // cache key — invalidates on any source record change
  readonly memberBalances: readonly { readonly memberId: string; readonly netBalanceMinor: number }[];
  readonly computedAt: string;
}

function isCacheValid(entry, currentSourceVersion): boolean;
function verifyZeroSumInvariant(entry): boolean;
function invalidateOnFinancialMutation(mutation): boolean;
```

Key invariants:
- `isCacheValid(entry, currentSourceVersion)` returns `true` iff
  `entry.sourceVersion === currentSourceVersion`.
- `verifyZeroSumInvariant(entry)` returns `true` iff:
  - All `netBalanceMinor` values are safe integers (no floats, no NaN,
    no Infinity, no out-of-range values).
  - The sum of all `netBalanceMinor` values is exactly 0.
- `invalidateOnFinancialMutation(mutation)` ALWAYS returns `true` — any
  of the 5 financial mutations invalidates the cache.

`safelyRetrieveCachedBalances(entry, currentSourceVersion)` is the safe
retrieval function — it verifies BOTH the cache validity AND the zero-sum
invariant on every retrieval. Returns the entry if both checks pass,
`null` otherwise.

## Floating-point guard

```ts
function isSafeIntegerAmount(value: number): boolean;
function assertIntegerMinor(amountMinor: number): void;
function verifyNoFloatingPointInBalances(balances): boolean;
```

- `isSafeIntegerAmount(value)` returns `true` iff `value` is a safe
  integer (in the range `[-(2^53 - 1), 2^53 - 1]`, no fractional part).
- `assertIntegerMinor(amountMinor)` throws if `amountMinor` is not a
  safe integer.
- `verifyNoFloatingPointInBalances(balances)` returns `true` iff every
  `netBalanceMinor` in the array is a safe integer.

Helper functions:
- `majorToMinorUnits(major)` — converts a major-unit amount (e.g. dollars)
  to minor units (e.g. cents), always rounding to a safe integer.
- `minorToMajorUnits(minor)` — converts a minor-unit amount to major
  units for display (the result is for DISPLAY ONLY).
- `addMinor(a, b)`, `subtractMinor(a, b)`, `sumMinor([...])` — safe
  integer arithmetic that asserts both inputs are safe integers and
  throws on overflow.

## N+1 query detector

Detects N+1 query patterns in database access logs. A burst of 5+
similar queries against the same table within a 100ms window is flagged
as an N+1 pattern.

- `detectNPlusOneQueries(queries, options)` — analyzes a list of query
  log entries and returns all detected patterns.
- `normalizeQueryPattern(query)` — normalizes a SQL query by replacing
  literal values with `?` placeholders, so queries that differ only in
  parameters are recognized as the same pattern.
- `getDetectionSeverity(detection)` — returns 0 (info), 1 (warning),
  or 2 (critical) based on `repeatCount`.

## Memory profiler

Captures memory snapshots and provides simple leak-detection heuristics.

- `captureSnapshot(timestamp, memoryUsage)` — captures a snapshot from
  raw byte values (converting to MB).
- `detectMemoryLeak(snapshots, options)` — analyzes a list of snapshots
  and returns a `LeakDetectionResult` with growth rate and severity.
  - `leakSuspected = true` when there are 5+ snapshots AND the growth
    rate exceeds 10 MB/hour (configurable).
  - `severity = 'critical'` when growth rate exceeds 50 MB/hour.
- `summarizeSnapshots(snapshots)` — returns peak, min, average, and
  final heap usage.
- `diffSnapshots(earlier, later)` — returns the difference between two
  snapshots.

## Use case: RunOptimizationBenchmarksUseCase

Orchestrates a benchmark run:
1. For each of the 18 optimization targets, collect a live measurement
   via the `PerformanceBenchmarkCollector` port.
2. Compare the observed value against the target (`meetsTargetValue`,
   `shouldAlertForTarget`).
3. Persist the benchmark run via the `PerformanceBenchmarkRepository`
   port.

The output summarizes:
- `measurementCount`: how many targets were successfully measured.
- `targetsMetCount`: how many targets met their target value.
- `alertsTriggeredCount`: how many targets crossed their alert threshold.

## Privacy

- Benchmark runs carry only aggregate measurements (latencies, rates,
  counts). They NEVER contain user IDs, merchant names, exact amounts,
  or raw receipt data.
- Memory snapshots carry only heap sizes and timestamps — no PII.

## Test coverage

| Suite | Tests | What it verifies |
|---|---|---|
| `balance-cache-safety.test.ts` | 35+ | Zero-sum invariant + invalidation on all 5 financial mutations |
| `floating-point-guard.test.ts` | 60+ | Floats rejected; safe integers accepted; arithmetic overflow protection |
| `n-plus-one-detector.test.ts` | 30+ | Burst detection; pattern normalization; severity classification |
| `memory-profiler.test.ts` | 30+ | Snapshot capture; leak detection; summary; diff |

## Critical invariants (test-enforced)

1. `OPTIMIZATION_TARGETS.length === 18` across 8 areas.
2. `verifyZeroSumInvariant(entry)` returns `false` for any non-zero sum,
   any float value, any NaN, any Infinity, any out-of-safe-range value.
3. `invalidateOnFinancialMutation(mutation)` returns `true` for ALL 5
   financial mutations (`expense_create`, `expense_edit`,
   `settlement_create`, `settlement_reverse`, `settlement_confirm`).
4. `isSafeIntegerAmount(value)` returns `false` for all floating-point
   values, NaN, Infinity, and out-of-safe-range integers.
5. `safelyRetrieveCachedBalances(entry, currentSourceVersion)` returns
   `null` whenever the cache is stale OR the zero-sum invariant is
   violated.
6. `createBalanceCacheEntry(input)` throws if any amount is a float OR
   the zero-sum invariant is violated — defense-in-depth at construction
   time.
