import { beforeEach, describe, expect, it } from '@jest/globals';

import { asDateTime } from '@domain/value-objects';

import { runMigrations, getSchemaVersion, MIGRATIONS, SCHEMA_VERSION_TABLE_SQL } from '../sqlite/schema';
import {
  SqliteSyncRepository,
  computeNextRetryAt,
  isRetryableError,
} from '../sync/sqlite-sync-repository';

import { InMemoryDatabase } from './in-memory-database';

describe('SqliteSyncRepository', () => {
  let db: InMemoryDatabase;
  let repo: SqliteSyncRepository;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    repo = new SqliteSyncRepository(db);
  });

  it('migrations apply and schema version is current', async () => {
    // Migration 0001 = initial schema, Migration 0002 = Phase 6 Track 1,
    // Migration 0003 = write-side support (audit_logs.group_id +
    // monitoring_metrics).
    // v4 = feedback store (feedback_records + review_prompt_ledger).
    // v5 = identity support (guest_identities + account_deletion_requests).
    // v6 = sync_queue_alignment (rebuilt sync_operations: full status /
    //      entity_type / operation CHECKs + updated_at column).
    // v7 = sync_cursors (v2.6.0 incremental-download checkpoints) +
    //      sync_conflicts rebuild (category CHECK aligned with the
    //      categories the coordinator actually writes).
    // Bump this assertion when adding new migrations.
    expect(await getSchemaVersion(db)).toBe(11);
  });

  it('enqueue inserts a pending operation', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: { amount: 1000 },
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    expect(op.id).toBeDefined();
    expect(op.status).toBe('pending');
    expect(op.retryCount).toBe(0);
    expect(op.createdAt).toBeDefined();

    const count = await repo.countPending();
    expect(count).toBe(1);
  });

  it('nextPending returns the oldest pending operation', async () => {
    await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.enqueue({
      entityType: 'group',
      entityId: 'group-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-2',
      baseVersion: 0,
      localVersion: 1,
    });

    const next = await repo.nextPending();
    expect(next?.entityType).toBe('expense');
    expect(next?.entityId).toBe('exp-1');
  });

  it('nextPending returns null when no operations pending', async () => {
    const next = await repo.nextPending();
    expect(next).toBeNull();
  });

  it('listPending returns up to limit operations', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.enqueue({
        entityType: 'expense',
        entityId: `exp-${i}`,
        operation: 'create',
        payload: {},
        idempotencyKey: `idem-${i}`,
        baseVersion: 0,
        localVersion: 1,
      });
    }
    const list = await repo.listPending(3);
    expect(list).toHaveLength(3);
  });

  it('markSyncing transitions status from pending to syncing', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);
    const found = await repo.findById(op.id);
    expect(found?.status).toBe('syncing');
  });

  it('markCompleted removes the operation', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);
    await repo.markCompleted(op.id);
    expect(await repo.findById(op.id)).toBeNull();
    expect(await repo.countPending()).toBe(0);
  });

  it('markFailed transitions to failed and increments retry count', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);
    await repo.markFailed(op.id, 'HTTP_500', 'Internal Server Error', asDateTime('2026-07-29T11:00:00.000Z'));
    const found = await repo.findById(op.id);
    expect(found?.status).toBe('failed');
    expect(found?.retryCount).toBe(1);
    expect(found?.lastErrorCode).toBe('HTTP_500');
    expect(found?.lastErrorMessage).toBe('Internal Server Error');
    expect(found?.nextRetryAt).toBe('2026-07-29T11:00:00.000Z');
  });

  it('resetForRetry transitions failed → pending and clears error', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);
    await repo.markFailed(op.id, 'HTTP_500', 'Server error', asDateTime('2026-07-29T11:00:00.000Z'));
    await repo.resetForRetry(op.id);
    const found = await repo.findById(op.id);
    expect(found?.status).toBe('pending');
    expect(found?.retryCount).toBe(0);
    expect(found?.lastErrorCode).toBeUndefined();
    expect(found?.lastErrorMessage).toBeUndefined();
  });

  it('markConflict transitions to conflict status', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markConflict(op.id, { reason: 'version_mismatch' });
    const found = await repo.findById(op.id);
    expect(found?.status).toBe('conflict');
  });

  it('markConflict persists conflict details to sync_conflicts table', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markConflict(op.id, {
      entityType: 'expense',
      entityId: 'exp-1',
      category: 'version_conflict',
      localVersion: 1,
      cloudVersion: 2,
    });

    const found = await repo.findById(op.id);
    expect(found?.status).toBe('conflict');

    // Verify sync_conflicts table has a row.
    const conflictRow = await db.get<{ category: string }>(
      'select * from sync_conflicts where entity_id = ?',
      ['exp-1'],
    );
    expect(conflictRow).not.toBeNull();
    expect(conflictRow?.category).toBe('version_conflict');
  });

  it('recoverStuckSyncing resets stuck syncing operations to pending', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);

    // Recover with a threshold in the future so the op qualifies.
    const futureTime = asDateTime('2099-01-01T00:00:00.000Z');
    const recovered = await repo.recoverStuckSyncing(futureTime);
    expect(recovered).toBe(1);

    const found = await repo.findById(op.id);
    expect(found?.status).toBe('pending');
  });

  it('countPending counts pending + syncing + failed', async () => {
    const op1 = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    const op2 = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-2',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-2',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op1.id);
    await repo.markSyncing(op2.id);
    await repo.markFailed(op2.id, 'HTTP_500', 'err', asDateTime('2026-07-29T11:00:00.000Z'));
    // countPending counts pending + syncing + failed = 0 + 1 + 1 = 2
    expect(await repo.countPending()).toBe(2);
  });

  it('listFailed returns only failed operations', async () => {
    const op1 = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-2',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-2',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op1.id);
    await repo.markFailed(op1.id, 'HTTP_500', 'err', asDateTime('2026-07-29T11:00:00.000Z'));
    const failed = await repo.listFailed(10);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.entityId).toBe('exp-1');
  });

  it('payload is serialized and deserialized correctly', async () => {
    const payload = { amount: 125050, currency: 'INR', splits: [{ member: 'a', amount: 500 }] };
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload,
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    const found = await repo.findById(op.id);
    expect(found?.payload).toEqual(payload);
  });

  it('listReadyForRetry excludes permanently-failed operations', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);
    // Manually set retry_count to the shared retry cap to simulate
    // permanent failure. (v2.5.0: the cap is MAX_SYNC_RETRIES = 10,
    // single-sourced with the retry policy — previously the SQL
    // hardcoded 8 while the policy said 10, so ops at 8–9 vanished
    // from both lists.)
    await db.run(
      'update sync_operations set retry_count = 10, status = ?, next_retry_at = null where id = ?',
      ['failed', op.id],
    );
    const ready = await repo.listReadyForRetry(10);
    expect(ready).toHaveLength(0);
  });

  // --- v2.5.0 regression: the queue must actually drain -----------------

  it('listReadyForRetry includes freshly enqueued PENDING operations (queue-drain parity)', async () => {
    // Regression for the v2.4.0 critical defect: listReadyForRetry
    // selected only status='failed', so newly enqueued pending ops were
    // never uploaded and the queue never drained. The in-memory
    // coordinator fake masked this by including 'pending' itself.
    await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-new',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-new',
      baseVersion: 0,
      localVersion: 1,
    });
    const ready = await repo.listReadyForRetry(10);
    expect(ready).toHaveLength(1);
    expect(ready[0]?.status).toBe('pending');
    expect(ready[0]?.entityId).toBe('exp-new');
  });

  it('listReadyForRetry returns due failed retries BEFORE new pending work', async () => {
    const retried = await repo.enqueue({
      entityType: 'settlement',
      entityId: 'stl-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-stl',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(retried.id);
    await repo.markFailed(retried.id, 'HTTP_500', 'down', asDateTime('2020-01-01T00:00:00.000Z'));
    await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-2',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-exp2',
      baseVersion: 0,
      localVersion: 1,
    });
    const ready = await repo.listReadyForRetry(10);
    expect(ready).toHaveLength(2);
    expect(ready[0]?.id).toBe(retried.id); // due retry first
    expect(ready[1]?.entityId).toBe('exp-2');
  });

  it('markPermanentlyFailed persists the permanently_failed status (migration 0006 alignment)', async () => {
    // Regression: the CHECK constraint in migrations 1–5 rejected
    // 'permanently_failed' (and the writer referenced a nonexistent
    // updated_at column) — on device this threw and crashed the loop.
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-pf',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-pf',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);
    await repo.markPermanentlyFailed(op.id, 'INVALID_PAYLOAD', 'bad');
    const found = await repo.findById(op.id);
    expect(found?.status).toBe('permanently_failed');
    // It must also surface in listPermanentlyFailed (user-review list).
    const failed = await repo.listPermanentlyFailed(10);
    expect(failed.some((o) => o.id === op.id)).toBe(true);
    // And be counted as needing attention, not as pending sync work.
    expect(await repo.countConflicts()).toBe(1);
    expect(await repo.countPending()).toBe(0);
  });

  it('cancelOperation persists the cancelled status', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-cancel',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-cancel',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.cancelOperation(op.id);
    const found = await repo.findById(op.id);
    expect(found?.status).toBe('cancelled');
    expect(await repo.countPending()).toBe(0);
  });

  it('countConflicts counts conflict + permanently_failed rows', async () => {
    const a = await repo.enqueue({
      entityType: 'expense', entityId: 'e-a', operation: 'create', payload: {},
      idempotencyKey: 'i-a', baseVersion: 0, localVersion: 1,
    });
    await repo.markSyncing(a.id);
    await repo.markConflict(a.id, { entityType: 'expense', entityId: 'e-a', category: 'version_conflict', localVersion: 1, cloudVersion: 2 });
    const b = await repo.enqueue({
      entityType: 'settlement', entityId: 's-b', operation: 'create', payload: {},
      idempotencyKey: 'i-b', baseVersion: 0, localVersion: 1,
    });
    await repo.markSyncing(b.id);
    await repo.markPermanentlyFailed(b.id, 'INVALID_PAYLOAD', 'bad');
    expect(await repo.countConflicts()).toBe(2);
  });

  it('migration 0006 preserves existing queue rows (rebuild is lossless)', async () => {
    // Enqueue BEFORE the v6 migration by building a v5 database first.
    const legacyDb = new InMemoryDatabase();
    await legacyDb.exec(SCHEMA_VERSION_TABLE_SQL);
    for (const m of MIGRATIONS) {
      if (m.version > 5) break;
      await legacyDb.transaction(async (tx) => {
        const statements = m.sql
          .split(';')
          .map((x) => x.trim())
          .map((x) => x.replace(/^--[^\n]*\n?/gm, '').trim())
          .filter((x) => x.length > 0);
        for (const stmt of statements) await tx.exec(stmt);
        await tx.run('insert into schema_version (version, name) values (?, ?)', [m.version, m.name]);
      });
    }
    const legacyRepo = new SqliteSyncRepository(legacyDb);
    await legacyRepo.enqueue({
      entityType: 'expense', entityId: 'legacy-1', operation: 'create',
      payload: { amount: 42 }, idempotencyKey: 'idem-legacy',
      baseVersion: 0, localVersion: 1,
    });
    // Now apply v6 on top.
    const v6 = MIGRATIONS.find((m) => m.version === 6);
    expect(v6).toBeDefined();
    await legacyDb.transaction(async (tx) => {
      const statements = (v6?.sql ?? '')
        .split(';')
        .map((x) => x.trim())
        .map((x) => x.replace(/^--[^\n]*\n?/gm, '').trim())
        .filter((x) => x.length > 0);
      for (const stmt of statements) await tx.exec(stmt);
      await tx.run('insert into schema_version (version, name) values (?, ?)', [6, 'sync_queue_alignment']);
    });
    const migrated = new SqliteSyncRepository(legacyDb);
    const ready = await migrated.listReadyForRetry(10);
    expect(ready).toHaveLength(1);
    expect(ready[0]?.entityId).toBe('legacy-1');
    expect(ready[0]?.payload).toEqual({ amount: 42 });
  });

  it('listPermanentlyFailed returns max-retry operations', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);
    await db.run(
      'update sync_operations set retry_count = 10, status = ? where id = ?',
      ['failed', op.id],
    );
    const permanent = await repo.listPermanentlyFailed(10);
    expect(permanent).toHaveLength(1);
    expect(permanent[0]?.id).toBe(op.id);
  });

  it('markConflict atomically inserts conflict and updates status', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    await repo.markSyncing(op.id);
    await repo.markConflict(op.id, {
      entityType: 'expense',
      entityId: 'exp-1',
      category: 'version_conflict',
      localVersion: 1,
      cloudVersion: 2,
    });
    const found = await repo.findById(op.id);
    expect(found?.status).toBe('conflict');
    const conflictRow = await db.get('select * from sync_conflicts where entity_id = ?', ['exp-1']);
    expect(conflictRow).not.toBeNull();
  });
});

