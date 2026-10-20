import type {
  ConflictCategory,
  SyncConflict,
  SyncConflictRepository,
  SyncEntityType,
} from '@domain/repositories/sync.repository';
import { asDateTime, nowDateTime } from '@domain/value-objects';
import type { UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from '../sqlite/database-connection';

/**
 * SQLite-backed `SyncConflictRepository` — v2.6.0.
 *
 * The `sync_conflicts` table existed since migration 0001, but only the
 * upload path (`SqliteSyncRepository.markConflict`) wrote to it — via an
 * op-tied transaction. The DOWNLOAD path (bidirectional sync, v2.6.0)
 * also detects conflicts ("remote changed while a local edit was
 * pending") and needs to record them WITHOUT a sync operation to point
 * at: the conflicting change came FROM the cloud, there is no queue
 * entry. This adapter implements the standalone contract.
 *
 * Financial pull-conflicts are NEVER auto-resolved — they are recorded
 * with resolution 'pending' and surface in the sync status UI until the
 * user reviews them.
 */
export class SqliteSyncConflictRepository implements SyncConflictRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async save(conflict: SyncConflict): Promise<void> {
    const updatedAt = nowDateTime() as string;
    // Plain insert — the caller (download applier) is responsible for
    // idempotency via countUnresolvedForEntity (one unresolved conflict
    // per entity, checked before writing). JSON.stringify of payloads
    // happens here so every writer stores the same wire format.
    await this.db.run(
      `insert into sync_conflicts (
        id, profile_id, entity_type, entity_id, category, local_version,
        cloud_version, local_payload, cloud_payload, resolution,
        resolved_at, resolved_by, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conflict.id,
        null,
        conflict.entityType,
        conflict.entityId,
        conflict.category,
        conflict.localVersion,
        conflict.cloudVersion,
        conflict.localPayload ? JSON.stringify(conflict.localPayload) : null,
        conflict.cloudPayload ? JSON.stringify(conflict.cloudPayload) : null,
        conflict.resolution ?? 'pending',
        conflict.resolvedAt ? (conflict.resolvedAt as string) : null,
        conflict.resolvedBy ?? null,
        conflict.createdAt as string,
        updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<SyncConflict | null> {
    const row = await this.db.get<SqlRow>(`select * from sync_conflicts where id = ?`, [id]);
    return row ? rowToConflict(row) : null;
  }

  async listUnresolved(limit: number): Promise<readonly SyncConflict[]> {
    // Two simple, engine-identical queries merged in JS (same pattern as
    // the v2.5.0 listReadyForRetry) — `OR` clauses are deliberately NOT
    // used because the constraint-faithful test double fails loud on
    // clauses it cannot evaluate, keeping test fidelity absolute.
    const nullResolution = await this.db.all<SqlRow>(
      `select * from sync_conflicts where resolution is null order by created_at desc limit ?`,
      [limit],
    );
    const pending = await this.db.all<SqlRow>(
      `select * from sync_conflicts where resolution = 'pending' order by created_at desc limit ?`,
      [limit],
    );
    const seen = new Set<string>();
    const merged: SqlRow[] = [];
    for (const row of [...nullResolution, ...pending]) {
      const id = row['id'] as string;
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
      if (merged.length >= limit) break;
    }
    return merged.map(rowToConflict);
  }

  async resolve(id: string, resolution: NonNullable<SyncConflict['resolution']>, resolvedBy: UserId): Promise<void> {
    await this.db.run(
      `update sync_conflicts
       set resolution = ?, resolved_at = ?, resolved_by = ?, updated_at = ?
       where id = ?`,
      [resolution, nowDateTime() as string, resolvedBy, nowDateTime() as string, id],
    );
  }

  /**
   * Count unresolved conflicts for a specific entity — the download
   * applier uses this to keep conflicts IDEMPOTENT under sync replay
   * (one unresolved conflict per entity, never a pile of duplicates).
   */
  async countUnresolvedForEntity(entityType: SyncEntityType, entityId: string): Promise<number> {
    const nullRow = await this.db.get<{ count: number }>(
      `select count(*) as count from sync_conflicts
       where entity_type = ? and entity_id = ? and resolution is null`,
      [entityType, entityId],
    );
    const pendingRow = await this.db.get<{ count: number }>(
      `select count(*) as count from sync_conflicts
       where entity_type = ? and entity_id = ? and resolution = 'pending'`,
      [entityType, entityId],
    );
    return (nullRow?.count ?? 0) + (pendingRow?.count ?? 0);
  }
}

/** Categories valid for the standalone (download-side) writer. */
export const STANDALONE_CONFLICT_CATEGORIES: readonly ConflictCategory[] = [
  'remote_change_conflict',
  'version_conflict',
  'financial_record_conflict',
  'deleted_remotely',
  'membership_conflict',
  'duplicate_creation',
];

function rowToConflict(row: SqlRow): SyncConflict {
  const localPayload = parsePayload(row['local_payload']);
  const cloudPayload = parsePayload(row['cloud_payload']);
  const resolvedAt = row['resolved_at'];
  const createdAt = row['created_at'];
  if (typeof createdAt !== 'string') {
    throw new Error(
      `sync_conflicts row ${String(row['id'])} has invalid created_at: ${String(createdAt)}`,
    );
  }
  return {
    id: row['id'] as string,
    entityType: row['entity_type'] as SyncEntityType,
    entityId: row['entity_id'] as string,
    category: row['category'] as ConflictCategory,
    localVersion: row['local_version'] as number,
    cloudVersion: row['cloud_version'] as number,
    ...(localPayload !== null ? { localPayload } : {}),
    ...(cloudPayload !== null ? { cloudPayload } : {}),
    ...(row['resolution'] ? { resolution: row['resolution'] as SyncConflict['resolution'] } : {}),
    ...(typeof resolvedAt === 'string' ? { resolvedAt: asDateTime(resolvedAt) } : {}),
    ...(row['resolved_by'] ? { resolvedBy: row['resolved_by'] as UserId } : {}),
    createdAt: asDateTime(createdAt),
  };
}

function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // A corrupted payload must not crash the review UI — return null and
    // let the record render with versions only.
    return null;
  }
}
