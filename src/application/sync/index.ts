/**
 * Sync coordinator application layer — Phase 7 Prompt 62 + v2.6.0.
 *
 * The `SyncCoordinator` is the central orchestrator for the sync loop.
 * It is the ONLY entry point for starting a sync run — no other
 * component should directly call the SyncRepository's processing
 * methods.
 *
 * ── Locking ──
 *
 * A boolean flag prevents overlapping runs within the same JS
 * runtime. The database-level lock is the `syncing` status on
 * `sync_operations` — the `recoverStuckSyncing` method resets stale
 * operations on startup.
 *
 * ── Retry ──
 *
 * Bounded exponential backoff with jitter (from the `retry-policy`
 * module). Server-provided retry-after values are respected.
 * Non-retriable errors (invalid payload, unsupported schema) are
 * marked as permanently failed and do NOT loop forever.
 *
 * ── Error classification ──
 *
 * Three categories: `retriable`, `requires_intervention`,
 * `permanent`. From the `sync-error-classifier` module (Prompt 61).
 *
 * ── Bidirectional sync (v2.6.0) ──
 *
 * A run is push-then-pull: the upload phase drains the queue, then the
 * `DownloadCoordinator` pulls remote changes (incremental, per-
 * collection cursors, conflict-aware, replay-safe). The
 * `RemoteChangeApplier` port keeps the coordinator decoupled from the
 * local storage engine.
 */

export * from './sync-coordinator-types';
export * from './sync-coordinator';
export * from './download-coordinator';
export * from './remote-change-applier.port';
export * from './resolve-remote-conflict.usecase';
