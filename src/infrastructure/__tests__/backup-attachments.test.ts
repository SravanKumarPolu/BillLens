/**
 * Receipt attachments in encrypted backups.
 *
 * Uses a real temporary filesystem for image bytes and real SQLite for tables.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from '@jest/globals';

import type {
  BackupAttachmentBytes,
  BackupAttachmentStore,
} from '@application/backup/backup.usecases';
import {
  BACKUP_TABLES,
  CreateBackupUseCase,
  InspectBackupUseCase,
  RestoreBackupUseCase,
} from '@application/backup/backup.usecases';
import { SqliteBackupStore } from '@infrastructure/sqlite/sqlite-backup-store';
import { encryptBackup } from '@application/backup/backup-crypto';
import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const GROUP = 'g_attach';
const OWNER = 'm_attach_owner';
const USER = 'local-user';
const PASSWORD = 'backup passphrase 123';

const dir = mkdtempSync(join(tmpdir(), 'billlens-attach-'));
const imageDir = join(dir, 'images');
const restoreDir = join(dir, 'restored');
mkdirSync(imageDir, { recursive: true });
mkdirSync(restoreDir, { recursive: true });

const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=';

class FsAttachmentStore implements BackupAttachmentStore {
  constructor(
    private readonly root: string,
    private readonly available: number | null = 100 * 1024 * 1024,
  ) {}

  async read(uri: string): Promise<BackupAttachmentBytes | null> {
    const path = uri.replace(/^file:\/\//, '');
    if (!existsSync(path)) return null;
    const buffer = readFileSync(path);
    return {
      base64: buffer.toString('base64'),
      sizeBytes: buffer.length,
      mimeType: 'image/jpeg',
    };
  }

  async write(id: string, base64: string, extension: string): Promise<string> {
    const path = join(this.root, `${id}.${extension}`);
    writeFileSync(path, Buffer.from(base64, 'base64'));
    return `file://${path}`;
  }

  async remove(uri: string): Promise<void> {
    const path = uri.replace(/^file:\/\//, '');
    if (existsSync(path)) rmSync(path);
  }

  async availableBytes(): Promise<number | null> {
    return this.available;
  }
}

async function open(name: string): Promise<{ db: SqliteCliDatabase; services: AppServices }> {
  const db = new SqliteCliDatabase(join(dir, name));
  await runMigrations(db);
  return { db, services: createCompositionRoot({ database: db, appVersion: '2.19.0' }) };
}

async function seed(services: AppServices, db: SqliteCliDatabase): Promise<string> {
  await services.repositories.groups.save(
    createGroup({
      id: GROUP as never,
      name: 'Attachments',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: OWNER as never,
      groupId: GROUP as never,
      userId: USER as never,
      displayName: 'Owner',
      role: 'owner',
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  await db.exec('create table if not exists _dummy (id text)');
  return GROUP;
}

async function insertReceipt(
  db: SqliteCliDatabase,
  id: string,
  imageUri: string | null,
): Promise<void> {
  await db.run(
    `insert into receipts (
       id, group_id, source, storage_mode, uploaded_by, created_at, updated_at,
       image_uri, client_created_at, client_updated_at, version
     ) values (?, ?, 'paper', 'local_only', ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      GROUP,
      USER,
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      imageUri,
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    ],
  );
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('receipt attachments in backups', () => {
  it('backs up and restores image bytes with rewritten local URIs', async () => {
    const { db, services } = await open('source.db');
    await seed(services, db);
    const imagePath = join(imageDir, 'receipt.jpg');
    writeFileSync(imagePath, Buffer.from(JPEG_BASE64, 'base64'));
    await insertReceipt(db, 'r1', `file://${imagePath}`);

    const creator = new CreateBackupUseCase(
      new SqliteBackupStore(db),
      new FsAttachmentStore(imageDir),
      '2.19.0',
    );
    const created = await creator.execute(PASSWORD, { includeImages: true });
    expect(created.preview.attachmentCount).toBe(1);
    expect(created.preview.attachmentBytes).toBeGreaterThan(0);

    const target = await open('target.db');
    const newStore = new FsAttachmentStore(restoreDir);
    const restorer = new RestoreBackupUseCase(new SqliteBackupStore(target.db), newStore);
    const preview = await restorer.execute(created.envelopeJson, PASSWORD);
    expect(preview.attachmentCount).toBe(1);

    const row = await target.db.get<{ image_uri: string }>(
      "select image_uri from receipts where id = 'r1'",
    );
    expect(row?.image_uri).not.toBe(`file://${imagePath}`);
    expect(row?.image_uri?.startsWith('file://')).toBe(true);
    const restoredPath = row?.image_uri?.replace(/^file:\/\//, '') ?? '';
    expect(readFileSync(restoredPath).toString('base64')).toBe(JPEG_BASE64);
  }, 30_000);

  it('deduplicates identical files shared by two receipts', async () => {
    const { db, services } = await open('dedupe-source.db');
    await seed(services, db);
    const imagePath = join(imageDir, 'shared.jpg');
    writeFileSync(imagePath, Buffer.from(JPEG_BASE64, 'base64'));
    await insertReceipt(db, 'r2', `file://${imagePath}`);
    await insertReceipt(db, 'r3', `file://${imagePath}`);

    const creator = new CreateBackupUseCase(
      new SqliteBackupStore(db),
      new FsAttachmentStore(imageDir),
      '2.19.0',
    );
    const created = await creator.execute(PASSWORD, { includeImages: true });
    expect(created.preview.attachmentCount).toBe(1);
  }, 30_000);

  it('warns about missing images but still backs up financial data', async () => {
    const { db, services } = await open('missing.db');
    await seed(services, db);
    await insertReceipt(db, 'r4', 'file:///definitely/missing.jpg');
    const creator = new CreateBackupUseCase(
      new SqliteBackupStore(db),
      new FsAttachmentStore(imageDir),
      '2.19.0',
    );
    const created = await creator.execute(PASSWORD, { includeImages: true });
    expect(created.preview.missingImages).toHaveLength(1);
    expect(created.preview.attachmentCount).toBe(0);
    expect(created.preview.counts.groups).toBe(1);
  }, 30_000);

  it('restores a v1 financial-only payload', async () => {
    const source = await open('v1-source.db');
    await seed(source.services, source.db);
    const tables = await source.services.backup.create.execute(PASSWORD);
    // A v1 payload is the same table shape without attachments.
    const store = new SqliteBackupStore(source.db);
    const tableRows = await store.readTables(BACKUP_TABLES);
    const v1 = await encryptBackup(
      JSON.stringify({
        format: 'billlens-backup',
        version: 1,
        schemaVersion: await store.getSchemaVersion(),
        appVersion: '2.16.0',
        exportedAt: new Date().toISOString(),
        tables: tableRows,
      }),
      PASSWORD,
    );
    void tables;

    const target = await open('v1-target.db');
    const targetStore = new SqliteBackupStore(target.db);
    const restorer = new RestoreBackupUseCase(targetStore, new FsAttachmentStore(restoreDir));
    const preview = await restorer.execute(JSON.stringify(v1), PASSWORD);
    expect(preview.formatVersion).toBe(1);
    expect(preview.includesAttachments).toBe(false);
    const group = await target.db.get<{ name: string }>(
      "select name from groups where id = 'g_attach'",
    );
    expect(group?.name).toBe('Attachments');
  }, 30_000);

  it('refuses to restore when free storage is insufficient', async () => {
    const { db } = await open('storage-source.db');
    const imagePath = join(imageDir, 'storage.jpg');
    writeFileSync(imagePath, Buffer.from(JPEG_BASE64, 'base64'));
    await insertReceipt(db, 'r5', `file://${imagePath}`);
    const creator = new CreateBackupUseCase(
      new SqliteBackupStore(db),
      new FsAttachmentStore(imageDir),
      '2.19.0',
    );
    const created = await creator.execute(PASSWORD, { includeImages: true });

    const target = await open('storage-target.db');
    const restorer = new RestoreBackupUseCase(
      new SqliteBackupStore(target.db),
      new FsAttachmentStore(join(dir, 'no-space'), 0),
    );
    await expect(restorer.execute(created.envelopeJson, PASSWORD)).rejects.toThrow(
      /Not enough free storage/,
    );
    const groups = await target.db.get<{ count: number }>('select count(*) as count from groups');
    expect(groups?.count).toBe(0);
  }, 30_000);

  it('removes staged files when the database transaction fails', async () => {
    const { db } = await open('rollback-source.db');
    const imagePath = join(imageDir, 'rollback.jpg');
    writeFileSync(imagePath, Buffer.from(JPEG_BASE64, 'base64'));
    await insertReceipt(db, 'r6', `file://${imagePath}`);
    const creator = new CreateBackupUseCase(
      new SqliteBackupStore(db),
      new FsAttachmentStore(imageDir),
      '2.19.0',
    );
    const created = await creator.execute(PASSWORD, { includeImages: true });

    const rollbackDir = join(dir, 'rollback-files');
    mkdirSync(rollbackDir, { recursive: true });
    const failingStore = {
      getSchemaVersion: async () => 12,
      readTables: async () => ({}),
      replaceTables: async () => {
        throw new Error('simulated transaction failure');
      },
    };
    const restorer = new RestoreBackupUseCase(failingStore, new FsAttachmentStore(rollbackDir));
    await expect(restorer.execute(created.envelopeJson, PASSWORD)).rejects.toThrow(
      /simulated transaction failure/,
    );
    expect(readdirSync(rollbackDir)).toEqual([]);
  }, 30_000);

  it('rejects an unsupported backup payload version', async () => {
    const { db } = await open('version-source.db');
    const store = new SqliteBackupStore(db);
    const payload = await encryptBackup(
      JSON.stringify({
        format: 'billlens-backup',
        version: 3,
        schemaVersion: 12,
        appVersion: '9.0.0',
        exportedAt: new Date().toISOString(),
        tables: {},
      }),
      PASSWORD,
    );
    await expect(
      new InspectBackupUseCase(store).execute(JSON.stringify(payload), PASSWORD),
    ).rejects.toThrow(/not supported/);
  }, 30_000);

  it('rejects a hash mismatch and leaves target data untouched', async () => {
    const { db, services } = await open('hash-source.db');
    await seed(services, db);
    const created = await services.backup.create.execute(PASSWORD, { includeImages: true });
    const envelope = JSON.parse(created.envelopeJson) as Record<string, string>;
    // Decrypt/re-encrypt is intentionally not bypassed: tampered ciphertext is
    // covered by the existing AEAD test. This checks the in-payload hash guard
    // through a synthetic v2 payload.
    const store = new SqliteBackupStore(db);
    const payload = JSON.stringify({
      format: 'billlens-backup',
      version: 2,
      schemaVersion: await store.getSchemaVersion(),
      appVersion: '2.19.0',
      exportedAt: new Date().toISOString(),
      tables: await store.readTables(BACKUP_TABLES),
      attachments: [
        {
          id: 'receipt-bad',
          originalUris: ['file:///x.jpg'],
          sha256: '0'.repeat(64),
          sizeBytes: 100,
          mimeType: 'image/jpeg',
          extension: 'jpg',
          base64: JPEG_BASE64,
        },
      ],
    });
    const tampered = await encryptBackup(payload, PASSWORD);
    void envelope;

    const target = await open('hash-target.db');
    const targetStore = new SqliteBackupStore(target.db);
    const restorer = new RestoreBackupUseCase(targetStore, new FsAttachmentStore(restoreDir));
    await expect(restorer.execute(JSON.stringify(tampered), PASSWORD)).rejects.toThrow(/integrity/);
    const groups = await target.db.get<{ count: number }>('select count(*) as count from groups');
    expect(groups?.count).toBe(0);
  }, 30_000);
});
