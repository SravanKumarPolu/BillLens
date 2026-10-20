import type { SyncRepository } from '@domain/repositories/sync.repository';
import {
  computeNextRetry,
  DEFAULT_RETRY_POLICY,
  type RetryPolicyConfig,
} from '@domain/services/sync/retry-policy';
import {
  classifySyncError,
  shouldRetryOperation,
} from '@domain/services/sync/sync-error-classifier';
import { nowDateTime } from '@domain/value-objects';

import type { DownloadCoordinator } from './download-coordinator';
import type {
  ConnectivityPort,
  RemoteSyncPort,
  SyncRunResult,
  SyncStatus,
  SyncTrigger,
} from './sync-coordinator-types';

/**
 * Sync Coordinator — Phase 7 Prompt 62.
 *
 * The central coordinator that orchestrates the sync loop. It is the
 * ONLY entry point for starting a sync run — no other component
 * should directly call the SyncRepository's processing methods.
 *
 * ── Responsibilities ──
 *
 *   1. Locking: prevent overlapping sync runs (process-level lock).
 *   2. Connectivity: check online status before starting; skip if offline.
 *   3. Processing: dequeue operations, upload via RemoteSyncPort,
 *      handle success/error/conflict.
 *   4. Download (v2.6.0): after the upload phase, pull remote changes
 *      through the DownloadCoordinator (incremental, cursor-based,
 *      conflict-aware). Push-then-pull ordering means a local edit
 *      reaches the cloud before remote state is reconciled against it,
 *      which minimises false conflicts and keeps parent rows ahead of
 *      children on both sides.
 *   5. Retry: apply the retry policy (bounded exponential backoff
 *      with jitter) for retriable errors; mark permanent errors as
 *      permanently failed.
 *   6. Recovery: recover stuck operations on startup.
 *   7. Status: expose the current sync status for the UI.
 *
 * ── Locking ──
 *
 * A simple boolean flag (`isRunning`) prevents overlapping runs
 * within the same JavaScript runtime. For multi-runtime safety
 * (e.g. React Native's background task runner), the database-level
 * lock is the `syncing` status on the `sync_operations` table —
 * the `recoverStuckSyncing` method resets stale operations.
 *
 * When a sync is requested while one is already running:
 *   - If the trigger is `pull_to_refresh` or `user_retry` (user-
 *     initiated), the request is SKIPPED (the existing run will
 *     handle the pending operations).
 *   - If the trigger is `push_notification` or `network_reconnect`,
 *     the request is also SKIPPED (the existing run is already
 *     processing).
 *   - The skipped result is returned with `skipped: true`.
 *
 * ── Error handling ──
 *
 * For each operation:
 *   1. Call `RemoteSyncPort.uploadOperation`.
 *   2. On `success`: mark completed.
 *   3. On `conflict`: mark conflict (user review required).
 *   4. On `error`: classify the error code:
 *      - `retriable`: increment retry count, compute next retry time,
 *        mark failed with scheduled retry.
 *      - `requires_intervention`: mark conflict.
 *      - `permanent`: mark permanently failed.
 *   5. If retries are exhausted: mark permanently failed.
 *
 * The coordinator stops processing after encountering the first
 * retriable error IF the error is `NETWORK_UNAVAILABLE` (the device
 * went offline mid-sync). For other retriable errors, it continues
 * processing remaining operations (they might succeed independently).
 */
export class SyncCoordinator {
  private isRunning = false;
  private currentStatus: SyncStatus = 'idle';
  private connectivityUnsubscribe: (() => void) | null = null;
  private retryTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly retryPolicy: RetryPolicyConfig;
  /** v2.6.0: optional download phase (bidirectional sync). */
  private readonly downloadCoordinator: DownloadCoordinator | null;
  /** v2.6.0: the last download result, for diagnostics and the UI. */
  private lastDownloadError: { entityType: string; errorCode: string; errorMessage: string } | null = null;

