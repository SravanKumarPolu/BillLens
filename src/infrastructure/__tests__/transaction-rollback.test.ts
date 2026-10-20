import { beforeEach, describe, expect, it } from '@jest/globals';

import { asDateTime } from '@domain/value-objects';

import { runMigrations } from '../sqlite/schema';
import { SqliteSyncRepository } from '../sync/sqlite-sync-repository';

import { InMemoryDatabase } from './in-memory-database';

describe('Transaction rollback (in-memory)', () => {
  let db: InMemoryDatabase;
  let repo: SqliteSyncRepository;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    repo = new SqliteSyncRepository(db);
  });

  it('rolls back insert when callback throws', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.run(
          `insert into sync_operations (
            id, entity_type, entity_id, operation, payload, idempotency_key,
            base_version, local_version, status, retry_count, created_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
          [
            'op-rollback-1',
            'expense',
            'exp-1',
            'create',
            '{}',
            'idem-rollback-1',
            0,
            1,
            '2026-07-29T10:00:00.000Z',
          ],
        );
        throw new Error('Simulated failure');
      }),
    ).rejects.toThrow('Simulated failure');

    // The insert should have been rolled back.
    const op = await repo.findById('op-rollback-1');
    expect(op).toBeNull();
  });

  it('commits insert when callback succeeds', async () => {
    await db.transaction(async (tx) => {
      await tx.run(
        `insert into sync_operations (
          id, entity_type, entity_id, operation, payload, idempotency_key,
          base_version, local_version, status, retry_count, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
        [
          'op-commit-1',
          'expense',
          'exp-1',
          'create',
          '{}',
          'idem-commit-1',
          0,
          1,
          '2026-07-29T10:00:00.000Z',
        ],
      );
    });

    const op = await repo.findById('op-commit-1');
    expect(op).not.toBeNull();
    expect(op?.status).toBe('pending');
  });

  it('rolls back multi-statement transaction (sync op + audit log)', async () => {
    // Simulate a financial mutation that writes BOTH a sync op AND an audit
    // log entry. If the audit log write fails, the sync op must roll back.
    await expect(
      db.transaction(async (tx) => {
        await tx.run(
          `insert into sync_operations (
            id, entity_type, entity_id, operation, payload, idempotency_key,
            base_version, local_version, status, retry_count, created_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
          [
            'op-financial-1',
            'expense',
            'exp-1',
            'create',
            '{"amount": 1000}',
            'idem-financial-1',
            0,
            1,
            '2026-07-29T10:00:00.000Z',
          ],
        );
        await tx.run(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_id, new_version, created_at
          ) values (?, ?, ?, ?, ?, ?, ?)`,
          [
            'audit-1',
            'expense',
            'exp-1',
            'create',
            'user-1',
            1,
            '2026-07-29T10:00:00.000Z',
          ],
        );
        throw new Error('Simulated audit log write failure');
      }),
    ).rejects.toThrow('Simulated audit log write failure');

    // Both writes should be rolled back.
    expect(await repo.findById('op-financial-1')).toBeNull();
    const auditRow = await db.get('select * from audit_logs where id = ?', ['audit-1']);
    expect(auditRow).toBeNull();
  });

  it('offline data survives app restart (in-memory simulation)', async () => {
    // Enqueue an operation
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: { amount: 1000 },
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });

    // Simulate "app restart" by creating a new repo instance pointed at
    // the same underlying DB.
    const repo2 = new SqliteSyncRepository(db);
    const found = await repo2.findById(op.id);
    expect(found).not.toBeNull();
    expect(found?.entityId).toBe('exp-1');
    expect(await repo2.countPending()).toBe(1);
  });

  it('failed transaction does not leave partial financial data', async () => {
    // Insert expense, then insert split, then throw → all rolled back.
    await expect(
      db.transaction(async (tx) => {
        await tx.run(
          `insert into expenses (
            id, group_id, title, amount_minor, currency_code, expense_date,
            split_type, created_by, created_at, updated_at, version,
            client_created_at, client_updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'exp-fail-1',
            'group-1',
            'Test',
            1000,
            'INR',
            '2026-07-29T10:00:00.000Z',
            'equal',
            'user-1',
            '2026-07-29T10:00:00.000Z',
            '2026-07-29T10:00:00.000Z',
            1,
            '2026-07-29T10:00:00.000Z',
            '2026-07-29T10:00:00.000Z',
          ],
        );
        await tx.run(
          `insert into expense_splits (
            id, expense_id, member_id, amount_minor,
            created_at, updated_at, version, client_created_at, client_updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'split-fail-1',
            'exp-fail-1',
            'm-1',
            500,
            '2026-07-29T10:00:00.000Z',
            '2026-07-29T10:00:00.000Z',
            1,
            '2026-07-29T10:00:00.000Z',
            '2026-07-29T10:00:00.000Z',
          ],
        );
        throw new Error('Simulated split write failure');
      }),
    ).rejects.toThrow('Simulated split write failure');

    // Both writes should be rolled back — no orphan expense, no orphan split.
    const expense = await db.get('select * from expenses where id = ?', ['exp-fail-1']);
    expect(expense).toBeNull();
    const split = await db.get('select * from expense_splits where id = ?', ['split-fail-1']);
    expect(split).toBeNull();
  });

  it('transaction rollback restores UPDATEd rows', async () => {
    await db.transaction(async (tx) => {
      await tx.run(
        `insert into sync_operations (
          id, entity_type, entity_id, operation, payload, idempotency_key,
          base_version, local_version, status, retry_count, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
        [
          'op-1',
          'expense',
          'exp-1',
          'create',
          '{}',
          'idem-1',
          0,
          1,
          '2026-07-29T10:00:00.000Z',
        ],
      );
    });

    // Update the row outside any transaction.
    await db.run('update sync_operations set status = ? where id = ?', ['syncing', 'op-1']);
    let row = await db.get<{ status: string }>(
      'select status from sync_operations where id = ?',
      ['op-1'],
    );
    expect(row?.status).toBe('syncing');

    // Now UPDATE inside a transaction that throws — the UPDATE must be rolled back.
    await expect(
      db.transaction(async (tx) => {
        await tx.run('update sync_operations set status = ? where id = ?', ['completed', 'op-1']);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    // The UPDATE should have been rolled back — status should be 'syncing' not 'completed'.
    row = await db.get<{ status: string }>(
      'select status from sync_operations where id = ?',
      ['op-1'],
    );
    expect(row?.status).toBe('syncing');
  });
});

describe('Pending operation creation (atomic with entity write)', () => {
  let db: InMemoryDatabase;
  let repo: SqliteSyncRepository;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    repo = new SqliteSyncRepository(db);
  });

  it('creates a sync operation atomically with an expense insert', async () => {
    // This simulates the local-write flow:
    //   1. Start transaction
    //   2. Validate domain input (done in use case)
    //   3. Save expense to SQLite
    //   4. Save audit record
    //   5. Add pending sync operation
    //   6. Commit
    //   7. Update application state (Zustand)
    await db.transaction(async (tx) => {
      // 3. Save expense
      await tx.run(
        `insert into expenses (
          id, group_id, title, amount_minor, currency_code, expense_date,
          split_type, created_by, created_at, updated_at, version,
          client_created_at, client_updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'exp-atomic-1',
          'group-1',
          'Dinner',
          125050,
          'INR',
          '2026-07-29T10:00:00.000Z',
          'equal',
          'user-1',
          '2026-07-29T10:00:00.000Z',
          '2026-07-29T10:00:00.000Z',
          1,
          '2026-07-29T10:00:00.000Z',
          '2026-07-29T10:00:00.000Z',
        ],
      );
      // 4. Save audit
      await tx.run(
        `insert into audit_logs (
          id, entity_type, entity_id, action, actor_id, new_version, created_at
        ) values (?, ?, ?, ?, ?, ?, ?)`,
        ['audit-1', 'expense', 'exp-atomic-1', 'create', 'user-1', 1, '2026-07-29T10:00:00.000Z'],
      );
      // 5. Add pending sync op
      await tx.run(
        `insert into sync_operations (
          id, entity_type, entity_id, operation, payload, idempotency_key,
          base_version, local_version, status, retry_count, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
        [
          'op-atomic-1',
          'expense',
          'exp-atomic-1',
          'create',
          '{"amount_minor": 125050}',
          'idem-atomic-1',
          0,
          1,
          '2026-07-29T10:00:00.000Z',
        ],
      );
    });

    // Verify all three writes committed.
    const expense = await db.get('select * from expenses where id = ?', ['exp-atomic-1']);
    expect(expense).not.toBeNull();
    const audit = await db.get('select * from audit_logs where id = ?', ['audit-1']);
    expect(audit).not.toBeNull();
    const op = await repo.findById('op-atomic-1');
    expect(op).not.toBeNull();
    expect(op?.status).toBe('pending');
  });

  it('markFailed sets nextRetryAt correctly', async () => {
    const op = await repo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'create',
      payload: {},
      idempotencyKey: 'idem-1',
      baseVersion: 0,
      localVersion: 1,
    });
    const retryAt = asDateTime('2026-07-29T11:00:00.000Z');
    await repo.markSyncing(op.id);
    await repo.markFailed(op.id, 'HTTP_500', 'Server error', retryAt);
    const found = await repo.findById(op.id);
    expect(found?.nextRetryAt).toBe('2026-07-29T11:00:00.000Z');
    expect(found?.lastErrorCode).toBe('HTTP_500');
  });
});