describe('computeNextRetryAt', () => {
  it('returns null when retryCount >= MAX_SYNC_RETRIES', () => {
    const from = asDateTime('2026-07-29T10:00:00.000Z');
    const result = computeNextRetryAt(10, from);
    expect(result).toBeNull();
  });

  it('computeNextRetryAt returns null when retryCount >= MAX_SYNC_RETRIES (no from)', () => {
    const result = computeNextRetryAt(10);
    expect(result).toBeNull();
  });

  it('returns a future time for retryCount < 8', () => {
    const from = asDateTime('2026-07-29T10:00:00.000Z');
    const result = computeNextRetryAt(0, from);
    const resultDate = new Date(result as string);
    const fromDate = new Date(from as string);
    expect(resultDate.getTime()).toBeGreaterThan(fromDate.getTime());
  });

  it('exponential backoff: retry 5 has longer delay than retry 0', () => {
    const from = asDateTime('2026-07-29T10:00:00.000Z');
    const r0 = computeNextRetryAt(0, from);
    const r5 = computeNextRetryAt(5, from);
    const d0 = new Date(r0 as string).getTime() - new Date(from as string).getTime();
    const d5 = new Date(r5 as string).getTime() - new Date(from as string).getTime();
    expect(d5).toBeGreaterThan(d0);
  });
});

