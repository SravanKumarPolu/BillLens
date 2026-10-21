/**
 * SqliteGuestIdentityRepository + SqliteAccountDeletionRepository tests
 * (v2.4.0) — the durable local identity layer over the in-memory SQL
 * double, including the v5 migration.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { createGuestIdentity, asGuestIdentityId } from '@domain/entities/guest-identity';
import { asDateTime } from '@domain/value-objects';

import { runMigrations, getSchemaVersion } from '../sqlite/schema';
import { SqliteAccountDeletionRepository } from '../sqlite/sqlite-account-deletion-repository';
import { SqliteGuestIdentityRepository } from '../sqlite/sqlite-guest-identity-repository';

import { InMemoryDatabase } from './in-memory-database';

describe('migration 0005 (identity_support)', () => {
  it('applies and reports schema version 6 (v2.5.0 migration applied after)', async () => {
    const db = new InMemoryDatabase();
    await runMigrations(db);
    expect(await getSchemaVersion(db)).toBe(9);
  });
});

describe('SqliteGuestIdentityRepository', () => {
  let db: InMemoryDatabase;
  let repo: SqliteGuestIdentityRepository;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    repo = new SqliteGuestIdentityRepository(db);
  });

  it('round-trips a guest identity', async () => {
    const identity = createGuestIdentity({
      id: asGuestIdentityId('guest-1'),
      displayName: 'Asha',
      deviceSecretHash: 'sha256:abc',
    });
    await repo.save(identity);

    const loaded = await repo.findById(asGuestIdentityId('guest-1'));
    expect(loaded?.displayName).toBe('Asha');
    expect(loaded?.deviceSecretHash).toBe('sha256:abc');
    expect(loaded?.upgradeStatus).toBe('local_only');
    expect(loaded?.linkedUserId).toBeUndefined();
  });

  it('persists upgrade state and linked user', async () => {
    await repo.save(
      createGuestIdentity({
        id: asGuestIdentityId('guest-2'),
        displayName: 'Ben',
        deviceSecretHash: 'sha256:def',
      }),
    );
    // Simulate the upgrade flow writing the linked state.
    const base = (await repo.findById(asGuestIdentityId('guest-2')))!;
    await repo.save({
      ...base,
      upgradeStatus: 'upgraded',
      linkedUserId: 'cloud-user-9' as never,
    });

    const linked = await repo.findByLinkedUserId('cloud-user-9' as never);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.upgradeStatus).toBe('upgraded');
  });

  it('soft-deleted identities are invisible', async () => {
    await repo.save(
      createGuestIdentity({
        id: asGuestIdentityId('guest-3'),
        displayName: 'Chen',
        deviceSecretHash: 'sha256:xyz',
      }),
    );
    await repo.softDelete(asGuestIdentityId('guest-3'), {
      actorId: 'guest-3' as never,
      deletedAt: asDateTime(new Date().toISOString()),
      reason: 'test',
    });
    expect(await repo.findById(asGuestIdentityId('guest-3'))).toBeNull();
  });
});

describe('SqliteAccountDeletionRepository', () => {
  let db: InMemoryDatabase;
  let repo: SqliteAccountDeletionRepository;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    repo = new SqliteAccountDeletionRepository(db);
  });

  it('saves and finds the ACTIVE scheduled request for a user', async () => {
    const now = new Date().toISOString();
    await repo.save({
      id: 'del-1' as never,
      userId: 'user-1' as never,
      status: 'scheduled',
      requestedAt: asDateTime(now),
      recoveryDeadlineAt: asDateTime(new Date(Date.now() + 14 * 86400_000).toISOString()),
      version: 1,
    });

    const active = await repo.findActiveByUser('user-1' as never);
    expect(active?.id).toBe('del-1');
    expect(active?.status).toBe('scheduled');
    expect(await repo.findById('del-1')).not.toBeNull();
  });

  it('cancelled requests are no longer active', async () => {
    await repo.save({
      id: 'del-2' as never,
      userId: 'user-2' as never,
      status: 'scheduled',
      requestedAt: asDateTime(new Date().toISOString()),
      recoveryDeadlineAt: asDateTime(new Date(Date.now() + 86400_000).toISOString()),
      version: 1,
    });
    await repo.save({
      id: 'del-2' as never,
      userId: 'user-2' as never,
      status: 'cancelled',
      requestedAt: asDateTime(new Date().toISOString()),
      recoveryDeadlineAt: asDateTime(new Date(Date.now() + 86400_000).toISOString()),
      version: 2,
    });

    expect(await repo.findActiveByUser('user-2' as never)).toBeNull();
    // The cancelled record is still retrievable by id (support tooling).
    expect((await repo.findById('del-2'))?.status).toBe('cancelled');
  });

  it('users are isolated — no cross-user active leaks', async () => {
    await repo.save({
      id: 'del-3' as never,
      userId: 'user-3' as never,
      status: 'scheduled',
      requestedAt: asDateTime(new Date().toISOString()),
      recoveryDeadlineAt: asDateTime(new Date(Date.now() + 86400_000).toISOString()),
      version: 1,
    });
    expect(await repo.findActiveByUser('someone-else' as never)).toBeNull();
  });
});
