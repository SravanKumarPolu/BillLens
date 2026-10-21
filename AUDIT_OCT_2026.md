# BillLens — Review & Competitive Audit (20 October 2026)

**Scope:** whole repository — `app/`, `src/`, `supabase/`, `scripts/`, web export
**Baseline:** `34fd075` + working-tree changes
**Environment:** macOS, Node 24.20, TZ `Asia/Calcutta`, no native folders (CNG)
**Post-audit update:** the project was migrated to Expo SDK 57 (RN 0.86.3,
React 19.2.3, TypeScript 6) so it matches the installed Expo Go. Every gate
below was re-run after the migration; see CHANGELOG 2.7.0. A follow-up
2.7.1 fixes the first-launch SQL splitter (`near "tracks"`) that surfaced
once the app ran on device.

---

## 1. Verdict

The product core is solid: a layered Expo Router app, an offline-first SQLite
model, a receipt → draft → review → expense pipeline, and a design system whose
warm-ivory / ink-indigo palette already matches the "classic and elegant"
brief. 722 source files, 185 test suites, 37 routes.

But the working tree could not ship. Three **release-blocking regressions**
were present, none of which the test suite could see:

1. The local SQLite schema used PostgreSQL's `char_length()` in seven `CHECK`
   constraints. SQLite has no such function, so **the app would fail on first
   launch**, before any screen rendered.
2. `npm run lint` did not lint anything: the script passed `--ext` to a flat
   config (invalid), and `eslint.config.mjs` had been deleted.
