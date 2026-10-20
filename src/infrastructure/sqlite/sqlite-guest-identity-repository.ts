/**
 * SQLite-backed implementation of the `GuestIdentityRepository` contract
 * (v2.4.0) — the durable LOCAL guest identity that v2.3.0 only had as a
 * test double. Guests get a real, persisted identity (display name +
 * device-secret hash) created at onboarding and kept in SQLite until a
 * cloud account is linked.
 *
 * SECURITY: only the device-secret HASH is stored here. The raw secret
 * lives in SecureStore (CreateGuestIdentityUseCase enforces this split).
 * LOCAL-ONLY: no sync-op co-write — guest identities never leave the
 * device (the cloud `guest_identity_links` row is created only during
 * the explicit guest → cloud upgrade flow).
 */

import type { GuestIdentity } from '@domain/entities/guest-identity';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asDisplayName, asVersionNumber } from '@domain/value-objects';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';
import { paginateRows, parseOffsetCursor } from './row-mappers';

const COLUMNS = `
  id, display_name, device_secret_hash, upgrade_status, linked_user_id,
  created_at, updated_at, deleted_at, version
`;

interface GuestIdentityRow extends SqlRow {
  readonly id: string;
  readonly display_name: string;
  readonly device_secret_hash: string;
  readonly upgrade_status: string;
  readonly linked_user_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
}

function mapRow(row: GuestIdentityRow): GuestIdentity {
  return {
    id: row.id as never,
    displayName: asDisplayName(row.display_name),
    deviceSecretHash: row.device_secret_hash,
    upgradeStatus: row.upgrade_status as GuestIdentity['upgradeStatus'],
    ...(row.linked_user_id !== null ? { linkedUserId: row.linked_user_id as never } : {}),
    createdAt: asDateTime(row.created_at),
    updatedAt: asDateTime(row.updated_at),
    version: asVersionNumber(row.version),
  };
}

export class SqliteGuestIdentityRepository implements GuestIdentityRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: Parameters<GuestIdentityRepository['findById']>[0]): Promise<GuestIdentity | null> {
    const row = await this.db.get<GuestIdentityRow>(
      `select ${COLUMNS} from guest_identities where id = ? and deleted_at is null`,
      [id],
    );
    return row ? mapRow(row) : null;
  }

  /** Full-replacement save; the version comes from the domain entity. */
  async save(identity: GuestIdentity): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const existing = await tx.get<SqlRow>(`select id from guest_identities where id = ?`, [
          identity.id,
        ]);
        if (existing) {
          await tx.run(
            `update guest_identities set
               display_name = ?, device_secret_hash = ?, upgrade_status = ?,
               linked_user_id = ?, created_at = ?, updated_at = ?, deleted_at = null, version = ?
             where id = ?`,
            [
              identity.displayName,
              identity.deviceSecretHash,
              identity.upgradeStatus,
              identity.linkedUserId ?? null,
              identity.createdAt as string,
              identity.updatedAt as string,
              identity.version,
              identity.id,
            ],
          );
        } else {
          await tx.run(
            `insert into guest_identities (
               id, display_name, device_secret_hash, upgrade_status, linked_user_id,
               created_at, updated_at, deleted_at, version
             ) values (?, ?, ?, ?, ?, ?, ?, null, ?)`,
            [
              identity.id,
              identity.displayName,
              identity.deviceSecretHash,
              identity.upgradeStatus,
              identity.linkedUserId ?? null,
              identity.createdAt as string,
              identity.updatedAt as string,
              identity.version,
            ],
          );
        }
      });
    } catch (error) {
      throw new DatabaseError(`GuestIdentity save failed: ${String(error)}`, { cause: error });
    }
  }

  async findByLinkedUserId(userId: Parameters<GuestIdentityRepository['findByLinkedUserId']>[0]): Promise<readonly GuestIdentity[]> {
    const rows = await this.db.all<GuestIdentityRow>(
      `select ${COLUMNS} from guest_identities
       where linked_user_id = ? and deleted_at is null
       order by updated_at desc`,
      [userId],
    );
    return rows.map(mapRow);
  }

  async list(pagination: Pagination): Promise<PaginatedResult<GuestIdentity>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<GuestIdentityRow>(
      `select ${COLUMNS} from guest_identities
       where deleted_at is null
       order by created_at desc
       limit ? offset ?`,
      [pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapRow), pagination.limit, offset);
  }

  async softDelete(
    id: Parameters<GuestIdentityRepository['findById']>[0],
    metadata: DeleteMetadata,
  ): Promise<SoftDeleteResult> {
    try {
      await this.db.run(
        `update guest_identities set deleted_at = ?, updated_at = ?, version = version + 1
         where id = ? and deleted_at is null`,
        [metadata.deletedAt as string, metadata.deletedAt as string, id],
      );
      return { id: id as string, deletedAt: metadata.deletedAt, version: asVersionNumber(1) };
    } catch (error) {
      throw new DatabaseError(`GuestIdentity soft delete failed: ${String(error)}`, {
        cause: error,
      });
    }
  }
}
