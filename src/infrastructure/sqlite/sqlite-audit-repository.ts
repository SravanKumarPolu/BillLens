/**
 * SQLite-backed implementation of the `AuditRepository` contract.
 *
 * The audit log is APPEND-ONLY: this adapter exposes `append` plus three
 * read methods, and deliberately contains no update or delete path —
 * once written, an audit entry is immutable (the underlying table has no
 * UPDATE statement anywhere in this codebase).
 *
 * PRIVACY: the `change_summary` column stores a JSON document supplied by
 * the use cases. Those summaries are already structured field deltas
 * (status from/to, version from/to) — the use cases must never place
 * receipt text, card details, UPI ids, or payment references in them.
 * The adapter serialises whatever it is given and parses defensively on
 * read (corrupted JSON degrades to `undefined`, never a crash).
 *
 * SYNC: `audit_logs` is a LOCAL MIRROR — the `sync_operations` entity-type
 * check does not include an audit entity (by design; audit rows reach the
 * cloud through the server's own audit pipeline once Supabase lands).
 * No sync operation is co-enqueued here.
 *
 * The `group_id` column is added by migration 0003 so `listByGroup` can
 * filter in SQL — mirroring the cloud schema, which has always had it.
 */

import type {
  AuditLogEntry,
  AuditRepository,
} from '@domain/repositories/audit.repository';
import type {
  PaginatedResult,
  Pagination,
} from '@domain/repositories/repository-contracts';
import { asDateTime, nowDateTime } from '@domain/value-objects';
import type { GroupId, UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { newRowId, paginateRows, parseOffsetCursor } from './row-mappers';

const AUDIT_COLUMNS = `
  id, entity_type, entity_id, action, actor_id, group_id,
  previous_version, new_version, change_summary, created_at
`;

export class SqliteAuditRepository implements AuditRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async append(entry: Omit<AuditLogEntry, 'createdAt'>): Promise<AuditLogEntry> {
    const createdAt = nowDateTime();
    await this.db.run(
      `insert into audit_logs (
         id, entity_type, entity_id, action, actor_id, group_id,
         previous_version, new_version, change_summary, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.actorId ?? null,
        entry.groupId ?? null,
        entry.previousVersion ?? null,
        entry.newVersion ?? null,
        entry.changeSummary !== undefined
          ? JSON.stringify(entry.changeSummary)
          : null,
        createdAt as string,
      ],
    );
    return { ...entry, createdAt };
  }

  async listByEntity(
    entityType: string,
    entityId: string,
  ): Promise<readonly AuditLogEntry[]> {
    const rows = await this.db.all<SqlRow>(
      `select ${AUDIT_COLUMNS} from audit_logs
       where entity_type = ? and entity_id = ?
       order by created_at asc`,
      [entityType, entityId],
    );
    return rows.map(mapAuditRow);
  }

  async listByActor(
    actorId: UserId,
    pagination: Pagination,
  ): Promise<PaginatedResult<AuditLogEntry>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${AUDIT_COLUMNS} from audit_logs
       where actor_id = ?
       order by created_at desc
       limit ? offset ?`,
      [actorId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapAuditRow), pagination.limit, offset);
  }

  async listByGroup(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<AuditLogEntry>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${AUDIT_COLUMNS} from audit_logs
       where group_id = ?
       order by created_at desc
       limit ? offset ?`,
      [groupId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapAuditRow), pagination.limit, offset);
  }
}

/** Row → entity mapper (kept file-local: only this adapter reads audit rows). */
function mapAuditRow(row: SqlRow): AuditLogEntry {
  const changeSummaryRaw = row['change_summary'] as string | null;
  let changeSummary: Readonly<Record<string, unknown>> | undefined;
  if (changeSummaryRaw !== null && changeSummaryRaw !== undefined) {
    try {
      const parsed = JSON.parse(changeSummaryRaw) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        changeSummary = parsed as Readonly<Record<string, unknown>>;
      }
    } catch {
      // Corrupted JSON must never crash an audit read — degrade to
      // "no summary" (the fixed columns still round-trip).
    }
  }
  const groupId = row['group_id'];
  const actorId = row['actor_id'];
  return {
    id: row['id'] as string,
    entityType: row['entity_type'] as string,
    entityId: row['entity_id'] as string,
    action: row['action'] as AuditLogEntry['action'],
    ...(actorId !== null && actorId !== undefined ? { actorId: actorId as UserId } : {}),
    ...(groupId !== null && groupId !== undefined ? { groupId: groupId as GroupId } : {}),
    ...(row['previous_version'] !== null && row['previous_version'] !== undefined
      ? { previousVersion: row['previous_version'] as number }
      : {}),
    ...(row['new_version'] !== null && row['new_version'] !== undefined
      ? { newVersion: row['new_version'] as number }
      : {}),
    ...(changeSummary !== undefined ? { changeSummary } : {}),
    createdAt: asDateTime(row['created_at'] as string),
  };
}

// Re-exported so future adapters share one id generator.
export { newRowId };