3. The web build could not build: `react-native-web` was removed and
   `metro.config.js` (needed for `expo-sqlite`'s WASM) was gone.

All three are fixed and now guarded. The two failing timezone suites are fixed
at the root, and three product gaps were closed: screen-reader amounts, the
unreachable drafts queue, and empty web metadata.

**Gates after this pass**

| Gate | Before | After |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| `npm run lint` | **crashed** (no config) | 0 errors / 0 warnings across TS+TSX |
| `jest` | 183 suites, **5 failing** | **185 suites / 4,715 passing** |
| `npm run db:validate` | valid | valid |
| `npm run db:verify` | *did not exist* | 8 blocks, **33 tables** in real SQLite |
| `expo export -p web` | **failed** (wasm unresolved) | succeeds, metadata verified per route |
| `expo-doctor` | 16/18 | **21/21** |

---

## 2. Release-blocking defects (fixed)

### 2.1 SQLite schema used PostgreSQL syntax — P0

`src/infrastructure/sqlite/schema.ts` had `char_length(...)` in
`MIGRATION_0002_PHASE6_TRACK1` and the payment-handle tables. The string was
copied from `supabase/migrations/202610101500_phase6_track1_settlement_state_machine.sql`,
where `char_length` is valid. In SQLite:

```
$ sqlite3 :memory: "select char_length('abc');"
Error: in prepare, no such function: char_length
```

Why the suite missed it: `InMemoryDatabase` (the test double) records
statements and parses only column names; it never asks SQLite to prepare the
SQL. 181 "green" suites therefore proved nothing about the schema.

**Fix.** Restored `length()` and added two guards:

- `src/infrastructure/__tests__/sqlite-schema-portability.test.ts` — scans
  every registered migration for PostgreSQL-only constructs (`char_length`,
  `now()`, `timestamptz`, `serial`, `ilike`, `::cast`, `interval`).
- `scripts/verify-sqlite-schema.js` (`npm run db:verify`) — extracts the schema
  blocks and executes them in a real `sqlite3` process. Verified it catches the
  exact regression:

  ```
  ✖ Local schema does not execute in SQLite:
  Runtime error near line 661: unknown function: char_length()
  ```

  On the fixed schema: `✓ 8 blocks, 33 tables created.` Wired into
  `precommit` and CI.

### 2.2 Lint was dead — P0

`eslint . --ext .ts,.tsx` is an eslintrc-mode flag. Under flat config ESLint
rejects it and then looks for `.eslintrc.*`, which does not exist:

```
ESLint couldn't find a configuration file.
```

The config file had also been removed, so all TypeScript — hooks dependencies,
unused imports, accidental `console` in render paths — was unchecked.

**Fix.** New `eslint.config.mjs` with `@typescript-eslint`, `eslint-plugin-react`
and `eslint-plugin-react-hooks`; scripts are plain `eslint .` / `--fix`. Result:
0 errors, 0 warnings over the whole codebase (two legitimate positional-key
uses documented with targeted disables). Also removed the two dead variables in
`scripts/validate-sql.js`.

### 2.3 Web build was broken — P0

`react-native-web` was missing from `dependencies` and `metro.config.js` was
deleted, so `expo export -p web` failed:

```
Unable to resolve ./wa-sqlite/wa-sqlite.wasm from expo-sqlite/web/worker.ts
```

**Fix.** Restored `react-native-web@^0.21`, recreated `metro.config.js` with
`wasm` added to `resolver.assetExts`, and documented the hosting requirement:
wa-sqlite needs `SharedArrayBuffer`, so the static host must send
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Without those headers the page
loads but the database worker cannot start.

### 2.4 Timezone-dependent dates — P1

Two suites failed on any non-UTC machine because `Date.parse` treats
`2025-01-15` as UTC midnight and `2025/01/15` as **local** midnight:

- a format-only correction (`2025/01/15` → `2025-01-15`) was recorded as a
  **value change**, corrupting OCR-improvement statistics;
- `getPeriodStart('monthly')` asserted UTC calendar fields while producing
  local ones.

**Fix.**

- `parseCalendarDates` / `sameCalendarDate` — timezone-free calendar parsing
  (year-first, day-first, month-first; leap years; impossible dates rejected;
  ambiguous `01/02/2025` keeps both readings). `Date.parse` is no longer used
  for receipt dates.
- `getPeriodStart(period, now, timeZone?)` — local-calendar boundaries resolved
  to UTC with a two-pass offset calculation (DST-correct), device zone by
  default, UTC fallback for unknown zones.
- Tests: TZ matrix (UTC, IST, US Pacific, UTC+14), New York DST boundary,
  half-hour offsets, unknown zone.

---

## 3. Product and design improvements

### 3.1 Screen readers announced database units — accessibility

Six user-facing strings interpolated minor units, e.g. *"You are owed 125050
minor units in INR"*: home balances (owed/owing), home group cards, group home,
groups list, new-expense participant rows, and the balance-explanation reason.

Added `describeAmount(minor, code, { includeDirection })` and replaced every
call site. A screen reader now hears "You are owed ₹1,250.50 INR"; the raw
integer never appears. Tests assert both the formatting and the absence of the
integer.

### 3.2 Drafts were a dead end — core flow

The dashboard counted "N drafts waiting for review" and the card said "Tap to
review", but the card had no `onPress` and there was no list route. A draft
saved when the app closed could only be reached by capturing another receipt.

Added `/drafts` built on the existing `ExpenseDraftRepository`:

- `view-models/drafts-inbox.ts` — pure filtering (`needs_review` + `ready`),
  newest-first ordering, counts, honest empty summary;
- `hooks/use-pending-drafts.ts` — registry-backed, refreshes on focus;
- `screens/drafts/DraftsInboxScreen.tsx` — loading, error + retry, empty
  state, per-row status / issue count / amount;
- `app/drafts/index.tsx` — route (`noindex`), registered in the root stack;
- dashboard card now has a working **Review** action.

Covered by 10 tests.

### 3.3 Home group cards — affordance

The card looked tappable but only the chevron was. The whole card is now one
`Pressable` with one focus stop and a pressed state; the chevron is decorative.
This removes a duplicate focus target for the same destination.

### 3.4 Web metadata was empty — SEO

All 35 exported routes shipped `<title data-rh="true"></title>` and no
description. Added:

- `app/+html.tsx` — zoom-preserving viewport (no `user-scalable=no`), light/dark
  `theme-color`, `color-scheme`, pre-hydration background matching the tokens;
- `src/presentation/web/PageHead.tsx` — flat `<Head>` children (a Fragment
  silently dropped every description), OG/Twitter tags, opt-in `noindex`;
- default `PageHead` in the root layout, so no route can render an empty title;
- per-route heads for home, groups, activity, settings, capture, drafts;
- branded `+not-found` and `public/robots.txt` mirroring the `noindex` policy.

Measured on the fresh export:

| Route | `<title>` | Description | Robots |
|---|---|---|---|
| `/` | `BillLens` | yes | index |
| `/groups` | `Groups · BillLens` | yes | index |
| `/activity` | `Activity · BillLens` | yes | index |
| `/settings` | `Settings · BillLens` | yes | noindex |
| `/capture` | `Capture a receipt · BillLens` | yes | noindex |
| `/drafts` | `Drafts · BillLens` | yes | noindex |
| `/+not-found` | `Page not found · BillLens` | yes | noindex |

Exactly one `<title>` per page.

---

## 4. Competitive gap audit

BillLens positions itself as "Splid/Splitwise, but receipt-aware and
India-first". Measured against the category's table stakes:

| Capability | Category baseline | BillLens today | Verdict |
|---|---|---|---|
| Groups, members, invites | All | Shipped, offline-first | Parity |
| Balances + debt simplification | All | Multi-currency engine, greedy suggestions | Parity |
| Settle-up with audit trail | Most | Draft → record → pending confirmation, conflict-safe | **Stronger** |
| Offline-first | Splid, Tricount | SQLite + queue + conflict resolution | Parity/stronger |
| Receipt → structured draft → review | Splitwise (upload), most none | OCR + per-field confidence + review | **Differentiator** |
| Draft recovery after restart | — | **Fixed here** (inbox) | Differentiator now usable |
| Item-level splitting | Splitwise Pro, SplitPro | Domain + review UI | Parity |
| Multi-currency | Splitwise (paid), Tricount | Per-currency balances, correct decimals | Parity |
| Reminders / notifications | All | **Missing** | **Gap** |
| Search across expenses | Splitwise, SplitPro | **Missing** (group-name search only) | **Gap** |
| Export / backup to file | Splitwise CSV, SplitPro | **No UI**; `domain/ecosystem/accounting-export.ts` is unused | **Gap** |
| Recurring expenses | Splitwise, SplitPro | **Missing** | **Gap** |
| Localisation | Most ship several languages | English-only UI | **Gap** |
| Web access | Splitwise web, SplitPro | Static export works; no acquisition story | **Closing** |

**Read of the market.** The differentiator is real and now reachable end to
end (capture → draft → inbox → confirm). It will not win on breadth against
Splitwise; it can win on receipt capture and financial correctness. The four
table-stakes gaps — notifications, search, export, recurring — are what block
a switch, not missing enterprise modules.

**Where the repository misleads.** Ten domain modules (14,695 lines) have zero
production consumers: `ai`, `api-platform`, `bi`, `compliance`, `ecosystem`,
`enterprise`, `i18n`, `monetisation`, `roadmap`, `scalability`. Their tests
inflate the suite and previously justified claims ("AI insights",
"gamification", "budgets", "PDF/Excel export") that had no screen. The marketing
docs that made those claims have been pruned from the working tree; the code
remains. Decide per module: wire, archive, or delete.

---

## 5. Design review

**Holds up (keep):**

- Warm ivory `#FAF8F5`, deep slate text, ink-indigo `#2B3A8C` — restrained, not
  "SaaS purple"; reads classic rather than flash.
- Semantic colours identical across themes and never the sole signal (labels,
  signs, icons accompany colour).
- `tabular-nums` on every amount style; integer minor units end to end with a
  domain currency table (0/2/3-decimal currencies handled).
- 44pt touch targets, named text styles, 4/8 spacing scale, reduced-motion hook.

**Needs work:**

1. **Typography is system-only.** A licensed serif for `display` /
   `screenTitle` (sans for body and amounts) would deliver the "classic" half of
   the brief. This is a brand decision, not a code fix.
2. **Empty states are text-heavy.** The first-run card is good; the secondary
   ones are icon + sentence. One small illustration set would lift perceived
   quality more than any spacing change.
3. **Long lists are not virtualised.** `grep -rl FlatList src app` → **0**.
   Activity is capped, which limits the damage, but a long expense history
   mounts every row.
4. **Wide-screen layout.** The 600pt reading column is defined in tokens but not
   applied by `Screen`; on tablet/web the layout stretches edge to edge.

---

## 6. Performance

| Metric | Value | Note |
|---|---|---|
| Web JS bundle | 2.2 MB min / **556 KB gzip**, one chunk | route-level splitting not active |
| Dashboard load | 3 sequential queries per group | N+1; parallelising is the next win |
| Lists | 0 virtualised lists | `FlatList`/FlashList for activity + expenses |
| Test suite | ~9–15 s for 4,715 tests | healthy |
| SQLite schema | 33 tables, executes in <100 ms | `npm run db:verify` |

The web bundle is the one number a performance engineer should act on: 556 KB
gzip is a 3–4 s first load on a mid-range phone. Code-split capture/OCR (the
heaviest surface, least needed on first paint) before adding features.

---

## 7. Open issues (not fixed — need a decision)

| # | Issue | Evidence | Recommendation |
|---|---|---|---|
| 1 | **14,695 LOC with no consumer** | zero imports for 10 domain modules | wire, archive under `labs/`, or delete |
| 2 | **No reminders/notifications** | no notification adapter; competitors have them | push + settle-up nudges |
| 3 | **No expense search** | `grep SearchExpense src` → 0 | search across groups |
| 4 | **No export UI** | `exportToFormat` imported nowhere | CSV export from group settings |
| 5 | **Lists not virtualised** | `FlatList` → 0 files | activity + expenses first |
| 6 | **556 KB gzip single chunk** | export measurement | split capture/OCR |
| 7 | **Weeks start Sunday only** | `getPeriodStart` documented assumption | add `weekStartsOn` for ISO markets |
| 8 | **Jest worker force-exit warning** | full run prints it; `--detectOpenHandles` on `src/store` finds none | inspect sync/connectivity intervals |
| 9 | **Native folders removed** | `android/` + `ios/` absent (CNG) | `npx expo prebuild` before device builds |
| 10 | **Web needs COOP/COEP headers** | wa-sqlite uses SharedArrayBuffer | configure host headers |
| 11 | **No E2E or visual regression in CI** | `e2e/maestro` exists, not wired | add a device smoke flow |
| 12 | **87 root docs deleted in working tree** | `git status` deletions | confirm intentional; keep one audit doc |

---

## 8. Recommended next steps

**P0 (before any build)**
1. Regenerate native projects (`npx expo prebuild`) and run a device smoke test
   of first launch — the schema bug proves CI alone is not enough.
2. Configure the web host's COOP/COEP headers.

**P1 (next release)**
3. Reminders for unsettled balances.
4. CSV export (reuse `domain/ecosystem/accounting-export.ts`) — closes the
   "can I leave with my data" question.
5. Search across expenses.
6. Virtualise activity and expense lists.
7. Resolve the ten domain-only modules.

**P2 (quality)**
8. Localisation foundation (extract strings, one non-English locale).
9. Visual regression baseline for the five core screens.
10. Parallelise the dashboard's per-group queries.

---

## Appendix — verification commands

```bash
npx tsc --noEmit                 # clean
npm run lint                     # 0 errors, 0 warnings
npx jest --silent                # 185 suites / 4,715 tests passing
npm run db:validate              # 6 SQL files valid
npm run db:verify                # 8 blocks, 33 tables in real SQLite
npm run secret-scan              # clean
npx expo export -p web           # 35 pages; titles/descriptions verified
npx expo-doctor                  # 21/21 checks passed
```

**Files changed**

```
app/+html.tsx                                   (new)  document shell
app/+not-found.tsx                              (new)  branded 404
app/_layout.tsx                                        default title + drafts route
app/(tabs)/{index,groups,activity,settings}.tsx        per-route metadata
app/capture/index.tsx                                  per-route metadata
app/drafts/index.tsx                            (new)  drafts route
public/robots.txt                               (new)  crawler policy
metro.config.js                                 (new)  wasm asset support
eslint.config.mjs                               (new)  TS + hooks linting
scripts/verify-sqlite-schema.js                 (new)  real SQLite execution
scripts/validate-sql.js                                dead vars removed
package.json                                    scripts, react-native-web, db:verify
src/infrastructure/sqlite/schema.ts                    char_length → length
src/infrastructure/__tests__/sqlite-schema-portability.test.ts (new)
src/domain/enterprise/spending-limits.ts               timezone-correct periods
src/domain/ocr-improvement/field-level-diff.ts         calendar-date diffing
src/presentation/design-system/financial-format.ts     describeAmount()
src/presentation/screens/home/HomeDashboardScreen.tsx  a11y, tappable card, drafts CTA
src/presentation/screens/{group,expense}/*.tsx         a11y labels
src/presentation/view-models/balance-explanation.ts    speakable reason
src/presentation/{hooks/use-pending-drafts.ts,screens/drafts/*,view-models/drafts-inbox.ts,utils/relative-time.ts,web/PageHead.tsx} (new)
README.md / CHANGELOG.md                               status, web build notes
+ tests for every fix
```
