import type { RemoteChange } from '@domain/services/sync/incremental-download';

/**
 * Remote change applier — port (v2.6.0, bidirectional sync).
 *
 * Applies a remote change (from the incremental-download feed) to the
 * LOCAL database. This is the cloud→local WRITE path and it is
 * deliberately separate from the local repositories: the repositories
 * co-enqueue an upload sync-op with every mutation (that is correct for
 * user edits), while applying a REMOTE change must NOT re-enqueue
 * anything — otherwise every downloaded row would bounce straight back
 * to the cloud as a pending upload (the echo loop).
 *
 * Each call is REPLAY-SAFE: applying the same remote change twice is
 * a no-op the second time (version-guarded skip).
 */
export interface RemoteChangeApplier {
  /**
   * Apply one remote change to the local database.
   *
   * The decision (apply / skip / conflict / defer) follows the pure
   * reconciliation rules in
   * `@domain/services/sync/incremental-download.ts#reconcileChange`:
   *
   *   - No local record            → apply remote (create)
   *   - Same version               → skip
   *   - Remote newer, local clean  → apply remote
   *   - Local pending, remote = base → skip (the pending upload wins)
   *   - Local pending, remote changed → record conflict (user review)
   *   - Remote delete + local pending edit → HIGH-PRIORITY conflict
   */
  apply(change: RemoteChange): Promise<RemoteApplyOutcome>;

  /**
   * keep_local — re-base the local edit onto the current cloud version
   * (row version := cloudVersion + 1, conflicted upload op := pending
   * with base = cloudVersion) and requeue it. The next sync uploads
   * the local aggregate and wins the guarded update.
   */
  keepLocalVersion(input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly cloudVersion: number;
  }): Promise<RemoteConflictResolutionOutcome>;

  /**
   * keep_cloud — write the cloud payload locally (exactly as the
   * server holds it) and cancel every pending local op for the entity
   * so the stale local version can never re-upload.
   */
  applyCloudVersion(input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly cloudPayload: Readonly<Record<string, unknown>>;
  }): Promise<RemoteConflictResolutionOutcome>;
}

/** The result of applying one remote change. */
export type RemoteApplyOutcome =
  | { readonly action: 'applied'; readonly entityId: string }
  | { readonly action: 'skipped'; readonly entityId: string; readonly reason: 'same_version' | 'continue_upload' }
  | { readonly action: 'conflicted'; readonly entityId: string; readonly category: string }
  /**
   * The change references a parent that does not exist locally yet
   * (e.g. an expense whose group row has not been downloaded). The
   * download coordinator HOLDS the collection cursor before this
   * change and retries it on the next pull — a financial record is
   * never silently dropped because its parent lost a race.
   */
  | { readonly action: 'deferred'; readonly entityId: string; readonly reason: 'parent_missing'; readonly parentEntityType: string; readonly parentEntityId: string }
  | { readonly action: 'failed'; readonly entityId: string; readonly errorCode: string; readonly errorMessage: string };

/** Aggregate outcome of applying a page/batch of remote changes. */
export interface RemoteApplyBatchResult {
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly conflictCount: number;
  readonly deferredCount: number;
  readonly failedCount: number;
}

/**
 * The user's decision on a download-detected conflict (v2.6.0).
 *
 * Financial conflicts are NEVER auto-merged — the user explicitly
 * chooses one side, and BOTH operations are deterministic and safe:
 *
 *   - keep_local: the local edit wins. The local row's version is
 *     bumped ABOVE the cloud version and the conflicted upload op is
 *     re-based onto the cloud version (base = cloud, local = cloud+1)
 *     so the guarded update succeeds without a new conflict cycle.
 *   - keep_cloud: the remote state wins. The cloud payload is written
 *     locally and every pending local op for that entity is cancelled
 *     so the stale local version can never re-upload.
 */
export type ConflictResolutionAction = 'keep_local' | 'keep_cloud';

export interface RemoteConflictResolutionOutcome {
  readonly action: ConflictResolutionAction;
  readonly status: 'resolved' | 'failed';
  readonly errorMessage?: string;
}
