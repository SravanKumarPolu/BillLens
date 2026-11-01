# Business Intelligence

> Phase 10 Prompt 95 — operational dashboards for revenue, growth, retention, costs, and product health. All data is **aggregated and privacy-respecting**.

## 1. Goals

The BI layer provides operational visibility into the BillLens business:

- **Revenue** — MRR, ARR, ARPU, churn, LTV.
- **User growth** — DAU, WAU, MAU, new sign-ups.
- **Retention** — D1/D7/D30 cohort retention.
- **Feature adoption** — which features are used, by what fraction of users.
- **OCR accuracy** — field-level pass rate, per-merchant accuracy.
- **Sync reliability** — sync success rate, conflict rate.
- **Support metrics** — ticket volume, SLA compliance, CSAT.
- **Infrastructure costs** — per-component spend, cost-per-user.
- **Growth funnel** — stage-by-stage conversion + bottleneck identification.
- **Product health** — composite score across 6 dimensions.

Every dashboard widget uses **aggregated, anonymised data**. No individual user data, expense amounts, or merchant names appear in a dashboard.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BI Dashboard UI (Phase 2)                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BI Application Layer                         │
│   get-revenue-snapshot.usecase.ts                              │
│   get-growth-funnel.usecase.ts                                 │
│   get-product-health.usecase.ts                                │
│   ... etc.                                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BI Domain (this module)                      │
│                                                                │
│   dashboard-model.ts      revenue-metrics.ts                   │
│   growth-funnel.ts        infrastructure-costs.ts              │
│   product-health.ts                                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              BI Repository Ports (read-only)                    │
│   RevenueRepository, FunnelRepository, HealthRepository, ...   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                Aggregated data warehouse
                  (materialised views, no PII)
```

All BI domain modules are **pure functions**: they compute snapshots from inputs. The application layer fetches aggregated data from the warehouse via repository ports and feeds it to the domain functions.

## 3. Privacy constraints

| Constraint                                                | How enforced |
|-----------------------------------------------------------|--------------|
| No individual user data in dashboards                     | Snapshots use COUNTs and aggregates only |
| No expense amounts in dashboards                          | `RevenueSnapshot.arpu` is a derived average; individual amounts never enter the module |
| No merchant names in dashboards                           | OCR accuracy is reported as a field-level pass rate, not per-merchant |
| No payment instrument data (card BINs, UPI IDs)           | Revenue module accepts only `ActiveSubscription { plan, price }` |
| Analytics retention ≤ 30 days (raw events); aggregates retained indefinitely | Enforced at the warehouse level |

## 4. Dashboard widgets

Each widget is described by a `DashboardWidget`:

```ts
interface DashboardWidget {
  id: string;
  type: DashboardType;  // 'revenue' | 'user_growth' | ...
  title: string;
  metric: string;       // machine-readable metric identifier
  currentValue: number;
  previousValue: number;
  changePercent: number; // ((current - previous) / |previous|) * 100
  trend: 'up' | 'down' | 'flat';
  target?: number;
  unit: string;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}
