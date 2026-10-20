import type { SyncCursorRepository } from '@domain/repositories/sync-cursor.repository';
import {
  DOWNLOAD_ENTITY_ORDER,
  OVERLAP_WINDOW_MS,
  type IncrementalDownloadPort,
  type RemoteChange,
  type RemoteEntityType,
} from '@domain/services/sync/incremental-download';
import { nowDateTime } from '@domain/value-objects';
import type { DateTime } from '@domain/value-objects/date-time';

import type { RemoteApplyOutcome, RemoteChangeApplier } from './remote-change-applier.port';

/**
 * Download coordinator — v2.6.0 (bidirectional sync, CLOUD→DEVICE).
 *
 * Orchestrates the incremental pull: for every synced entity
 * collection (parent-first), page the remote change feed, apply each
 * change through the `RemoteChangeApplier`, and persist the cursor
 * checkpoint only after the page was applied.
 *
 * ── Consistency rules ──
 *
 *   1. RESTART-SAFE: the cursor is saved AFTER a page is applied. A
 *      crash replays the page; applying is version-guarded and
 *      idempotent, so replay converges without duplicates.
 *   2. PARENT-FIRST: collections download in DOWNLOAD_ENTITY_ORDER
 *      (groups → members → invites → expenses → payers → splits →
 *      settlements) so foreign keys resolve within one run.
 *   3. NOTHING IS SILENTLY DROPPED: a change whose parent is missing
 *      locally (or that fails to apply) HOLDS the collection cursor
 *      before itself and stops that collection for this run — the row
 *      is retried on the next pull, and the condition surfaces in the
 *      sync status instead of being swallowed.
 *   4. CURSOR RECOVERY: an unparseable cursor is discarded (full
 *      re-download of that collection). Re-downloads are safe:
 *      applying a same-version row is a skip.
 *   5. BOUNDED WORK: maxPagesPerCollection bounds a single run so one
 *      huge backfill cannot monopolise the sync loop — the next page
 *      continues on the next trigger.
 */
export class DownloadCoordinator {
  private readonly pageLimit: number;
  private readonly maxPagesPerCollection: number;

  constructor(
    private readonly feed: IncrementalDownloadPort,
    private readonly applier: RemoteChangeApplier,
    private readonly cursors: SyncCursorRepository,
    options?: { readonly pageLimit?: number; readonly maxPagesPerCollection?: number },
  ) {
    this.pageLimit = options?.pageLimit ?? 200;
    this.maxPagesPerCollection = options?.maxPagesPerCollection ?? 50;
  }

  /**
   * Discard every collection cursor (manual "full re-sync").
   * Safe: applying a remote row is version-guarded and idempotent, so
   * a full re-download converges without duplicating anything.
   */
  async resetCursors(): Promise<void> {
    await this.cursors.resetAll();
  }

  /**
   * Download every collection in dependency order.
   * A hard feed failure (network/auth) stops the remaining collections
   * — they will be picked up by the next sync trigger.
   */
  async downloadAll(): Promise<DownloadRunResult> {
    const startedAt = nowDateTime();
    const totals = emptyTotals();
    let error: DownloadRunError | null = null;

    for (const entityType of DOWNLOAD_ENTITY_ORDER) {
      const result = await this.downloadCollection(entityType);
      totals.downloadedCount += result.downloadedCount;
      totals.appliedCount += result.appliedCount;
      totals.skippedCount += result.skippedCount;
      totals.conflictCount += result.conflictCount;
      totals.deferredCount += result.deferredCount;
      totals.failedCount += result.failedCount;
      totals.cursorResets += result.cursorResets;

      if (result.error !== null) {
        error = result.error;
        // Auth/network failures will hit every subsequent collection
        // too — stop the run honestly rather than hammering the API.
        if (
          result.error.errorCode === 'NETWORK_UNAVAILABLE' ||
          result.error.errorCode === 'AUTH_TOKEN_EXPIRED' ||
          result.error.errorCode === 'NOT_CONFIGURED'
        ) {
          break;
        }
      }
    }

    return {
      startedAt,
      finishedAt: nowDateTime(),
      ...totals,
      error,
    };
  }

