/**
 * Alerting rules for production monitoring.
 *
 * Each monitored metric has exactly one alert rule. A rule fires when the
 * observed metric value crosses the alert threshold defined in
 * `METRIC_DEFINITIONS`. Each rule carries:
 *
 *   - `severity`: how loudly to page (info / warning / critical)
 *   - `cooldownMs`: minimum time between two firings of the same rule
 *     (prevents alert storms when a metric flaps around the threshold)
 *
 * Severity guidance:
 *   - `critical`: data loss, settlement failures, restore failures, crashes
 *   - `warning`: sync / export / OCR / backup degradation
 *   - `info`: latency drift (no data loss, but UX degraded)
 *
 * See `docs/production-monitoring.md`.
 */

import type { MonitoredMetric } from './metrics-model';
import { METRIC_DEFINITIONS, shouldAlert, type MetricDefinition } from './metrics-model';

// ---------------------------------------------------------------------------
// Severity + cooldown
// ---------------------------------------------------------------------------

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRule {
  /** The metric this rule watches. */
  readonly metric: MonitoredMetric;
  /** Severity used by the notifier to choose the channel + page policy. */
  readonly severity: AlertSeverity;
  /**
   * Minimum time (ms) between two firings of this rule for the SAME
   * observed entity. Prevents alert storms when a metric flaps.
   */
  readonly cooldownMs: number;
  /** Human-readable explanation shown in the alert body (no PII). */
  readonly runbook: string;
}

// ---------------------------------------------------------------------------
// Rule table — one rule per monitored metric (9 total)
// ---------------------------------------------------------------------------

const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

export const ALERT_RULES: Readonly<Record<MonitoredMetric, AlertRule>> = Object.freeze({
  crash_free_session_rate: Object.freeze({
    metric: 'crash_free_session_rate',
    severity: 'critical',
    cooldownMs: FIFTEEN_MINUTES,
    runbook:
      'Users are hitting uncaught crashes. Inspect the latest crash stack traces (no PII), reproduce locally, and ship a hotfix. Do NOT log payload data.',
  }),
  sync_success_rate: Object.freeze({
    metric: 'sync_success_rate',
    severity: 'warning',
    cooldownMs: FIFTEEN_MINUTES,
    runbook:
      'Sync failures are above threshold. Check cloud API status, retry queue depth, and conflict-resolution logs (no PII).',
  }),
  ocr_accuracy_rate: Object.freeze({
    metric: 'ocr_accuracy_rate',
    severity: 'warning',
    cooldownMs: THIRTY_MINUTES,
    runbook:
      'OCR extractions are being corrected more than usual. Inspect aggregate field-level correction rates (never raw OCR text).',
  }),
  settlement_completion_rate: Object.freeze({
    metric: 'settlement_completion_rate',
    severity: 'critical',
    cooldownMs: FIFTEEN_MINUTES,
    runbook:
      'Settlements are failing reconciliation. Inspect balance-engine + settlement-engine logs (no exact amounts, no merchant names).',
  }),
  export_success_rate: Object.freeze({
    metric: 'export_success_rate',
    severity: 'warning',
    cooldownMs: FIFTEEN_MINUTES,
    runbook:
      'Export operations are failing. Check filesystem permissions, free disk space (no file paths in logs).',
  }),
  backup_success_rate: Object.freeze({
    metric: 'backup_success_rate',
    severity: 'warning',
    cooldownMs: FIFTEEN_MINUTES,
    runbook:
      'Local backups are failing. Check filesystem permissions and disk space (no file paths in logs).',
  }),
  restore_success_rate: Object.freeze({
    metric: 'restore_success_rate',
    severity: 'critical',
    cooldownMs: FIFTEEN_MINUTES,
    runbook:
      'Restore operations are failing — users may lose access to historical data. Inspect schema migration + integrity-check logs (no PII).',
  }),
  api_latency_p95_ms: Object.freeze({
    metric: 'api_latency_p95_ms',
    severity: 'info',
    cooldownMs: FIVE_MINUTES,
    runbook:
      'API p95 latency is above target. Inspect cloud-side request duration; consider warming caches or scaling up.',
  }),
  database_query_latency_p95_ms: Object.freeze({
    metric: 'database_query_latency_p95_ms',
    severity: 'info',
    cooldownMs: FIVE_MINUTES,
    runbook:
      'Local SQLite p95 query latency is above target. Inspect slow query patterns (aggregate only — never log query SQL or row data).',
  }),
});

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------

export interface AlertFiringContext {
  /** The metric value that triggered the rule. */
  readonly observedValue: number;
  /** ISO date-time when the rule was evaluated. */
  readonly evaluatedAt: string;
  /** ISO date-time when this rule last fired, or null if never. */
  readonly lastFiredAt: string | null;
}

export interface FiredAlert {
  readonly metric: MonitoredMetric;
  readonly severity: AlertSeverity;
  readonly observedValue: number;
  readonly threshold: number;
  readonly firedAt: string;
  readonly runbook: string;
  /**
   * True when this firing is suppressed by the cooldown (i.e. the rule
   * would have fired, but the cooldown has not yet elapsed). The caller
   * decides whether to drop or aggregate suppressed firings.
   */
  readonly suppressed: boolean;
}

/**
 * Evaluate a rule against an observed metric value.
 *
 * Returns a `FiredAlert` when the threshold is crossed (and possibly
 * suppressed by cooldown), or `null` when the value is within bounds.
 */
export function evaluateAlertRule(
  rule: AlertRule,
  context: AlertFiringContext,
): FiredAlert | null {
  const definition: MetricDefinition = METRIC_DEFINITIONS[rule.metric];
  if (!shouldAlert(definition, context.observedValue)) {
    return null;
  }

  const now = Date.parse(context.evaluatedAt);
  const last = context.lastFiredAt === null ? null : Date.parse(context.lastFiredAt);

  let suppressed = false;
  if (last !== null && Number.isFinite(now) && Number.isFinite(last)) {
    if (now - last < rule.cooldownMs) {
      suppressed = true;
    }
  }

  return {
    metric: rule.metric,
    severity: rule.severity,
    observedValue: context.observedValue,
    threshold: definition.alertThreshold,
    firedAt: context.evaluatedAt,
    runbook: rule.runbook,
    suppressed,
  };
}

/**
 * Convenience helper — evaluate all 9 rules against a snapshot of metric
 * values and return the fired (non-suppressed) alerts.
 */
export function evaluateAllAlerts(
  observed: Readonly<Partial<Record<MonitoredMetric, number>>>,
  nowIso: string,
  lastFired: Readonly<Partial<Record<MonitoredMetric, string | null>>>,
): readonly FiredAlert[] {
  const out: FiredAlert[] = [];
  for (const key of Object.keys(ALERT_RULES) as MonitoredMetric[]) {
    const value = observed[key];
    if (value === undefined) continue;
    const rule = ALERT_RULES[key];
    if (!rule) continue;
    const fired = evaluateAlertRule(rule, {
      observedValue: value,
      evaluatedAt: nowIso,
      lastFiredAt: lastFired[key] ?? null,
    });
    if (fired && !fired.suppressed) {
      out.push(fired);
    }
  }
  return out;
}
