/**
 * Production monitoring metric definitions — privacy-safe by construction.
 *
 * Every metric defined here is an AGGREGATE ratio or latency. NO metric ever
 * carries individual user data, exact amounts, merchant names, UPI IDs, raw
 * OCR text, file paths, or SQLite payloads. Any payload accompanying a
 * metric MUST be passed through `redactMetricPayload` before recording.
 *
 * See `docs/production-monitoring.md` and `docs/privacy-and-trust.md`.
 */

// ---------------------------------------------------------------------------
// Monitored metrics (9)
// ---------------------------------------------------------------------------

export type MonitoredMetric =
  | 'crash_free_session_rate'
  | 'sync_success_rate'
  | 'ocr_accuracy_rate'
  | 'settlement_completion_rate'
  | 'export_success_rate'
  | 'backup_success_rate'
  | 'restore_success_rate'
  | 'api_latency_p95_ms'
  | 'database_query_latency_p95_ms';

export const MONITORED_METRICS: readonly MonitoredMetric[] = [
  'crash_free_session_rate',
  'sync_success_rate',
  'ocr_accuracy_rate',
  'settlement_completion_rate',
  'export_success_rate',
  'backup_success_rate',
  'restore_success_rate',
  'api_latency_p95_ms',
  'database_query_latency_p95_ms',
] as const;

// ---------------------------------------------------------------------------
// Units + direction
// ---------------------------------------------------------------------------

export type MetricUnit = 'ratio' | 'latency_ms';

export type MetricDirection = 'higher_is_better' | 'lower_is_better';

// ---------------------------------------------------------------------------
// Metric definition
// ---------------------------------------------------------------------------

export interface MetricDefinition {
  /** Stable identifier (used in storage + dashboards). */
  readonly key: MonitoredMetric;
  /** Human-readable label (no PII). */
  readonly label: string;
  /** What this metric measures — short description. */
  readonly description: string;
  /** Unit of measurement: ratio (0..1) or latency in milliseconds. */
  readonly unit: MetricUnit;
  /** Whether higher or lower values are better. */
  readonly direction: MetricDirection;
  /** Target value the team aims for. */
  readonly target: number;
  /** Value below/above which an alert fires (depends on direction). */
  readonly alertThreshold: number;
}

/**
 * The 9 monitored metric definitions.
 *
 * Ratio metrics are expressed in the range [0, 1] (e.g. 0.99 = 99%).
 * Latency metrics are expressed in milliseconds.
 */
export const METRIC_DEFINITIONS: Readonly<Record<MonitoredMetric, MetricDefinition>> = Object.freeze({
  crash_free_session_rate: Object.freeze({
    key: 'crash_free_session_rate',
    label: 'Crash-Free Session Rate',
    description: 'Fraction of app sessions that ended without an uncaught crash.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.995,
    alertThreshold: 0.98,
  }),
  sync_success_rate: Object.freeze({
    key: 'sync_success_rate',
    label: 'Sync Success Rate',
    description: 'Fraction of sync operations that completed without error.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.99,
    alertThreshold: 0.95,
  }),
  ocr_accuracy_rate: Object.freeze({
    key: 'ocr_accuracy_rate',
    label: 'OCR Accuracy Rate',
    description: 'Fraction of OCR extractions accepted by the user without correction.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.9,
    alertThreshold: 0.8,
  }),
  settlement_completion_rate: Object.freeze({
    key: 'settlement_completion_rate',
    label: 'Settlement Completion Rate',
    description: 'Fraction of settlements that reach a reconciled state.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.98,
    alertThreshold: 0.9,
  }),
  export_success_rate: Object.freeze({
    key: 'export_success_rate',
    label: 'Export Success Rate',
    description: 'Fraction of data export operations that completed successfully.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.99,
    alertThreshold: 0.95,
  }),
  backup_success_rate: Object.freeze({
    key: 'backup_success_rate',
    label: 'Backup Success Rate',
    description: 'Fraction of local backup operations that completed successfully.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.99,
    alertThreshold: 0.95,
  }),
  restore_success_rate: Object.freeze({
    key: 'restore_success_rate',
    label: 'Restore Success Rate',
    description: 'Fraction of local restore operations that completed successfully.',
    unit: 'ratio',
    direction: 'higher_is_better',
    target: 0.99,
    alertThreshold: 0.95,
  }),
  api_latency_p95_ms: Object.freeze({
    key: 'api_latency_p95_ms',
    label: 'API Latency p95 (ms)',
    description: '95th percentile round-trip latency of cloud API calls in milliseconds.',
    unit: 'latency_ms',
    direction: 'lower_is_better',
    target: 400,
    alertThreshold: 1500,
  }),
  database_query_latency_p95_ms: Object.freeze({
    key: 'database_query_latency_p95_ms',
    label: 'Database Query Latency p95 (ms)',
    description: '95th percentile latency of local SQLite queries in milliseconds.',
    unit: 'latency_ms',
    direction: 'lower_is_better',
    target: 50,
    alertThreshold: 250,
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the given observed value crosses the alert threshold.
 *
 * For `higher_is_better` ratio metrics, an alert fires when the observed
 * value drops BELOW the threshold.
 *
 * For `lower_is_better` latency metrics, an alert fires when the observed
 * value rises ABOVE the threshold.
 */
export function shouldAlert(
  definition: MetricDefinition,
  observedValue: number,
): boolean {
  if (definition.direction === 'higher_is_better') {
    return observedValue < definition.alertThreshold;
  }
  return observedValue > definition.alertThreshold;
}

/**
 * Returns true when the observed value meets or exceeds the target.
 *
 * For `higher_is_better` ratios: true when `observed >= target`.
 * For `lower_is_better` latencies: true when `observed <= target`.
 */
export function meetsTarget(
  definition: MetricDefinition,
  observedValue: number,
): boolean {
  if (definition.direction === 'higher_is_better') {
    return observedValue >= definition.target;
  }
  return observedValue <= definition.target;
}

/**
 * Returns the definition for a metric key. Throws if the key is unknown —
 * a programming error rather than a runtime recoverable condition.
 */
export function getMetricDefinition(key: MonitoredMetric): MetricDefinition {
  const def = METRIC_DEFINITIONS[key];
  if (!def) {
    throw new Error(`Unknown monitored metric: ${key}`);
  }
  return def;
}
