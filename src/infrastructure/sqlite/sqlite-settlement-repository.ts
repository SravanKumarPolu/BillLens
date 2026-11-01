/**
 * SQLite-backed implementation of the `SettlementRepository` contract —
 * the write side of the settlement lifecycle (Phase 6 Track 1 state
 * machine: draft → requested → pending_confirmation → completed, plus
 * dispute / reversal / cancel paths).
 *
 * ATOMICITY: every mutation (`save`, `saveReversal`, `softDelete`) runs in
 * ONE transaction that also enqueues the settlement's offline-sync
 * operation (see `sync-op-writer.ts`). A crash between the entity write
 * and the sync enqueue is therefore impossible — the schema's
 * entity-write → sync-queue atomicity warning is satisfied by
 * construction, exactly like the group / member / expense / draft
 * adapters.
 *
 * STATE HISTORY: `appendStateHistory` is APPEND-ONLY. There is no update
 * or delete path for `settlement_state_history` — the audit trail of
 * state transitions is immutable once written.
 *
 * IDEMPOTENCY:
 *   - `softDelete` replays idempotently (an already-deleted settlement
 *     returns the existing tombstone instead of bumping the version a
 *     second time) — sync replay can never double-delete.
 *   - `findByOperationId` / `findByPaymentReferenceHash` back the
 *     use-case-level idempotency checks (Prompt 53): the offline-creation
 *     retry and duplicate-reference detection.
 *
 * FINANCIAL SAFETY: settlements NEVER modify expense rows, and
 * `saveReversal` does NOT mutate the original settlement — reversals are
 * a separate financial record (swap from/to, same amount) whose combined
 * effect with the reversed original is net zero in the balance engine.
 */

