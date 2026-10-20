import { beforeEach, describe, expect, it } from '@jest/globals';

import type { RemoteChange } from '@domain/services/sync/incremental-download';
import { asDateTime } from '@domain/value-objects';

import { runMigrations } from '../sqlite/schema';
import { SqliteRemoteChangeApplier } from '../sync/sqlite-remote-change-applier';
import { SqliteSyncConflictRepository } from '../sync/sqlite-sync-conflict-repository';
import { SqliteSyncRepository } from '../sync/sqlite-sync-repository';

import { InMemoryDatabase } from './in-memory-database';

/**
 * SqliteRemoteChangeApplier — the CLOUD→DEVICE write path (v2.6.0).
 *
 * The headline invariants under test:
 *   1. Remote rows land EXACTLY as the server holds them.
 *   2. Applying NEVER enqueues an upload sync-op (no echo loop).
 *   3. Same-version replays are no-ops (idempotent).
 *   4. A pending local edit suppresses remote overwrites (and child
 *      rows) and surfaces a conflict instead of losing either side.
 *   5. A remote delete of a locally-edited record is a HIGH-PRIORITY
 *      conflict, never a silent loss.
 *   6. Children whose parents are missing are DEFERRED, not dropped.
 */

describe('SqliteRemoteChangeApplier', () => {
  let db: InMemoryDatabase;
  let applier: SqliteRemoteChangeApplier;
  let conflicts: SqliteSyncConflictRepository;
  let syncRepo: SqliteSyncRepository;

  const GROUP_ID = 'group-1';
  const MEMBER_A = 'member-a';
  const MEMBER_B = 'member-b';

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    conflicts = new SqliteSyncConflictRepository(db);
    applier = new SqliteRemoteChangeApplier(db, conflicts);
    syncRepo = new SqliteSyncRepository(db);
  });

  /** Seed a group + two members as if they were created locally. */
  async function seedGroupWithMembers(): Promise<void> {
    await db.run(
      `insert into groups (id, name, currency_code, created_by, created_at, updated_at,
         deleted_at, version, last_modified_by, client_created_at, client_updated_at)
       values (?, ?, ?, ?, ?, ?, null, 1, ?, ?, ?)`,
      [GROUP_ID, 'Trip', 'USD', 'user-1', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', 'user-1', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z'],
    );
    await db.run(
      `insert into group_members (id, group_id, user_id, display_name, role, joined_at,
         left_at, created_at, updated_at, version, created_by, last_modified_by,
         client_created_at, client_updated_at)
       values (?, ?, ?, ?, 'owner', ?, null, ?, ?, 1, ?, ?, ?, ?)`,
      [MEMBER_A, GROUP_ID, 'user-1', 'Alice', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', 'user-1', 'user-1', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z'],
    );
    await db.run(
      `insert into group_members (id, group_id, user_id, display_name, role, joined_at,
         left_at, created_at, updated_at, version, created_by, last_modified_by,
         client_created_at, client_updated_at)
       values (?, ?, ?, ?, 'member', ?, null, ?, ?, 1, ?, ?, ?, ?)`,
      [MEMBER_B, GROUP_ID, 'user-2', 'Bob', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', 'user-1', 'user-1', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z'],
    );
  }

  function groupChange(
    payloadOverrides: Partial<Record<string, unknown>> = {},
    changeOverrides: Partial<Pick<RemoteChange, 'changeType' | 'version'>> = {},
  ): RemoteChange {
    const payload = {
      id: GROUP_ID,
      name: 'Trip (renamed by Alice)',
      description: null,
      currency_code: 'USD',
      created_by: 'user-1',
      created_at: '2026-10-01T10:00:00.000Z',
      updated_at: '2026-10-02T12:00:00.000Z',
      deleted_at: null,
      version: 2,
      last_modified_by: 'user-1',
      client_created_at: '2026-10-01T10:00:00.000Z',
      client_updated_at: '2026-10-02T12:00:00.000Z',
      ...payloadOverrides,
    };
    return {
      entityType: 'group',
      entityId: GROUP_ID,
      changeType: 'update',
      version: 2,
      payload,
      occurredAt: asDateTime(String(payload.updated_at)),
      ...changeOverrides,
    };
  }

  function expenseChange(
    payloadOverrides: Partial<Record<string, unknown>> = {},
    changeOverrides: Partial<Pick<RemoteChange, 'changeType' | 'version'>> = {},
  ): RemoteChange {
    const payload = {
      id: 'exp-1',
      group_id: GROUP_ID,
      title: 'Dinner',
      amount_minor: 5000,
      currency_code: 'USD',
      expense_date: '2026-10-02T19:00:00.000Z',
      split_type: 'equal',
      receipt_id: null,
      note: null,
      category: null,
      created_by: 'user-1',
      created_at: '2026-10-02T19:00:00.000Z',
      updated_at: '2026-10-02T19:00:00.000Z',
      deleted_at: null,
      version: 1,
      last_modified_by: 'user-1',
      client_created_at: '2026-10-02T19:00:00.000Z',
      client_updated_at: '2026-10-02T19:00:00.000Z',
      ...payloadOverrides,
    };
    return {
      entityType: 'expense',
      entityId: 'exp-1',
      changeType: 'create',
      version: 1,
      payload,
      occurredAt: asDateTime(String(payload.updated_at)),
      ...changeOverrides,
    };
  }

  // ------------------------------------------------------------------
  // 1. Basic application
  // ------------------------------------------------------------------

  it('applies a remote group update and stores the server version', async () => {
    await seedGroupWithMembers();
    const outcome = await applier.apply(groupChange());
    expect(outcome.action).toBe('applied');

    const row = await db.get<{ name: string; version: number; updated_at: string }>(
      'select name, version, updated_at from groups where id = ?',
      [GROUP_ID],
    );
    expect(row?.name).toBe('Trip (renamed by Alice)');
    expect(row?.version).toBe(2);
    expect(row?.updated_at).toBe('2026-10-02T12:00:00.000Z');
  });

  it('applies a remote expense create (no local record)', async () => {
    await seedGroupWithMembers();
    const outcome = await applier.apply(expenseChange());
    expect(outcome.action).toBe('applied');
    const row = await db.get<{ title: string; amount_minor: number }>(
      'select title, amount_minor from expenses where id = ?',
      ['exp-1'],
    );
    expect(row?.title).toBe('Dinner');
    expect(row?.amount_minor).toBe(5000);
  });

  it('NEVER enqueues a sync operation when applying remote changes (no echo)', async () => {
    await seedGroupWithMembers();
    await applier.apply(groupChange());
    await applier.apply(expenseChange());
    const count = await db.get<{ count: number }>(
      `select count(*) as count from sync_operations`,
    );
    expect(count?.count).toBe(0);
  });

  // ------------------------------------------------------------------
  // 2. Replay safety
  // ------------------------------------------------------------------

  it('skips a same-version replay (idempotent)', async () => {
    await seedGroupWithMembers();
    await applier.apply(groupChange());
    const replay = await applier.apply(groupChange());
    expect(replay.action).toBe('skipped');
    if (replay.action === 'skipped') {
      expect(replay.reason).toBe('same_version');
    }
  });

  it('overwrites an OLDER local version when local is clean (apply_remote_newer)', async () => {
    await seedGroupWithMembers();
    const appliedFirst = await applier.apply(groupChange());
    expect(appliedFirst.action).toBe('applied');
    // A later remote change with version 3.
    const v3 = groupChange(
      { name: 'Trip v3', version: 3, updated_at: '2026-10-03T09:00:00.000Z' },
      { changeType: 'update', version: 3 },
    );
    const outcome = await applier.apply(v3);
    expect(outcome.action).toBe('applied');
    const row = await db.get<{ name: string; version: number }>(
      'select name, version from groups where id = ?',
      [GROUP_ID],
    );
    expect(row?.name).toBe('Trip v3');
    expect(row?.version).toBe(3);
  });

  // ------------------------------------------------------------------
  // 3. Tombstones
  // ------------------------------------------------------------------

  it('applies a remote soft-delete as a tombstone', async () => {
    await seedGroupWithMembers();
    const created = await applier.apply(expenseChange());
    expect(created.action).toBe('applied');
    const tombstone = expenseChange(
      {
        version: 2,
        deleted_at: '2026-10-03T08:00:00.000Z',
        updated_at: '2026-10-03T08:00:00.000Z',
      },
      { changeType: 'delete', version: 2 },
    );
    const outcome = await applier.apply(tombstone);
    expect(outcome.action).toBe('applied');
    const row = await db.get<{ deleted_at: string | null; version: number }>(
      'select deleted_at, version from expenses where id = ?',
      ['exp-1'],
    );
    expect(row?.deleted_at).toBe('2026-10-03T08:00:00.000Z');
    expect(row?.version).toBe(2);
  });

  it('maps a group_member tombstone to left_at (local membership model)', async () => {
    await seedGroupWithMembers();
    const removal: RemoteChange = {
      entityType: 'group_member',
      entityId: MEMBER_B,
      changeType: 'delete',
      version: 2,
      payload: {
        id: MEMBER_B,
        group_id: GROUP_ID,
        user_id: 'user-2',
        display_name: 'Bob',
        role: 'member',
        joined_at: '2026-10-01T10:00:00.000Z',
        left_at: null,
        created_at: '2026-10-01T10:00:00.000Z',
        updated_at: '2026-10-03T08:00:00.000Z',
        version: 2,
        created_by: 'user-1',
        last_modified_by: 'user-1',
        client_created_at: '2026-10-01T10:00:00.000Z',
        client_updated_at: '2026-10-03T08:00:00.000Z',
        deleted_at: '2026-10-03T08:00:00.000Z',
      },
      deletedAt: asDateTime('2026-10-03T08:00:00.000Z'),
      occurredAt: asDateTime('2026-10-03T08:00:00.000Z'),
    };
    const outcome = await applier.apply(removal);
    expect(outcome.action).toBe('applied');
    const row = await db.get<{ left_at: string | null }>(
      'select left_at from group_members where id = ?',
      [MEMBER_B],
    );
    expect(row?.left_at).toBe('2026-10-03T08:00:00.000Z');
  });

  // ------------------------------------------------------------------
  // 4. Conflicts (local pending vs remote change)
  // ------------------------------------------------------------------

  it('records a conflict when a local edit is pending and remote moved on', async () => {
    await seedGroupWithMembers();
    // Local user edited the group → pending update op (base = remote v1... remote is v2 now).
    await syncRepo.enqueue({
      entityType: 'group',
      entityId: GROUP_ID,
      operation: 'update',
      payload: { name: 'Local name' },
      idempotencyKey: 'group:group-1:update:2',
      baseVersion: 1,
      localVersion: 2,
    });

    const outcome = await applier.apply(groupChange());
    expect(outcome.action).toBe('conflicted');

    const unresolved = await conflicts.listUnresolved(10);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.category).toBe('remote_change_conflict');
    expect(unresolved[0]?.cloudVersion).toBe(2);
    expect(unresolved[0]?.localVersion).toBe(1);
    // Both sides of the diff are preserved for the review UI.
    expect(unresolved[0]?.cloudPayload).toBeDefined();
  });

  it('records a FINANCIAL conflict category for expense conflicts', async () => {
    await seedGroupWithMembers();
    await applier.apply(expenseChange());
    await syncRepo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'update',
      payload: { title: 'Local edit', amount_minor: 9000 },
      idempotencyKey: 'expense:exp-1:update:2',
      baseVersion: 1,
      localVersion: 2,
    });
    const remoteV2 = expenseChange(
      { title: 'Remote edit', amount_minor: 6000, version: 2, updated_at: '2026-10-03T09:00:00.000Z' },
      { changeType: 'update', version: 2 },
    );
    const outcome = await applier.apply(remoteV2);
    expect(outcome.action).toBe('conflicted');
    if (outcome.action === 'conflicted') {
      expect(outcome.category).toBe('financial_record_conflict');
    }
  });

  it('conflict recording is IDEMPOTENT under replay (one unresolved per entity)', async () => {
    await seedGroupWithMembers();
    await syncRepo.enqueue({
      entityType: 'group',
      entityId: GROUP_ID,
      operation: 'update',
      payload: { name: 'Local name' },
      idempotencyKey: 'group:group-1:update:2',
      baseVersion: 1,
      localVersion: 2,
    });
    await applier.apply(groupChange());
    await applier.apply(groupChange()); // replay
    const unresolved = await conflicts.listUnresolved(10);
    expect(unresolved).toHaveLength(1);
  });

  it('does NOT overwrite the local row when conflicting (local state preserved)', async () => {
    await seedGroupWithMembers();
    await syncRepo.enqueue({
      entityType: 'group',
      entityId: GROUP_ID,
      operation: 'update',
      payload: { name: 'Local name' },
      idempotencyKey: 'group:group-1:update:2',
      baseVersion: 1,
      localVersion: 2,
    });
    // Local row was already renamed locally by the user:
    await db.run(`update groups set name = 'Local name' where id = ?`, [GROUP_ID]);
    await applier.apply(groupChange());
    const row = await db.get<{ name: string }>('select name from groups where id = ?', [GROUP_ID]);
    expect(row?.name).toBe('Local name');
  });

  // ------------------------------------------------------------------
  // 5. Remote delete vs pending local edit = high-priority conflict
    // ------------------------------------------------------------------

  it('remote delete + pending local edit = high-priority conflict (never silent loss)', async () => {
    await seedGroupWithMembers();
    await applier.apply(expenseChange());
    await syncRepo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'update',
      payload: { title: 'Local edit' },
      idempotencyKey: 'expense:exp-1:update:2',
      baseVersion: 1,
      localVersion: 2,
    });
    const tombstone = expenseChange(
      {
        version: 2,
        deleted_at: '2026-10-03T08:00:00.000Z',
        updated_at: '2026-10-03T08:00:00.000Z',
      },
      { changeType: 'delete', version: 2 },
    );
    const outcome = await applier.apply(tombstone);
    expect(outcome.action).toBe('conflicted');
    const unresolved = await conflicts.listUnresolved(10);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.category).toBe('deleted_remotely');
    // The row is still locally alive (deletion deferred to review).
    const row = await db.get<{ deleted_at: string | null }>(
      'select deleted_at from expenses where id = ?',
      ['exp-1'],
    );
    expect(row?.deleted_at).toBeNull();
  });

  // ------------------------------------------------------------------
  // 6. Pending-upload wins when remote is unchanged from base
  // ------------------------------------------------------------------

  it('pending local edit suppresses a remote change at the BASE version', async () => {
    await seedGroupWithMembers();
    await syncRepo.enqueue({
      entityType: 'group',
      entityId: GROUP_ID,
      operation: 'update',
      payload: { name: 'Local name' },
      idempotencyKey: 'group:group-1:update:2',
      baseVersion: 2,
      localVersion: 3,
    });
    // Remote is still at v2 (== base) — the local edit must win.
    const outcome = await applier.apply(groupChange());
    expect(outcome.action).toBe('skipped');
    if (outcome.action === 'skipped') {
      expect(outcome.reason).toBe('continue_upload');
    }
  });

  // ------------------------------------------------------------------
  // 7. Parent integrity (defer, never drop)
  // ------------------------------------------------------------------

  it('defers an expense whose parent group is missing locally', async () => {
    // No seedGroupWithMembers — the group row does not exist yet.
    const outcome = await applier.apply(expenseChange());
    expect(outcome.action).toBe('deferred');
    if (outcome.action === 'deferred') {
      expect(outcome.parentEntityType).toBe('group');
      expect(outcome.parentEntityId).toBe(GROUP_ID);
    }
    // Nothing was written.
    const row = await db.get('select id from expenses where id = ?', ['exp-1']);
    expect(row).toBeNull();
  });

  it('applies the expense after the parent group lands (defer → apply)', async () => {
    await applier.apply(expenseChange());
    await seedGroupWithMembers();
    const outcome = await applier.apply(expenseChange());
    expect(outcome.action).toBe('applied');
  });

  it('suppresses remote child rows while the parent expense has a pending local edit', async () => {
    await seedGroupWithMembers();
    await applier.apply(expenseChange());
    await syncRepo.enqueue({
      entityType: 'expense',
      entityId: 'exp-1',
      operation: 'update',
      payload: { title: 'Local edit' },
      idempotencyKey: 'expense:exp-1:update:2',
      baseVersion: 1,
      localVersion: 2,
    });
    const remoteSplit: RemoteChange = {
      entityType: 'expense_split',
      entityId: 'split-remote-1',
      changeType: 'create',
      version: 1,
      payload: {
        id: 'split-remote-1',
        expense_id: 'exp-1',
        member_id: MEMBER_B,
        amount_minor: 2500,
        percentage_basis_points: null,
        share_units: null,
        deleted_at: null,
        created_at: '2026-10-03T10:00:00.000Z',
        updated_at: '2026-10-03T10:00:00.000Z',
        version: 1,
        created_by: 'user-2',
        last_modified_by: 'user-2',
        client_created_at: '2026-10-03T10:00:00.000Z',
        client_updated_at: '2026-10-03T10:00:00.000Z',
      },
      occurredAt: asDateTime('2026-10-03T10:00:00.000Z'),
    };
    const outcome = await applier.apply(remoteSplit);
    expect(outcome.action).toBe('skipped');
    if (outcome.action === 'skipped') {
      expect(outcome.reason).toBe('continue_upload');
    }
    const row = await db.get('select id from expense_splits where id = ?', ['split-remote-1']);
    expect(row).toBeNull();
  });

  // ------------------------------------------------------------------
  // 8. Normalization (cloud → local constraint compatibility)
  // ------------------------------------------------------------------

  it('normalises an unknown settlement method to "other" (local CHECK)', async () => {
    await seedGroupWithMembers();
    const settlement: RemoteChange = {
      entityType: 'settlement',
      entityId: 'set-1',
      changeType: 'create',
      version: 1,
      payload: {
        id: 'set-1',
        group_id: GROUP_ID,
        from_member_id: MEMBER_B,
        to_member_id: MEMBER_A,
        amount_minor: 1200,
        currency_code: 'USD',
        method: 'paypal', // not in the local enum
        settlement_date: '2026-10-03T10:00:00.000Z',
        note: null,
        reverses_settlement_id: null,
        reversal_of_settlement_id: null,
        created_by: 'user-2',
        created_at: '2026-10-03T10:00:00.000Z',
        updated_at: '2026-10-03T10:00:00.000Z',
        deleted_at: null,
        version: 1,
        last_modified_by: 'user-2',
        client_created_at: '2026-10-03T10:00:00.000Z',
        client_updated_at: '2026-10-03T10:00:00.000Z',
        status: null,
        confirmed_by_member_id: null,
        confirmed_at: null,
        payment_reference_hash: null,
        operation_id: null,
        evidence_hash: null,
        dispute_reason: null,
        dispute_note: null,
      },
      occurredAt: asDateTime('2026-10-03T10:00:00.000Z'),
    };
    const outcome = await applier.apply(settlement);
    expect(outcome.action).toBe('applied');
    const row = await db.get<{ method: string; status: string }>(
      'select method, status from settlements where id = ?',
      ['set-1'],
    );
    expect(row?.method).toBe('other');
    expect(row?.status).toBe('completed'); // NULL status normalised per phase-6 semantics
  });

  it('fails loudly (not silently) when the change cannot be applied', async () => {
    const unknown: RemoteChange = {
      entityType: 'receipt',
      entityId: 'r-1',
      changeType: 'create',
      version: 1,
      payload: {},
      occurredAt: asDateTime('2026-10-03T10:00:00.000Z'),
    };
    // 'receipt' has no local table mapping in the applier — it must be
    // a FAILED outcome (visible), never a silent skip.
    const outcome = await applier.apply(unknown);
    expect(outcome.action).toBe('failed');
  });
});

