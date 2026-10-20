import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  GetMetricsDashboardUseCase,
  RecordMetricUseCase,
} from '@application/monitoring/index';
import { redactMetricPayload } from '@domain/monitoring';

import { runMigrations } from '../sqlite/schema';
import { SqliteMetricRepository } from '../sqlite/sqlite-metric-repository';

import { InMemoryDatabase } from './in-memory-database';

/**
 * SQLite monitoring-metric repository tests (Prompt 81 infrastructure).
 *
 * Proves:
 *   1. record → recent → latestSnapshot round-trips.
 *   2. record is IDEMPOTENT by (metric, recordedAt) — no duplicate rows.
 *   3. The adapter redacts payloads DEFENSIVELY (PII never reaches the
 *      table even when the caller passed an unsafe payload).
 *   4. GetMetricsDashboardUseCase renders the real snapshot over the
 *      adapter (the composition-root wiring's building block).
 */

const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-02T10:00:00.000Z';
const T3 = '2026-10-03T10:00:00.000Z';

let db: InMemoryDatabase;
let repo: SqliteMetricRepository;

beforeEach(async () => {
  db = new InMemoryDatabase();
  await runMigrations(db);
  repo = new SqliteMetricRepository(db);
});

describe('sqlite metric repository', () => {
  it('round-trips samples and recent() returns oldest-first', async () => {
    await repo.record({ metric: 'sync_success_rate', value: 0.95, recordedAt: T1 });
    await repo.record({ metric: 'sync_success_rate', value: 0.97, recordedAt: T2 });
    await repo.record({ metric: 'sync_success_rate', value: 0.99, recordedAt: T3 });

    const recent = await repo.recent('sync_success_rate', 2);
    expect(recent.map((s) => s.value)).toEqual([0.97, 0.99]);
  });

  it('latestSnapshot returns the most recent sample per metric', async () => {
    await repo.record({ metric: 'ocr_accuracy_rate', value: 0.8, recordedAt: T1 });
    await repo.record({ metric: 'ocr_accuracy_rate', value: 0.9, recordedAt: T2 });
    await repo.record({ metric: 'api_latency_p95_ms', value: 250, recordedAt: T3 });

    const snapshot = await repo.latestSnapshot();
    expect(snapshot.ocr_accuracy_rate?.value).toBe(0.9);
    expect(snapshot.ocr_accuracy_rate?.recordedAt).toBe(T2);
    expect(snapshot.api_latency_p95_ms?.value).toBe(250);
    expect(snapshot.crash_free_session_rate).toBeUndefined();
  });

  it('record is idempotent by (metric, recordedAt)', async () => {
    await repo.record({ metric: 'sync_success_rate', value: 0.95, recordedAt: T1 });
    await repo.record({ metric: 'sync_success_rate', value: 0.95, recordedAt: T1 });

    const recent = await repo.recent('sync_success_rate', 10);
    expect(recent).toHaveLength(1);

    // A different recordedAt IS a new sample.
    await repo.record({ metric: 'sync_success_rate', value: 0.96, recordedAt: T2 });
    expect(await repo.recent('sync_success_rate', 10)).toHaveLength(2);
  });

  it('redacts unsafe payloads defensively before persisting', async () => {
    await repo.record({
      metric: 'crash_free_session_rate',
      value: 0.99,
      recordedAt: T1,
      payload: {
        sqlitePath: '/data/user/0/com.billlens/databases/billlens.db',
        filePath: 'file:///var/mobile/Containers/Data/receipt.jpg',
        upiId: 'alice@okhdfcbank',
        ocrText: 'MERCHANT: Blue Bottle Coffee TOTAL: 42.50',
        note: 'user alice@example.com crashed on screen GroupHome',
      },
    });

    const rows = await db.all<Record<string, unknown>>(
      `select payload from monitoring_metrics`,
    );
    const stored = JSON.parse(String(rows[0]?.['payload'])) as Record<string, unknown>;

    // The redacted payload contains NONE of the raw PII.
    expect(JSON.stringify(stored)).not.toContain('alice@okhdfcbank');
    expect(JSON.stringify(stored)).not.toContain('receipt.jpg');
    expect(JSON.stringify(stored)).not.toContain('Blue Bottle');
    expect(JSON.stringify(stored)).not.toContain('alice@example.com');
    expect(JSON.stringify(stored)).not.toContain('billlens.db');
    // And it IS the output of the domain redactor (same shape).
    expect(stored).toEqual(
      redactMetricPayload({
        sqlitePath: '/data/user/0/com.billlens/databases/billlens.db',
        filePath: 'file:///var/mobile/Containers/Data/receipt.jpg',
        upiId: 'alice@okhdfcbank',
        ocrText: 'MERCHANT: Blue Bottle Coffee TOTAL: 42.50',
        note: 'user alice@example.com crashed on screen GroupHome',
      }),
    );
  });
});

describe('metrics dashboard over the sqlite adapter', () => {
  it('GetMetricsDashboardUseCase renders the recorded snapshot', async () => {
    const record = new RecordMetricUseCase(repo);
    const dashboard = new GetMetricsDashboardUseCase(repo);

    // Before any samples: all values null, zero alerts.
    const empty = await dashboard.execute(T3);
    expect(empty.entries.every((e) => e.latestValue === null)).toBe(true);
    expect(empty.alertCount).toBe(0);

    // sync_success_rate target ≥ 0.99 → 0.95 misses the target.
    await record.execute({ metric: 'sync_success_rate', value: 0.95, recordedAt: T1 });
    // api_latency_p95_ms threshold 500 → 250 is fine.
    await record.execute({ metric: 'api_latency_p95_ms', value: 250, recordedAt: T1 });

    const result = await dashboard.execute(T3);
    const sync = result.entries.find((e) => e.key === 'sync_success_rate');
    const latency = result.entries.find((e) => e.key === 'api_latency_p95_ms');
    expect(sync?.latestValue).toBe(0.95);
    expect(sync?.meetsTarget).toBe(false);
    expect(sync?.alerting).toBe(false);
    expect(latency?.latestValue).toBe(250);
    expect(latency?.meetsTarget).toBe(true);
    expect(result.alertCount).toBe(0);
  });
});
