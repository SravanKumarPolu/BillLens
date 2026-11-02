/**
 * Repository port for recording + retrieving metric samples.
 *
 * The application layer depends on this port, NOT on any concrete storage
 * (SQLite, AsyncStorage, remote telemetry backend). Infrastructure adapters
 * implement this port.
 *
 * CRITICAL: implementations MUST call `redactMetricPayload` themselves on
 * the inbound `payload` before persisting — but the use case also redacts
 * defensively before calling the port, so even an unsafe adapter cannot
 * leak PII that was already removed upstream.
 */

import type { MonitoredMetric, RedactedPayload } from '@domain/monitoring';

export interface MetricSample {
  readonly metric: MonitoredMetric;
  readonly value: number;
  readonly recordedAt: string;
  /** Privacy-safe payload (already redacted). */
  readonly payload?: RedactedPayload;
}

export interface MetricRepository {
  /** Record a single metric sample. Idempotent by `(metric, recordedAt)`. */
  record(sample: MetricSample): Promise<void>;

  /** Fetch the most recent N samples for a metric (oldest first). */
  recent(metric: MonitoredMetric, limit: number): Promise<readonly MetricSample[]>;

  /** Fetch the most recent sample for each metric (used by dashboards). */
  latestSnapshot(): Promise<Readonly<Partial<Record<MonitoredMetric, MetricSample>>>>;
}
