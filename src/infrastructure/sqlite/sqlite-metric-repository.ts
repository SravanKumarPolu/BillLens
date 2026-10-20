/**
 * SQLite-backed implementation of the `MetricRepository` port — the
 * on-device cache of privacy-safe metric samples (Prompt 81).
 *
 * PRIVACY CONTRACT (see `metric-repository.port.ts`): the adapter MUST
 * call `redactMetricPayload` on the inbound payload before persisting,
 * even though `RecordMetricUseCase` already redacted defensively. The
 * double redaction means an unsafe upstream caller cannot leak PII into
 * the local `monitoring_metrics` table (added by migration 0003).
 *
 * IDEMPOTENCY: `record` is idempotent by `(metric, recordedAt)` — the
 * table's unique index enforces it at the storage layer, and the adapter
 * implements the same semantics with an upsert so the behaviour is
 * identical on every engine (a retry of the same sample never duplicates
 * a row).
 *
 * This is the LOCAL cache only. The cloud aggregation backend (the
 * operational dashboard across all users) is deferred until the Supabase
 * project is provisioned — the on-device data never contains PII, so
 * uploading redacted samples later requires no migration of this table.
 */

import type {
  MetricRepository,
  MetricSample,
} from '@application/monitoring/metric-repository.port';
import { redactMetricPayload } from '@domain/monitoring';
import { MONITORED_METRICS } from '@domain/monitoring';
import type { MonitoredMetric } from '@domain/monitoring';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { newRowId } from './row-mappers';

export class SqliteMetricRepository implements MetricRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async record(sample: MetricSample): Promise<void> {
    // Defensive redaction — the port requires adapters to redact themselves.
    const redactedPayload =
      sample.payload !== undefined
        ? JSON.stringify(redactMetricPayload(sample.payload))
        : null;

    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(
        `select id from monitoring_metrics where metric = ? and recorded_at = ?`,
        [sample.metric, sample.recordedAt],
      );
      if (existing) {
        // Idempotent replay — same (metric, recordedAt) sample updates the
        // value/payload in place instead of duplicating the row.
        await tx.run(
          `update monitoring_metrics set value = ?, payload = ? where id = ?`,
          [sample.value, redactedPayload, existing['id'] as string],
        );
      } else {
        await tx.run(
          `insert into monitoring_metrics (id, metric, value, payload, recorded_at)
           values (?, ?, ?, ?, ?)`,
          [newRowId(), sample.metric, sample.value, redactedPayload, sample.recordedAt],
        );
      }
    });
  }

  async recent(metric: MonitoredMetric, limit: number): Promise<readonly MetricSample[]> {
    // Newest-first from storage, reversed to the contract's oldest-first.
    const rows = await this.db.all<SqlRow>(
      `select metric, value, payload, recorded_at from monitoring_metrics
       where metric = ?
       order by recorded_at desc
       limit ?`,
      [metric, limit],
    );
    return rows.map(mapMetricRow).reverse();
  }

  async latestSnapshot(): Promise<
    Readonly<Partial<Record<MonitoredMetric, MetricSample>>>
  > {
    const snapshot: Partial<Record<MonitoredMetric, MetricSample>> = {};
    for (const metric of MONITORED_METRICS) {
      const row = await this.db.get<SqlRow>(
        `select metric, value, payload, recorded_at from monitoring_metrics
         where metric = ?
         order by recorded_at desc
         limit 1`,
        [metric],
      );
      if (row) {
        snapshot[metric] = mapMetricRow(row);
      }
    }
    return snapshot;
  }
}

function mapMetricRow(row: SqlRow): MetricSample {
  const payloadRaw = row['payload'] as string | null;
  let payload: MetricSample['payload'];
  if (payloadRaw !== null && payloadRaw !== undefined) {
    try {
      payload = JSON.parse(payloadRaw) as MetricSample['payload'];
    } catch {
      // Corrupted payload JSON degrades to "no payload" — never crash a read.
    }
  }
  return {
    metric: row['metric'] as MonitoredMetric,
    value: row['value'] as number,
    ...(payload !== undefined ? { payload } : {}),
    recordedAt: row['recorded_at'] as string,
  };
}
