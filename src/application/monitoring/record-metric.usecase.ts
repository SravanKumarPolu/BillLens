/**
 * Use case: Record a metric sample.
 *
 * Privacy contract:
 *   1. The raw payload is passed through `redactMetricPayload` BEFORE
 *      being handed to the repository. The repository never sees raw PII.
 *   2. The use case validates the metric key against `MONITORED_METRICS`
 *      so a caller cannot smuggle in an arbitrary metric name.
 *   3. The use case validates the observed value is a finite number
 *      within sensible bounds (ratios in [0, 1], latencies in [0, 1 hour]).
 */

import {
  METRIC_DEFINITIONS,
  MONITORED_METRICS,
  redactMetricPayload,
  type MetricDefinition,
  type MonitoredMetric,
  type RedactedPayload,
} from '@domain/monitoring';

import type { MetricRepository, MetricSample } from './metric-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface RecordMetricInput {
  readonly metric: MonitoredMetric;
  readonly value: number;
  readonly recordedAt: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface RecordMetricOutput {
  readonly metric: MonitoredMetric;
  readonly value: number;
  readonly recordedAt: string;
  readonly redacted: boolean;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class RecordMetricUseCase {
  constructor(private readonly repo: MetricRepository) {}

  async execute(input: RecordMetricInput): Promise<RecordMetricOutput> {
    // 1. Validate metric key.
    if (!MONITORED_METRICS.includes(input.metric)) {
      throw new Error(`Unknown monitored metric: ${input.metric}`);
    }
    const definition: MetricDefinition = METRIC_DEFINITIONS[input.metric];

    // 2. Validate value shape + range.
    if (!Number.isFinite(input.value)) {
      throw new Error(`Metric ${input.metric} value must be finite, got ${input.value}`);
    }
    if (definition.unit === 'ratio') {
      if (input.value < 0 || input.value > 1) {
        throw new Error(
          `Ratio metric ${input.metric} value must be in [0, 1], got ${input.value}`,
        );
      }
    } else {
      // latency_ms — allow 0..1 hour (3_600_000 ms).
      if (input.value < 0 || input.value > 3_600_000) {
        throw new Error(
          `Latency metric ${input.metric} value out of range [0, 3,600,000 ms], got ${input.value}`,
        );
      }
    }

    // 3. Validate ISO date-time.
    if (Number.isNaN(Date.parse(input.recordedAt))) {
      throw new Error(`Metric ${input.metric} recordedAt must be a valid ISO date-time`);
    }

    // 4. Redact payload (defensive — adapters should also redact).
    let redactedPayload: RedactedPayload | undefined;
    let redacted = false;
    if (input.payload !== undefined && Object.keys(input.payload).length > 0) {
      redactedPayload = redactMetricPayload(input.payload);
      redacted = true;
    }

    // 5. Persist.
    const sample: MetricSample = {
      metric: input.metric,
      value: input.value,
      recordedAt: input.recordedAt,
      ...(redactedPayload !== undefined ? { payload: redactedPayload } : {}),
    };
    await this.repo.record(sample);

    return {
      metric: input.metric,
      value: input.value,
      recordedAt: input.recordedAt,
      redacted,
    };
  }
}
