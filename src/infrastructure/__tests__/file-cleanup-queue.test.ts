/**
 * Durable receipt-file cleanup outbox.
 *
 * Verifies intent is written in the deletion transaction, shared files are
 * never queued, retries survive a restart, and missing files complete safely.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from '@jest/globals';

import { ProcessFileCleanupQueueUseCase } from '@application/backup/file-cleanup.usecases';
import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { SqliteFileCleanupStore } from '@infrastructure/sqlite/sqlite-file-cleanup-store';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const USER = 'local-user';
const dir = mkdtempSync(join(tmpdir(), 'billlens-cleanup-'));
let counter = 0;

async function open(name: string): Promise<{ db: SqliteCliDatabase; services: AppServices }> {
  const db = new SqliteCliDatabase(join(dir, name));
  await runMigrations(db);
  return { db, services: createCompositionRoot({ database: db }) };
}

async function seedGroup(
  services: AppServices,
  name: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  await services.repositories.groups.save(
    createGroup({
      id: groupId as never,
      name,
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: memberId as never,
      groupId: groupId as never,
      userId: USER as never,
      displayName: 'Owner',
      role: 'owner',
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
}

async function addReceipt(db: SqliteCliDatabase, groupId: string, uri: string): Promise<void> {
  counter += 1;
  await db.run(
    `insert into receipts (
       id, group_id, source, storage_mode, uploaded_by, created_at, updated_at,
       image_uri, client_created_at, client_updated_at, version
     ) values (?, ?, 'paper', 'local_only', ?, ?, ?, ?, ?, ?, 1)`,
    [
      `r${counter}`,
      groupId,
      USER,
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      uri,
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    ],
  );
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('file cleanup outbox', () => {
  it('queues a deleted group receipt and processes it after a restart', async () => {
    const first = await open('queue.db');
    await seedGroup(first.services, 'Delete me', 'g_cleanup_a', 'm_cleanup_a');
    await addReceipt(first.db, 'g_cleanup_a', 'file:///tmp/receipt-a.jpg');

    const result = await first.services.groups.deleteGroup.execute({
      groupId: 'g_cleanup_a',
      confirmationName: 'Delete me',
      secondConfirmation: true,
    });
    expect(result.filesQueued).toBe(1);

    const queued = await first.db.all<{ uri: string; completed_at: string | null }>(
      'select uri, completed_at from file_cleanup_queue',
    );
    expect(queued).toEqual([{ uri: 'file:///tmp/receipt-a.jpg', completed_at: null }]);

    // Simulate app restart: a new connection/service reads the persisted queue.
    const restarted = await open('queue.db');
    const removed: string[] = [];
    const processor = new ProcessFileCleanupQueueUseCase(
      new SqliteFileCleanupStore(restarted.db),
      async (uri) => {
        removed.push(uri);
      },
    );
    const processed = await processor.execute('2099-01-01T00:00:00.000Z');
    expect(processed.completed).toBe(1);
    expect(removed).toEqual(['file:///tmp/receipt-a.jpg']);
    const done = await restarted.db.get<{ completed_at: string | null }>(
      'select completed_at from file_cleanup_queue where uri = ?',
      ['file:///tmp/receipt-a.jpg'],
    );
    expect(done?.completed_at).not.toBeNull();
  }, 20_000);

  it('does not queue a file still referenced by another group', async () => {
    const { db, services } = await open('shared.db');
    await seedGroup(services, 'One', 'g_cleanup_b', 'm_cleanup_b');
    await seedGroup(services, 'Two', 'g_cleanup_c', 'm_cleanup_c');
    await addReceipt(db, 'g_cleanup_b', 'file:///tmp/shared.jpg');
    await addReceipt(db, 'g_cleanup_c', 'file:///tmp/shared.jpg');

    const result = await services.groups.deleteGroup.execute({
      groupId: 'g_cleanup_b',
      confirmationName: 'One',
      secondConfirmation: true,
    });
    expect(result.filesQueued).toBe(0);
    const queue = await db.get<{ count: number }>('select count(*) as count from file_cleanup_queue');
    expect(queue?.count).toBe(0);
  }, 20_000);

  it('retries a failed unlink with backoff and completes on the next run', async () => {
    const { db } = await open('retry.db');
    await db.run(
      `insert into file_cleanup_queue
         (id, uri, reason, attempts, last_error, next_attempt_at, created_at, updated_at)
       values ('j1', 'file:///tmp/flaky.jpg', 'group_deleted', 0, null, ?, ?, ?)`,
      ['2026-10-22T00:00:00.000Z', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z'],
    );
    let attempts = 0;
    const processor = new ProcessFileCleanupQueueUseCase(
      new SqliteFileCleanupStore(db),
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('device busy');
      },
    );

    const first = await processor.execute('2026-10-22T00:00:00.000Z');
    expect(first.retried).toBe(1);
    const row = await db.get<{ attempts: number; next_attempt_at: string }>(
      "select attempts, next_attempt_at from file_cleanup_queue where id = 'j1'",
    );
    expect(row?.attempts).toBe(1);
    expect(row?.next_attempt_at).toBe('2026-10-22T00:01:00.000Z');

    const second = await processor.execute('2026-10-22T00:01:00.000Z');
    expect(second.completed).toBe(1);
  }, 20_000);

  it('completes missing files and stops retrying after the attempt cap', async () => {
    const { db } = await open('missing.db');
    await db.run(
      `insert into file_cleanup_queue
         (id, uri, reason, attempts, last_error, next_attempt_at, created_at, updated_at)
       values ('j2', 'file:///tmp/missing.jpg', 'group_deleted', 0, null, ?, ?, ?)`,
      ['2026-10-22T00:00:00.000Z', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z'],
    );
    // A missing file is a successful no-op remover in production.
    const processor = new ProcessFileCleanupQueueUseCase(
      new SqliteFileCleanupStore(db),
      async () => undefined,
    );
    const result = await processor.execute('2026-10-22T00:00:00.000Z');
    expect(result.completed).toBe(1);

    await db.run(
      `insert into file_cleanup_queue
         (id, uri, reason, attempts, last_error, next_attempt_at, created_at, updated_at)
       values ('j3', 'file:///tmp/permanent.jpg', 'group_deleted', 4, 'locked', ?, ?, ?)`,
      ['2026-10-22T00:00:00.000Z', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z'],
    );
    const permanent = new ProcessFileCleanupQueueUseCase(
      new SqliteFileCleanupStore(db),
      async () => {
        throw new Error('locked');
      },
    );
    const final = await permanent.execute('2026-10-22T00:00:00.000Z');
    expect(final.failedPermanently).toBe(1);
    const row = await db.get<{ next_attempt_at: string }>(
      "select next_attempt_at from file_cleanup_queue where id = 'j3'",
    );
    expect(row?.next_attempt_at).toBe('9999-12-31T00:00:00.000Z');
  }, 20_000);
});
