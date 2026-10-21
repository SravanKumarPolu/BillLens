/** SQLite adapter for the encrypted logical backup. */

import type {
  BackupRow,
  BackupStore,
  BackupTableName,
} from '@application/backup/backup.usecases';
import { BACKUP_TABLES } from '@application/backup/backup.usecases';

import type { DatabaseConnection, SqlParam } from './database-connection';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertTable(table: string): asserts table is BackupTableName {
  if (!(BACKUP_TABLES as readonly string[]).includes(table) || !IDENTIFIER.test(table)) {
    throw new Error(`Refusing to back up unknown table: ${table}`);
  }
}

export class SqliteBackupStore implements BackupStore {
  constructor(private readonly db: DatabaseConnection) {}

  async getSchemaVersion(): Promise<number> {
    const row = await this.db.get<{ version: number }>(
      'select max(version) as version from schema_version',
    );
    return Number(row?.version ?? 0);
  }

  async readTables(
    tables: readonly BackupTableName[],
  ): Promise<Record<string, readonly BackupRow[]>> {
    const result: Record<string, readonly BackupRow[]> = {};
    for (const table of tables) {
      assertTable(table);
      const rows = await this.db.all<Record<string, unknown>>(`select * from ${table}`);
      result[table] = rows.map((row) => {
        const clean: Record<string, string | number | null> = {};
        for (const [key, value] of Object.entries(row)) {
          if (value === null || typeof value === 'string' || typeof value === 'number') {
            clean[key] = value;
          } else if (typeof value === 'boolean') {
            clean[key] = value ? 1 : 0;
          } else {
            throw new Error(`Unsupported value in ${table}.${key}; backup aborted.`);
          }
        }
        return clean;
      });
    }
    return result;
  }

  async replaceTables(tables: Record<string, readonly BackupRow[]>): Promise<void> {
    for (const table of Object.keys(tables)) assertTable(table);

    await this.db.transaction(async (tx) => {
      // Reverse dependency order: children before parents.
      for (const table of [...BACKUP_TABLES].reverse()) {
        await tx.run(`delete from ${table}`);
      }

      for (const table of BACKUP_TABLES) {
        const rows = tables[table] ?? [];
        if (rows.length === 0) continue;
        const columns = await tx.all<{ name: string }>(`pragma table_info(${table})`);
        const allowed = new Set(columns.map((column) => column.name));
        for (const row of rows) {
          const keys = Object.keys(row);
          for (const key of keys) {
            if (!IDENTIFIER.test(key) || !allowed.has(key)) {
              throw new Error(`Backup contains an unknown column ${table}.${key}.`);
            }
          }
          if (keys.length === 0) continue;
          await tx.run(
            `insert into ${table} (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`,
            keys.map((key) => row[key] as SqlParam),
          );
        }
      }
    });
  }
}
