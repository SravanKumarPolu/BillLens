/**
 * Logical local backup and restore.
 *
 * Backup format v2 adds authenticated receipt attachments. v1 payloads (no
 * attachments) remain readable. Backups are table snapshots of financial data
 * only — never tokens, sync cursors, analytics or feedback.
 *
 * Restore stages attachment files before the SQLite transaction. If the
 * transaction fails, staged files are removed and the previous database is
 * unchanged. Filesystem and SQL are not one atomic unit; this is an explicit
 * staged-write strategy, not a claim of cross-resource atomicity.
 */

import { sha256 } from '@noble/hashes/sha256';

import { toHex, utf8ToBytes } from '@domain/sync-crypto/encoding';

import { decryptBackup, encryptBackup } from './backup-crypto';

export type BackupCell = string | number | null;
export type BackupRow = Readonly<Record<string, BackupCell>>;

/** Parent tables first; restore deletes in reverse. */
export const BACKUP_TABLES = [
  'groups',
  'group_members',
  'capture_sources',
  'receipts',
  'extraction_results',
  'receipt_items',
  'expenses',
  'expense_payers',
  'expense_splits',
  'settlements',
  'settlement_state_history',
  'recurring_expenses',
  'recurring_occurrences',
  'payment_evidence',
  'member_payment_handles',
  'settlement_reminders',
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

export interface BackupStore {
  getSchemaVersion(): Promise<number>;
  readTables(tables: readonly BackupTableName[]): Promise<Record<string, readonly BackupRow[]>>;
  replaceTables(tables: Record<string, readonly BackupRow[]>): Promise<void>;
}

export interface BackupAttachmentBytes {
  readonly base64: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

/** File I/O port used for receipt images. Implemented by Expo in production. */
export interface BackupAttachmentStore {
  read(uri: string): Promise<BackupAttachmentBytes | null>;
  write(id: string, base64: string, extension: string): Promise<string>;
  remove(uri: string): Promise<void>;
  availableBytes(): Promise<number | null>;
}

export interface BackupAttachment {
  readonly id: string;
  readonly originalUris: readonly string[];
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly extension: string;
  readonly base64: string;
}

export interface BackupPayload {
  readonly format: 'billlens-backup';
  readonly version: 1 | 2;
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly tables: Record<string, readonly BackupRow[]>;
  readonly attachments?: readonly BackupAttachment[];
}

export interface BackupCounts {
  readonly groups: number;
  readonly expenses: number;
  readonly settlements: number;
  readonly rows: number;
}

export interface BackupPreview {
  readonly formatVersion: 1 | 2;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly counts: BackupCounts;
  readonly includesAttachments: boolean;
  readonly attachmentCount: number;
  readonly attachmentBytes: number;
  readonly missingImages: readonly string[];
}

export interface CreatedBackup {
  readonly envelopeJson: string;
  readonly preview: BackupPreview;
  readonly filename: string;
}

export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 60 * 1024 * 1024;
export const MAX_ATTACHMENTS = 200;

function countRows(tables: Record<string, readonly BackupRow[]>): BackupCounts {
  const rows = Object.values(tables).reduce((sum, entries) => sum + entries.length, 0);
  return {
    groups: tables.groups?.length ?? 0,
    expenses: tables.expenses?.length ?? 0,
    settlements: tables.settlements?.length ?? 0,
    rows,
  };
}

function attachmentExtension(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const dot = clean.lastIndexOf('.');
  const ext = dot >= 0 ? clean.slice(dot + 1).toLowerCase() : 'jpg';
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
}

function looksLikeImage(base64: string, extension: string): boolean {
  if (base64.length < 16) return false;
  if (base64.startsWith('/9j/')) return true;
  if (base64.startsWith('iVBOR')) return true;
  if (base64.startsWith('R0lGOD')) return true;
  if (base64.startsWith('UklGR')) return true;
  if (extension === 'heic' || extension === 'heif') {
    return base64.startsWith('AAAA') && base64.slice(0, 240).includes('ZnR5cA');
  }
  return false;
}

function hashBase64(base64: string): string {
  return toHex(sha256(utf8ToBytes(base64)));
}

function collectImageUris(tables: Record<string, readonly BackupRow[]>): readonly string[] {
  const uris = new Set<string>();
  for (const rows of Object.values(tables)) {
    for (const row of rows) {
      const uri = row.image_uri;
      if (typeof uri === 'string' && uri.length > 0) uris.add(uri);
    }
  }
  return [...uris];
}

function parsePayload(json: string, currentSchema: number): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Backup contents are not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Backup contents are invalid.');
  const payload = parsed as Record<string, unknown>;
  if (payload.format !== 'billlens-backup') throw new Error('Unrecognised backup contents.');
  if (payload.version !== 1 && payload.version !== 2) {
    throw new Error('This backup version is not supported by this app version.');
  }
  const schemaVersion = Number(payload.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0 || schemaVersion > currentSchema) {
    throw new Error(
      `This backup uses database version ${String(payload.schemaVersion)}; this app supports up to ${currentSchema}.`,
    );
  }
  if (typeof payload.tables !== 'object' || payload.tables === null) {
    throw new Error('Backup has no table data.');
  }
  const rawTables = payload.tables as Record<string, unknown>;
  const tables: Record<string, readonly BackupRow[]> = {};
  for (const table of BACKUP_TABLES) {
    const rows = rawTables[table];
    if (rows === undefined) {
      // v1 backups made before newer tables existed are still restorable.
      tables[table] = [];
      continue;
    }
    if (!Array.isArray(rows)) throw new Error(`Backup table ${table} is malformed.`);
    tables[table] = rows as readonly BackupRow[];
  }
  if ((tables.groups?.length ?? 0) === 0 && (tables.expenses?.length ?? 0) > 0) {
    throw new Error('Backup is missing its groups table.');
  }

  let attachments: readonly BackupAttachment[] = [];
  if (payload.version === 2) {
    if (!Array.isArray(payload.attachments)) {
      throw new Error('Backup is missing its attachment manifest.');
    }
    let total = 0;
    const seen = new Set<string>();
    attachments = payload.attachments.map((raw) => {
      if (typeof raw !== 'object' || raw === null) throw new Error('Backup attachment is invalid.');
      const item = raw as Record<string, unknown>;
      for (const field of ['id', 'sha256', 'base64', 'mimeType', 'extension']) {
        if (typeof item[field] !== 'string' || (item[field] as string).length === 0) {
          throw new Error('Backup attachment is incomplete.');
        }
      }
      if (
        !Array.isArray(item.originalUris) ||
        item.originalUris.some((uri) => typeof uri !== 'string')
      ) {
        throw new Error('Backup attachment URI mapping is invalid.');
      }
      const sizeBytes = Number(item.sizeBytes);
      if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES) {
        throw new Error('Backup attachment size is invalid.');
      }
      total += sizeBytes;
      if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('Backup attachments are too large.');
      if (seen.has(item.sha256 as string)) throw new Error('Backup contains duplicate attachments.');
      seen.add(item.sha256 as string);
      return {
        id: item.id as string,
        originalUris: item.originalUris as readonly string[],
        sha256: item.sha256 as string,
        sizeBytes,
        mimeType: item.mimeType as string,
        extension: item.extension as string,
        base64: item.base64 as string,
      };
    });
    if (attachments.length > MAX_ATTACHMENTS) throw new Error('Too many receipt attachments.');
  }

  return {
    format: 'billlens-backup',
    version: payload.version,
    schemaVersion,
    appVersion: typeof payload.appVersion === 'string' ? payload.appVersion : 'unknown',
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : '',
    tables,
    ...(payload.version === 2 ? { attachments } : {}),
  };
}