  /**
   * Download one collection from its cursor. Never throws — every
   * failure mode is folded into the result so the sync coordinator can
   * surface it without crashing the run.
   */
  async downloadCollection(entityType: RemoteEntityType): Promise<CollectionDownloadResult> {
    const startedAt = nowDateTime();
    const counts = {
      downloadedCount: 0,
      appliedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      deferredCount: 0,
      failedCount: 0,
      cursorResets: 0,
    };

    // ── Cursor recovery ──
    let cursor = await this.cursors.get(entityType);
    if (cursor !== null && !isValidCursor(cursor)) {
      // Unparseable/corrupt cursor (e.g. manual SQLite edit, partial
      // write from an old format) → discard and re-read everything.
      // Re-downloads are replay-safe (version-guarded skip).
      await this.cursors.reset(entityType);
      cursor = null;
      counts.cursorResets = 1;
    }

    // ── Overlap window (late-commit guard) ──
    // A long-running transaction can commit a row whose updated_at
    // (set at trigger time) is BELOW a cursor this device already
    // saved — the pull that saved the cursor could not see the
    // uncommitted row. Lowering the first page's watermark by
    // OVERLAP_WINDOW_MS re-reads that zone; re-read rows are skipped
    // by version, so the overlap is pure safety, never duplication.
    // A null cursor (first sync) needs no overlap.
    let queryCursor = cursor === null ? null : lowerCursorForOverlap(cursor);
    let pages = 0;

    try {
      while (pages < this.maxPagesPerCollection) {
        const page = await this.feed.downloadChanges(entityType, queryCursor, this.pageLimit);
        pages += 1;
        counts.downloadedCount += page.changes.length;

        for (let i = 0; i < page.changes.length; i += 1) {
          const change = page.changes[i] as RemoteChange;
          const outcome = await this.applier.apply(change);
          countOutcome(counts, outcome);

          // HOLD: never advance the checkpoint past a change that could
          // not be applied. Save the position BEFORE the change so the
          // next pull retries exactly this row.
          if (outcome.action === 'deferred' || outcome.action === 'failed') {
            const holdCursor =
              i === 0 ? queryCursor : formatCursorPosition(page.changes[i - 1] as RemoteChange);
            if (holdCursor !== null) {
              await this.cursors.save(entityType, holdCursor);
            }
            return {
              entityType,
              startedAt,
              finishedAt: nowDateTime(),
              ...counts,
              ...(outcome.action === 'failed'
                ? {
                    error: {
                      entityType,
                      errorCode: outcome.errorCode,
                      errorMessage: outcome.errorMessage,
                    },
                  }
                : {
                    error: {
                      entityType,
                      errorCode: 'PARENT_MISSING',
                      errorMessage:
                        `Remote ${change.entityType} ${change.entityId} references a ` +
                        `${outcome.parentEntityType} (${outcome.parentEntityId}) that is not ` +
                        'downloaded yet — the cursor is held and this row retries on the next pull.',
                    },
                  }),
            };
          }
        }

        if (!page.hasMore) {
          // Complete page set — persist the safe checkpoint. (The feed
          // returns nextCursor = the watermark of the last row; null
          // when the collection is empty and no cursor existed.)
          if (page.nextCursor !== null) {
            await this.cursors.save(entityType, page.nextCursor);
          }
          break;
        }

        // More pages — persist the intermediate checkpoint too, so an
        // app kill mid-backfill resumes instead of restarting.
        if (page.nextCursor !== null) {
          await this.cursors.save(entityType, page.nextCursor);
          queryCursor = page.nextCursor;
        } else {
          break; // defensive: hasMore without a cursor cannot continue
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        entityType,
        startedAt,
        finishedAt: nowDateTime(),
        ...counts,
        error: {
          entityType,
          errorCode: classifyFeedError(err),
          errorMessage: message,
        },
      };
    }

    return {
      entityType,
      startedAt,
      finishedAt: nowDateTime(),
      ...counts,
      error: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export interface CollectionDownloadResult {
  readonly entityType: RemoteEntityType;
  readonly startedAt: DateTime;
  readonly finishedAt: DateTime;
  readonly downloadedCount: number;
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly conflictCount: number;
  readonly deferredCount: number;
  readonly failedCount: number;
  readonly cursorResets: number;
  readonly error: DownloadRunError | null;
}

export interface DownloadRunError {
  readonly entityType: RemoteEntityType;
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface DownloadRunResult {
  readonly startedAt: DateTime;
  readonly finishedAt: DateTime;
  readonly downloadedCount: number;
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly conflictCount: number;
  readonly deferredCount: number;
  readonly failedCount: number;
  readonly cursorResets: number;
  readonly error: DownloadRunError | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyTotals(): {
  downloadedCount: number;
  appliedCount: number;
  skippedCount: number;
  conflictCount: number;
  deferredCount: number;
  failedCount: number;
  cursorResets: number;
} {
  return {
    downloadedCount: 0,
    appliedCount: 0,
    skippedCount: 0,
    conflictCount: 0,
    deferredCount: 0,
    failedCount: 0,
    cursorResets: 0,
  };
}

function countOutcome(
  counts: {
    appliedCount: number;
    skippedCount: number;
    conflictCount: number;
    deferredCount: number;
    failedCount: number;
  },
  outcome: RemoteApplyOutcome,
): void {
  switch (outcome.action) {
    case 'applied':
      counts.appliedCount += 1;
      break;
    case 'skipped':
      counts.skippedCount += 1;
      break;
    case 'conflicted':
      counts.conflictCount += 1;
      break;
    case 'deferred':
      counts.deferredCount += 1;
      break;
    case 'failed':
      counts.failedCount += 1;
      break;
  }
}

/**
 * The watermark position of a change in `(occurredAt, entityId)` form —
 * the SAME format the Supabase feed uses for cursors. Exported for the
 * feed implementation and tests so the two can never drift.
 */
export function formatCursorPosition(change: RemoteChange): string {
  return `${change.occurredAt as string}|${change.entityId}`;
}

/** A cursor is valid when it is `<iso-timestamp>|<non-empty-id>`. */
export function isValidCursor(cursor: string): boolean {
  const separatorIndex = cursor.lastIndexOf('|');
  if (separatorIndex <= 0) return false;
  const timestamp = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);
  if (id.length === 0) return false;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed);
}

/**
 * Lower a cursor's timestamp by the overlap window, keeping the row id
 * (an empty-id bucket matches everything at that timestamp — exactly
 * the re-read the guard needs). Returns null for cursors that cannot
 * be parsed (the caller then does a full re-download).
 */
export function lowerCursorForOverlap(cursor: string): string | null {
  const separatorIndex = cursor.lastIndexOf('|');
  if (separatorIndex <= 0) return null;
  const timestamp = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  const lowered = new Date(parsed - OVERLAP_WINDOW_MS);
  return `${lowered.toISOString()}|${id}`;
}

/** Map a feed error to the sync error-code space (reused classifier). */
export function classifyFeedError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes('Failed to fetch') ||
    message.includes('Network request failed') ||
    message.includes('network')
  ) {
    return 'NETWORK_UNAVAILABLE';
  }
  const code = extractErrorCode(message);
  switch (code) {
    case '401':
    case 'PGRST301':
      // JWT expired / invalid — transient; refresh + retry next trigger.
      return 'AUTH_TOKEN_EXPIRED';
    case 'PGRST116':
      return 'VERSION_CONFLICT';
    case '42501':
      return 'PERMISSION_CHANGED';
    case '23505':
      return 'DUPLICATE_CREATION';
    case '23503':
      return 'PARENT_DELETED_REMOTELY';
    case '429':
      return 'RATE_LIMIT';
    case '503':
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'SERVER_ERROR';
  }
}

function extractErrorCode(message: string): string {
  const match = message.match(/\b(PGRST\d+|42501|23505|23503|401|429|503)\b/);
  return match?.[1] ?? 'UNKNOWN';
}
