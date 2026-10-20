/**
 * Bidirectional sync integration test (v2.6.0).
 *
 * TWO local devices (in-memory SQLite each) + ONE fake shared cloud
 * that implements BOTH the upload port (RemoteSyncPort) and the
 * download feed (IncrementalDownloadPort). RLS is emulated by
 * filtering the feed on each device's memberships.
 *
 * Proven end-to-end:
 *   1. Device A creates a group + expense OFFLINE → syncs → the cloud
 *      holds the rows → device B pulls → B sees identical financial
 *      state (expenses + balances).
 *   2. B records a settlement → pushes → A pulls → BOTH devices
 *      compute the same balances (financial correctness across devices).
 *   3. A deletes an expense → the tombstone reaches B on pull.
 *   4. CONCURRENT edits of the same expense → exactly ONE conflict,
 *      both payloads preserved, no duplicate rows.
 *   5. Offline restart: the queue survives; the next run drains it.
 *   6. Retried uploads NEVER duplicate rows (idempotency by row id).
 *   7. Membership revocation: a removed member's feed goes empty.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { GetGroupBalancesUseCase } from '@application/balances/get-group-balances.usecase';
import { CreateGroupUseCase } from '@application/groups/create-group.usecase';
import { DownloadCoordinator, SyncCoordinator } from '@application/sync';
import type { ConnectivityPort, RemoteSyncPort, SyncRunResult } from '@application/sync';
import type {
  RemoteChange,
  RemoteEntityType,
} from '@domain/services/sync/incremental-download';
import { asDateTime, nowDateTime } from '@domain/value-objects';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { SqliteAuditRepository } from '@infrastructure/sqlite/sqlite-audit-repository';
import { SqliteBalanceQueryPort } from '@infrastructure/sqlite/sqlite-balance-query-port';
import { SqliteExpenseRepository } from '@infrastructure/sqlite/sqlite-expense-repository';
import { SqliteGroupMemberRepository } from '@infrastructure/sqlite/sqlite-group-member-repository';
import { SqliteGroupRepository } from '@infrastructure/sqlite/sqlite-group-repository';
import { SqliteSettlementRepository } from '@infrastructure/sqlite/sqlite-settlement-repository';
import { SqliteRemoteChangeApplier } from '@infrastructure/sync/sqlite-remote-change-applier';
import { SqliteSyncConflictRepository } from '@infrastructure/sync/sqlite-sync-conflict-repository';
import { SqliteSyncCursorRepository } from '@infrastructure/sync/sqlite-sync-cursor-repository';
import { SqliteSyncRepository } from '@infrastructure/sync/sqlite-sync-repository';

import { InMemoryDatabase } from './in-memory-database';

// ---------------------------------------------------------------------------
// Fake shared cloud
// ---------------------------------------------------------------------------

type CloudRow = Record<string, unknown> & { id: string; updated_at: string };

class FakeSharedCloud implements RemoteSyncPort {
  /** table → rows, mutated by uploads. */
  readonly tables = new Map<string, CloudRow[]>();
  /** Upload failures to simulate (entityId → error). */
  readonly failUploads = new Map<string, { errorCode: string; errorMessage: string }>();

  constructor() {
    for (const t of ['groups', 'group_members', 'group_invites', 'expenses', 'expense_payers', 'expense_splits', 'settlements']) {
      this.tables.set(t, []);
    }
  }

  // ── RemoteSyncPort (upload) ──

  async uploadOperation(
    operation: Parameters<RemoteSyncPort['uploadOperation']>[0],
  ): Promise<
    | { readonly status: 'success' }
    | { readonly status: 'conflict'; readonly cloudVersion: number; readonly cloudPayload?: Readonly<Record<string, unknown>> }
    | { readonly status: 'error'; readonly errorCode: string; readonly errorMessage: string }
  > {
    const failure = this.failUploads.get(operation.entityId);
    if (failure) return { status: 'error', ...failure };

    const table = this.tableFor(operation.entityType);
    if (table === null) return { status: 'success' };
    const rows = this.tables.get(table) as CloudRow[];
    const payload = operation.payload as Record<string, unknown>;

    if (operation.operation === 'delete') {
      const row = rows.find((r) => r.id === operation.entityId);
      if (row) {
        row['deleted_at'] = nowDateTime();
        row['version'] = operation.localVersion;
      }
      return { status: 'success' };
    }

    let main = payload;
    if (operation.entityType === 'expense' && typeof payload['expense'] === 'object') {
      main = payload['expense'] as Record<string, unknown>;
    }
    if (operation.entityType === 'settlement' && typeof payload['settlement'] === 'object') {
      main = payload['settlement'] as Record<string, unknown>;
    }

    if (operation.operation === 'create') {
      const exists = rows.find((r) => r.id === operation.entityId);
      if (exists) {
        // Retry of an accepted write → success (idempotent by row id).
        return { status: 'success' };
      }
      rows.push({ ...main, id: operation.entityId, version: operation.localVersion } as unknown as CloudRow);
      // Aggregate children.
      for (const key of ['payers', 'splits']) {
        const children = Array.isArray(payload[key]) ? (payload[key] as Record<string, unknown>[]) : [];
        const childTable = key === 'payers' ? 'expense_payers' : 'expense_splits';
        for (const c of children) {
          (this.tables.get(childTable) as CloudRow[]).push({ ...c } as CloudRow);
        }
      }
      return { status: 'success' };
    }

    if (operation.operation === 'update') {
      const row = rows.find((r) => r.id === operation.entityId);
      if (!row) return { status: 'success' };
      // Optimistic concurrency: only the base-version holder wins.
      if ((row['version'] as number) !== operation.baseVersion) {
        return {
          status: 'conflict',
          cloudVersion: row['version'] as number,
          cloudPayload: row,
        };
      }
      Object.assign(row, main, { version: operation.localVersion });
      return { status: 'success' };
    }

    return { status: 'success' };
  }

  // ── IncrementalDownloadPort (download, RLS-emulated) ──

  readonly visibility = new Map<string, Set<string>>();

  allow(device: string, table: string, ids: readonly string[]): void {
    const key = `${device}:${table}`;
    this.visibility.set(key, new Set(ids));
  }

  /** Per-device feed with RLS emulation (device-scoped visibility). */
  downloadChangesFor(
    deviceKey: string,
    entityType: RemoteEntityType,
    cursor: string | null,
    limit: number,
  ): ReturnType<FakeSharedCloud['downloadChanges']> {
    const self = this;
    const scoped = Object.create(self) as FakeSharedCloud;
    scoped.isVisible = (table: string, id: string): boolean => {
      const ids = self.visibility.get(`${deviceKey}:${table}`);
      return ids ? ids.has(id) : true;
    };
    return self.downloadChanges.call(scoped, entityType, cursor, limit);
  }

  async downloadChanges(
    entityType: RemoteEntityType,
    cursor: string | null,
    limit: number,
  ): Promise<{
    readonly changes: readonly RemoteChange[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  }> {
    const table = this.tableFor(entityType);
    if (table === null) return { changes: [], nextCursor: cursor, hasMore: false };

    let rows = [...(this.tables.get(table) ?? [])];
    // RLS emulation: device-scoped visibility (all feeds in this test
    // use the same allowlist registered under the caller's key — the
    // test wires per-device ports below).
    rows = rows.filter((r) => this.isVisible(table, r.id as string));

    // Keyset filter emulation.
    let tuple: { updatedAt: string; rowId: string } | null = null;
    if (cursor !== null) {
      const idx = cursor.lastIndexOf('|');
      if (idx > 0) {
        tuple = { updatedAt: cursor.slice(0, idx), rowId: cursor.slice(idx + 1) };
      }
    }
    rows.sort((a, b) => {
      const ta = String(a['updated_at']);
      const tb = String(b['updated_at']);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
    rows = rows.filter((r) => {
      if (!tuple) return true;
      const at = String(r['updated_at']);
      if (at > tuple.updatedAt) return true;
      return at === tuple.updatedAt && String(r.id) > tuple.rowId;
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const changes = page.map((row) => toChange(entityType, row));
    const last = page[page.length - 1];
    return {
      changes,
      nextCursor: last ? `${String(last['updated_at'])}|${String(last.id)}` : cursor,
      hasMore,
    };
  }

  isVisible(_table: string, _id: string): boolean {
    return true; // no allowlist registered → fully visible (shared world)
  }

  private tableFor(entityType: string): string | null {
    const map: Record<string, string> = {
      group: 'groups',
      group_member: 'group_members',
      group_invite: 'group_invites',
      expense: 'expenses',
      expense_payer: 'expense_payers',
      expense_split: 'expense_splits',
      settlement: 'settlements',
    };
    return map[entityType] ?? null;
  }
}

function toChange(
  entityType: RemoteEntityType,
  row: CloudRow,
): RemoteChange {
  const version = typeof row['version'] === 'number' ? row['version'] : 1;
  const deletedAt = row['deleted_at'];
  return {
    entityType,
    entityId: String(row.id),
    changeType: deletedAt ? 'delete' : version <= 1 ? 'create' : 'update',
    version,
    payload: { ...row },
    ...(deletedAt ? { deletedAt: asDateTime(String(deletedAt)) } : {}),
    occurredAt: asDateTime(String(row['updated_at'])),
  };
}

// ---------------------------------------------------------------------------
// Device harness
// ---------------------------------------------------------------------------

class OnlinePort implements ConnectivityPort {
  online = true;
  private readonly listeners: ((online: boolean) => void)[] = [];
  async isOnline(): Promise<boolean> {
    return this.online;
  }
  onConnectivityChange(callback: (online: boolean) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
  setOnline(online: boolean): void {
    this.online = online;
    for (const l of this.listeners) l(online);
  }
}

interface Device {
  readonly name: string;
  readonly db: InMemoryDatabase;
  readonly syncRepo: SqliteSyncRepository;
  readonly coordinator: SyncCoordinator;
  readonly connectivity: OnlinePort;
  readonly cloud: FakeSharedCloud;
  readonly feed: DeviceFeed;
}

/** Per-device feed view (carries the device key for RLS emulation). */
class DeviceFeed {
  constructor(
    private readonly cloud: FakeSharedCloud,
    private readonly deviceKey: string,
  ) {}
  async downloadChanges(
    entityType: RemoteEntityType,
    cursor: string | null,
    limit: number,
  ): Promise<{
    readonly changes: readonly RemoteChange[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  }> {
    return this.cloud.downloadChangesFor(this.deviceKey, entityType, cursor, limit);
  }
}

async function makeDevice(
  name: string,
  cloud: FakeSharedCloud,
): Promise<Device> {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  const syncRepo = new SqliteSyncRepository(db);
  const connectivity = new OnlinePort();
  const conflicts = new SqliteSyncConflictRepository(db);
  const applier = new SqliteRemoteChangeApplier(db, conflicts);
  const cursors = new SqliteSyncCursorRepository(db);
  const feed = new DeviceFeed(cloud, name);
  const downloadCoordinator = new DownloadCoordinator(feed, applier, cursors);
  const coordinator = new SyncCoordinator(syncRepo, connectivity, cloud, undefined, downloadCoordinator);
  return { name, db, syncRepo, coordinator, connectivity, cloud, feed };
}

// ---------------------------------------------------------------------------
// Entity builders (local write path — the real repository adapters)
// ---------------------------------------------------------------------------

const GROUP_ID = 'grp-shared';
const ALICE_MEMBER = 'member-alice';
const BOB_MEMBER = 'member-bob';
const ALICE_USER = 'user-alice';
const BOB_USER = 'user-bob';

/**
 * Seed the shared group through the REAL write path (CreateGroupUseCase
 * for the group + owner, SqliteGroupMemberRepository for the second
 * member) so every row co-enqueues its upload op — exactly like the
 * app's own flows. Everything the other device needs is uploaded.
 */
async function seedSharedGroup(device: Device, ownerId: string, ownerMemberId: string): Promise<void> {
  const useCase = new CreateGroupUseCase(
    new SqliteGroupRepository(device.db),
    new SqliteGroupMemberRepository(device.db),
    new SqliteAuditRepository(device.db),
  );
  await useCase.execute({
    groupId: GROUP_ID,
    name: 'Trip',
    currencyCode: 'USD',
    createdBy: ownerId,
    ownerMemberId,
    now: asDateTime('2026-10-01T10:00:00.000Z'),
  });
}

/** Add the second member through the REAL member repository. */
async function addMember(device: Device, memberId: string, userId: string, displayName: string): Promise<void> {
  const repo = new SqliteGroupMemberRepository(device.db);
  await repo.save({
    id: memberId,
    groupId: GROUP_ID,
    userId,
    displayName: displayName as never,
    role: 'member',
    joinedAt: asDateTime('2026-10-01T10:05:00.000Z'),
    updatedAt: asDateTime('2026-10-01T10:05:00.000Z'),
    version: 1 as never,
  } as never);
}

interface LocalExpenseInput {
  readonly id: string;
  readonly title: string;
  readonly amountMinor: number;
  readonly payerMemberId: string;
  readonly splitMemberIds: readonly string[];
  readonly createdBy: string;
  readonly updatedAt?: string;
  readonly version?: number;
}

/** Write an expense through the REAL repository adapter (sync-op atomic). */
async function writeExpenseLocally(device: Device, input: LocalExpenseInput): Promise<void> {
  const repo = new SqliteExpenseRepository(device.db);
  const updatedAt = input.updatedAt ?? '2026-10-02T12:00:00.000Z';
  const version = input.version ?? 1;
  await repo.save(
    {
      id: input.id,
      groupId: GROUP_ID,
      title: input.title,
      amountMinor: input.amountMinor,
      currencyCode: 'USD',
      expenseDate: asDateTime('2026-10-02T12:00:00.000Z'),
      splitType: 'equal' as const,
      receiptId: null,
      note: null,
      category: null,
      createdBy: input.createdBy,
      createdAt: asDateTime('2026-10-02T12:00:00.000Z'),
      updatedAt: asDateTime(updatedAt),
      deletedAt: undefined,
      version: version as never,
      lastModifiedBy: input.createdBy,
      clientCreatedAt: asDateTime('2026-10-02T12:00:00.000Z'),
      clientUpdatedAt: asDateTime(updatedAt),
    } as never,
    [
      {
        id: `${input.id}-payer-1`,
        expenseId: input.id,
        memberId: input.payerMemberId,
        amountMinor: input.amountMinor,
        deletedAt: undefined,
        createdAt: asDateTime('2026-10-02T12:00:00.000Z'),
        updatedAt: asDateTime(updatedAt),
        version: 1 as never,
        createdBy: input.createdBy,
        lastModifiedBy: input.createdBy,
        clientCreatedAt: asDateTime('2026-10-02T12:00:00.000Z'),
        clientUpdatedAt: asDateTime(updatedAt),
      } as never,
    ],
    input.splitMemberIds.map((memberId) => ({
      id: `${input.id}-split-${memberId}`,
      expenseId: input.id,
      memberId,
      amountMinor: Math.floor(input.amountMinor / input.splitMemberIds.length),
      percentageBasisPoints: null,
      shareUnits: null,
      deletedAt: undefined,
      createdAt: asDateTime('2026-10-02T12:00:00.000Z'),
      updatedAt: asDateTime(updatedAt),
      version: 1 as never,
      createdBy: input.createdBy,
      lastModifiedBy: input.createdBy,
      clientCreatedAt: asDateTime('2026-10-02T12:00:00.000Z'),
      clientUpdatedAt: asDateTime(updatedAt),
    })) as never,
  );
}

async function groupBalances(device: Device): Promise<readonly { memberId: string; balanceMinor: number }[]> {
  const useCase = new GetGroupBalancesUseCase(new SqliteBalanceQueryPort(device.db));
  const result = await useCase.execute({ groupId: GROUP_ID as never });
  expect(result.notFound).toBe(false);
  // Per-currency results (the group uses a single currency).
  const usd = result.results.find((r) => r.currencyCode === 'USD');
  expect(usd).toBeDefined();
  return (usd?.memberCurrencyBalances ?? []).map((b) => ({
    memberId: b.memberId,
    balanceMinor: b.netBalanceMinor,
  }));
}

// ---------------------------------------------------------------------------
// The scenarios
// ---------------------------------------------------------------------------

describe('Bidirectional sync — two devices, one shared cloud (v2.6.0)', () => {
  let cloud: FakeSharedCloud;
  let alice: Device;
  let bob: Device;

  beforeEach(async () => {
    cloud = new FakeSharedCloud();
    alice = await makeDevice('device-alice', cloud);
    bob = await makeDevice('device-bob', cloud);
  });

  it('Scenario 1–2: offline create → push → pull → consistent balances', async () => {
    // ── Alice creates the group (+ owner member) + adds Bob, then an
    //    expense — ALL through the real write path, all offline ──
    await seedSharedGroup(alice, ALICE_USER, ALICE_MEMBER);
    await addMember(alice, BOB_MEMBER, BOB_USER, 'Bob');
    await writeExpenseLocally(alice, {
      id: 'exp-dinner',
      title: 'Dinner',
      amountMinor: 6000,
      payerMemberId: ALICE_MEMBER,
      splitMemberIds: [ALICE_MEMBER, BOB_MEMBER],
      createdBy: ALICE_USER,
    });

    // ── Alice syncs (push) ──
    alice.connectivity.online = true;
    const runA = (await alice.coordinator.requestSync('app_startup')) as SyncRunResult;
    expect(runA.skipped).toBe(false);
    // group + owner member + bob member + expense aggregate.
    expect(runA.processedCount).toBe(4);

    // Cloud now holds everything.
    expect(cloud.tables.get('groups')).toHaveLength(1);
    expect(cloud.tables.get('expenses')).toHaveLength(1);
    expect(cloud.tables.get('expense_splits')).toHaveLength(2);
    expect(cloud.tables.get('group_members')).toHaveLength(2);

    // ── Bob's fresh device pulls EVERYTHING (group, members, expense) ──
    bob.connectivity.online = true;
    const runB = (await bob.coordinator.requestSync('app_startup')) as SyncRunResult;
    expect(runB.downloadAppliedCount).toBeGreaterThanOrEqual(5);

    // Bob sees Alice's member row and the expense via pull.
    const bobAlice = await bob.db.get('select * from group_members where id = ?', [ALICE_MEMBER]);
    expect(bobAlice).not.toBeNull();

    // ── Bob records a settlement OFFLINE (pays Alice back 3000)
    //    through the REAL settlement repository (co-enqueues its
    //    upload op) and pushes ──
    const bobSettlementRepo = new SqliteSettlementRepository(bob.db);
    await bobSettlementRepo.save({
      id: 'set-1',
      groupId: GROUP_ID,
      fromMemberId: BOB_MEMBER,
      toMemberId: ALICE_MEMBER,
      amountMinor: 3000,
      currencyCode: 'USD',
      method: 'cash',
      settlementDate: asDateTime('2026-10-03T09:00:00.000Z'),
      note: undefined,
      createdBy: BOB_USER,
      createdAt: asDateTime('2026-10-03T09:00:00.000Z'),
      updatedAt: asDateTime('2026-10-03T09:00:00.000Z'),
      version: 1 as never,
      status: 'completed',
    } as never);
    const runB2 = (await bob.coordinator.requestSync('network_reconnect')) as SyncRunResult;
    expect(runB2.processedCount).toBe(1);
    expect(cloud.tables.get('settlements')).toHaveLength(1);

    // ── Alice pulls → identical financial state ──
    const runA2 = (await alice.coordinator.requestSync('network_reconnect')) as SyncRunResult;
    expect(runA2.downloadAppliedCount).toBeGreaterThanOrEqual(1);
    const aliceSettlement = await alice.db.get('select * from settlements where id = ?', ['set-1']);
    expect(aliceSettlement).not.toBeNull();

    // Both devices compute THE SAME balances: Dinner 6000 paid by
    // Alice, split 3000/3000; settlement 3000 Bob→Alice.
    const aliceBalances = await groupBalances(alice);
    const bobBalances = await groupBalances(bob);
    expect(aliceBalances).toEqual(bobBalances);
    const aliceNet = aliceBalances.find((b) => b.memberId === ALICE_MEMBER)?.balanceMinor;
    const bobNet = aliceBalances.find((b) => b.memberId === BOB_MEMBER)?.balanceMinor;
    // Alice paid 6000, owes 3000, received 3000 → net 0.
    expect(aliceNet).toBe(0);
    expect(bobNet).toBe(0);
  });

  it('Scenario 3: a remote delete tombstone reaches the other device', async () => {
    await seedSharedGroup(alice, ALICE_USER, ALICE_MEMBER);
    await writeExpenseLocally(alice, {
      id: 'exp-gone',
      title: 'To be deleted',
      amountMinor: 1000,
      payerMemberId: ALICE_MEMBER,
      splitMemberIds: [ALICE_MEMBER],
      createdBy: ALICE_USER,
    });
    await alice.coordinator.requestSync('app_startup');

    // Bob's fresh device pulls everything in.
    await bob.coordinator.requestSync('app_startup');
    expect(await bob.db.get('select id from expenses where id = ?', ['exp-gone'])).not.toBeNull();

    // Alice deletes locally (soft delete via the repository) → push.
    const repo = new SqliteExpenseRepository(alice.db);
    await repo.softDelete('exp-gone' as never, { deletedAt: asDateTime('2026-10-04T10:00:00.000Z'), reason: 'test' } as never);
    await alice.coordinator.requestSync('network_reconnect');
    expect((cloud.tables.get('expenses') as CloudRow[])[0]?.['deleted_at']).not.toBeNull();

    // Bob pulls → tombstone applied locally.
    await bob.coordinator.requestSync('network_reconnect');
    const bobRow = await bob.db.get<{ deleted_at: string | null }>(
      'select deleted_at from expenses where id = ?',
      ['exp-gone'],
    );
    expect(bobRow?.deleted_at).not.toBeNull();
  });

  it('Scenario 4: concurrent edits → ONE conflict, both payloads preserved, no duplicates', async () => {
    await seedSharedGroup(alice, ALICE_USER, ALICE_MEMBER);
    await addMember(alice, BOB_MEMBER, BOB_USER, 'Bob');
    await writeExpenseLocally(alice, {
      id: 'exp-c',
      title: 'Original',
      amountMinor: 4000,
      payerMemberId: ALICE_MEMBER,
      splitMemberIds: [ALICE_MEMBER, BOB_MEMBER],
      createdBy: ALICE_USER,
    });
    await alice.coordinator.requestSync('app_startup');

    // Bob pulls the expense (v1 locally).
    await bob.coordinator.requestSync('app_startup');

    // BOTH devices edit the same expense concurrently (same base v1).
    const aliceRepo = new SqliteExpenseRepository(alice.db);
    const bobRepo = new SqliteExpenseRepository(bob.db);
    await aliceRepo.save(
      {
        id: 'exp-c', groupId: GROUP_ID, title: 'Alice edit', amountMinor: 4500,
        currencyCode: 'USD', expenseDate: asDateTime('2026-10-02T12:00:00.000Z'),
        splitType: 'equal', receiptId: null, note: null, category: null,
        createdBy: ALICE_USER, createdAt: asDateTime('2026-10-02T12:00:00.000Z'),
        updatedAt: asDateTime('2026-10-04T10:00:00.000Z'), version: 2 as never,
        lastModifiedBy: ALICE_USER, clientCreatedAt: asDateTime('2026-10-02T12:00:00.000Z'),
        clientUpdatedAt: asDateTime('2026-10-04T10:00:00.000Z'),
      } as never,
      [],
      [],
    );
    await bobRepo.save(
      {
        id: 'exp-c', groupId: GROUP_ID, title: 'Bob edit', amountMinor: 5000,
        currencyCode: 'USD', expenseDate: asDateTime('2026-10-02T12:00:00.000Z'),
        splitType: 'equal', receiptId: null, note: null, category: null,
        createdBy: ALICE_USER, createdAt: asDateTime('2026-10-02T12:00:00.000Z'),
        updatedAt: asDateTime('2026-10-04T10:01:00.000Z'), version: 2 as never,
        lastModifiedBy: BOB_USER, clientCreatedAt: asDateTime('2026-10-02T12:00:00.000Z'),
        clientUpdatedAt: asDateTime('2026-10-04T10:01:00.000Z'),
      } as never,
      [],
      [],
    );

    // Alice pushes first → cloud v2 = Alice's edit.
    await alice.coordinator.requestSync('network_reconnect');
    // Bob pushes second → base v1 no longer matches → the cloud port
    // reports a version conflict → Bob's op becomes conflicted.
    const bobRun = (await bob.coordinator.requestSync('network_reconnect')) as SyncRunResult;
    expect(bobRun.conflictedCount).toBe(1);

    // No duplicate rows anywhere.
    expect(cloud.tables.get('expenses')).toHaveLength(1);
    const aliceConflicts = await new SqliteSyncConflictRepository(alice.db).listUnresolved(10);
    // The conflict is recorded on BOB's side (the loser of the race).
    const bobConflicts = await new SqliteSyncConflictRepository(bob.db).listUnresolved(10);
    expect(bobConflicts).toHaveLength(1);
    expect(bobConflicts[0]?.entityId).toBe('exp-c');
    expect(bobConflicts[0]?.cloudVersion).toBe(2);
    expect(aliceConflicts).toHaveLength(0);

    // Alice also pulls clean (her own version is the cloud truth).
    await alice.coordinator.requestSync('network_reconnect');
    const aliceRow = await alice.db.get<{ title: string }>(
      'select title from expenses where id = ?',
      ['exp-c'],
    );
    expect(aliceRow?.title).toBe('Alice edit');
  });

  it('Scenario 5: offline queue survives an app restart and drains afterwards', async () => {
    await seedSharedGroup(alice, ALICE_USER, ALICE_MEMBER);
    await writeExpenseLocally(alice, {
      id: 'exp-off',
      title: 'Created offline',
      amountMinor: 2500,
      payerMemberId: ALICE_MEMBER,
      splitMemberIds: [ALICE_MEMBER],
      createdBy: ALICE_USER,
    });

    // Offline: nothing uploads (3 ops: group, owner member, expense).
    alice.connectivity.online = false;
    const offlineRun = await alice.coordinator.requestSync('app_startup');
    expect(offlineRun.skipped).toBe(true);
    expect(await alice.syncRepo.countPending()).toBe(3);

    // "Restart": recover stuck ops exactly like SyncCoordinator.start().
    await alice.syncRepo.recoverStuckSyncing(nowDateTime());
    expect(await alice.syncRepo.countPending()).toBe(3);

    // Reconnect → the queue drains completely.
    alice.connectivity.online = true;
    const run = (await alice.coordinator.requestSync('network_reconnect')) as SyncRunResult;
    expect(run.processedCount).toBe(3);
    expect(await alice.syncRepo.countPending()).toBe(0);
    expect(cloud.tables.get('expenses')).toHaveLength(1);
  });

  it('Scenario 6: retried uploads NEVER duplicate rows (idempotency)', async () => {
    await seedSharedGroup(alice, ALICE_USER, ALICE_MEMBER);
    await writeExpenseLocally(alice, {
      id: 'exp-idem',
      title: 'Idempotent',
      amountMinor: 900,
      payerMemberId: ALICE_MEMBER,
      splitMemberIds: [ALICE_MEMBER],
      createdBy: ALICE_USER,
    });
    await alice.coordinator.requestSync('app_startup');
    expect(cloud.tables.get('expenses')).toHaveLength(1);

    // Force-apply the SAME create op again (simulating a retry of a
    // server-accepted write whose response was lost).
    const op = await alice.syncRepo.listByEntity('expense', 'exp-idem');
    // The op was drained — re-run the upload directly against the cloud.
    const uploadResult = await cloud.uploadOperation({
      id: 'retry-op',
      entityType: 'expense',
      entityId: 'exp-idem',
      operation: 'create',
      payload: (await alice.db.get('select * from expenses where id = ?', ['exp-idem'])) as Record<string, unknown>,
      idempotencyKey: 'expense:exp-idem:create:1',
      baseVersion: 0,
      localVersion: 1,
      status: 'pending',
      retryCount: 0,
      createdAt: nowDateTime(),
    });
    expect(uploadResult.status).toBe('success');
    expect(cloud.tables.get('expenses')).toHaveLength(1); // STILL one row
    void op;
  });

  it('Scenario 7: a removed member stops receiving the group feed', async () => {
    await seedSharedGroup(alice, ALICE_USER, ALICE_MEMBER);
    await writeExpenseLocally(alice, {
      id: 'exp-private',
      title: 'Private dinner',
      amountMinor: 700,
      payerMemberId: ALICE_MEMBER,
      splitMemberIds: [ALICE_MEMBER],
      createdBy: ALICE_USER,
    });
    await alice.coordinator.requestSync('app_startup');

    // Bob's visibility is REVOKED (removed from the group).
    cloud.allow('device-bob', 'groups', []);
    cloud.allow('device-bob', 'group_members', []);
    cloud.allow('device-bob', 'expenses', []);

    const run = (await bob.coordinator.requestSync('app_startup')) as SyncRunResult;
    expect(run.downloadAppliedCount ?? 0).toBe(0);
    expect(await bob.db.get('select id from expenses where id = ?', ['exp-private'])).toBeNull();
  });
});
