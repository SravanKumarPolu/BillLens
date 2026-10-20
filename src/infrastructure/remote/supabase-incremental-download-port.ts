/**
 * SupabaseIncrementalDownloadPort — v2.6.0 (bidirectional sync,
 * CLOUD→DEVICE).
 *
 * Concrete `IncrementalDownloadPort` over PostgREST: pages each synced
 * table with KEYSET pagination on the (updated_at, id) watermark, maps
 * soft-deleted rows to tombstones, and hands every raw cloud row to
 * the download coordinator for reconciliation.
 *
 * ── Authorization ──
 *
 * Every request carries the signed-in user's JWT (the same
 * `accessToken` factory binding as the upload port). Row Level Security
 * therefore decides visibility — a device can only download rows its
 * active group memberships authorise. There is no service-role key
 * anywhere in this file (secret-scan enforced).
 *
 * ── Cursor format ──
 *
 *   `<updated_at ISO string>|<row id>`  e.g.
 *   `2026-10-12T09:15:30.123+00:00|0e1f2a3b-…`
 *
 * The filter is ALWAYS the exact keyset continuation from the tuple it
 * was given. The OVERLAP window (re-reading a few minutes before the
 * cursor so a row committed by a long-running transaction AFTER a
 * previous cursor advanced past its trigger time is still caught) is
 * applied by the DOWNLOAD COORDINATOR at session start — it owns
 * session state and lowers the tuple's timestamp before the first
 * page. Re-read rows are free: the applier skips same-version rows
 * (replay-safe).
 *
 * ── Tombstones ──
 *
 * Soft-deleted rows (deleted_at NOT NULL) are surfaced as
 * `changeType: 'delete'` WITH their full row payload — deletions are
 * never communicated by absence, so a device that was offline during
 * the delete still converges when it next pulls.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type {
  IncrementalDownloadPort,
  RemoteChange,
  RemoteEntityType,
} from '@domain/services/sync/incremental-download';
import { asDateTime } from '@domain/value-objects';

/** Cloud table for each downloadable entity type (null = not served). */
const FEED_TABLES: Partial<Record<RemoteEntityType, string>> = {
  group: 'groups',
  group_member: 'group_members',
  group_invite: 'group_invites',
  expense: 'expenses',
  expense_payer: 'expense_payers',
  expense_split: 'expense_splits',
  settlement: 'settlements',
};

export class SupabaseIncrementalDownloadPort implements IncrementalDownloadPort {
  private client: SupabaseClient | null = null;

  constructor(
    private readonly supabaseUrl?: string,
    private readonly supabaseAnonKey?: string,
    /** Supplies the signed-in user's access token (RLS evaluation). */
    private readonly getAccessToken?: () => Promise<string | null>,
  ) {}

  private getClient(): SupabaseClient | null {
    if (this.client !== null) return this.client;
    // EXPO_PUBLIC_* are the only vars Expo inlines into the RN bundle.
    const url =
      this.supabaseUrl ??
      process.env['EXPO_PUBLIC_SUPABASE_URL'] ??
      process.env['SUPABASE_URL'];
    const key =
      this.supabaseAnonKey ??
      process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] ??
      process.env['SUPABASE_ANON_KEY'];
    if (!url || !key) return null;
    this.client = createClient(url, key, {
      ...(this.getAccessToken !== undefined ? { accessToken: this.getAccessToken } : {}),
    });
    return this.client;
  }

  async downloadChanges(
    entityType: RemoteEntityType,
    cursor: string | null,
    limit: number,
  ): Promise<{
    readonly changes: readonly RemoteChange[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  }> {
    const client = this.getClient();
    if (client === null) {
      throw new Error(
        'NOT_CONFIGURED: Supabase is not configured (set EXPO_PUBLIC_SUPABASE_URL / ' +
          'EXPO_PUBLIC_SUPABASE_ANON_KEY). The download phase stays idle until configured.',
      );
    }

    const table = FEED_TABLES[entityType];
    if (table === undefined) {
      // Unknown collection — not an error, an explicitly empty feed
      // (the download scope in incremental-download.ts documents why
      // receipts / per-user records are not mirrored cross-device).
      return { changes: [], nextCursor: cursor, hasMore: false };
    }

    // ── Page filter: EXACT keyset continuation ──
    // This port is STATELESS per call: it always continues from the
    // exact (updated_at, id) tuple it was given. The OVERLAP window
    // that guards against late-committing transactions is applied by
    // the download coordinator at session start (it owns session
    // state) — it lowers the tuple's timestamp before the first page.
    let query = client.from(table).select('*');
    const parsed = parseCursor(cursor);
    if (parsed !== null) {
      // Keyset continuation: everything strictly newer than the
      // watermark, plus the remainder of the watermark's own timestamp
      // bucket (id > lastId — an empty lastId matches the whole bucket,
      // which is how the coordinator's overlap lowering re-reads it).
      // No offsets — no boundary losses.
      const lastId = parsed.rowId ?? '';
      query = query.or(
        `updated_at.gt."${parsed.updatedAt}",and(updated_at.eq."${parsed.updatedAt}",id.gt."${lastId}")`,
      );
    }
    query = query
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit + 1); // +1 to detect hasMore without a count query

    const { data, error } = await query;
    if (error !== null) {
      throw new Error(formatPostgrestError(error.code, error.message));
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const changes = pageRows.map((row) => rowToChange(entityType, row));
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      lastRow !== undefined
        ? formatCursor(String(lastRow['updated_at'] ?? ''), String(lastRow['id'] ?? ''))
        : null;

    return { changes, nextCursor, hasMore };
  }
}

// ---------------------------------------------------------------------------
// Cursor helpers (exported for tests — the download coordinator's
// `formatCursorPosition` produces the same shape for held cursors)
// ---------------------------------------------------------------------------

export function formatCursor(updatedAt: string, rowId: string): string {
  return `${updatedAt}|${rowId}`;
}

export function parseCursor(
  cursor: string | null,
): { readonly updatedAt: string; readonly rowId: string | null } | null {
  if (cursor === null || cursor.length === 0) return null;
  const separatorIndex = cursor.lastIndexOf('|');
  if (separatorIndex <= 0) return null;
  const updatedAt = cursor.slice(0, separatorIndex);
  const rowId = cursor.slice(separatorIndex + 1);
  if (!Number.isFinite(Date.parse(updatedAt))) return null;
  return { updatedAt, rowId: rowId.length > 0 ? rowId : null };
}

// ---------------------------------------------------------------------------
// Row → RemoteChange mapping
// ---------------------------------------------------------------------------

function rowToChange(entityType: RemoteEntityType, row: Record<string, unknown>): RemoteChange {
  const deletedAt = row['deleted_at'];
  const version = typeof row['version'] === 'number' ? row['version'] : 1;
  const occurredAtRaw = row['updated_at'];
  const occurredAt = asDateTime(
    typeof occurredAtRaw === 'string' && occurredAtRaw.length > 0
      ? occurredAtRaw
      : new Date().toISOString(),
  );
  return {
    entityType,
    entityId: String(row['id'] ?? ''),
    changeType:
      deletedAt !== null && deletedAt !== undefined
        ? 'delete'
        : version <= 1
          ? 'create'
          : 'update',
    version,
    payload: row,
    ...(deletedAt !== null && deletedAt !== undefined
      ? { deletedAt: asDateTime(String(deletedAt)) }
      : {}),
    occurredAt,
  };
}

function formatPostgrestError(code: string | undefined, message: string): string {
  const prefix = code !== null && code !== undefined ? `${code}: ` : '';
  return `${prefix}${message}`;
}
