import type { UserId } from '@shared-types/index';

import type { DateTime } from '../value-objects/date-time';

/**
 * Version number used by the sync system.
 *
 * NOTE: This is a plain `number` (not the branded `VersionNumber` value
 * object) because sync operations legitimately reference version 0
 * ("no prior cloud version"). The branded `VersionNumber` value object
 * requires ≥ 1, which is correct for entity versions but not for sync
 * base versions.
 */
export type SyncVersion = number;

/**
 * Sync operation — a single pending change to be uploaded to the cloud.
 *
 * Sync operations are queued locally (SQLite). The cloud has no
 * `sync_queue` table; instead, the sync worker applies each operation
 * to the appropriate cloud table and removes it from the local queue
 * on success.
 *
 * ── Phase 7 extensions (Prompt 61) ──
 *
 * The entity type, operation type, and status unions have been
 * extended to support Phase 6 entities and Phase 7 operation kinds.
 * The `SyncOperation` interface gains `dependencyOperationIds` and
 * `payloadVersion`. All changes are additive — existing callers
 * continue to work because the old status/operation/type values are
 * still valid (the Phase 1 values are subsets of the Phase 7 unions).
 */
export type SyncEntityType =
  | 'group'
  | 'group_member'
  | 'group_invite'
  | 'expense'
  | 'expense_payer'
  | 'expense_split'
  | 'receipt'
  | 'receipt_item'
  | 'settlement'
  // Phase 6 additions
  | 'settlement_state_history'
  | 'settlement_reminder'
  | 'payment_handle'
  | 'preference';

export type SyncOperationType =
  | 'create'
  | 'update'
  | 'delete'
  // Phase 7 additions
  | 'restore'
  | 'upload'
  | 'link'
  | 'confirm'
  | 'reverse';

/**
 * The lifecycle status of a sync operation.
 *
 * Phase 1 values (`pending`, `syncing`, `failed`, `conflict`,
 * `completed`) are preserved as aliases for backwards compatibility.
 * Phase 7 adds `retry_wait`, `blocked`, `permanently_failed`,
 * `cancelled`.
 *
 *   - `pending` (alias for `queued`) — waiting to be processed
 *   - `syncing` (alias for `processing`) — being uploaded
 *   - `failed` — a retryable failure; will be retried
 *   - `retry_wait` — failed but waiting for the backoff timer to expire
 *   - `blocked` — waiting for a dependency to complete
 *   - `conflict` — requires user review
 *   - `completed` — successfully synced, removed from queue
 *   - `permanently_failed` — exhausted all retries or hit a permanent error
 *   - `cancelled` — user or system cancelled the operation
 */
export type SyncOperationStatus =
  | 'pending'
  | 'queued'
  | 'syncing'
  | 'processing'
  | 'failed'
  | 'retry_wait'
  | 'blocked'
  | 'conflict'
  | 'completed'
  | 'permanently_failed'
  | 'cancelled';

export interface SyncOperation {
  readonly id: string;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly operation: SyncOperationType;
  /** Serialised payload to upload. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Idempotency key — server uses this to dedupe retries. */
  readonly idempotencyKey: string;
  /** The version the client had when queueing this op (for optimistic concurrency). */
  readonly baseVersion: SyncVersion;
  /** The new version the client is writing. */
  readonly localVersion: SyncVersion;
  readonly status: SyncOperationStatus;
  readonly retryCount: number;
  readonly lastErrorCode?: string;
  readonly lastErrorMessage?: string;
  readonly createdAt: DateTime;
  readonly lastAttemptedAt?: DateTime;
  readonly nextRetryAt?: DateTime;
  // ── Phase 7 additions ──
  /**
   * IDs of sync operations that must complete before this one can
   * be processed. Used for dependency ordering: parent-before-child
   * creation, delete-after-pending-update, attachment-upload-after-
   * parent-creation, settlement-confirmation-after-creation, reversal-
   * after-completed-settlement.
   */
  readonly dependencyOperationIds?: readonly string[];
  /**
   * The version of the payload schema. Incremented when the payload
   * format changes. The backend validates this — an unsupported
   * payload version is a permanent error, not a retriable one.
   */
  readonly payloadVersion?: number;
}

/**
 * Repository for the local `sync_operations` table.
 *
 * This repository is LOCAL-ONLY — sync operations live in SQLite, not in
 * the cloud. The cloud has no `sync_queue` table.
 */
