# Product Analytics

> Phase 9 — Prompt 83
>
> BillLens ships privacy-safe product analytics: DAU/WAU/MAU, feature
> adoption (15 features), manual-vs-OCR usage, and D1/D7/D30 retention.
> CRITICAL: analytics events NEVER carry exact amounts, merchant names,
> UPI IDs, raw receipt text, file paths, or any of the 13 sensitive
> property keys listed below. All amounts are bucketed into coarse
> ranges. All user identifiers are anonymous installation IDs.

## Goals

1. Measure product health: DAU/WAU/MAU, retention, feature adoption.
2. Detect drift early (e.g. D7 retention dropping below 12%).
3. NEVER leak PII to the analytics backend — even with a buggy adapter.

## Privacy contract

### Sensitive property keys (13) — ALWAYS dropped

```
amountMinor       amountMajor       merchantName
upiId             bankReference     ocrText
receiptImage      groupName         memberName
note              paymentReference  inviteToken
sessionToken      filePath
```

These keys are dropped ENTIRELY by `redactAnalyticsEvent`. Even a
redacted placeholder is not preserved — the key is removed from the
event properties object before persistence.

### Amount bucketing

Amounts are NEVER stored as exact values. They are bucketed into coarse
ranges:

- `< 100` (amountMinor < 100)
- `100-1000` (100 ≤ amountMinor < 1000)
- `1000-10000` (1000 ≤ amountMinor < 10000)
- `> 10000` (amountMinor ≥ 10000)

### Value-level PII scrubbing

Even non-sensitive keys can carry PII in their values (e.g. a free-text
`description` containing an email). The redactor scrubs these patterns
from string values:

- File URIs (`file://...`)
- Absolute paths (`/data/`, `/var/`, `/Users/`, `/home/`, `/tmp/`,
  `/storage/`, `/Documents/`)
- Email addresses (`x@y.z`)
- UPI VPAs (`name@bank`)
- Payment references (10-22 digit runs)
- Long hex/base64 tokens
- SQL query fragments

Each is replaced with `[REDACTED:<type>]`.

### Anonymous IDs only

Analytics events use `anonymousId` — an opaque installation ID (e.g. a
UUID generated on first launch). The redactor validates this field and
replaces it with `[REDACTED:anonymous_id]` if it accidentally looks like
an email or contains PII patterns.

## Product metrics (11)

| Key                 | Unit           | Description                                  |
| ------------------- | -------------- | -------------------------------------------- |
| `dau`               | count          | Distinct anonymous IDs active in last 24h    |
| `wau`               | count          | Distinct anonymous IDs active in last 7 days |
| `mau`               | count          | Distinct anonymous IDs active in last 30 days|
| `groups_created`    | count          | New groups created (per-day bucket)          |
| `expenses_created`  | count          | New expenses created (per-day bucket)        |
| `receipts_scanned`  | count          | Receipts processed through OCR               |
| `manual_vs_ocr`     | bucketed_ratio | `manual` / `ocr` / `mixed`                   |
| `retention_d1`      | ratio          | D1 retention (target 0.40, alert < 0.25)     |
| `retention_d7`      | ratio          | D7 retention (target 0.20, alert < 0.12)     |
| `retention_d30`     | ratio          | D30 retention (target 0.10, alert < 0.05)    |
| `feature_adoption`  | ratio          | Per-feature adoption rate                    |

## Tracked features (15)

```
create_group                  join_group_via_invite
create_expense_manual         create_expense_ocr
settlement_flow               capture_receipt_camera
capture_receipt_gallery       expense_split_equal
expense_split_exact           expense_split_percentage
expense_split_shares          expense_split_items
backup_local                  restore_local
export_data
```

Each feature's adoption rate is computed as `uniqueUsers / mau`, where
`uniqueUsers` is the number of distinct anonymous installation IDs
that used the feature at least once in the period.

## Architecture

```
src/domain/analytics/
  product-metrics.ts            # 11 metric definitions
  analytics-redactor.ts         # redactAnalyticsEvent() — pure privacy function
  retention-calculator.ts       # D1/D7/D30 cohort retention (pure)
  feature-adoption-tracker.ts   # 15-feature tracker (in-memory, snapshot report)

src/application/analytics/
  analytics-repository.port.ts                  # AnalyticsRepository port
  record-analytics-event.usecase.ts             # redacts before storage
  get-product-dashboard.usecase.ts              # DAU/WAU/MAU + counts + manual-vs-OCR
```

The domain layer has **zero** framework imports (verified by
`src/domain/__tests__/domain-independence.test.ts`). The application
layer depends only on the domain layer + the repository port.

## Retention calculation

The retention calculator is a pure function that takes pre-aggregated
cohort data:

1. **Cohort**: a set of anonymous installation IDs first seen on the
   same day.
2. **Activity snapshots**: per-day sets of anonymous installation IDs
   that were active.
3. **D1/D7/D30 retention**: fraction of the cohort active on day+1,
   day+7, day+30 after the cohort date.

The calculator never sees emails, phone numbers, or user IDs — it
operates exclusively on anonymous installation IDs.

## Testing

- `src/domain/analytics/__tests__/analytics-redactor.test.ts` — verifies
  ALL 13 sensitive keys are dropped, amounts are bucketed, PII is
  scrubbed from string values, nested objects/arrays are recursively
  redacted, and no PII leaks in serialized output.
- `src/domain/analytics/__tests__/retention-calculator.test.ts` —
  verifies D1/D7/D30 computation, cohort aggregation, edge cases.
- `src/domain/analytics/__tests__/feature-adoption-tracker.test.ts` —
  verifies 15-feature tracking, idempotent recording, adoption rate
  computation, most/least adopted identification.

## Operational notes

- Analytics events should be batched client-side (e.g. flushed every 5
  minutes or on app backgrounding) to reduce network chatter.
- The redactor runs BEFORE the event enters the batch queue — even if
  the queue is persisted to disk in cleartext (e.g. before encryption
  at rest is configured), no PII is present.
- Retention cohorts should be recomputed nightly from the raw event
  log. The calculator is fast (O(cohort_size × snapshots)) and can run
  in a background job.
- Feature adoption should be tracked per-period (e.g. weekly). The
  tracker's `reset()` method clears all feature usage at the start of
  a new period; MAU is updated separately via `setMau()`.