  constructor(
    private readonly syncRepo: SyncRepository,
    private readonly connectivity: ConnectivityPort,
    private readonly remoteSync: RemoteSyncPort,
    retryPolicy?: Partial<RetryPolicyConfig>,
    /** v2.6.0 — omit for a push-only coordinator (legacy test harnesses). */
    downloadCoordinator?: DownloadCoordinator,
  ) {
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...retryPolicy };
    this.downloadCoordinator = downloadCoordinator ?? null;
  }

  /**
   * Start the coordinator. Subscribes to connectivity changes and
   * recovers stuck operations.
   *
   * Should be called once at app startup.
   */
  async start(): Promise<void> {
    // v2.5.0: recover ALL operations stuck in 'syncing' from a previous
    // crash/force-quit. The old 5-minute threshold left an op that was
    // killed seconds before relaunch invisible for the WHOLE session
    // (it was neither retried nor counted as pending work). At boot no
    // upload can be in flight — the previous runtime is gone — so every
    // 'syncing' row is stale by definition.
    const recovered = await this.syncRepo.recoverStuckSyncing(nowDateTime());
    if (recovered > 0) {
      // Log for diagnostics — the coordinator does not throw on
      // recovery; it just resets the stuck operations.
    }

    // Subscribe to connectivity changes.
    this.connectivityUnsubscribe = this.connectivity.onConnectivityChange(
      async (online) => {
        if (online) {
          await this.requestSync('network_reconnect');
        } else {
          this.currentStatus = 'offline';
        }
      },
    );

    // Check initial connectivity and trigger a startup sync.
    const online = await this.connectivity.isOnline();
    if (online) {
      await this.requestSync('app_startup');
    } else {
      this.currentStatus = 'offline';
    }
  }

  /**
   * Stop the coordinator. Unsubscribes from connectivity changes.
   *
   * Should be called once at app termination/backgrounding.
   */
  async stop(): Promise<void> {
    if (this.connectivityUnsubscribe !== null) {
      this.connectivityUnsubscribe();
      this.connectivityUnsubscribe = null;
    }
    if (this.retryTimerHandle !== null) {
      clearTimeout(this.retryTimerHandle);
      this.retryTimerHandle = null;
    }
    this.isRunning = false;
    this.currentStatus = 'idle';
  }

  /**
   * Request a sync run. If a run is already in progress, the
   * request is skipped (see locking rules above).
   */
  async requestSync(trigger: SyncTrigger): Promise<SyncRunResult> {
    const startedAt = nowDateTime();

    // ── Lock check ──
    // Set the lock IMMEDIATELY (before any await) so that a
    // concurrent call in the same JS tick sees the lock and skips.
    if (this.isRunning) {
      return {
        trigger,
        startedAt,
        finishedAt: nowDateTime(),
        processedCount: 0,
        failedCount: 0,
        permanentlyFailedCount: 0,
        conflictedCount: 0,
        blockedCount: 0,
        skipped: true,
        skipReason: 'A sync run is already in progress',
      };
    }
    // Acquire the lock BEFORE the first await — this is critical
    // for the single-threaded JS event loop: both the lock check
    // and the lock acquisition are synchronous, so a concurrent
    // call that arrives in the same tick sees the lock.
    this.isRunning = true;

    // ── Connectivity check ──
    const online = await this.connectivity.isOnline();
    if (!online) {
      this.isRunning = false; // release the lock
      this.currentStatus = 'offline';
      return {
        trigger,
        startedAt,
        finishedAt: nowDateTime(),
        processedCount: 0,
        failedCount: 0,
        permanentlyFailedCount: 0,
        conflictedCount: 0,
        blockedCount: 0,
        skipped: true,
        skipReason: 'Device is offline',
      };
    }

    // ── Set status to running ──
    this.currentStatus = 'running';

    let processedCount = 0;
    let failedCount = 0;
    let permanentlyFailedCount = 0;
    let conflictedCount = 0;
    let blockedCount = 0;

    // ── Download phase counters (v2.6.0) ──
    let downloadedCount: number | undefined;
    let downloadAppliedCount: number | undefined;
    let downloadSkippedCount: number | undefined;
    let downloadConflictCount: number | undefined;
    let downloadDeferredCount: number | undefined;
    let downloadCursorResets: number | undefined;

    try {
      // ── Process operations ──
      // Process in batches to avoid holding the lock too long.
      const BATCH_SIZE = 50;
      let hasMore = true;

      while (hasMore) {
        const pending = await this.syncRepo.listReadyForRetry(BATCH_SIZE);
        if (pending.length === 0) {
          // No more operations ready for processing.
          break;
        }

        for (const op of pending) {
          // Check connectivity (the device may have gone offline mid-sync).
          const stillOnline = await this.connectivity.isOnline();
          if (!stillOnline) {
            this.currentStatus = 'offline';
            // Stop processing; the remaining operations will be retried
            // when connectivity returns.
            hasMore = false;
            break;
          }

          // Mark as syncing.
          await this.syncRepo.markSyncing(op.id);

          // Upload.
          const result = await this.remoteSync.uploadOperation(op);

          if (result.status === 'success') {
            await this.syncRepo.markCompleted(op.id);
            processedCount++;
          } else if (result.status === 'conflict') {
            // v2.5.0: conflict records now carry the FULL operation
            // context (entity type/id, both versions, both payloads,
            // category) so the review UI can render a usable diff.
            // Previously only {cloudVersion, cloudPayload} was passed,
            // producing rows with entity_type 'unknown', version 0 and
            // a null local payload.
            await this.syncRepo.markConflict(op.id, {
              entityType: op.entityType,
              entityId: op.entityId,
              category: 'version_conflict',
              localVersion: op.localVersion,
              cloudVersion: result.cloudVersion,
              localPayload: op.payload,
              ...(result.cloudPayload !== undefined ? { cloudPayload: result.cloudPayload } : {}),
              baseVersion: op.baseVersion,
            });
            conflictedCount++;
          } else {
            // Error — classify and handle
            const category = classifySyncError(result.errorCode);
            const newRetryCount = op.retryCount + 1;

            if (category === 'permanent') {
              await this.syncRepo.markPermanentlyFailed(
                op.id,
                result.errorCode,
                result.errorMessage,
              );
              permanentlyFailedCount++;
            } else if (category === 'requires_intervention') {
              // v2.5.0: same rich conflict metadata as version conflicts.
              await this.syncRepo.markConflict(op.id, {
                entityType: op.entityType,
                entityId: op.entityId,
                category: conflictCategoryForErrorCode(result.errorCode),
                localVersion: op.localVersion,
                cloudVersion: 0,
                localPayload: op.payload,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
                baseVersion: op.baseVersion,
              });
              conflictedCount++;
            } else {
              // Retriable
              if (
                shouldRetryOperation(
                  op.operation,
                  result.errorCode,
                  newRetryCount,
                  this.retryPolicy.maxAttempts,
                )
              ) {
                const nextRetry = computeNextRetry(
                  newRetryCount,
                  this.retryPolicy,
                  nowDateTime(),
                  result.retryAfterMs,
                );
                await this.syncRepo.markFailed(
                  op.id,
                  result.errorCode,
                  result.errorMessage,
                  nextRetry,
                );
                failedCount++;
              } else {
                // Exhausted retries
                await this.syncRepo.markPermanentlyFailed(
                  op.id,
                  result.errorCode,
                  `${result.errorMessage} (exhausted ${this.retryPolicy.maxAttempts} retries)`,
                );
                permanentlyFailedCount++;
              }

              // If the error is network unavailable, stop processing
              // remaining operations — they'll also fail.
              if (result.errorCode === 'NETWORK_UNAVAILABLE') {
                this.currentStatus = 'offline';
                hasMore = false;
                break;
              }
            }
          }
        }
      }

      // ── Check for blocked operations ──
      const blocked = await this.syncRepo.listBlocked(BATCH_SIZE);
      blockedCount = blocked.length;

      // ── Download phase (v2.6.0, bidirectional sync) ──
      // Runs AFTER the upload phase: pending local edits are already
      // on the server (or marked conflicted), so remote reconciliation
      // sees the freshest possible base. Runs even when the upload
      // phase found nothing — other users' changes arrive here.
      if (this.downloadCoordinator !== null) {
        const stillOnline = await this.connectivity.isOnline();
        if (stillOnline) {
          this.currentStatus = 'running';
          const downloadResult = await this.downloadCoordinator.downloadAll();
          downloadedCount = downloadResult.downloadedCount;
          downloadAppliedCount = downloadResult.appliedCount;
          downloadSkippedCount = downloadResult.skippedCount;
          downloadConflictCount = downloadResult.conflictCount;
          downloadDeferredCount = downloadResult.deferredCount;
          downloadCursorResets = downloadResult.cursorResets;

          conflictedCount += downloadResult.conflictCount;
          blockedCount += downloadResult.deferredCount;
          if (downloadResult.error !== null) {
            this.lastDownloadError = downloadResult.error;
            const category = classifySyncError(downloadResult.error.errorCode);
            if (category === 'retriable') {
              failedCount += 1;
            } else if (category === 'requires_intervention') {
              conflictedCount += 1;
            } else {
              permanentlyFailedCount += 1;
            }
          } else {
            this.lastDownloadError = null;
          }
        }
      }
    } finally {
      // ── Release lock ──
      this.isRunning = false;

      // ── Update status ──
      if (failedCount > 0) {
        this.currentStatus = 'running_with_errors';
      } else if (permanentlyFailedCount > 0) {
        this.currentStatus = 'permanently_failed';
      } else if (conflictedCount > 0) {
        this.currentStatus = 'conflict';
      } else if (blockedCount > 0) {
        this.currentStatus = 'blocked';
      } else {
        this.currentStatus = 'idle';
      }
    }

    // ── Schedule the next retry run (v2.5.0) ──
    // Previously `next_retry_at` was written but NOTHING re-invoked
    // requestSync when the backoff window elapsed — a failed op could
    // sit for hours until an unrelated trigger fired. After each run
    // with failures, arm a one-shot timer for the earliest due retry
    // (bounded: max 5 minutes out, so a far-future backoff still gets
    // picked up by connectivity/forground triggers first).
    this.scheduleRetryTimer();

    return {
      trigger,
      startedAt,
      finishedAt: nowDateTime(),
      processedCount,
      failedCount,
      permanentlyFailedCount,
      conflictedCount,
      blockedCount,
      skipped: false,
      ...(downloadedCount !== undefined ? { downloadedCount } : {}),
      ...(downloadAppliedCount !== undefined ? { downloadAppliedCount } : {}),
      ...(downloadSkippedCount !== undefined ? { downloadSkippedCount } : {}),
      ...(downloadConflictCount !== undefined ? { downloadConflictCount } : {}),
      ...(downloadDeferredCount !== undefined ? { downloadDeferredCount } : {}),
      ...(downloadCursorResets !== undefined ? { downloadCursorResets } : {}),
    };
  }

  /**
   * Get the current sync status for the UI.
   */
  async getStatus(): Promise<SyncStatus> {
    return this.currentStatus;
  }

  /**
   * The last download-phase error (v2.6.0), or null when the last
   * download run completed cleanly. The sync settings screen surfaces
   * this honestly instead of hiding pull failures behind upload state.
   */
  getDownloadError(): { entityType: string; errorCode: string; errorMessage: string } | null {
    return this.lastDownloadError;
  }

  /**
   * Manually retry a failed operation. Resets the retry count and
   * triggers a sync run.
   */
  async retryOperation(operationId: string): Promise<void> {
    await this.syncRepo.resetForRetry(operationId);
    await this.requestSync('user_retry');
  }

  /**
   * Cancel a pending operation.
   */
  async cancelOperation(operationId: string): Promise<void> {
    await this.syncRepo.cancelOperation(operationId);
  }

  /**
   * Discard every download cursor so the next sync re-downloads all
   * collections from the beginning (manual "full re-sync" in the sync
   * settings). Safe: applying a remote row is version-guarded, so the
   * replay converges without duplicating anything.
   */
  async resetFullSync(): Promise<void> {
    await this.downloadCoordinator?.resetCursors();
  }

  // ------------------------------------------------------------------
  // Retry timer (v2.5.0)
  // ------------------------------------------------------------------

  /**
   * Arm a one-shot timer that re-runs the sync when the earliest
   * scheduled retry becomes due. Cleared by `stop()` and re-armed after
   * every run — never overlapping (the run lock absorbs late firings),
   * never infinite (bounded by MAX_SYNC_RETRIES per operation).
   */
  private scheduleRetryTimer(): void {
    if (this.retryTimerHandle !== null) {
      clearTimeout(this.retryTimerHandle);
      this.retryTimerHandle = null;
    }
    void (async () => {
      const failed = await this.syncRepo.listFailed(50);
      const dueTimes = failed
        .map((o) => o.nextRetryAt)
        .filter((t): t is Exclude<typeof t, undefined> => t !== undefined && t !== null)
        .map((t) => Date.parse(String(t)));
      if (dueTimes.length === 0) return; // nothing scheduled
      const earliestDueMs = Math.min(...dueTimes) - Date.now();
      if (earliestDueMs <= 0) {
        // Already due — fire on the next tick (skip when a run holds
        // the lock; the lock check inside requestSync handles overlap).
        this.retryTimerHandle = setTimeout(() => {
          this.retryTimerHandle = null;
          void this.requestSync('retry_timer');
        }, 0);
        return;
      }
      const delayMs = Math.min(Math.max(earliestDueMs, 1_000), this.retryPolicy.maxDelayMs);
      this.retryTimerHandle = setTimeout(() => {
        this.retryTimerHandle = null;
        void this.requestSync('retry_timer');
      }, delayMs);
      // Node/test runtimes: keep the pending timer from holding the
      // process open. React Native's setTimeout ignores this safely.
      (this.retryTimerHandle as unknown as { unref?: () => void }).unref?.();
    })();
  }
}

/**
 * Map a sync error code to the conflict category recorded in the
 * sync_conflicts table (v2.5.0 — previously every requires-intervention
 * error was recorded as the default 'version_conflict').
 */
export function conflictCategoryForErrorCode(errorCode: string): string {
  switch (errorCode) {
    case 'PERMISSION_CHANGED':
      return 'permission_changed';
    case 'PARENT_DELETED_REMOTELY':
      return 'parent_deleted_remotely';
    case 'IDENTITY_LINK_CONFLICT':
      return 'identity_link_conflict';
    case 'PRIVACY_POLICY_CONFLICT':
      return 'privacy_policy_conflict';
    case 'DELETED_REMOTELY':
      return 'deleted_remotely';
    case 'MEMBERSHIP_CONFLICT':
      return 'membership_conflict';
    case 'DUPLICATE_CREATION':
      return 'duplicate_creation';
    case 'FINANCIAL_RECORD_CONFLICT':
      return 'financial_record_conflict';
    case 'VERSION_CONFLICT':
    default:
      return 'version_conflict';
  }
}
