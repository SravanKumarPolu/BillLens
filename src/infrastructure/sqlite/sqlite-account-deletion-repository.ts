/**
 * SQLite-backed implementation of the `AccountDeletionRepository` port
 * (v2.4.0) — the LOCAL half of the account-deletion flow. The scheduled
 * request (with its 14-day recovery window) persists on-device so the
 * status survives app restarts; the cloud `account_deletion_requests`
 * row + server-side purge job land with the provisioned Supabase
 * project (documented blocker — the local adapter is fully functional).
 */

import type { AccountDeletionRepository } from '@application/identity/account-deletion/account-deletion.port';
import type { AccountDeletionRequest } from '@domain/entities/account-deletion-request';
import type { UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';

interface DeletionRequestRow extends SqlRow {
  readonly id: string;
  readonly user_id: string;
  readonly status: string;
  readonly requested_at: string;
  readonly recovery_deadline_at: string;
  readonly version: number;
}

function mapRow(row: DeletionRequestRow): AccountDeletionRequest {
  return {
    id: row.id as never,
    userId: row.user_id as never,
    status: row.status as AccountDeletionRequest['status'],
    requestedAt: row.requested_at as never,
    recoveryDeadlineAt: row.recovery_deadline_at as never,
    version: row.version,
  };
}

export class SqliteAccountDeletionRepository implements AccountDeletionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async save(request: AccountDeletionRequest): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const existing = await tx.get<SqlRow>(
          `select id from account_deletion_requests where id = ?`,
          [request.id],
        );
        if (existing) {
          await tx.run(
            `update account_deletion_requests set
               user_id = ?, status = ?, requested_at = ?, recovery_deadline_at = ?,
               updated_at = ?, version = ?
             where id = ?`,
            [
              request.userId,
              request.status,
              request.requestedAt as string,
              request.recoveryDeadlineAt as string,
              new Date().toISOString(),
              request.version,
              request.id,
            ],
          );
        } else {
          await tx.run(
            `insert into account_deletion_requests (
               id, user_id, status, requested_at, recovery_deadline_at,
               created_at, updated_at, version
             ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              request.id,
              request.userId,
              request.status,
              request.requestedAt as string,
              request.recoveryDeadlineAt as string,
              new Date().toISOString(),
              new Date().toISOString(),
              request.version,
            ],
          );
        }
      });
    } catch (error) {
      throw new DatabaseError(`AccountDeletionRequest save failed: ${String(error)}`, {
        cause: error,
      });
    }
  }

  async findActiveByUser(userId: UserId): Promise<AccountDeletionRequest | null> {
    const row = await this.db.get<DeletionRequestRow>(
      `select id, user_id, status, requested_at, recovery_deadline_at, version
       from account_deletion_requests
       where user_id = ? and status = 'scheduled' and deleted_at is null
       order by requested_at desc
       limit 1`,
      [userId],
    );
    return row ? mapRow(row) : null;
  }

  async findById(id: string): Promise<AccountDeletionRequest | null> {
    const row = await this.db.get<DeletionRequestRow>(
      `select id, user_id, status, requested_at, recovery_deadline_at, version
       from account_deletion_requests
       where id = ? and deleted_at is null`,
      [id],
    );
    return row ? mapRow(row) : null;
  }
}
