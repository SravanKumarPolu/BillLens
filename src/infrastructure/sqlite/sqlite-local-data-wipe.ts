/** SQLite implementation of the full local-data wipe. */

import type {
  LocalDataWipePreview,
  LocalDataWipeStore,
} from '@application/retention/wipe-local-data.usecase';

import type { DatabaseConnection } from './database-connection';

export class SqliteLocalDataWipe implements LocalDataWipeStore {
  constructor(private readonly db: DatabaseConnection) {}

  private async count(table: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(`select count(*) as count from ${table}`);
    return Number(row?.count ?? 0);
  }

  async preview(): Promise<LocalDataWipePreview> {
    return {
      groups: await this.count('groups'),
      expenses: await this.count('expenses'),
      settlements: await this.count('settlements'),
      receipts: await this.count('receipts'),
    };
  }

  async wipe(): Promise<{ readonly filesQueued: number }> {
    await this.db.exec('pragma foreign_keys = off');
    try {
      return await this.db.transaction(async (tx) => {
        const images = await tx.all<{ uri: string }>(
          `select image_uri as uri from receipts where image_uri is not null and image_uri <> ''
           union
           select image_uri as uri from capture_sources where image_uri is not null and image_uri <> ''`,
        );
        const now = new Date().toISOString();
        let queued = 0;
        for (const [index, row] of images.entries()) {
          await tx.run(
            `insert into file_cleanup_queue
               (id, uri, reason, attempts, last_error, next_attempt_at, created_at, updated_at)
             values (?, ?, 'local_data_erased', 0, null, ?, ?, ?)`,
            [`wipe-${Date.now()}-${index}`, row.uri, now, now, now],
          );
          queued += 1;
        }

        const tables = await tx.all<{ name: string }>(
          `select name from sqlite_master
           where type = 'table' and name not in ('schema_version', 'file_cleanup_queue')
             and name not like 'sqlite_%'`,
        );
        for (const table of tables) {
          if (!/^[a-z_][a-z0-9_]*$/.test(table.name)) continue;
          await tx.run(`delete from ${table.name}`);
        }
        return { filesQueued: queued };
      });
    } finally {
      await this.db.exec('pragma foreign_keys = on');
    }
  }
}
