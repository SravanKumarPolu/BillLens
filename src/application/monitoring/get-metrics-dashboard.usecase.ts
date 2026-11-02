/**
 * Use case: Build a privacy-safe dashboard snapshot of all monitored
 * metrics.
 *
 * The dashboard returns:
 *   - the latest observed value for each metric
 *   - whether that value meets the target
 *   - whether that value crosses the alert threshold
 *   - the metric's definition (label, unit, direction, target, threshold)
 *
 * The dashboard NEVER returns raw payloads. Even redacted payloads are
 * omitted — operators do not need them in a summary view, and omitting
 * them shrinks the attack surface for accidental PII display in the UI.
 */

import {
  METRIC_DEFINITIONS,
  MONITORED_METRICS,
  meetsTarget,
  shouldAlert,
  type MetricDefinition,
  type MonitoredMetric,
} from '@domain/monitoring';

import type { MetricRepository } from './metric-repository.port';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface DashboardMetricEntry {
  readonly key: MonitoredMetric;
  readonly label: string;
  readonly unit: 'ratio' | 'latency_ms';
  readonly direction: 'higher_is_better' | 'lower_is_better';
  readonly target: number;
  readonly alertThreshold: number;
  readonly latestValue: number | null;
  readonly latestAt: string | null;
  readonly meetsTarget: boolean;
  readonly alerting: boolean;
}

export interface MetricsDashboard {
  readonly generatedAt: string;
  readonly entries: readonly DashboardMetricEntry[];
  readonly alertCount: number;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class GetMetricsDashboardUseCase {
  constructor(private readonly repo: MetricRepository) {}

  async execute(nowIso: string = new Date().toISOString()): Promise<MetricsDashboard> {
    if (Number.isNaN(Date.parse(nowIso))) {
      throw new Error('nowIso must be a valid ISO date-time');
    }
    const snapshot = await this.repo.latestSnapshot();

    const entries: DashboardMetricEntry[] = MONITORED_METRICS.map((key) => {
      const def: MetricDefinition = METRIC_DEFINITIONS[key];
      const sample = snapshot[key];
      const latestValue = sample?.value ?? null;
      const latestAt = sample?.recordedAt ?? null;
      return {
        key,
        label: def.label,
        unit: def.unit,
        direction: def.direction,
        target: def.target,
        alertThreshold: def.alertThreshold,
        latestValue,
        latestAt,
        meetsTarget: latestValue === null ? false : meetsTarget(def, latestValue),
        alerting: latestValue === null ? false : shouldAlert(def, latestValue),
      };
    });

    const alertCount = entries.reduce(
      (acc, e) => acc + (e.alerting ? 1 : 0),
      0,
    );

    return {
      generatedAt: nowIso,
      entries,
      alertCount,
    };
  }
}
