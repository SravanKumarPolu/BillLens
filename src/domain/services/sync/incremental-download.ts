/**
 * Incremental download types — Phase 7 Prompt 63.
 *
 * Defines the sync cursor, change feed, reconciliation rules, and
 * tombstone model for incremental cloud-to-device synchronisation.
 *
 * The existing `DownloadCursorPort` was defined in Prompt 62's
 * sync-coordinator-types.ts. This module adds the cursor model,
 * the change feed, and the pure reconciliation logic.
 */

import type { DateTime } from '@domain/value-objects/date-time';

// ---------------------------------------------------------------------------
// Sync cursor
// ---------------------------------------------------------------------------

export type SyncCursorScope = 'profile' | 'group' | 'entity_collection';

export interface SyncCursor {
  readonly scopeType: SyncCursorScope;
  readonly scopeId: string;
  readonly cursorValue: string;
  readonly lastSuccessfulSyncAt: DateTime;
  readonly schemaVersion: number;
}

// ---------------------------------------------------------------------------
// Change feed — a single remote change to download and reconcile
// ---------------------------------------------------------------------------

export type ChangeType = 'create' | 'update' | 'delete' | 'restore';

export type RemoteEntityType =
  | 'group'
  | 'group_member'
  | 'group_invite'
  | 'expense'
  | 'expense_payer'
  | 'expense_split'
  | 'receipt'
  | 'settlement'
  | 'settlement_state_history'
  | 'settlement_reminder'
  | 'payment_handle'
  | 'preference';

export interface RemoteChange {
  readonly entityType: RemoteEntityType;
  readonly entityId: string;
  readonly changeType: ChangeType;
  readonly version: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly deletedAt?: DateTime;
  readonly occurredAt: DateTime;
}

// ---------------------------------------------------------------------------
// Reconciliation result
// ---------------------------------------------------------------------------

export type ReconciliationAction =
  | 'apply_remote'        // No local pending mutation → apply remote
  | 'skip_same_version'    // Same version → do nothing
  | 'apply_remote_newer'  // Remote newer, local clean → apply remote
  | 'continue_upload'      // Local pending, remote unchanged from base → continue upload
  | 'create_conflict'      // Local pending and remote changed → conflict
  | 'create_high_priority_conflict'; // Remote deletion with local pending edit

export interface ReconciliationResult {
  readonly action: ReconciliationAction;
  readonly entityType: RemoteEntityType;
  readonly entityId: string;
  readonly remoteVersion: number;
  readonly localVersion: number;
  readonly baseVersion: number;
  readonly hasLocalPending: boolean;
}

// ---------------------------------------------------------------------------
// Pure reconciliation logic
// ---------------------------------------------------------------------------

/**
 * Determine the reconciliation action for a remote change.
 *
 * Pure function — no side effects, no I/O.
 *
 * ── Reconciliation rules (spec, Prompt 63) ──
 *
 *   No local pending mutation     → apply remote
 *   Same version                  → skip
 *   Remote newer, local clean     → apply remote
 *   Local pending, remote unchanged from base → continue upload
 *   Local pending and remote changed → create conflict
 *   Remote deletion with local pending edit → high-priority conflict
 */
export function reconcileChange(input: {
  readonly remoteChange: RemoteChange;
  readonly localVersion: number | null; // null = no local record
  readonly baseVersion: number; // 0 = no base version (never synced)
  readonly hasLocalPending: boolean;
}): ReconciliationResult {
  const { remoteChange, localVersion, baseVersion, hasLocalPending } = input;
  const remoteVersion = remoteChange.version;

  // Remote deletion with local pending edit → high-priority conflict
  if (remoteChange.changeType === 'delete' && hasLocalPending) {
    return {
      action: 'create_high_priority_conflict',
      entityType: remoteChange.entityType,
      entityId: remoteChange.entityId,
      remoteVersion,
      localVersion: localVersion ?? 0,
      baseVersion,
      hasLocalPending,
    };
  }

  // No local record → apply remote (create)
  if (localVersion === null) {
    return {
      action: 'apply_remote',
      entityType: remoteChange.entityType,
      entityId: remoteChange.entityId,
      remoteVersion,
      localVersion: 0,
      baseVersion,
      hasLocalPending,
    };
  }

  // Same version → skip
  if (localVersion === remoteVersion) {
    return {
      action: 'skip_same_version',
      entityType: remoteChange.entityType,
      entityId: remoteChange.entityId,
      remoteVersion,
      localVersion,
      baseVersion,
      hasLocalPending,
    };
  }

  // Local pending, remote unchanged from base → continue upload
  if (hasLocalPending && remoteVersion === baseVersion) {
    return {
      action: 'continue_upload',
      entityType: remoteChange.entityType,
      entityId: remoteChange.entityId,
      remoteVersion,
      localVersion,
      baseVersion,
      hasLocalPending,
    };
  }

  // Local pending and remote changed → conflict
  if (hasLocalPending && remoteVersion !== baseVersion) {
    return {
      action: 'create_conflict',
      entityType: remoteChange.entityType,
      entityId: remoteChange.entityId,
      remoteVersion,
      localVersion,
      baseVersion,
      hasLocalPending,
    };
  }

  // Remote newer, local clean → apply remote
  if (!hasLocalPending && remoteVersion > localVersion) {
    return {
      action: 'apply_remote_newer',
      entityType: remoteChange.entityType,
      entityId: remoteChange.entityId,
      remoteVersion,
      localVersion,
      baseVersion,
      hasLocalPending,
    };
  }

  // Remote older, local clean → skip (shouldn't happen in normal sync,
  // but be defensive)
  return {
    action: 'skip_same_version',
    entityType: remoteChange.entityType,
    entityId: remoteChange.entityId,
    remoteVersion,
    localVersion,
    baseVersion,
    hasLocalPending,
  };
}