describe('isRetryableError', () => {
  it('returns true for network errors', () => {
    expect(isRetryableError('NETWORK_TIMEOUT')).toBe(true);
    expect(isRetryableError('NETWORK_CONNECTION_REFUSED')).toBe(true);
  });

  it('returns true for 5xx HTTP errors', () => {
    expect(isRetryableError('HTTP_500')).toBe(true);
    expect(isRetryableError('HTTP_502')).toBe(true);
    expect(isRetryableError('HTTP_503')).toBe(true);
    expect(isRetryableError('HTTP_504')).toBe(true);
  });

  it('returns true for 429 rate limit', () => {
    expect(isRetryableError('HTTP_429')).toBe(true);
  });

  it('returns false for 4xx client errors', () => {
    expect(isRetryableError('HTTP_400')).toBe(false);
    expect(isRetryableError('HTTP_401')).toBe(false);
    expect(isRetryableError('HTTP_403')).toBe(false);
    expect(isRetryableError('HTTP_404')).toBe(false);
    expect(isRetryableError('HTTP_422')).toBe(false);
  });

  it('returns false for unknown error codes', () => {
    expect(isRetryableError('UNKNOWN_ERROR')).toBe(false);
    expect(isRetryableError('VALIDATION_FAILED')).toBe(false);
  });
});
