/**
 * SQLite-backed implementation of the `GroupMemberRepository` contract.
 *
 * Conventions (matching `SqliteGroupRepository`):
 *   - `save()` is a full upsert of the member row as given.
 *   - Every mutation enqueues a `group_member` sync operation inside the
 *     same transaction (entity write + sync-queue entry are atomic).
 *   - `softDelete` sets `left_at` (the storage-layer equivalent of
 *     `leaveGroup`) and is idempotent under replay.
 *   - `updateRole` performs a read-modify-write in one transaction and
 *     bumps the row version, returning the updated entity.
 */


import type { GroupMember, MemberRole } from '@domain/entities/group-member';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { GroupId, MemberId, UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';
import {
  mapGroupMemberRow,
  paginateRows,
  parseOffsetCursor,
} from './row-mappers';
import { enqueueSyncOpWithin, syncIdempotencyKey } from './sync-op-writer';

const MEMBER_COLUMNS = `
  id, group_id, user_id, display_name, role, joined_at, left_at,
  created_at, updated_at, version, created_by, last_modified_by,
  client_created_at, client_updated_at
`;

export class SqliteGroupMemberRepository implements GroupMemberRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: MemberId): Promise<GroupMember | null> {
    const row = await this.db.get<SqlRow>(
      `select ${MEMBER_COLUMNS} from group_members where id = ?`,
      [id],
    );
    return row ? mapGroupMemberRow(row) : null;
  }

  async findActiveByGroupAndUser(groupId: GroupId, userId: UserId): Promise<GroupMember | null> {
    const row = await this.db.get<SqlRow>(
      `select ${MEMBER_COLUMNS} from group_members
       where group_id = ? and user_id = ? and left_at is null`,
      [groupId, userId],
    );
    return row ? mapGroupMemberRow(row) : null;
  }

  async listActiveByGroup(groupId: GroupId): Promise<readonly GroupMember[]> {
    const rows = await this.db.all<SqlRow>(
      `select ${MEMBER_COLUMNS} from group_members
       where group_id = ? and left_at is null
       order by joined_at asc`,
      [groupId],
    );
    return rows.map(mapGroupMemberRow);
  }

  async listAllByGroup(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<GroupMember>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${MEMBER_COLUMNS} from group_members
       where group_id = ?
       order by joined_at asc
       limit ? offset ?`,
      [groupId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapGroupMemberRow), pagination.limit, offset);
  }

  async findActiveOwner(groupId: GroupId): Promise<GroupMember | null> {
    const row = await this.db.get<SqlRow>(
      `select ${MEMBER_COLUMNS} from group_members
       where group_id = ? and role = 'owner' and left_at is null`,
      [groupId],
    );
    return row ? mapGroupMemberRow(row) : null;
  }

  async updateRole(id: MemberId, newRole: MemberRole): Promise<GroupMember> {
    return this.db.transaction(async (tx) => {
      const row = await tx.get<SqlRow>(
        `select ${MEMBER_COLUMNS} from group_members where id = ?`,
        [id],
      );
      if (!row) {
        throw new DatabaseError(`GroupMember ${id} not found`, { code: 'NOT_FOUND' });
      }
      const current = mapGroupMemberRow(row);
      if (current.role === newRole) {
        return current; // no-op — avoid a spurious version bump + sync op
      }
      if (current.leftAt) {
        throw new DatabaseError(`GroupMember ${id} has left and cannot change role`, {
          code: 'ENTITY_DELETED',
        });
      }
      const updatedAt = asDateTime(new Date().toISOString());
      const newVersion = asVersionNumber((current.version as number) + 1);
      await tx.run(
        `update group_members set role = ?, updated_at = ?, version = ? where id = ?`,
        [newRole, updatedAt as string, newVersion as number, id],
      );
      await enqueueSyncOpWithin(tx, {
        entityType: 'group_member',
        entityId: id as string,
        operation: 'update',
        payload: { id, groupId: current.groupId, role: newRole, version: newVersion },
        idempotencyKey: syncIdempotencyKey('group_member', id as string, 'update', newVersion as number),
        baseVersion: current.version as number,
        localVersion: newVersion as number,
      });
      return { ...current, role: newRole, updatedAt, version: newVersion };
    });
  }

  async save(member: GroupMember): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(
        `select id from group_members where id = ?`,
        [member.id],
      );
      if (existing) {
        await tx.run(
          `update group_members set
             group_id = ?, user_id = ?, display_name = ?, role = ?,
             joined_at = ?, left_at = ?, created_at = ?, updated_at = ?,
             version = ?, created_by = ?, last_modified_by = ?,
             client_created_at = ?, client_updated_at = ?
           where id = ?`,
          [
            member.groupId,
            member.userId ?? null,
            member.displayName,
            member.role,
            member.joinedAt as string,
            member.leftAt ? (member.leftAt as string) : null,
            member.joinedAt as string,
            member.updatedAt as string,
            member.version as number,
            member.userId ?? null,
            member.userId ?? null,
            member.joinedAt as string,
            member.updatedAt as string,
            member.id,
          ],
        );
        await enqueueSyncOpWithin(tx, {
          entityType: 'group_member',
          entityId: member.id as string,
          operation: 'update',
          payload: memberToPayload(member),
          idempotencyKey: syncIdempotencyKey('group_member', member.id as string, 'update', member.version as number),
          baseVersion: (member.version as number) - 1,
          localVersion: member.version as number,
        });
      } else {
        await tx.run(
          `insert into group_members (
             id, group_id, user_id, display_name, role, joined_at, left_at,
             created_at, updated_at, version, created_by, last_modified_by,
             client_created_at, client_updated_at
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            member.id,
            member.groupId,
            member.userId ?? null,
            member.displayName,
            member.role,
            member.joinedAt as string,
            member.leftAt ? (member.leftAt as string) : null,
            member.joinedAt as string,
            member.updatedAt as string,
            member.version as number,
            member.userId ?? null,
            member.userId ?? null,
            member.joinedAt as string,
            member.updatedAt as string,
          ],
        );
        await enqueueSyncOpWithin(tx, {
          entityType: 'group_member',
          entityId: member.id as string,
          operation: 'create',
          payload: memberToPayload(member),
          idempotencyKey: syncIdempotencyKey('group_member', member.id as string, 'create', member.version as number),
          baseVersion: 0,
          localVersion: member.version as number,
        });
      }
    });
  }

  async softDelete(id: MemberId, metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    return this.db.transaction(async (tx) => {
      const row = await tx.get<SqlRow>(
        `select ${MEMBER_COLUMNS} from group_members where id = ?`,
        [id],
      );
      if (!row) {
        throw new DatabaseError(`GroupMember ${id} not found`, { code: 'NOT_FOUND' });
      }
      const currentLeftAt = row['left_at'] as string | null;
      if (currentLeftAt) {
        // Idempotent replay (member already left).
        return {
          id: id as string,
          deletedAt: asDateTime(currentLeftAt),
          version: asVersionNumber(row['version'] as number),
        };
      }
      const deletedAt = metadata.deletedAt;
      const newVersion = asVersionNumber((row['version'] as number) + 1);
      await tx.run(
        `update group_members set left_at = ?, updated_at = ?, version = ? where id = ?`,
        [deletedAt as string, deletedAt as string, newVersion as number, id],
      );
      await enqueueSyncOpWithin(tx, {
        entityType: 'group_member',
        entityId: id as string,
        operation: 'delete',
        payload: { id, leftAt: deletedAt, reason: metadata.reason ?? null },
        idempotencyKey: syncIdempotencyKey('group_member', id as string, 'delete', newVersion as number),
        baseVersion: row['version'] as number,
        localVersion: newVersion as number,
      });
      return { id: id as string, deletedAt, version: newVersion };
    });
  }
}

/** Cloud-upload payload shape for a member row. */
function memberToPayload(member: GroupMember): Record<string, unknown> {
  // v2.6.0 CRITICAL COMPLETENESS FIX: the payload must be a COMPLETE
  // cloud row — created_at / updated_at / client_created_at /
  // client_updated_at are NOT NULL without defaults in the cloud
  // schema, so the previous partial payload failed every member upload
  // on a live project (23502 not-null violation). Values mirror this
  // repository's INSERT exactly (created_at = joined_at, the audit
  // columns carry the user id, client_* mirror joined/updated).
  return {
    id: member.id,
    group_id: member.groupId,
    user_id: member.userId ?? null,
    display_name: member.displayName,
    role: member.role,
    joined_at: member.joinedAt,
    left_at: member.leftAt ?? null,
    version: member.version,
    created_at: member.joinedAt,
    updated_at: member.updatedAt,
    created_by: member.userId ?? null,
    last_modified_by: member.userId ?? null,
    client_created_at: member.joinedAt,
    client_updated_at: member.updatedAt,
  };
}
