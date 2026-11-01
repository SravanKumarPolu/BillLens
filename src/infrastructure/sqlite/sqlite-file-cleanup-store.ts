/** SQLite-backed receipt-file cleanup outbox. */

import type {
  FileCleanupJob,
  FileCleanupStore,
} from '@application/backup/file-cleanup.usecases';

import type { DatabaseConnection } from './database-connection';

export class SqliteFileCleanupStore implements FileCleanupStore {
  constructor(private readonly db: DatabaseConnection) {}

  async listDue(now: string, limit: number): Promise<readonly FileCleanupJob[]> {
    const rows = await this.db.all<{
      id: string;
      uri: string;
      attempts: number;
      reason: string;
    }>(
      `select id, uri, attempts, reason from file_cleanup_queue
       where completed_at is null and next_attempt_at <= ?
       order by next_attempt_at asc limit ?`,
      [now, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      uri: row.uri,
      attempts: Number(row.attempts),
      reason: row.reason,
    }));
  }

  async markComplete(id: string, now: string): Promise<void> {
    await this.db.run(
      'update file_cleanup_queue set completed_at = ?, updated_at = ?, last_error = null where id = ?',
      [now, now, id],
    );
  }

  async reschedule(id: string, error: string, nextAttemptAt: string, now: string): Promise<void> {
    await this.db.run(
      `update file_cleanup_queue
       set attempts = attempts + 1, last_error = ?, next_attempt_at = ?, updated_at = ?
       where id = ?`,
      [error, nextAttemptAt, now, id],
    );
  }

  async pruneCompleted(before: string, limit: number): Promise<number> {
    const result = await this.db.run(
      `delete from file_cleanup_queue where id in (
         select id from file_cleanup_queue where completed_at is not null and completed_at < ? limit ?
       )`,
      [before, limit],
    );
    return result.rowsAffected;
  }
}