import type { Settlement } from '@domain/entities/settlement';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import type {
  SettlementListFilter,
  SettlementRepository,
  SettlementStateHistoryEntry,
} from '@domain/repositories/settlement.repository';
import { asDateTime, asVersionNumber, nowDateTime } from '@domain/value-objects';
import type { DateTime } from '@domain/value-objects';
import type { GroupId, MemberId, SettlementId, UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';
import {
  mapSettlementRow,
  mapSettlementStateHistoryRow,
  newRowId,
  paginateRows,
  parseOffsetCursor,
} from './row-mappers';
import { enqueueSyncOpWithin, syncIdempotencyKey } from './sync-op-writer';

const SETTLEMENT_COLUMNS = `
  id, group_id, from_member_id, to_member_id, amount_minor, currency_code,
  method, settlement_date, note, reverses_settlement_id,
  reversal_of_settlement_id, status, confirmed_by_member_id, confirmed_at,
  payment_reference_hash, operation_id, evidence_hash, dispute_reason,
  dispute_note, created_by, created_at, updated_at, deleted_at, version
`;

export class SqliteSettlementRepository implements SettlementRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  async findById(id: SettlementId): Promise<Settlement | null> {
    const row = await this.db.get<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements where id = ?`,
      [id],
    );
    return row ? mapSettlementRow(row) : null;
  }

  async listByGroup(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where group_id = ? and deleted_at is null
       order by settlement_date desc
       limit ? offset ?`,
      [groupId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapSettlementRow), pagination.limit, offset);
  }

  async listSentByMember(
    memberId: MemberId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where from_member_id = ? and deleted_at is null
       order by settlement_date desc
       limit ? offset ?`,
      [memberId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapSettlementRow), pagination.limit, offset);
  }

  async listReceivedByMember(
    memberId: MemberId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where to_member_id = ? and deleted_at is null
       order by settlement_date desc
       limit ? offset ?`,
      [memberId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapSettlementRow), pagination.limit, offset);
  }

  async listUpdatedSince(
    groupId: GroupId,
    since: DateTime,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where group_id = ? and updated_at > ?
       order by updated_at asc
       limit ? offset ?`,
      [groupId, since as string, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapSettlementRow), pagination.limit, offset);
  }

  async listByFilter(
    groupId: GroupId,
    filter: SettlementListFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    // Dynamically build an AND-only WHERE clause. Clause order is stable so
    // the parameter order matches the placeholder order on every engine.
    const clauses: string[] = ['group_id = ?', 'deleted_at is null'];
    const params: unknown[] = [groupId];

    if (filter.payerMemberId !== undefined) {
      clauses.push('from_member_id = ?');
      params.push(filter.payerMemberId);
    }
    if (filter.receiverMemberId !== undefined) {
      clauses.push('to_member_id = ?');
      params.push(filter.receiverMemberId);
    }
    if (filter.currencyCode !== undefined) {
      clauses.push('currency_code = ?');
      params.push(filter.currencyCode);
    }
    if (filter.method !== undefined) {
      clauses.push('method = ?');
      params.push(filter.method);
    }
    if (filter.statuses !== undefined && filter.statuses.length > 0) {
      clauses.push(`status in (${filter.statuses.map(() => '?').join(', ')})`);
      params.push(...filter.statuses);
    } else if (filter.status !== undefined) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    if (filter.createdAfter !== undefined) {
      clauses.push('created_at > ?');
      params.push(filter.createdAfter as string);
    }
    if (filter.createdBefore !== undefined) {
      clauses.push('created_at <= ?');
      params.push(filter.createdBefore as string);
    }

    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where ${clauses.join(' and ')}
       order by settlement_date desc
       limit ? offset ?`,
      [...params, pagination.limit + 1, offset] as never,
    );
    return paginateRows(rows.map(mapSettlementRow), pagination.limit, offset);
  }

  async listPendingConfirmation(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where group_id = ? and deleted_at is null and status = 'pending_confirmation'
       order by settlement_date desc
       limit ? offset ?`,
      [groupId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapSettlementRow), pagination.limit, offset);
  }

  async listDisputed(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where group_id = ? and deleted_at is null and status = 'disputed'
       order by settlement_date desc
       limit ? offset ?`,
      [groupId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapSettlementRow), pagination.limit, offset);
  }

  async findByOperationId(operationId: string): Promise<Settlement | null> {
    const row = await this.db.get<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where operation_id = ? and deleted_at is null`,
      [operationId],
    );
    return row ? mapSettlementRow(row) : null;
  }

  async findByPaymentReferenceHash(
    groupId: GroupId,
    paymentReferenceHash: string,
  ): Promise<Settlement | null> {
    const row = await this.db.get<SqlRow>(
      `select ${SETTLEMENT_COLUMNS} from settlements
       where group_id = ? and payment_reference_hash = ? and deleted_at is null`,
      [groupId, paymentReferenceHash],
    );
    return row ? mapSettlementRow(row) : null;
  }

  async listStateHistory(
    settlementId: SettlementId,
  ): Promise<readonly SettlementStateHistoryEntry[]> {
    const rows = await this.db.all<SqlRow>(
      `select * from settlement_state_history
       where settlement_id = ?
       order by created_at asc`,
      [settlementId],
    );
    return rows.map(mapSettlementStateHistoryRow);
  }

  // -----------------------------------------------------------------------
  // Writes
  // -----------------------------------------------------------------------

  async save(settlement: Settlement): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(`select id from settlements where id = ?`, [
        settlement.id,
      ]);
      const isCreate = !existing;

      await writeSettlementRow(tx, settlement, isCreate);

      await enqueueSyncOpWithin(tx, {
        entityType: 'settlement',
        entityId: settlement.id as string,
        operation: isCreate ? 'create' : 'update',
        payload: settlementSyncPayload(settlement),
        idempotencyKey: syncIdempotencyKey(
          'settlement',
          settlement.id as string,
          isCreate ? 'create' : 'update',
          settlement.version as number,
        ),
        baseVersion: isCreate ? 0 : (settlement.version as number) - 1,
        localVersion: settlement.version as number,
      });
    });
  }

  async softDelete(id: SettlementId, metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    return this.db.transaction(async (tx) => {
      const row = await tx.get<SqlRow>(
        `select ${SETTLEMENT_COLUMNS} from settlements where id = ?`,
        [id],
      );
      if (!row) {
        throw new DatabaseError(`Settlement ${id} not found`, { code: 'NOT_FOUND' });
      }
      const currentDeletedAt = row['deleted_at'] as string | null;
      if (currentDeletedAt) {
        // Idempotent replay: return the existing tombstone untouched.
        return {
          id: id as string,
          deletedAt: asDateTime(currentDeletedAt),
          version: asVersionNumber(row['version'] as number),
        };
      }
      const deletedAt = metadata.deletedAt;
      const newVersion = asVersionNumber((row['version'] as number) + 1);
      await tx.run(
        `update settlements set deleted_at = ?, updated_at = ?, version = ? where id = ?`,
        [deletedAt as string, deletedAt as string, newVersion as number, id],
      );
      await enqueueSyncOpWithin(tx, {
        entityType: 'settlement',
        entityId: id as string,
        operation: 'delete',
        payload: { id, deletedAt, reason: metadata.reason ?? null },
        idempotencyKey: syncIdempotencyKey(
          'settlement',
          id as string,
          'delete',
          newVersion as number,
        ),
        baseVersion: row['version'] as number,
        localVersion: newVersion as number,
      });
      return { id: id as string, deletedAt, version: newVersion };
    });
  }

  async saveReversal(reversal: Settlement): Promise<Settlement> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(`select id from settlements where id = ?`, [
        reversal.id,
      ]);
      const isCreate = !existing;

      await writeSettlementRow(tx, reversal, isCreate);

      await enqueueSyncOpWithin(tx, {
        entityType: 'settlement',
        entityId: reversal.id as string,
        operation: isCreate ? 'create' : 'update',
        payload: settlementSyncPayload(reversal),
        idempotencyKey: syncIdempotencyKey(
          'settlement',
          reversal.id as string,
          isCreate ? 'create' : 'update',
          reversal.version as number,
        ),
        baseVersion: isCreate ? 0 : (reversal.version as number) - 1,
        localVersion: reversal.version as number,
      });
    });
    return reversal;
  }

  async appendStateHistory(
    settlementId: SettlementId,
    transition: {
      readonly fromStatus: NonNullable<Settlement['status']>;
      readonly toStatus: NonNullable<Settlement['status']>;
      readonly actorId?: UserId;
      readonly actorMemberId?: MemberId;
      readonly note?: string;
      readonly newVersion: number;
    },
  ): Promise<void> {
    // Append-only — no update path exists for state history.
    await this.db.run(
      `insert into settlement_state_history (
         id, settlement_id, from_status, to_status, actor_id,
         actor_member_id, note, new_version, created_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newRowId(),
        settlementId,
        transition.fromStatus,
        transition.toStatus,
        transition.actorId ?? null,
        transition.actorMemberId ?? null,
        transition.note ?? null,
        transition.newVersion,
        nowDateTime() as string,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Shared row writer
// ---------------------------------------------------------------------------

/**
 * Insert or update the settlements row. Kept as a module-level helper so
 * `save` and `saveReversal` write EXACTLY the same columns — a divergence
 * between the two paths would be a sync-corruption bug.
 */
async function writeSettlementRow(
  tx: { run(sql: string, params?: readonly unknown[]): Promise<unknown> },
  settlement: Settlement,
  isCreate: boolean,
): Promise<void> {
  if (isCreate) {
    await tx.run(
      `insert into settlements (
         id, group_id, from_member_id, to_member_id, amount_minor,
         currency_code, method, settlement_date, note,
         reverses_settlement_id, reversal_of_settlement_id, status,
         confirmed_by_member_id, confirmed_at, payment_reference_hash,
         operation_id, evidence_hash, dispute_reason, dispute_note,
         created_by, created_at, updated_at, deleted_at, version,
         last_modified_by, client_created_at, client_updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settlement.id,
        settlement.groupId,
        settlement.fromMemberId,
        settlement.toMemberId,
        settlement.amountMinor,
        settlement.currencyCode,
        settlement.method,
        settlement.settlementDate as string,
        settlement.note ?? null,
        settlement.reversesSettlementId ?? null,
        settlement.reversalOfSettlementId ?? null,
        settlement.status ?? null,
        settlement.confirmedByMemberId ?? null,
        settlement.confirmedAt ? (settlement.confirmedAt as string) : null,
        settlement.paymentReferenceHash ?? null,
        settlement.operationId ?? null,
        settlement.evidenceHash ?? null,
        settlement.disputeReason ?? null,
        settlement.disputeNote ?? null,
        settlement.createdBy,
        settlement.createdAt as string,
        settlement.updatedAt as string,
        settlement.deletedAt ? (settlement.deletedAt as string) : null,
        settlement.version as number,
        settlement.createdBy,
        settlement.createdAt as string,
        settlement.updatedAt as string,
      ],
    );
  } else {
    await tx.run(
      `update settlements set
         group_id = ?, from_member_id = ?, to_member_id = ?, amount_minor = ?,
         currency_code = ?, method = ?, settlement_date = ?, note = ?,
         reverses_settlement_id = ?, reversal_of_settlement_id = ?, status = ?,
         confirmed_by_member_id = ?, confirmed_at = ?, payment_reference_hash = ?,
         operation_id = ?, evidence_hash = ?, dispute_reason = ?, dispute_note = ?,
         created_by = ?, created_at = ?, updated_at = ?, deleted_at = ?, version = ?,
         last_modified_by = ?, client_updated_at = ?
       where id = ?`,
      [
        settlement.groupId,
        settlement.fromMemberId,
        settlement.toMemberId,
        settlement.amountMinor,
        settlement.currencyCode,
        settlement.method,
        settlement.settlementDate as string,
        settlement.note ?? null,
        settlement.reversesSettlementId ?? null,
        settlement.reversalOfSettlementId ?? null,
        settlement.status ?? null,
        settlement.confirmedByMemberId ?? null,
        settlement.confirmedAt ? (settlement.confirmedAt as string) : null,
        settlement.paymentReferenceHash ?? null,
        settlement.operationId ?? null,
        settlement.evidenceHash ?? null,
        settlement.disputeReason ?? null,
        settlement.disputeNote ?? null,
        settlement.createdBy,
        settlement.createdAt as string,
        settlement.updatedAt as string,
        settlement.deletedAt ? (settlement.deletedAt as string) : null,
        settlement.version as number,
        settlement.createdBy,
        settlement.updatedAt as string,
        settlement.id,
      ],
    );
  }
}

/** Cloud-upload payload: the settlement snapshot as one unit. */
function settlementSyncPayload(settlement: Settlement): Record<string, unknown> {
  return {
    settlement: {
      id: settlement.id,
      group_id: settlement.groupId,
      from_member_id: settlement.fromMemberId,
      to_member_id: settlement.toMemberId,
      amount_minor: settlement.amountMinor,
      currency_code: settlement.currencyCode,
      method: settlement.method,
      settlement_date: settlement.settlementDate,
      note: settlement.note ?? null,
      reverses_settlement_id: settlement.reversesSettlementId ?? null,
      reversal_of_settlement_id: settlement.reversalOfSettlementId ?? null,
      status: settlement.status ?? null,
      confirmed_by_member_id: settlement.confirmedByMemberId ?? null,
      confirmed_at: settlement.confirmedAt ?? null,
      payment_reference_hash: settlement.paymentReferenceHash ?? null,
      operation_id: settlement.operationId ?? null,
      evidence_hash: settlement.evidenceHash ?? null,
      dispute_reason: settlement.disputeReason ?? null,
      dispute_note: settlement.disputeNote ?? null,
      created_by: settlement.createdBy,
      created_at: settlement.createdAt,
      updated_at: settlement.updatedAt,
      deleted_at: settlement.deletedAt ?? null,
      version: settlement.version,
      // v2.6.0 COMPLETENESS FIX: last_modified_by / client_created_at /
      // client_updated_at are NOT NULL without defaults in the cloud
      // schema — the previous partial payload failed every settlement
      // upload on a live project (23502). Values mirror this
      // repository's INSERT exactly.
      last_modified_by: settlement.createdBy,
      client_created_at: settlement.createdAt,
      client_updated_at: settlement.updatedAt,
    },
  };
}