// --------------------------------------------------------------------
// 9. User conflict resolution (keep_local / keep_cloud)
// --------------------------------------------------------------------

describe('SqliteRemoteChangeApplier — conflict resolution (v2.6.0)', () => {
  let db: InMemoryDatabase;
  let applier: SqliteRemoteChangeApplier;
  let conflicts: SqliteSyncConflictRepository;
  let syncRepo: SqliteSyncRepository;

  const GROUP_ID = 'group-r';
  const MEMBER_A = 'member-ra';

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    conflicts = new SqliteSyncConflictRepository(db);
    applier = new SqliteRemoteChangeApplier(db, conflicts);
    syncRepo = new SqliteSyncRepository(db);

    await db.run(
      `insert into groups (id, name, currency_code, created_by, created_at, updated_at,
         deleted_at, version, last_modified_by, client_created_at, client_updated_at)
       values (?, 'Trip', 'USD', 'user-1', ?, ?, null, 1, 'user-1', ?, ?)`,
      [GROUP_ID, '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z'],
    );
    await db.run(
      `insert into group_members (id, group_id, user_id, display_name, role, joined_at,
         left_at, created_at, updated_at, version, created_by, last_modified_by,
         client_created_at, client_updated_at)
       values (?, ?, 'user-1', 'Alice', 'owner', ?, null, ?, ?, 1, 'user-1', 'user-1', ?, ?)`,
      [MEMBER_A, GROUP_ID, '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z'],
    );
    await db.run(
      `insert into expenses (id, group_id, title, amount_minor, currency_code, expense_date,
         split_type, created_by, created_at, updated_at, deleted_at, version,
         last_modified_by, client_created_at, client_updated_at)
       values ('exp-r', ?, 'Original', 4000, 'USD', ?, 'equal', 'user-1', ?, ?, null, 2, 'user-1', ?, ?)`,
      [GROUP_ID, '2026-10-02T12:00:00.000Z', '2026-10-02T12:00:00.000Z', '2026-10-02T12:00:00.000Z', '2026-10-02T12:00:00.000Z', '2026-10-02T12:00:00.000Z'],
    );
  });

  it('keep_local re-bases the upload op onto the cloud version and bumps the row', async () => {
    // A conflicted upload op exists (base 1, local 2) — cloud moved to 3.
    await syncRepo.enqueue({
      entityType: 'expense',
      entityId: 'exp-r',
      operation: 'update',
      payload: { expense: { id: 'exp-r', title: 'Local edit', version: 2 }, payers: [], splits: [] },
      idempotencyKey: 'expense:exp-r:update:2',
      baseVersion: 1,
      localVersion: 2,
    });
    // The op is conflicted (as the upload path would have left it).
    const ops = await syncRepo.listByEntity('expense', 'exp-r');
    await syncRepo.markConflict(ops[0]!.id, {
      entityType: 'expense',
      entityId: 'exp-r',
      category: 'version_conflict',
      localVersion: 2,
      cloudVersion: 3,
    });

    const outcome = await applier.keepLocalVersion({
      entityType: 'expense',
      entityId: 'exp-r',
      cloudVersion: 3,
    });
    expect(outcome.status).toBe('resolved');

    // The local row version is now cloud + 1.
    const row = await db.get<{ version: number }>('select version from expenses where id = ?', ['exp-r']);
    expect(row?.version).toBe(4);

    // The op is re-based: base 3, local 4, pending again.
    const rebased = await syncRepo.listByEntity('expense', 'exp-r');
    const pendingOp = rebased.find((o) => o.status === 'pending');
    expect(pendingOp).toBeDefined();
    expect(pendingOp?.baseVersion).toBe(3);
    expect(pendingOp?.localVersion).toBe(4);
    // The embedded payload version was kept consistent.
    const payload = pendingOp?.payload as { expense: { version: number } };
    expect(payload.expense.version).toBe(4);
  });

  it('keep_cloud writes the cloud payload and cancels the stale local ops', async () => {
    await syncRepo.enqueue({
      entityType: 'expense',
      entityId: 'exp-r',
      operation: 'update',
      payload: { expense: { id: 'exp-r', title: 'Local edit', version: 2 }, payers: [], splits: [] },
      idempotencyKey: 'expense:exp-r:update:2',
      baseVersion: 1,
      localVersion: 2,
    });

    const outcome = await applier.applyCloudVersion({
      entityType: 'expense',
      entityId: 'exp-r',
      cloudPayload: {
        id: 'exp-r',
        group_id: GROUP_ID,
        title: 'Cloud truth',
        amount_minor: 5500,
        currency_code: 'USD',
        expense_date: '2026-10-02T12:00:00.000Z',
        split_type: 'equal',
        receipt_id: null,
        note: null,
        category: null,
        created_by: 'user-1',
        created_at: '2026-10-02T12:00:00.000Z',
        updated_at: '2026-10-04T09:00:00.000Z',
        deleted_at: null,
        version: 3,
        last_modified_by: 'user-2',
        client_created_at: '2026-10-02T12:00:00.000Z',
        client_updated_at: '2026-10-04T09:00:00.000Z',
      },
    });
    expect(outcome.status).toBe('resolved');

    // The local row now mirrors the cloud exactly.
    const row = await db.get<{ title: string; amount_minor: number; version: number }>(
      'select title, amount_minor, version from expenses where id = ?',
      ['exp-r'],
    );
    expect(row?.title).toBe('Cloud truth');
    expect(row?.amount_minor).toBe(5500);
    expect(row?.version).toBe(3);

    // The stale local op can never re-upload.
    const ops = await syncRepo.listByEntity('expense', 'exp-r');
    const active = ops.filter((o) => o.status !== 'cancelled');
    expect(active).toHaveLength(0);
  });
});