function previewOf(payload: BackupPayload, missingImages: readonly string[]): BackupPreview {
  const attachments = payload.attachments ?? [];
  return {
    formatVersion: payload.version,
    schemaVersion: payload.schemaVersion,
    exportedAt: payload.exportedAt,
    appVersion: payload.appVersion,
    counts: countRows(payload.tables),
    includesAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
    attachmentBytes: attachments.reduce((sum, item) => sum + item.sizeBytes, 0),
    missingImages,
  };
}

export class CreateBackupUseCase {
  constructor(
    private readonly store: BackupStore,
    private readonly attachments: BackupAttachmentStore,
    private readonly appVersion: string,
  ) {}

  async execute(
    passphrase: string,
    options: { readonly includeImages?: boolean } = {},
  ): Promise<CreatedBackup> {
    const schemaVersion = await this.store.getSchemaVersion();
    const tables = await this.store.readTables(BACKUP_TABLES);
    const includeImages = options.includeImages === true;
    const missingImages: string[] = [];
    const attachments: BackupAttachment[] = [];

    if (includeImages) {
      const byHash = new Map<string, { attachment: BackupAttachment; uris: string[] }>();
      let totalBytes = 0;
      for (const uri of collectImageUris(tables)) {
        const bytes = await this.attachments.read(uri).catch(() => null);
        if (bytes === null) {
          missingImages.push(uri);
          continue;
        }
        if (bytes.sizeBytes > MAX_ATTACHMENT_BYTES) {
          throw new Error('A receipt image is larger than the 12 MB backup limit.');
        }
        const extension = attachmentExtension(uri);
        if (!looksLikeImage(bytes.base64, extension)) {
          throw new Error('A receipt image has an unsupported or corrupted format.');
        }
        const hash = hashBase64(bytes.base64);
        const existing = byHash.get(hash);
        if (existing !== undefined) {
          existing.uris.push(uri);
          continue;
        }
        if (attachments.length >= MAX_ATTACHMENTS) {
          throw new Error('Too many receipt images for one backup.');
        }
        totalBytes += bytes.sizeBytes;
        if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          throw new Error('Receipt images exceed the 60 MB backup limit.');
        }
        const attachment: BackupAttachment = {
          id: `receipt-${hash.slice(0, 16)}`,
          originalUris: [uri],
          sha256: hash,
          sizeBytes: bytes.sizeBytes,
          mimeType: bytes.mimeType,
          extension,
          base64: bytes.base64,
        };
        byHash.set(hash, { attachment, uris: [uri] });
        attachments.push(attachment);
      }
      for (const entry of byHash.values()) {
        entry.attachment = { ...entry.attachment, originalUris: [...entry.uris] };
      }
      attachments.splice(
        0,
        attachments.length,
        ...[...byHash.values()].map((entry) => entry.attachment),
      );
    }

