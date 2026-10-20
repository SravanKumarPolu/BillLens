import type { SyncOperation } from '@domain/repositories/sync.repository';
import type { DateTime } from '@domain/value-objects';

/**
 * Sync trigger types — Phase 7 Prompt 62.
 *
 * The reason a sync run was requested. Used for logging, analytics,
 * and to decide whether to allow overlapping runs (e.g. a background
 * trigger should NOT override a user-initiated pull-to-refresh).
 *
 * Spec (Prompt 62) lists these triggers:
 *
 *   App startup
 *   User signs in
 *   Network reconnects
 *   App returns to foreground
 *   User pulls to refresh
 *   User taps retry
 *   Background task
 *   Account upgrade resumes
 *   Push notification indicates remote change
 */
export type SyncTrigger =
  | 'app_startup'
  | 'user_signin'
  | 'network_reconnect'
  | 'app_foreground'
  | 'pull_to_refresh'
  | 'user_retry'
  | 'background_task'
  | 'account_upgrade'
  | 'push_notification'
  | 'retry_timer'
  | 'manual';

/**
 * The current status of the sync coordinator.
 *
 *   - `idle` — no sync run in progress, no pending operations
 *   - `running` — a sync run is in progress
 *   - `running_with_errors` — a sync run is in progress but some
 *     operations have failed (retriable errors)
 *   - `offline` — the device is offline; sync is paused
 *   - `blocked` — one or more operations are blocked by dependencies
 *   - `permanently_failed` — one or more operations have permanently
 *     failed and require user intervention
 *   - `conflict` — one or more operations have conflicts that require
 *     user resolution
 */
export type SyncStatus =
  | 'idle'
  | 'running'
  | 'running_with_errors'
  | 'offline'
  | 'blocked'
  | 'permanently_failed'
  | 'conflict';

/**
 * The result of a single sync run.
 *
 * v2.6.0: a run is now BIDIRECTIONAL — the upload phase (push pending
 * local ops) runs first, then the download phase (pull remote changes).
 * The download counters are additive and optional so existing callers
 * (and tests) keep compiling; when a run was skipped before reaching
 * the download phase the fields are simply absent.
 */
export interface SyncRunResult {
  /** The trigger that started this run. */
  readonly trigger: SyncTrigger;
  /** When the run started. */
  readonly startedAt: DateTime;
  /** When the run finished. */
  readonly finishedAt: DateTime;
  /** Number of operations successfully processed (upload phase). */
  readonly processedCount: number;
  /** Number of operations that failed (retriable). */
  readonly failedCount: number;
  /** Number of operations that permanently failed. */
  readonly permanentlyFailedCount: number;
  /** Number of operations that conflicted. */
  readonly conflictedCount: number;
  /** Number of operations skipped (blocked by dependencies). */
  readonly blockedCount: number;
  /** True if the run was skipped because another run was in progress. */
  readonly skipped: boolean;
  /** The reason the run was skipped, if applicable. */
  readonly skipReason?: string;

  // ── Download phase (v2.6.0, bidirectional sync) ──
  /** Remote rows fetched during the download phase. */
  readonly downloadedCount?: number;
  /** Remote rows applied to the local database. */
  readonly downloadAppliedCount?: number;
  /** Remote rows skipped (same version / pending-upload wins). */
  readonly downloadSkippedCount?: number;
  /** Remote changes that produced a user-review conflict. */
  readonly downloadConflictCount?: number;
  /** Remote rows deferred (missing parent — retried next pull). */
  readonly downloadDeferredCount?: number;
  /** Collections whose cursor was discarded (full re-download). */
  readonly downloadCursorResets?: number;
}

/**
 * Port: connectivity detection.
 *
 * The concrete implementation uses React Native's `NetInfo` module
 * (or a mock in tests). The coordinator calls `isOnline()` before
 * starting a sync run; if offline, it sets the status to `offline`
 * and returns immediately.
 *
 * The port also supports event-based connectivity change
 * notifications: when the network reconnects, the coordinator
 * should automatically request a sync.
 */
export interface ConnectivityPort {
  /** Check whether the device currently has network connectivity. */
  isOnline(): Promise<boolean>;

  /**
   * Subscribe to connectivity change events. Returns an unsubscribe
   * function. When the network transitions from offline → online,
   * the callback is called with `true`.
   */
  onConnectivityChange(callback: (online: boolean) => void): () => void;
}

/**
 * Port: remote sync endpoint.
 *
 * The concrete implementation makes HTTP requests to the Supabase
 * backend. The coordinator calls `uploadOperation` for each
 * operation in the queue; the port returns success, an error code,
 * or a conflict.
 */
export interface RemoteSyncPort {
  /**
   * Upload a single sync operation to the cloud.
   *
   * Returns:
   *   - `{ status: 'success' }` — the operation was accepted.
   *   - `{ status: 'conflict', cloudVersion, cloudPayload }` — version
   *     conflict; the coordinator marks the operation as conflicting.
   *   - `{ status: 'error', errorCode, errorMessage, retryAfterMs? }` —
   *     the upload failed. The coordinator classifies the error and
   *     schedules a retry or marks as permanent.
   */
  uploadOperation(
    operation: SyncOperation,
  ): Promise<
    | { readonly status: 'success' }
    | {
        readonly status: 'conflict';
        readonly cloudVersion: number;
        readonly cloudPayload?: Readonly<Record<string, unknown>>;
      }
    | {
        readonly status: 'error';
        readonly errorCode: string;
        readonly errorMessage: string;
        readonly retryAfterMs?: number;
      }
  >;
}

/**
 * Port: download cursor management for incremental sync.
 *
 * The coordinator calls `getCursor` at the start of a sync run to
 * get the last-synced timestamp, then `downloadChanges` to fetch
 * remote changes since that timestamp. After processing the
 * changes, it calls `saveCursor` with the new timestamp.
 *
 * This port is defined here but the concrete implementation is
 * deferred to Prompt 63 (Incremental Download).
 */
export interface DownloadCursorPort {
  getCursor(): Promise<DateTime | null>;
  saveCursor(cursor: DateTime): Promise<void>;
}
