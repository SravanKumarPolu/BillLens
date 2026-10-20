/**
 * Barrel for the monitoring domain module.
 */

export {
  METRIC_DEFINITIONS,
  MONITORED_METRICS,
  getMetricDefinition,
  meetsTarget,
  shouldAlert,
  type MetricDefinition,
  type MetricDirection,
  type MetricUnit,
  type MonitoredMetric,
} from './metrics-model';

export {
  ALERT_RULES,
  evaluateAlertRule,
  evaluateAllAlerts,
  type AlertFiringContext,
  type AlertRule,
  type AlertSeverity,
  type FiredAlert,
} from './alerting-rules';

export {
  bucketAmountMinor,
  containsResidualPii,
  redactMetricPayload,
  type RedactedPayload,
} from './metrics-redactor';