// ---------------------------------------------------------------------------
// Late-commit overlap window
// ---------------------------------------------------------------------------

/**
 * How far BEFORE the stored cursor each pull re-reads (milliseconds).
 *
 * Guard against late commits: a long-running transaction writes its
 * rows with `updated_at` set at trigger time but only becomes visible
 * at COMMIT — possibly AFTER another device pulled past that timestamp.
 * Lowering the first page's watermark by this window re-reads the risk
 * zone; re-read rows are skipped by version, so the overlap is pure
 * safety, never duplication. Residual risk: a transaction left open
 * LONGER than this window can still be missed until the next full
 * re-sync (documented in docs/consistency-model.md).
 */
export const OVERLAP_WINDOW_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Port: remote change feed
// ---------------------------------------------------------------------------

/**
 * Port: download remote changes for ONE entity collection.
 *
 * v2.6.0 (bidirectional sync): the port is per-collection — each
 * entity type (groups, group_members, group_invites, expenses,
 * expense_payers, expense_splits, settlements) downloads with its own
 * cursor, so a failure on one table never blocks the others and the
 * coordinator can apply tables in parent-first dependency order.
 *
 * The concrete implementation queries the Supabase backend with the
 * signed-in user's JWT (RLS decides visibility — a device can only
 * ever download rows its memberships authorise).
 *
 * Cursor format is owned by the implementation. The Supabase adapter
 * uses the `(updated_at, id)` watermark tuple of the last row the
 * device APPLIED, e.g. `2026-10-12T09:15:30.123+00:00|0e1f…-…`.
 *
 * ── Pagination & completeness contract ──
 *
 *   - Changes are returned in `(occurredAt, entityId)` ASC order
 *     (occurredAt mirrors the cloud row's updated_at).
 *   - `hasMore` true → call again with `nextCursor` to fetch the next
 *     page (keyset pagination — no offsets, no skipped or duplicated
 *     rows at page boundaries).
 *   - `nextCursor` of the LAST page (hasMore false) is the safe
 *     checkpoint to persist. The coordinator persists it only AFTER
 *     the page was applied; a crash before that replays the page,
 *     which is safe because applying is version-guarded.
 *   - TOMBSTONES: soft-deleted cloud rows (deleted_at set) come back
 *     as `changeType: 'delete'` carrying the full row — deletions are
 *     never communicated by absence, so nothing is ever "missed".
 */
export interface IncrementalDownloadPort {
  /**
   * Download remote changes for one entity collection since the cursor.
   *
   * A null cursor means "first sync / full re-download" — the
   * implementation reads the collection from the beginning. Applying
   * is replay-safe (version-guarded skip), so a full re-download
   * converges without duplicating anything.
   */
  downloadChanges(
    entityType: RemoteEntityType,
    cursor: string | null,
    limit: number,
  ): Promise<{
    readonly changes: readonly RemoteChange[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Download scope
// ---------------------------------------------------------------------------

/**
 * The entity collections the download feed serves, in the order the
 * coordinator pulls them (parent-first so foreign keys resolve within
 * a single pull run: groups before members, members before invites,
 * expenses before their payers/splits, settlements last).
 *
 * Deliberately NOT downloaded (documented, not forgotten):
 *   - `receipt` / `receipt_item` — receipt IMAGES are captured on and
 *     belong to the device that scanned them (privacy design; the
 *     expense row carries the financial truth). The financial sync
 *     must never pull another member's receipt artifacts onto a
 *     device that never consented to store them.
 *   - `settlement_state_history` — the settlements row carries the
 *     authoritative current state; history is an audit artifact.
 *   - `settlement_reminder` / `payment_handle` / `preference` —
 *     per-user records, not shared financial state; their RLS
 *     policies are owner-scoped, and mirroring them cross-device adds
 *     no collaborative value.
 */
export const DOWNLOAD_ENTITY_ORDER: readonly RemoteEntityType[] = [
  'group',
  'group_member',
  'group_invite',
  'expense',
  'expense_payer',
  'expense_split',
  'settlement',
];

// ---------------------------------------------------------------------------
// Permission revocation
// ---------------------------------------------------------------------------

export interface PermissionRevocation {
  readonly groupId: string;
  readonly memberId: string;
  readonly revokedAt: DateTime;
  readonly reason: 'removed' | 'group_deleted' | 'permission_changed';
}

/**
 * Apply permission revocation rules.
 *
 * When group access is removed (spec, Prompt 63):
 *   - Stop downloading new private data
 *   - Mark local access state
 *   - Remove or lock sensitive cached content
 *   - Preserve locally authored records for audit
 *   - Do not continue attachment downloads
 *   - Cancel unauthorised pending operations
 */
export function shouldCancelPendingOperationForRevocation(
  op: { readonly entityType: RemoteEntityType; readonly entityId: string },
  _revocation: PermissionRevocation,
): boolean {
  // If the operation references an entity in the revoked group,
  // cancel it. For the MVP, we check entity types that carry group
  // context (expenses, settlements, members, invites). A more
  // sophisticated implementation would check the entity's group_id
  // field against the revocation's groupId.
  const groupScopedTypes: RemoteEntityType[] = [
    'expense',
    'expense_payer',
    'expense_split',
    'settlement',
    'group_member',
    'group_invite',
  ];
  return groupScopedTypes.includes(op.entityType);
}
