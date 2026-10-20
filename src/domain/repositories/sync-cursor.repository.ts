import type { SyncEntityType } from './sync.repository';

/**
 * Sync cursor repository — v2.6.0 (bidirectional sync).
 *
 * Persists the incremental-download checkpoint for each synced entity
 * collection. The cursor value is an opaque string produced by the
 * `IncrementalDownloadPort` implementation (for Supabase: the
 * `(updated_at, id)` watermark tuple of the last applied remote row).
 *
 * ── Contract rules ──
 *
 *   1. CURSORS ARE PER ENTITY COLLECTION — each table downloads
 *      independently, so a failure downloading expenses never blocks
 *      groups from syncing.
 *   2. SAVE ONLY AFTER APPLY — the download coordinator saves the
 *      cursor only after a page of remote changes has been applied
 *      (or deliberately skipped). A crash between apply and save
 *      replays the page, which is safe because applying a remote row
 *      is version-guarded and idempotent.
 *   3. RESET = FULL RE-DOWNLOAD — resetting a cursor (or returning
 *      null) forces the next pull to re-read the whole table from the
 *      beginning. Applying is replay-safe (same version → skip), so a
 *      reset is always safe, merely slower. Used for manual "full
 *      re-sync" and for recovering from corrupt cursors.
 */
export interface SyncCursorRepository {
  /**
   * Get the stored cursor for an entity collection.
   * Returns null when no checkpoint exists (first sync or after reset).
   */
  get(entityType: SyncEntityType): Promise<string | null>;

  /** Persist the cursor for an entity collection (upsert). */
  save(entityType: SyncEntityType, cursorValue: string): Promise<void>;

  /** Clear the cursor for one entity collection (full re-download next pull). */
  reset(entityType: SyncEntityType): Promise<void>;

  /** Clear ALL cursors (full re-download of every collection next pull). */
  resetAll(): Promise<void>;

  /**
   * List every stored cursor (diagnostics — the sync settings screen
   * shows per-collection freshness honestly).
   */
  listAll(): Promise<readonly SyncCursorRecord[]>;
}

/** A stored cursor record (diagnostics shape). */
export interface SyncCursorRecord {
  readonly entityType: SyncEntityType;
  readonly cursorValue: string;
  /** When this cursor was last advanced (local wall clock). */
  readonly updatedAt: string;
}
