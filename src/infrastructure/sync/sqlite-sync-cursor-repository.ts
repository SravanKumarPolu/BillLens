import type {
  SyncCursorRecord,
  SyncCursorRepository,
} from '@domain/repositories/sync-cursor.repository';
import type { SyncEntityType } from '@domain/repositories/sync.repository';
import { nowDateTime } from '@domain/value-objects';

import type { DatabaseConnection } from '../sqlite/database-connection';

/**
 * SQLite-backed `SyncCursorRepository` — v2.6.0 (bidirectional sync).
 *
 * Stores one incremental-download checkpoint per entity collection in
 * the local `sync_cursors` table (migration 0007). The cursor value is
 * opaque to this repository — the owning download port produces and
 * consumes it.
 *
 * Crash-safety: the download coordinator saves the cursor only AFTER a
 * page of remote changes has been applied locally. If the app dies
 * between apply and save, the next pull replays the page — which is
 * safe because applying a remote row is version-guarded (same version
 * → skip) and therefore idempotent.
 */
export class SqliteSyncCursorRepository implements SyncCursorRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async get(entityType: SyncEntityType): Promise<string | null> {
    const row = await this.db.get<{ cursor_value: string }>(
      `select cursor_value from sync_cursors where entity_type = ?`,
      [entityType],
    );
    return row?.cursor_value ?? null;
  }

  async save(entityType: SyncEntityType, cursorValue: string): Promise<void> {
    // delete-then-insert inside one transaction (atomic on both the
    // production SQLite engine and the in-memory test double, which
    // deliberately does not implement upsert syntax). The table holds
    // at most one row per collection — a rewrite is a cursor advance.
    const updatedAt = nowDateTime() as string;
    await this.db.transaction(async (tx) => {
      await tx.run(`delete from sync_cursors where entity_type = ?`, [entityType]);
      await tx.run(
        `insert into sync_cursors (entity_type, cursor_value, cursor_updated_at)
         values (?, ?, ?)`,
        [entityType, cursorValue, updatedAt],
      );
    });
  }

  async reset(entityType: SyncEntityType): Promise<void> {
    await this.db.run(`delete from sync_cursors where entity_type = ?`, [entityType]);
  }

  async resetAll(): Promise<void> {
    await this.db.run(`delete from sync_cursors`);
  }

  async listAll(): Promise<readonly SyncCursorRecord[]> {
    const rows = await this.db.all<{ entity_type: string; cursor_value: string; cursor_updated_at: string }>(
      `select entity_type, cursor_value, cursor_updated_at from sync_cursors order by entity_type asc`,
    );
    return rows.map((row) => ({
      entityType: row.entity_type as SyncEntityType,
      cursorValue: row.cursor_value,
      updatedAt: row.cursor_updated_at,
    }));
  }
}
