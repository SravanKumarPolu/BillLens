# Production Monitoring

> Phase 9 — Prompt 81
>
> BillLens ships **privacy-safe production monitoring** for nine core
> metrics. The system is designed so that *even a malicious or buggy
> adapter* cannot leak PII to a telemetry backend: every payload is
> redacted by the domain redactor before it leaves the application layer.

## Goals

1. Detect production degradation early (crashes, sync failures, OCR
   drift, settlement failures, latency regressions).
2. Provide on-call operators with a privacy-safe dashboard showing the
   latest value of each metric, whether it meets target, and whether it
   is alerting.
3. NEVER leak individual user data, exact amounts, merchant names, UPI
   IDs, raw OCR text, file paths, or SQLite query strings.

## Monitored metrics (9)

| Key                              | Unit       | Direction        | Target  | Alert threshold |
| -------------------------------- | ---------- | ---------------- | ------- | --------------- |
| `crash_free_session_rate`        | ratio      | higher is better | 0.995   | < 0.98          |
| `sync_success_rate`              | ratio      | higher is better | 0.99    | < 0.95          |
| `ocr_accuracy_rate`              | ratio      | higher is better | 0.90    | < 0.80          |
| `settlement_completion_rate`     | ratio      | higher is better | 0.98    | < 0.90          |
| `export_success_rate`            | ratio      | higher is better | 0.99    | < 0.95          |
| `backup_success_rate`            | ratio      | higher is better | 0.99    | < 0.95          |
| `restore_success_rate`           | ratio      | higher is better | 0.99    | < 0.95          |
| `api_latency_p95_ms`             | latency_ms | lower is better  | 400 ms  | > 1500 ms       |
| `database_query_latency_p95_ms`  | latency_ms | lower is better  | 50 ms   | > 250 ms        |

All ratio metrics are expressed in the range `[0, 1]` (e.g. `0.995` =
99.5%). Latency metrics are 95th percentiles in milliseconds.

## Architecture

```
src/domain/monitoring/
  metrics-model.ts       # 9 metric definitions + helpers (meetsTarget, shouldAlert)
  metrics-redactor.ts    # redactMetricPayload() — pure privacy function
  alerting-rules.ts      # 9 alert rules (severity + cooldownMs) + evaluator

src/application/monitoring/
  metric-repository.port.ts              # MetricRepository port
  record-metric.usecase.ts               # redacts payload, validates, persists
  get-metrics-dashboard.usecase.ts       # returns snapshot of latest values
```

The domain layer has **zero** framework imports (verified by
`src/domain/__tests__/domain-independence.test.ts`). The application layer
depends only on the domain layer + the repository port — no React, no
Supabase, no SQLite.

## Privacy contract

### What is redacted

`redactMetricPayload` strips, replaces with `[REDACTED:<type>]`, or buckets
**every** sensitive value:

| Category               | Trigger                                              | Replacement                  |
| ---------------------- | ---------------------------------------------------- | ---------------------------- |
| SQLite queries         | `SELECT/INSERT/UPDATE/DELETE/...` keyword            | `[REDACTED:sqlite_query]`    |
| File paths             | `file://`, `/data/`, `/var/`, `/Users/`, `/home/`, `/tmp/` | `[REDACTED:file_path]`  |
| Exact amounts          | `amountMinor` / `amountMajor` keys                   | Bucketed: `< 100`, `100-1000`, `1000-10000`, `> 10000` |
| Merchant names         | `merchantName` / `merchant` keys                     | `[REDACTED:merchant]`        |
| UPI IDs / VPAs         | `upiId`, or `name@bank` value pattern                | `[REDACTED:upi_id]`          |
| Raw OCR text           | `ocrText` / `ocr` / `rawText` keys                   | `[REDACTED:ocr_text]`        |
| Email addresses        | `email` key or `x@y.z` value pattern                 | `[REDACTED:email]`           |
| Payment references     | `paymentReference`, `bankReference`, `utr`, `rrn` keys or `\d{10,22}` value | `[REDACTED:payment_reference]` |
| Free text              | `note`, `description`, `title` keys                  | `[REDACTED:free_text]`       |
| Tokens                 | long hex/base64 strings                              | `[REDACTED:token]`           |

The redactor is a **pure function** — it never mutates the input payload
and returns a frozen, deep-cloned output.

### What is preserved

- Top-level numeric metric values (aggregate ratios / latencies).
- Top-level booleans, `null`, `undefined`.
- Non-sensitive string values at the top level (e.g. `metric: 'sync_success_rate'`).

### Defensive double-redaction

The application layer (`RecordMetricUseCase`) redacts the payload **before**
handing it to the repository. The repository port documents that adapters
MUST also redact. This defense-in-depth ensures that even a buggy adapter
that skips redaction cannot leak data — the payload it receives is already
redacted.

## Alerting

Each metric has one alert rule (`src/domain/monitoring/alerting-rules.ts`)
with:

- `severity`: `info` (latency drift), `warning` (sync/OCR/export/backup),
  `critical` (crashes, settlement, restore — data loss potential).
- `cooldownMs`: minimum interval between two firings (5 min for latency,
  15 min for most others).
- `runbook`: short, PII-free explanation of what to do.

`evaluateAllAlerts(observed, nowIso, lastFired)` returns the fired,
non-suppressed alerts — ready to be sent to the notifier.

## Dashboard

`GetMetricsDashboardUseCase` returns a `MetricsDashboard` snapshot:

- One entry per metric with: latest value, `meetsTarget`, `alerting`.
- A summary `alertCount`.
- **No payloads** — even redacted payloads are omitted from the dashboard
  view to minimize the surface area for accidental PII display.

## Testing

- `src/domain/monitoring/__tests__/metrics-redactor.test.ts` — verifies
  NO PII leaks across 13+ fixture categories (merchant names, UPI IDs,
  emails, payment refs, file paths, SQLite queries, OCR text, exact
  amounts, nested objects, arrays, mixed payloads).
- `src/domain/monitoring/__tests__/alerting-rules.test.ts` — verifies 9
  rules, severity assignments, cooldown behaviour, threshold direction
  for higher-is-better vs lower-is-better metrics.

## Operational notes

- Metric samples should be aggregated client-side (e.g. computed in a
  background job from raw event counts) before being recorded. The
  redactor does NOT compute aggregates — it only sanitizes them.
- Latency metrics should be computed with a streaming p95 algorithm
  (e.g. t-digest) so the metric itself does not require storing every
  individual sample.
- Alert firings should be sent to a privacy-safe channel (e.g. Slack
  webhook configured to drop message bodies containing `[REDACTED:...]`
  placeholders). Do NOT log the original raw payload anywhere.
