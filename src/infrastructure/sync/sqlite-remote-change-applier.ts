/**
 * SqliteRemoteChangeApplier — v2.6.0 (bidirectional sync, CLOUD→DEVICE).
 *
 * Applies remote changes to the local SQLite database following the
 * pure reconciliation rules (`reconcileChange` in
 * `@domain/services/sync/incremental-download.ts`).
 *
 * ── Why this is a separate write path ──
 *
 * The local repositories (`SqliteExpenseRepository` & co.) always
 * co-enqueue an UPLOAD sync-op inside the same transaction as the entity
 * write — correct for user edits, catastrophic for downloads: applying a
 * remote row through them would re-enqueue it for upload (the echo
 * loop). This applier writes the SAME tables with the SAME column
 * mappings but deliberately enqueues NOTHING.
 *
 * ── Decision table (reconcileChange) ──
 *
 *   remote delete + local pending edit   → HIGH-PRIORITY conflict
 *   no local record                      → apply (create)
 *   same version                         → skip (replay-safe)
 *   local pending, remote = base         → skip (pending upload wins)
 *   local pending, remote moved          → conflict (user review)
 *   remote newer, local clean            → apply (overwrite local)
 *
 * ── Financial safety ──
 *
 *   - Remote rows are written EXACTLY as the server holds them
 *     (version, timestamps, deleted_at) — the cloud is authoritative
 *     for financial records.
 *   - A change whose parent is missing locally is DEFERRED (cursor
 *     holds before it) — a financial record is never dropped because
 *     its group/member lost a pagination race.
 *   - A pending LOCAL edit on the parent expense suppresses remote
 *     child-row changes (payers/splits) — the local aggregate is the
 *     unit of upload; mixing remote children into a locally-pending
 *     aggregate would corrupt the balance math.
 *   - Conflicts are recorded with BOTH payloads and are never
 *     auto-resolved. One unresolved conflict per entity (replay-safe).
 */

import type { RemoteChangeApplier, RemoteApplyOutcome, RemoteConflictResolutionOutcome } from '@application/sync/remote-change-applier.port';
import type { SyncConflict, SyncEntityType } from '@domain/repositories/sync.repository';
import {
  reconcileChange,
  type RemoteChange,
  type RemoteEntityType,
} from '@domain/services/sync/incremental-download';
import { nowDateTime } from '@domain/value-objects';

import type { DatabaseConnection, SqlParam, SqlRow } from '../sqlite/database-connection';
import { newRowId } from '../sqlite/row-mappers';

import type { SqliteSyncConflictRepository } from './sqlite-sync-conflict-repository';

/** Sync-operation statuses that mean "a local mutation is in flight". */
const PENDING_OP_STATUSES =
  "('pending', 'queued', 'syncing', 'processing', 'failed', 'retry_wait', 'blocked')";

/** Entity types that carry financial meaning (stricter conflict labels). */
const FINANCIAL_ENTITY_TYPES: readonly SyncEntityType[] = [
  'expense',
  'expense_payer',
  'expense_split',
  'settlement',
];