    const payload: BackupPayload = {
      format: 'billlens-backup',
      version: 2,
      schemaVersion,
      appVersion: this.appVersion,
      exportedAt: new Date().toISOString(),
      tables,
      ...(includeImages ? { attachments } : { attachments: [] }),
    };
    const envelope = await encryptBackup(JSON.stringify(payload), passphrase);
    return {
      envelopeJson: JSON.stringify(envelope),
      preview: previewOf(payload, missingImages),
      filename: `billlens-backup-${payload.exportedAt.slice(0, 10)}.billlens`,
    };
  }
}

export class InspectBackupUseCase {
  constructor(private readonly store: BackupStore) {}

  async execute(envelopeJson: string, passphrase: string): Promise<BackupPreview> {
    const schemaVersion = await this.store.getSchemaVersion();
    const json = await decryptBackup(envelopeJson, passphrase);
    const payload = parsePayload(json, schemaVersion);
    for (const attachment of payload.attachments ?? []) {
      if (hashBase64(attachment.base64) !== attachment.sha256) {
        throw new Error('Backup attachment integrity check failed.');
      }
    }
    return previewOf(payload, []);
  }
}

export class RestoreBackupUseCase {
  constructor(
    private readonly store: BackupStore,
    private readonly attachments: BackupAttachmentStore,
  ) {}

  /**
   * Destructive: replaces the backed-up tables. Caller previews and confirms.
   * Attachments are staged first; on SQL failure staged files are removed.
   */
  async execute(envelopeJson: string, passphrase: string): Promise<BackupPreview> {
    const schemaVersion = await this.store.getSchemaVersion();
    const json = await decryptBackup(envelopeJson, passphrase);
    const payload = parsePayload(json, schemaVersion);
    const attachmentList = payload.attachments ?? [];

    for (const attachment of attachmentList) {
      if (hashBase64(attachment.base64) !== attachment.sha256) {
        throw new Error('Backup attachment integrity check failed.');
      }
      if (!looksLikeImage(attachment.base64, attachment.extension)) {
        throw new Error('Backup contains an unsupported receipt image.');
      }
    }

    const available = await this.attachments.availableBytes();
    const required = attachmentList.reduce((sum, item) => sum + item.sizeBytes, 0);
    if (available !== null && required > available) {
      throw new Error('Not enough free storage to restore receipt images.');
    }

    const staged: string[] = [];
    const uriMap = new Map<string, string>();
    try {
      for (const attachment of attachmentList) {
        const uri = await this.attachments.write(
          attachment.id,
          attachment.base64,
          attachment.extension,
        );
        staged.push(uri);
        for (const original of attachment.originalUris) uriMap.set(original, uri);
      }

      const rewritten: Record<string, readonly BackupRow[]> = {};
      for (const [table, rows] of Object.entries(payload.tables)) {
        rewritten[table] = rows.map((row) => {
          const next: Record<string, BackupCell> = {};
          for (const [key, value] of Object.entries(row)) {
            next[key] =
              typeof value === 'string' && uriMap.has(value)
                ? (uriMap.get(value) as string)
                : value;
          }
          return next;
        });
      }

      await this.store.replaceTables(rewritten);
    } catch (error) {
      await Promise.all(staged.map((uri) => this.attachments.remove(uri).catch(() => undefined)));
      throw error;
    }

    return previewOf(payload, []);
  }
}
