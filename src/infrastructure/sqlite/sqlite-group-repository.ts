/**
 * SQLite-backed implementation of the `GroupRepository` contract
 * (write side).
 *
 * Design notes:
 *
 *   - `save()` is a full upsert (insert when absent, otherwise a
 *     complete column-level replace of the row as given). Optimistic
 *     concurrency is enforced by the DOMAIN layer (`updateGroup` /
 *     `softDeleteGroup` compare expected versions) — the repository
 *     persists the already-validated state.
 *   - Every mutation (save insert/update, softDelete) also enqueues a
 *     `group` sync operation INSIDE the same transaction, so the
 *     entity write and its offline-sync queue entry commit atomically
 *     (see `sync-op-writer.ts` and the `sync_operations` schema note).
 *   - `softDelete` is idempotent: deleting an already-deleted group
 *     returns its existing delete result instead of throwing — a
 *     replayed sync/delete operation must not crash the sync loop.
 *   - `listByUser` is a two-step membership join (member group ids →
 *     groups `in (...)`), which keeps the SQL compatible with both the
 *     production SQLite engine and the in-memory test double (no JOIN
 *     support needed).
 */


import type { Group } from '@domain/entities/group';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { CurrencyCode } from '@domain/value-objects/currency-code';
import type { GroupId, UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';
import {
  mapGroupRow,
  paginateRows,
  parseOffsetCursor,
} from './row-mappers';
import { enqueueSyncOpWithin, syncIdempotencyKey } from './sync-op-writer';

const GROUP_COLUMNS = `
  id, name, description, currency_code, created_by, created_at, updated_at,
  deleted_at, version, last_modified_by, client_created_at, client_updated_at
`;

export class SqliteGroupRepository implements GroupRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: GroupId): Promise<Group | null> {
    const row = await this.db.get<SqlRow>(
      `select ${GROUP_COLUMNS} from groups where id = ?`,
      [id],
    );
    return row ? mapGroupRow(row) : null;
  }

  async listByUser(userId: UserId, pagination: Pagination): Promise<PaginatedResult<Group>> {
    // Step 1: active membership group ids for this user.
    const memberRows = await this.db.all<SqlRow>(
      `select group_id from group_members where user_id = ? and left_at is null`,
      [userId],
    );
    const groupIds = memberRows
      .map((r) => r['group_id'] as string)
      .filter((v): v is string => v !== null);
    if (groupIds.length === 0) {
      return { items: [], hasMore: false };
    }
    // Step 2: the groups themselves — active only, newest activity first.
    const placeholders = groupIds.map(() => '?').join(', ');
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${GROUP_COLUMNS} from groups
       where id in (${placeholders}) and deleted_at is null
       order by updated_at desc
       limit ? offset ?`,
      [...groupIds, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapGroupRow), pagination.limit, offset);
  }

  async listByCurrency(
    currency: CurrencyCode,
    pagination: Pagination,
  ): Promise<PaginatedResult<Group>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${GROUP_COLUMNS} from groups
       where currency_code = ? and deleted_at is null
       order by updated_at desc
       limit ? offset ?`,
      [currency, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapGroupRow), pagination.limit, offset);
  }

  async save(group: Group): Promise<void> {
    const description = group.description ?? null;
    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(`select id from groups where id = ?`, [
        group.id,
      ]);
      if (existing) {
        await tx.run(
          `update groups set
             name = ?, description = ?, currency_code = ?, created_by = ?,
             created_at = ?, updated_at = ?, deleted_at = ?, version = ?,
             last_modified_by = ?, client_created_at = ?, client_updated_at = ?
           where id = ?`,
          [
            group.name,
            description,
            group.currencyCode,
            group.createdBy,
            group.createdAt as string,
            group.updatedAt as string,
            group.deletedAt ? (group.deletedAt as string) : null,
            group.version as number,
            group.createdBy,
            group.createdAt as string,
            group.updatedAt as string,
            group.id,
          ],
        );
        await enqueueSyncOpWithin(tx, {
          entityType: 'group',
          entityId: group.id as string,
          operation: 'update',
          payload: groupToPayload(group),
          idempotencyKey: syncIdempotencyKey('group', group.id as string, 'update', group.version as number),
          baseVersion: (group.version as number) - 1,
          localVersion: group.version as number,
        });
      } else {
        await tx.run(
          `insert into groups (
             id, name, description, currency_code, created_by, created_at,
             updated_at, deleted_at, version, last_modified_by,
             client_created_at, client_updated_at
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            group.id,
            group.name,
            description,
            group.currencyCode,
            group.createdBy,
            group.createdAt as string,
            group.updatedAt as string,
            group.deletedAt ? (group.deletedAt as string) : null,
            group.version as number,
            group.createdBy,
            group.createdAt as string,
            group.updatedAt as string,
          ],
        );
        await enqueueSyncOpWithin(tx, {
          entityType: 'group',
          entityId: group.id as string,
          operation: 'create',
          payload: groupToPayload(group),
          idempotencyKey: syncIdempotencyKey('group', group.id as string, 'create', group.version as number),
          baseVersion: 0,
          localVersion: group.version as number,
        });
      }
    });
  }

  async softDelete(id: GroupId, metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    return this.db.transaction(async (tx) => {
      const row = await tx.get<SqlRow>(
        `select ${GROUP_COLUMNS} from groups where id = ?`,
        [id],
      );
      if (!row) {
        throw new DatabaseError(`Group ${id} not found`, { code: 'NOT_FOUND' });
      }
      // Idempotent replay: an already-deleted group returns its current
      // tombstone instead of throwing (sync delete-ops may repeat).
      const currentDeletedAt = row['deleted_at'] as string | null;
      if (currentDeletedAt) {
        return {
          id: id as string,
          deletedAt: asDateTime(currentDeletedAt),
          version: asVersionNumber(row['version'] as number),
        };
      }
      const deletedAt = metadata.deletedAt;
      const newVersion = asVersionNumber((row['version'] as number) + 1);
      await tx.run(
        `update groups set
           deleted_at = ?, updated_at = ?, version = ?, last_modified_by = ?
         where id = ?`,
        [deletedAt as string, deletedAt as string, newVersion as number, metadata.actorId, id],
      );
      await enqueueSyncOpWithin(tx, {
        entityType: 'group',
        entityId: id as string,
        operation: 'delete',
        payload: { id, deletedAt, reason: metadata.reason ?? null },
        idempotencyKey: syncIdempotencyKey('group', id as string, 'delete', newVersion as number),
        baseVersion: row['version'] as number,
        localVersion: newVersion as number,
      });
      return { id: id as string, deletedAt, version: newVersion };
    });
  }
}

/** Cloud-upload payload shape for a group row (snake_case, sync-friendly). */
function groupToPayload(group: Group): Record<string, unknown> {
  // v2.6.0 CRITICAL COMPLETENESS FIX: the payload must be a COMPLETE
  // cloud row — `client_created_at` / `client_updated_at` are NOT NULL
  // without defaults in the cloud schema, so the previous partial
  // payload failed every group upload on a live project (23502
  // not-null violation, retried to permanent failure). The values mirror
  // exactly what this repository's INSERT writes.
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? null,
    currency_code: group.currencyCode,
    created_by: group.createdBy,
    created_at: group.createdAt,
    updated_at: group.updatedAt,
    deleted_at: group.deletedAt ?? null,
    version: group.version,
    last_modified_by: group.createdBy,
    client_created_at: group.createdAt,
    client_updated_at: group.updatedAt,
  };
}