/** Local columns written for each entity type (cloud row → local row). */
const COLUMN_WHITELISTS: Record<string, readonly string[]> = {
  group: [
    'id', 'name', 'description', 'currency_code', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version', 'last_modified_by',
    'client_created_at', 'client_updated_at',
  ],
  group_member: [
    'id', 'group_id', 'user_id', 'display_name', 'role', 'joined_at',
    'left_at', 'created_at', 'updated_at', 'version', 'created_by',
    'last_modified_by', 'client_created_at', 'client_updated_at',
  ],
  group_invite: [
    'id', 'group_id', 'token', 'token_hash', 'inviter_member_id',
    'invitee_display_name', 'invitee_email', 'status', 'intended_role',
    'max_uses', 'use_count', 'expires_at', 'accepted_by_member_id',
    'accepted_at', 'revoked_at', 'created_at', 'updated_at', 'deleted_at',
    'version', 'created_by', 'last_modified_by', 'client_created_at',
    'client_updated_at',
  ],
  expense: [
    'id', 'group_id', 'title', 'amount_minor', 'currency_code',
    'expense_date', 'split_type', 'receipt_id', 'note', 'category',
    'created_by', 'created_at', 'updated_at', 'deleted_at', 'version',
    'last_modified_by', 'client_created_at', 'client_updated_at',
  ],
  expense_payer: [
    'id', 'expense_id', 'member_id', 'amount_minor', 'deleted_at',
    'created_at', 'updated_at', 'version', 'created_by',
    'last_modified_by', 'client_created_at', 'client_updated_at',
  ],
  expense_split: [
    'id', 'expense_id', 'member_id', 'amount_minor',
    'percentage_basis_points', 'share_units', 'deleted_at', 'created_at',
    'updated_at', 'version', 'created_by', 'last_modified_by',
    'client_created_at', 'client_updated_at',
  ],
  settlement: [
    'id', 'group_id', 'from_member_id', 'to_member_id', 'amount_minor',
    'currency_code', 'method', 'settlement_date', 'note',
    'reverses_settlement_id', 'reversal_of_settlement_id', 'created_by',
    'created_at', 'updated_at', 'deleted_at', 'version',
    'last_modified_by', 'client_created_at', 'client_updated_at',
    'status', 'confirmed_by_member_id', 'confirmed_at',
    'payment_reference_hash', 'operation_id', 'evidence_hash',
    'dispute_reason', 'dispute_note',
  ],
};

/** Local table for each downloadable entity type. */
const TABLES: Record<string, string> = {
  group: 'groups',
  group_member: 'group_members',
  group_invite: 'group_invites',
  expense: 'expenses',
  expense_payer: 'expense_payers',
  expense_split: 'expense_splits',
  settlement: 'settlements',
};

/** Parent FKs of each entity type: [local column, parent entity type]. */
const PARENT_FKS: Record<string, readonly (readonly [string, RemoteEntityType])[]> = {
  group: [],
  group_member: [['group_id', 'group']],
  group_invite: [
    ['group_id', 'group'],
    ['inviter_member_id', 'group_member'],
  ],
  expense: [['group_id', 'group']],
  expense_payer: [
    ['expense_id', 'expense'],
    ['member_id', 'group_member'],
  ],
  expense_split: [
    ['expense_id', 'expense'],
    ['member_id', 'group_member'],
  ],
  settlement: [
    ['group_id', 'group'],
    ['from_member_id', 'group_member'],
    ['to_member_id', 'group_member'],
  ],
};

/** Values accepted by the local `settlements.method` CHECK constraint. */
const LOCAL_SETTLEMENT_METHODS = new Set(['cash', 'upi', 'bank_transfer', 'other']);

