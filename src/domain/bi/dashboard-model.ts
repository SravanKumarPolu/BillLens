/**
 * BI dashboard model — widget definitions + change/trend computation.
 *
 * Phase 10 Prompt 95: Business Intelligence.
 *
 * CRITICAL PRIVACY CONSTRAINTS:
 *   - Dashboards use AGGREGATED data only. No individual user data,
 *     individual expense amounts, or individual merchant names appear
 *     in a dashboard widget.
 *   - `DashboardWidget.currentValue` / `previousValue` are aggregate
 *     numbers (totals, rates, averages) — never single-record values.
 *   - The widget title + metric name are PUBLIC (shown on the dashboard
 *     to anyone with dashboard access); they MUST NOT contain PII.
 *
 * This module is PURE: it computes widget values from inputs; no I/O.
 *
 * See `docs/business-intelligence.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardType =
  | 'revenue'
  | 'user_growth'
  | 'retention'
  | 'feature_adoption'
  | 'ocr_accuracy'
  | 'sync_reliability'
  | 'support'
  | 'infrastructure_costs'
  | 'growth_funnel'
  | 'product_health';

export type WidgetTrend = 'up' | 'down' | 'flat';

export type WidgetPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface DashboardWidget {
  readonly id: string;
  readonly type: DashboardType;
  readonly title: string;
  /** Metric identifier (machine-readable). */
  readonly metric: string;
  readonly currentValue: number;
  readonly previousValue: number;
  readonly changePercent: number;
  readonly trend: WidgetTrend;
  /** Optional target value (e.g. SLA target, OKR target). */
  readonly target?: number;
  readonly unit: string;
  readonly period: WidgetPeriod;
}

// ---------------------------------------------------------------------------
// Change percent
// ---------------------------------------------------------------------------

/**
 * Computes the percent change from `previous` to `current`.
 *
 *   changePercent = ((current - previous) / |previous|) * 100
 *
 * Returns:
 *   - 0 when both `current` and `previous` are 0.
 *   - 100 when `previous` is 0 and `current` is positive (infinite growth
 *     clamped to 100 to keep dashboards readable).
 *   - -100 when `previous` is 0 and `current` is negative (shouldn't
 *     happen for monotonic counters, but clamped for safety).
 *   - NaN is rejected with a thrown error.
 */
export function computeChangePercent(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    throw new Error(
      `current and previous must be finite numbers, got current=${current}, previous=${previous}`,
    );
  }
  if (previous === 0) {
    if (current === 0) return 0;
    return current > 0 ? 100 : -100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

/**
 * Computes the trend direction from `previous` to `current`.
 *
 *   - 'up'   when current > previous + threshold
 *   - 'down' when current < previous - threshold
 *   - 'flat' otherwise
 *
 * The default `threshold` is 0 — any difference is reported as up/down.
 * For noisy metrics (e.g. DAU), pass a threshold of 1% of `previous` to
 * avoid flicker.
 *
 * Special case: when `previous` is 0 and `current` is positive, returns
 * 'up' regardless of threshold.
 */
export function computeTrend(
  current: number,
  previous: number,
  threshold: number = 0,
): WidgetTrend {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    throw new Error(
      `current and previous must be finite numbers, got current=${current}, previous=${previous}`,
    );
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error(`threshold must be non-negative, got ${threshold}`);
  }
  if (current > previous + threshold) return 'up';
  if (current < previous - threshold) return 'down';
  return 'flat';
}

// ---------------------------------------------------------------------------
// Widget construction
// ---------------------------------------------------------------------------

export interface DashboardWidgetInput {
  readonly id: string;
  readonly type: DashboardType;
  readonly title: string;
  readonly metric: string;
  readonly currentValue: number;
  readonly previousValue: number;
  readonly target?: number;
  readonly unit: string;
  readonly period: WidgetPeriod;
  readonly trendThreshold?: number;
}

/**
 * Constructs a `DashboardWidget` from raw inputs. Computes `changePercent`
 * and `trend` automatically so the caller doesn't have to.
 *
 * The widget is frozen and ready to render in the dashboard UI.
 */
export function createDashboardWidget(
  input: DashboardWidgetInput,
): DashboardWidget {
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new Error('id must be a non-empty string');
  }
  if (typeof input.title !== 'string' || input.title.length === 0) {
    throw new Error('title must be a non-empty string');
  }
  if (typeof input.metric !== 'string' || input.metric.length === 0) {
    throw new Error('metric must be a non-empty string');
  }
  if (typeof input.unit !== 'string' || input.unit.length === 0) {
    throw new Error('unit must be a non-empty string');
  }
  const changePercent = computeChangePercent(input.currentValue, input.previousValue);
  const trend = computeTrend(
    input.currentValue,
    input.previousValue,
    input.trendThreshold,
  );
  return Object.freeze({
    id: input.id,
    type: input.type,
    title: input.title,
    metric: input.metric,
    currentValue: input.currentValue,
    previousValue: input.previousValue,
    changePercent,
    trend,
    ...(input.target !== undefined ? { target: input.target } : {}),
    unit: input.unit,
    period: input.period,
  });
}

/**
 * Returns true when the widget is meeting or exceeding its target.
 *
 *   - For "higher-is-better" metrics (e.g. MRR, retention): `currentValue >= target`.
 *   - For "lower-is-better" metrics (e.g. churn, error rate): `currentValue <= target`.
 *
 * The "direction" is inferred from the metric name prefix. The dashboard UI
 * labels a metric as "lower-is-better" when its name starts with one of:
 *   `churn`, `error`, `failure`, `latency`, `cost`, `dropoff`, `drop_off`,
 *   `bounce`, `unsubscri`, `refund`, `dispute`, `time_to_`, `mttr`,
 *   `sla_breach`, `cost_per_`.
 */
const LOWER_IS_BETTER_PREFIXES: readonly string[] = [
  'churn',
  'error',
  'failure',
  'latency',
  'cost',
  'dropoff',
  'drop_off',
  'bounce',
  'unsubscri',
  'refund',
  'dispute',
  'time_to_',
  'mttr',
  'sla_breach',
  'cost_per_',
];

export function isMetricMeetingTarget(widget: DashboardWidget): boolean {
  if (widget.target === undefined) return true;
  const lowerIsBetter = LOWER_IS_BETTER_PREFIXES.some((p) =>
    widget.metric.startsWith(p),
  );
  return lowerIsBetter
    ? widget.currentValue <= widget.target
    : widget.currentValue >= widget.target;
}
