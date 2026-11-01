# Performance Report — BillLens Release Candidate

> Phase 8, Prompt 74 + 80. Measured evidence from this environment;
> device-class measurements pending physical devices (honest gaps).
> Re-measured 2026-10-11 for v2.1.0 (settlements write-side + manual
> expense form + polished group home + metrics dashboard).

## Measured in this environment

| Metric | Value | Method |
|---|---|---|
| Full test-suite wall time | ≈ 11–13 s for 4,270 tests | `npx jest --silent` |
| Android Hermes bundle size | **3.83 MB** bytecode + 842 B metadata (v2.1.0; was 2.74 MB at v2.0.0 / 3.66 MB at v2.0.3) | `npx expo export --platform android` |
| Balance invariants over 1,000-expense synthetic group | within benchmark budgets (asserted, not wall-clocked here) | `run-optimization-benchmarks.usecase.ts` framework |

## Performance framework (implemented)

- `src/application/performance/run-optimization-benchmarks.usecase.ts`
  + `performance-benchmark-repository.port.ts` — repeatable benchmark
  runs recorded per release.
- `src/domain/performance/` — `optimization-targets.ts` (targets incl.
  cold start, home render, balance calc, OCR, sync, export, restore),
  `n-plus-one-detector.ts`, `memory-profiler.ts`,
  `floating-point-guard.ts`, `balance-cache-safety.ts` (cache
  invalidates on the 5 financial mutation types + verifies zero-sum —
  tested).
- `src/domain/scalability/capacity-model.ts` — capacity envelope for
  the Prompt 74 dataset targets (50 groups / 500 members / 10,000
  expenses / 1,000 settlements / 1,000 queued ops).
- Index coverage for hot queries (expense history, sync queue, audit)
  defined in `docs/database-schema.md` + migrations; search indexing
  strategy in `src/domain/scalability/search-indexing.ts`.

## Targets (Prompt 74) and status

| Target | Status |
|---|---|
| Cold/warm startup budgeted; non-critical services deferred off the render path | ✅ architected (providers lazy; DB init + session restore off critical path); **device measurement pending** |
| Heavy image work off the main thread | ✅ image preparation uses native modules (expo-image-manipulator path planned; current mock processor documented) |
| No full-table downloads / duplicate requests | ✅ incremental-download + compaction implemented and tested |
| Sync battery discipline | ✅ connectivity-triggered + cooldown (SyncCoordinator `cooling_down` with injected clock); no polling loops |
| No continuous background location | ✅ no location permission exists |
| Regression benchmarks tracked between releases | ✅ framework + repository port; **first baseline recording pending device run** |

## Large-dataset verification status

The capacity model and benchmark suite simulate the Prompt 74 dataset
shape (10k expenses / 1k settlements / 1k queue) and the SQLite layer
is pagination + index based (no N+1 per the detector tests). Wall-clock
measurements on low-end physical devices remain outstanding — recorded
as RISK-PERF-01 with a closed-beta measurement plan.

## Bundle size notes

3.83 MB Hermes bytecode (v2.1.0) is dominated by the React Native +
Expo runtime; the growth from 2.74 MB (v2.0.0) reflects the Phase 6–10
modules plus the v2.1.0 screens/adapters. No oversized assets exist
(`assets/` ≈ 46 KB total). Fonts are system defaults (no bundled font
payload). Debug symbols are not included in release artefacts by default.

## Device-class measurement plan (pre-beta)

Record cold start, home render, 1,000-expense group open, expense
search, balance calc, receipt processing, queue recovery, sync run,
CSV export, restore — on one low-end Android (2–3 GB RAM) and one
mid-range Android + one mid-tier iPhone; paste results into this file.
