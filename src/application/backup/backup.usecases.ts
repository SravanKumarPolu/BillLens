/**
 * Logical local backup and restore.
 *
 * Backups are table-level snapshots of the financial data only — never tokens,
 * sync cursors, analytics or feedback. Receipt image files are NOT included;
 * only their metadata rows are, and the UI says so.
 *
 * Restore replaces only the backed-up tables, inside one SQLite transaction.
 * Unsupported schema versions are rejected instead of being partially applied.
 */

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

export interface BackupPayload {
  readonly format: 'billlens-backup';
  readonly version: 1;
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly tables: Record<string, readonly BackupRow[]>;
}

export interface BackupCounts {
  readonly groups: number;
  readonly expenses: number;
  readonly settlements: number;
  readonly rows: number;
}

export interface BackupPreview {
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly counts: BackupCounts;
}

export interface CreatedBackup {
  readonly envelopeJson: string;
  readonly preview: BackupPreview;
  readonly filename: string;
}

function countRows(tables: Record<string, readonly BackupRow[]>): BackupCounts {
  const counts = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
  return {
    groups: tables.groups?.length ?? 0,
    expenses: tables.expenses?.length ?? 0,
    settlements: tables.settlements?.length ?? 0,
    rows: counts,
  };
}

function parsePayload(json: string, expectedSchema: number): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Backup contents are not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Backup contents are invalid.');
  const payload = parsed as Record<string, unknown>;
  if (payload.format !== 'billlens-backup' || payload.version !== 1) {
    throw new Error('Unrecognised backup contents.');
  }
  if (payload.schemaVersion !== expectedSchema) {
    throw new Error(
      `This backup uses database version ${String(payload.schemaVersion)}; this app supports ${expectedSchema}.`,
    );
  }
  if (typeof payload.tables !== 'object' || payload.tables === null) {
    throw new Error('Backup has no table data.');
  }
  const tables = payload.tables as Record<string, unknown>;
  for (const table of BACKUP_TABLES) {
    const rows = tables[table];
    if (!Array.isArray(rows)) throw new Error(`Backup is missing the ${table} table.`);
    // Rows are validated by the adapter (column allowlist) before insert.
  }
  return {
    format: 'billlens-backup',
    version: 1,
    schemaVersion: expectedSchema,
    appVersion: typeof payload.appVersion === 'string' ? payload.appVersion : 'unknown',
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : '',
    tables: tables as Record<string, readonly BackupRow[]>,
  };
}

export class CreateBackupUseCase {
  constructor(
    private readonly store: BackupStore,
    private readonly appVersion: string,
  ) {}

  async execute(password: string): Promise<CreatedBackup> {
    const schemaVersion = await this.store.getSchemaVersion();
    const tables = await this.store.readTables(BACKUP_TABLES);
    const payload: BackupPayload = {
      format: 'billlens-backup',
      version: 1,
      schemaVersion,
      appVersion: this.appVersion,
      exportedAt: new Date().toISOString(),
      tables,
    };
    const envelope = await encryptBackup(JSON.stringify(payload), password);
    return {
      envelopeJson: JSON.stringify(envelope),
      preview: {
        schemaVersion,
        exportedAt: payload.exportedAt,
        appVersion: this.appVersion,
        counts: countRows(tables),
      },
      filename: `billlens-backup-${payload.exportedAt.slice(0, 10)}.billlens`,
    };
  }
}

export class InspectBackupUseCase {
  constructor(private readonly store: BackupStore) {}

  async execute(envelopeJson: string, password: string): Promise<BackupPreview> {
    const schemaVersion = await this.store.getSchemaVersion();
    const json = await decryptBackup(envelopeJson, password);
    const payload = parsePayload(json, schemaVersion);
    return {
      schemaVersion: payload.schemaVersion,
      exportedAt: payload.exportedAt,
      appVersion: payload.appVersion,
      counts: countRows(payload.tables),
    };
  }
}

export class RestoreBackupUseCase {
  constructor(private readonly store: BackupStore) {}

  /**
   * Destructive: replaces the backed-up tables. The caller must preview and
   * explicitly confirm before invoking this.
   */
  async execute(envelopeJson: string, password: string): Promise<BackupPreview> {
    const schemaVersion = await this.store.getSchemaVersion();
    const json = await decryptBackup(envelopeJson, password);
    const payload = parsePayload(json, schemaVersion);
    await this.store.replaceTables(payload.tables);
    return {
      schemaVersion: payload.schemaVersion,
      exportedAt: payload.exportedAt,
      appVersion: payload.appVersion,
      counts: countRows(payload.tables),
    };
  }
}