export interface SyncRepository {
  /** Enqueue a new sync operation. Returns the persisted record. */
  enqueue(operation: Omit<SyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt'>): Promise<SyncOperation>;
  /** Get the next pending operation (FIFO order). */
  nextPending(): Promise<SyncOperation | null>;
  /** List all pending operations, ordered by createdAt ASC. */
  listPending(limit: number): Promise<readonly SyncOperation[]>;
  /** List operations that are ready for retry (nextRetryAt <= now or null). */
  listReadyForRetry(limit: number): Promise<readonly SyncOperation[]>;
  /** List operations that have exhausted all retries (permanently failed). */
  listPermanentlyFailed(limit: number): Promise<readonly SyncOperation[]>;
  /** List failed operations for the UI's "retry failed syncs" screen. */
  listFailed(limit: number): Promise<readonly SyncOperation[]>;
  /** Mark an operation as syncing (about to be uploaded). */
  markSyncing(id: string): Promise<void>;
  /** Mark an operation as completed and remove it from the queue. */
  markCompleted(id: string): Promise<void>;
  /** Mark an operation as failed with an error and schedule a retry. */
  markFailed(id: string, errorCode: string, errorMessage: string, nextRetryAt: DateTime | null): Promise<void>;
  /** Mark an operation as conflicting — requires user review. */
  markConflict(id: string, conflictDetails: Readonly<Record<string, unknown>>): Promise<void>;
  /** Manually retry a failed operation (resets retryCount). */
  resetForRetry(id: string): Promise<void>;
  /** Count pending operations (for the UI's "N changes pending" indicator). */
  countPending(): Promise<number>;
  /**
   * Count operations awaiting USER REVIEW (conflict + permanently
   * failed) — v2.5.0. The UI must show these as NOT synced; conflating
   * them with "all synced" hides real data-integrity problems.
   */
  countConflicts(): Promise<number>;
  /** Get a specific operation by ID. */
  findById(id: string): Promise<SyncOperation | null>;
  /** Recover sync operations stuck in 'syncing' status (e.g. from a crashed app). */
  recoverStuckSyncing(olderThan?: DateTime): Promise<number>;

  // ── Phase 7 additions (Prompt 61) ──

  /**
   * List operations that are blocked because their dependencies have
   * not completed. Returns operations whose `dependencyOperationIds`
   * contain at least one id that is still in the queue (not completed).
   */
  listBlocked(limit: number): Promise<readonly SyncOperation[]>;

  /**
   * Check whether all dependencies of an operation have completed.
   * Returns true if every `dependencyOperationId` is either not in
   * the queue (already completed) or is in the queue with status
   * `completed`. Used by the sync coordinator to decide whether a
   * blocked operation can be unblocked.
   */
  areDependenciesMet(operationId: string): Promise<boolean>;

  /**
   * Mark an operation as permanently failed. Used when the error
   * classification determines the error is permanent (invalid payload,
   * unsupported schema version, etc.) — the operation should not be
   * retried.
   */
  markPermanentlyFailed(id: string, errorCode: string, errorMessage: string): Promise<void>;

  /**
   * Cancel an operation. Used by the user or the system to remove
   * an operation from the queue without processing it. The operation's
   * `status` becomes `cancelled`.
   */
  cancelOperation(id: string): Promise<void>;

  /**
   * Compact redundant pending operations for the same entity.
   *
   * If there are multiple pending operations for the same
   * (entityType, entityId), the compaction may merge them:
   *
   *   - create + update + update → single create with the latest payload
   *   - create + delete → cancel both (if the entity never reached
   *     the server and local policy allows)
   *
   * Returns the number of operations removed by compaction.
   *
   * The compaction does NOT destroy audit history — the original
   * operations remain in the audit log. Only the queue is compacted.
   */
  compactPendingOperations(): Promise<number>;

  /**
   * List all operations for a specific entity (any status), ordered
   * by `createdAt` ASC. Used by the compaction logic and by the UI's
   * "sync history" view.
   */
  listByEntity(entityType: SyncEntityType, entityId: string): Promise<readonly SyncOperation[]>;
}

/**
 * Conflict record — created when a sync operation conflicts with the
 * cloud state. Financial conflicts require user review and are never
 * silently overwritten.
 */
export type ConflictCategory =
  | 'version_conflict'
  | 'deleted_remotely'
  | 'deleted_locally'
  | 'membership_conflict'
  | 'financial_record_conflict'
  | 'duplicate_creation'
  | 'permission_conflict'
  // v2.6.0: categories the coordinator actually derives from sync error
  // codes (conflictCategoryForErrorCode) + the download-side conflict.
  // The local CHECK constraint was aligned in migration 0007 — before
  // that, writing these on a real device threw and crashed the loop.
  | 'permission_changed'
  | 'parent_deleted_remotely'
  | 'identity_link_conflict'
  | 'privacy_policy_conflict'
  | 'remote_change_conflict';

export interface SyncConflict {
  readonly id: string;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly category: ConflictCategory;
  readonly localVersion: number;
  readonly cloudVersion: number;
  readonly localPayload?: Readonly<Record<string, unknown>>;
  readonly cloudPayload?: Readonly<Record<string, unknown>>;
  readonly resolution?: 'local_wins' | 'cloud_wins' | 'merged' | 'user_review' | 'pending';
  readonly resolvedAt?: DateTime;
  readonly resolvedBy?: UserId;
  readonly createdAt: DateTime;
}

export interface SyncConflictRepository {
  save(conflict: SyncConflict): Promise<void>;
  findById(id: string): Promise<SyncConflict | null>;
  listUnresolved(limit: number): Promise<readonly SyncConflict[]>;
  resolve(id: string, resolution: SyncConflict['resolution'], resolvedBy: UserId): Promise<void>;
}