```

### 4.1 Change percent

`computeChangePercent(current, previous)`:

- Returns 0 when both are 0.
- Returns 100 when previous is 0 and current is positive (infinite growth clamped).
- Returns -100 when previous is 0 and current is negative.
- Otherwise returns `((current - previous) / |previous|) * 100`.

### 4.2 Trend

`computeTrend(current, previous, threshold?)`:

- Returns 'up' when `current > previous + threshold`.
- Returns 'down' when `current < previous - threshold`.
- Returns 'flat' otherwise.

The default threshold is 0. For noisy metrics (e.g. DAU), pass `previous * 0.01` to avoid flicker.

### 4.3 Target meeting

`isMetricMeetingTarget(widget)` automatically infers whether a metric is "higher-is-better" or "lower-is-better" from the metric name prefix:

- **Lower-is-better prefixes**: `churn`, `error`, `failure`, `latency`, `cost`, `dropoff`, `drop_off`, `bounce`, `unsubscri`, `refund`, `dispute`, `time_to_`, `mttr`, `sla_breach`, `cost_per_`.

A metric is "meeting target" when:
- Higher-is-better: `currentValue >= target`
- Lower-is-better: `currentValue <= target`

## 5. Revenue metrics

### 5.1 Snapshot

```ts
interface RevenueSnapshot {
  period: string;        // '2026-07'
  mrr: number;           // Monthly Recurring Revenue
  arr: number;           // Annual Recurring Revenue (MRR * 12)
  arpu: number;          // Average Revenue Per User
  payingUsers: number;
  freeUsers: number;
  conversionRate: number; // payingUsers / totalUsers (0-1)
  churnRate: number;     // churned / startedWith (0-1)
  ltv: number;           // arpu / churnRate (Infinity when churn=0)
}
```

### 5.2 Formulas

| Metric          | Formula                                           |
|-----------------|---------------------------------------------------|
| MRR             | `sum(activeSubscriptions.price)`                  |
| ARR             | `MRR * 12`                                        |
| ARPU            | `totalRevenue / totalUsers` (0 when no users)     |
| Conversion rate | `payingUsers / (payingUsers + freeUsers)`         |
| Churn rate      | `churned / startedWith`                           |
| LTV             | `arpu / churnRate` (Infinity when churn=0)        |

### 5.3 Edge cases

- `startedWith = 0` → `computeChurnRate` throws (division by zero).
- `churned > startedWith` → throws (impossible).
- `churnRate = 0` → `computeLtv` returns `Number.POSITIVE_INFINITY`. The dashboard UI displays this as `∞` or `N/A`.

## 6. Growth funnel

### 6.1 Stages

```
app_download → guest_signup → first_group → first_expense →
first_receipt_scan → first_settlement → account_created →
returning_user → power_user
```

### 6.2 Conversion + drop-off

```
conversionRate[i] = users[i] / users[i-1]   (1.0 for i=0)
dropoffRate[i]   = 1 - conversionRate[i]
```

If `users[i] > users[i-1]` (impossible in a real funnel — indicates a data-quality issue), `conversionRate` is clamped to 1.0 and `dropoffRate` to 0.

### 6.3 Bottleneck identification

`identifyBottleneck(funnel)` returns the stage with the highest `dropoffRate`. Tie-breaking favours the **earliest** stage (a bottleneck earlier in the funnel is more impactful to fix).

Returns `null` when there is no drop-off.

## 7. Infrastructure costs

### 7.1 Snapshot

```ts
interface CostSnapshot {
  period: string;
  supabaseCost: number;
  ocrProviderCost: number;
  storageCost: number;
  pushNotificationCost: number;
  cdnCost: number;
  monitoringCost: number;
  totalCost: number;       // sum of the above
  costPerUser: number;     // totalCost / totalUsers
  costPerActiveUser: number; // totalCost / activeUsers
}
```

### 7.2 Trend

```ts
interface CostTrend {
  costChange: number;          // current.totalCost - previous.totalCost
  costPerUserChange: number;   // current.costPerUser - previous.costPerUser
}
```

A positive `costChange` means costs went up. A positive `costPerUserChange` means each user costs more to serve — this is concerning because it indicates cost is growing faster than the user base.

### 7.3 Largest component

`getLargestCostComponent(snapshot)` returns the largest cost component (e.g. `{ name: 'supabase', cost: 500 }`). Useful for the "Where is our money going?" widget.

## 8. Product health

### 8.1 Score

```ts
interface ProductHealthScore {
  overall: number;             // weighted average (0-100)
  financialIntegrity: number;  // zero-sum pass rate (0-100)
  syncReliability: number;     // sync success rate (0-100)
  ocrAccuracy: number;         // field-level accuracy (0-100)
  crashFreeRate: number;       // crash-free session rate (0-100)
  userSatisfaction: number;    // NPS-derived (0-100)
  supportSla: number;          // SLA compliance (0-100)
}
```

### 8.2 Weights

| Sub-score            | Weight | Rationale                                          |
|----------------------|--------|----------------------------------------------------|
| financialIntegrity   | 0.25   | Paramount — a financial bug invalidates the product|
| syncReliability      | 0.20   | Trust depends on data consistency                  |
| crashFreeRate        | 0.15   | Direct UX impact                                   |
| userSatisfaction     | 0.15   | Long-term retention signal                         |
| supportSla           | 0.15   | Operational excellence                             |
| ocrAccuracy          | 0.10   | Quality signal but not core to financial integrity |

Weights sum to 1.0.

### 8.3 NPS conversion

```
satisfaction = (nps + 100) / 2
```

- NPS = -100 → satisfaction = 0
- NPS =    0 → satisfaction = 50
- NPS = +100 → satisfaction = 100

### 8.4 Status

| Score | Status    |
|-------|-----------|
| ≥ 80  | healthy   |
| ≥ 60  | warning   |
| <  60 | critical  |

### 8.5 Weakest sub-score

`getWeakestSubScore(score)` returns the lowest sub-score below 90. Returns `null` when all sub-scores are ≥ 90. The dashboard uses this for the "weakest link" callout.

## 9. Dashboard types

| Type                   | Purpose                                                | Key widgets                              |
|------------------------|--------------------------------------------------------|------------------------------------------|
| revenue                | Track MRR, ARR, ARPU, churn, LTV                       | MRR trend, churn rate, LTV               |
| user_growth            | DAU, WAU, MAU, new sign-ups                            | DAU trend, sign-up source breakdown      |
| retention              | D1/D7/D30 cohort retention                             | Retention curve, cohort heatmap          |
| feature_adoption       | Which features are used                                | Adoption rate per feature, trend         |
| ocr_accuracy           | Field-level pass rate                                  | Accuracy trend, per-field breakdown      |
| sync_reliability       | Sync success rate, conflict rate                       | Success rate, conflict count             |
| support                | Ticket volume, SLA, CSAT                               | Ticket trend, SLA %, CSAT trend          |
| infrastructure_costs   | Per-component spend, cost-per-user                     | Cost trend, largest component            |
| growth_funnel          | Stage-by-stage conversion                              | Funnel chart, bottleneck callout         |
| product_health         | Composite health score                                 | Overall score, sub-score breakdown       |

## 10. Files

| File                                                       | Responsibility                                            |
|------------------------------------------------------------|-----------------------------------------------------------|
| `src/domain/bi/dashboard-model.ts`                         | Widget model, change/trend computation, target meeting    |
| `src/domain/bi/revenue-metrics.ts`                         | MRR, ARR, ARPU, churn, LTV, conversion rate               |
| `src/domain/bi/growth-funnel.ts`                           | Funnel computation + bottleneck identification            |
| `src/domain/bi/infrastructure-costs.ts`                    | Cost snapshots + trend                                    |
| `src/domain/bi/product-health.ts`                          | Health score, status, weakest-link detection              |
| `src/domain/bi/index.ts`                                   | Barrel                                                    |
| `src/domain/bi/__tests__/revenue-metrics.test.ts`          | Revenue tests                                             |
| `src/domain/bi/__tests__/growth-funnel.test.ts`            | Funnel tests                                              |
| `src/domain/bi/__tests__/product-health.test.ts`           | Health tests                                              |

## 11. Future work

- Predictive analytics: forecast MRR, churn, and infrastructure costs for the next quarter.
- Anomaly detection: alert when a metric deviates > 2σ from its trailing 30-day mean.
- Cohort analysis: group users by sign-up month and compare retention curves.
- Per-channel attribution: tie revenue and retention back to acquisition channels.
- Real-time stream: replace daily-batch snapshots with streaming aggregations for sub-minute freshness.