export class SqliteRemoteChangeApplier implements RemoteChangeApplier {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly conflicts: SqliteSyncConflictRepository,
  ) {}

  async apply(change: RemoteChange): Promise<RemoteApplyOutcome> {
    const entityType = change.entityType as SyncEntityType;
    const table = TABLES[change.entityType];
    if (table === undefined) {
      return {
        action: 'failed',
        entityId: change.entityId,
        errorCode: 'UNSUPPORTED_ENTITY_TYPE',
        errorMessage: `No local table mapping for remote entity type "${change.entityType}"`,
      };
    }

    try {
      // ── Local state ──
      const localRow = await this.db.get<SqlRow>(
        `select * from ${table} where id = ?`,
        [change.entityId],
      );
      const localVersion = localRow ? (localRow['version'] as number) : null;
      const latestPendingOp = await this.latestPendingOp(entityType, change.entityId);
      const hasLocalPending = latestPendingOp !== null;
      const baseVersion = latestPendingOp ? (latestPendingOp['base_version'] as number) : 0;

      // ── Pure reconciliation decision ──
      const decision = reconcileChange({
        remoteChange: change,
        localVersion,
        baseVersion,
        hasLocalPending,
      });

      switch (decision.action) {
        case 'skip_same_version':
        case 'continue_upload':
          return {
            action: 'skipped',
            entityId: change.entityId,
            reason: decision.action === 'continue_upload' ? 'continue_upload' : 'same_version',
          };

        case 'create_conflict':
        case 'create_high_priority_conflict':
          return await this.recordConflict(
            change,
            entityType,
            decision.action,
            localVersion ?? 0,
            localRow ?? null,
          );

        case 'apply_remote':
        case 'apply_remote_newer':
          return await this.writeRemoteRow(change);

        default:
          // reconcileChange is total — defensive only.
          return {
            action: 'skipped',
            entityId: change.entityId,
            reason: 'same_version',
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A missing PARENT (FK violation) is a deferrable condition, not a
      // failure: the cursor holds before this row and retries after the
      // parent lands.
      const missingParent = this.missingParentFromError(message, change);
      if (missingParent !== null) {
        return {
          action: 'deferred',
          entityId: change.entityId,
          reason: 'parent_missing',
          parentEntityType: missingParent[1],
          parentEntityId: missingParent[0],
        };
      }
      return {
        action: 'failed',
        entityId: change.entityId,
        errorCode: 'SERVER_ERROR',
        errorMessage: `Failed to apply remote ${change.entityType} ${change.entityId}: ${message}`,
      };
    }
  }

  // ------------------------------------------------------------------
  // Conflict handling
  // ------------------------------------------------------------------

  private async recordConflict(
    change: RemoteChange,
    entityType: SyncEntityType,
    action: 'create_conflict' | 'create_high_priority_conflict',
    localVersion: number,
    localRow: SqlRow | null,
  ): Promise<RemoteApplyOutcome> {
    const category: SyncConflict['category'] =
      action === 'create_high_priority_conflict'
        ? 'deleted_remotely'
        : FINANCIAL_ENTITY_TYPES.includes(entityType)
          ? 'financial_record_conflict'
          : 'remote_change_conflict';

    // Idempotency under sync replay: one UNRESOLVED conflict per
    // entity. A resolved (user-reviewed) conflict for an older remote
    // change must not block recording a NEW one.
    const unresolved = await this.conflicts.countUnresolvedForEntity(entityType, change.entityId);
    if (unresolved === 0) {
      // The LOCAL side of the diff: the entity's current row (what the
      // user sees) so the review UI can render both versions.
      let localPayload: Record<string, unknown> | undefined;
      if (localRow !== null) {
        localPayload = { ...localRow };
      } else {
        // No local row — surface the pending op's payload instead (e.g.
        // a remote delete that raced a local create this device has
        // queued but never uploaded).
        const pendingOp = await this.latestPendingOp(entityType, change.entityId);
        if (pendingOp !== null) {
          try {
            localPayload = JSON.parse(pendingOp['payload'] as string) as Record<string, unknown>;
          } catch {
            localPayload = undefined;
          }
        }
      }

      const conflict: SyncConflict = {
        id: newRowId(),
        entityType,
        entityId: change.entityId,
        category,
        localVersion,
        cloudVersion: change.version,
        ...(localPayload !== undefined ? { localPayload } : {}),
        cloudPayload: change.payload,
        resolution: 'pending',
        createdAt: change.occurredAt,
      };
      await this.conflicts.save(conflict);
    }

    return {
      action: 'conflicted',
      entityId: change.entityId,
      category,
    };
  }

  // ------------------------------------------------------------------
  // Conflict resolution (user decisions — never auto-merged)
  // ------------------------------------------------------------------

  async keepLocalVersion(input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly cloudVersion: number;
  }): Promise<RemoteConflictResolutionOutcome> {
    const table = TABLES[input.entityType];
    if (table === undefined) {
      return {
        action: 'keep_local',
        status: 'failed',
        errorMessage: `No local table for entity type "${input.entityType}"`,
      };
    }
    try {
      await this.db.transaction(async (tx) => {
        // 1. Bump the local row ABOVE the cloud version.
        const row = await tx.get<SqlRow>(`select version from ${table} where id = ?`, [
          input.entityId,
        ]);
        const newLocalVersion = input.cloudVersion + 1;
        if (row !== null && row !== undefined) {
          await tx.run(`update ${table} set version = ? where id = ?`, [
            newLocalVersion,
            input.entityId,
          ]);
        }

        // 2. Re-base the latest conflicted/pending upload op onto the
        //    cloud version and requeue it (base = cloud, local = cloud+1).
        const op = await tx.get<SqlRow>(
          `select * from sync_operations
           where entity_type = ? and entity_id = ? and status in ('conflict', 'failed', 'pending')
           order by created_at desc limit 1`,
          [input.entityType, input.entityId],
        );
        if (op !== null && op !== undefined) {
          const payload = JSON.parse((op['payload'] as string) ?? '{}') as Record<string, unknown>;
          // Keep the payload's embedded version fields consistent with
          // the re-based optimistic write.
          if (input.entityType === 'expense' && typeof payload['expense'] === 'object' && payload['expense'] !== null) {
            (payload['expense'] as Record<string, unknown>)['version'] = newLocalVersion;
          } else if (input.entityType === 'settlement' && typeof payload['settlement'] === 'object' && payload['settlement'] !== null) {
            (payload['settlement'] as Record<string, unknown>)['version'] = newLocalVersion;
          }
          payload['version'] = newLocalVersion;
          await tx.run(
            `update sync_operations
             set base_version = ?, local_version = ?, status = 'pending',
                 retry_count = 0, last_error_code = null, last_error_message = null,
                 next_retry_at = null, payload = ?, updated_at = ?
             where id = ?`,
            [
              input.cloudVersion,
              newLocalVersion,
              JSON.stringify(payload),
              nowDateTime() as string,
              op['id'] as string,
            ],
          );
        }
      });
      return { action: 'keep_local', status: 'resolved' };
    } catch (err) {
      return {
        action: 'keep_local',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async applyCloudVersion(input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly cloudPayload: Readonly<Record<string, unknown>>;
  }): Promise<RemoteConflictResolutionOutcome> {
    const table = TABLES[input.entityType];
    if (table === undefined) {
      return {
        action: 'keep_cloud',
        status: 'failed',
        errorMessage: `No local table for entity type "${input.entityType}"`,
      };
    }
    try {
      await this.writeRow(input.entityType, input.entityId, input.cloudPayload);
      // Cancel every in-flight local op for the entity so the stale
      // local version can never re-upload over the chosen cloud state.
      await this.db.run(
        `update sync_operations
         set status = 'cancelled', next_retry_at = null, updated_at = ?
         where entity_type = ? and entity_id = ?
           and status in ('pending', 'queued', 'failed', 'retry_wait', 'blocked', 'conflict')`,
        [nowDateTime() as string, input.entityType, input.entityId],
      );
      return { action: 'keep_cloud', status: 'resolved' };
    } catch (err) {
      return {
        action: 'keep_cloud',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ------------------------------------------------------------------
  // Row writing (NO sync-op enqueue — the download never echoes)
  // ------------------------------------------------------------------

  private async writeRemoteRow(change: RemoteChange): Promise<RemoteApplyOutcome> {
    const payload = normalizePayload(change.entityType, change.payload, change.entityId);

    // ── Parent integrity (defer, never drop) ──
    const missingParent = await this.firstMissingParent(change.entityType, payload);
    if (missingParent !== null) {
      return {
        action: 'deferred',
        entityId: change.entityId,
        reason: 'parent_missing',
        parentEntityType: missingParent[1],
        parentEntityId: missingParent[0],
      };
    }

    // ── Aggregate guard: a pending local edit owns the expense ──
    // Remote payer/split rows must not mutate a locally-pending
    // aggregate (the upload rewrites children wholesale on success).
    if (change.entityType === 'expense_payer' || change.entityType === 'expense_split') {
      const expenseId = payload['expense_id'];
      if (typeof expenseId === 'string') {
        const parentPending = await this.latestPendingOp('expense', expenseId);
        if (parentPending !== null) {
          return { action: 'skipped', entityId: change.entityId, reason: 'continue_upload' };
        }
      }
    }

    await this.writeRow(change.entityType, change.entityId, payload);
    return { action: 'applied', entityId: change.entityId };
  }

  /**
   * Write one remote row EXACTLY as the server holds it. No sync-op
   * enqueue (the download never echoes). Assumes parents exist — the
   * caller checked (or accepts the FK failure as 'failed').
   */
  private async writeRow(
    entityType: string,
    entityId: string,
    rawPayload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const table = TABLES[entityType];
    if (table === undefined) {
      throw new Error(`No local table mapping for entity type "${entityType}"`);
    }
    const payload = normalizePayload(entityType as RemoteEntityType, rawPayload, entityId);
    const columns = COLUMN_WHITELISTS[entityType] ?? [];
    const values: readonly SqlParam[] = columns.map((c) => (payload[c] ?? null) as SqlParam);

    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(`select id from ${table} where id = ?`, [entityId]);
      if (existing) {
        const updateColumns = columns.filter((c) => c !== 'id');
        const assignments = updateColumns.map((c) => `${c} = ?`).join(', ');
        await tx.run(
          `update ${table} set ${assignments} where id = ?`,
          [...updateColumns.map((c) => (payload[c] ?? null) as SqlParam), entityId],
        );
      } else {
        const placeholders = columns.map(() => '?').join(', ');
        await tx.run(
          `insert into ${table} (${columns.join(', ')}) values (${placeholders})`,
          values,
        );
      }

      // group_members tombstone mapping: the cloud soft-deletes a
      // membership with `deleted_at`; the local schema expresses the
      // same fact with `left_at` (which every local read filters on).
      if (entityType === 'group_member') {
        const deletedAt = payload['deleted_at'];
        const localLeftAt = payload['left_at'];
        if (typeof deletedAt === 'string' && (localLeftAt === null || localLeftAt === undefined)) {
          await tx.run(
            `update group_members set left_at = ? where id = ? and left_at is null`,
            [deletedAt, entityId],
          );
        }
      }
    });
  }

  /**
   * First parent (in FK order) whose row is missing locally, or null.
   * Used by the apply path to DEFER (never drop) an orphaned child row.
   */
  private async firstMissingParent(
    entityType: string,
    payload: Record<string, unknown>,
  ): Promise<readonly [string, string] | null> {
    for (const [column, parentType] of PARENT_FKS[entityType] ?? []) {
      const parentId = payload[column];
      if (typeof parentId !== 'string' || parentId.length === 0) continue;
      const parentTable = TABLES[parentType];
      const parentRow = await this.db.get<SqlRow>(
        `select id from ${parentTable} where id = ?`,
        [parentId],
      );
      if (!parentRow) return [parentId, parentType];
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Local state lookup
  // ------------------------------------------------------------------

  private async latestPendingOp(
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SqlRow | null> {
    const row = await this.db.get<SqlRow>(
      `select * from sync_operations
       where entity_type = ? and entity_id = ? and status in ${PENDING_OP_STATUSES}
       order by created_at desc limit 1`,
      [entityType, entityId],
    );
    return row ?? null;
  }

  /**
   * Detect "FOREIGN KEY constraint failed" (a parent landed AFTER this
   * row in the pull order, or was missed by an earlier pull) and map it
   * to the deferred outcome with the offending parent identity.
   */
  private missingParentFromError(
    message: string,
    change: RemoteChange,
  ): readonly [string, string] | null {
    if (!message.toLowerCase().includes('foreign key constraint')) return null;
    const fks = PARENT_FKS[change.entityType] ?? [];
    for (const [column, parentType] of fks) {
      const parentId = change.payload[column];
      if (typeof parentId === 'string' && parentId.length > 0) {
        return [parentId, parentType];
      }
    }
    return null;
  }
}

/** Payload normalization applied before any write. */
function normalizePayload(
  entityType: RemoteEntityType,
  raw: Readonly<Record<string, unknown>>,
  entityId?: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...raw };

  // The row's primary key: the cloud row carries `id`; fall back to the
  // change identity so a malformed feed payload can never write a row
  // with a null key.
  if (entityId !== undefined && (payload['id'] === null || payload['id'] === undefined)) {
    payload['id'] = entityId;
  }

  // Integers must arrive as integers (CHECK constraints and balance
  // math depend on it; JSON may deliver floats that are integral).
  for (const key of [
    'amount_minor', 'version', 'max_uses', 'use_count',
    'percentage_basis_points', 'share_units',
  ]) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      payload[key] = Math.trunc(value);
    }
  }

  // Settlement normalization for the local CHECK constraints.
  if (entityType === 'settlement') {
    const method = payload['method'];
    if (typeof method !== 'string' || !LOCAL_SETTLEMENT_METHODS.has(method)) {
      // Unknown/extended cloud method → 'other'. The method label is
      // not financial math; amounts are untouched.
      payload['method'] = 'other';
    }
    const status = payload['status'];
    if (status === null || status === undefined || status === '') {
      // Cloud treats NULL status as 'completed' (phase-6 migration) —
      // mirror that so the local state machine reads the same value.
      payload['status'] = 'completed';
    }
  }

  return payload;
}
