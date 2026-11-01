/**
 * SupabaseRemoteSyncPort — concrete implementation of RemoteSyncPort.
 *
 * Uploads sync operations to the Supabase backend. Each operation
 * is sent to the appropriate table (or RPC) with the idempotency key
 * so the backend can dedupe retries.
 *
 * v2.5.0 fixes over v2.4.0 (release-candidate verification pass):
 *
 *   - AGGREGATE PAYLOADS: `expense` sync ops carry the whole aggregate
 *     ({expense, payers, splits}) and `settlement` ops nest the row
 *     ({settlement}). Spreading those directly into a single-table
 *     PostgREST insert/update ALWAYS fails (unknown columns). The port
 *     now extracts the main row + child rows per entity type and
 *     uploads the aggregate as one unit (main row first; children
 *     upserted after the main row is accepted).
 *   - DELETE OPS no longer spread the payload (it contains non-column
 *     keys like `reason`); only `deleted_at` is written, with the
 *     optimistic version guard preserved.
 *   - IDEMPOTENT CREATE RETRIES: a 23505 (unique_violation) on create
 *     is only a CONFLICT when a DIFFERENT row holds the key; when the
 *     row with OUR id already exists the upload is the retry of a
 *     server-accepted-but-response-lost write → success.
 *   - AUTH EXPIRY: 401 / PGRST301 ("JWT expired") map to the retriable
 *     AUTH_TOKEN_EXPIRED instead of DELETED_REMOTELY (which dead-ended
 *     the queue as a user-review conflict). The registry refreshes the
 *     token before the next attempt.
 *   - VERSION CONFLICTS on update surface as `conflict` with the cloud
 *     version (PGRST116 from `.single()` no longer becomes a generic
 *     error).
 *   - Deny-all tables (`receipt_privacy_preferences`,
 *     `settlement_state_history`) are no longer mapped — uploading to
 *     them can only ever fail with RLS 42501; unmapped entity types
 *     fail fast as UNSUPPORTED_ENTITY_TYPE instead.
 *
 * v2.4.0 fixes over v2.3.0:
 *   - ENV NAMES: the client now reads `EXPO_PUBLIC_SUPABASE_URL` /
 *     `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the ONLY variables Expo inlines
 *     into the React Native bundle. The non-prefixed names are still
 *     honoured for server-side harnesses.
 *   - SESSION BINDING: an injectable `getAccessToken` supplies the
 *     signed-in user's JWT for every request (supabase-js `accessToken`
 *     factory) so RLS policies evaluate the real user; guests fall back
 *     to the anon-key JWT.
 *   - NOT_CONFIGURED: unconfigured now returns the `NOT_CONFIGURED`
 *     error code (retriable by the classifier) instead of the misleading
 *     `UNSUPPORTED_SCHEMA_VERSION`.
 *   - `delete` ops carry the optimistic version guard like updates.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { RemoteSyncPort } from '@application/sync/sync-coordinator-types';
import type { SyncOperation } from '@domain/repositories/sync.repository';

export class SupabaseRemoteSyncPort implements RemoteSyncPort {
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
      // Bind every request to the CURRENT session token when a user is
      // signed in (Row Level Security evaluates this JWT); guests keep
      // the anon-key JWT. Returning null falls back to supabase-js's
      // own session handling.
      ...(this.getAccessToken !== undefined
        ? { accessToken: this.getAccessToken }
        : {}),
    });
    return this.client;
  }

  async uploadOperation(
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
  > {
    const client = this.getClient();
    if (client === null) {
      return {
        status: 'error',
        errorCode: 'NOT_CONFIGURED',
        errorMessage:
          'Supabase is not configured (set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY). ' +
          'Operations stay queued locally and retry once configured.',
      };
    }

    try {
      // Route based on entity type + operation
      const table = this.getTableForEntityType(operation.entityType);
      if (table === null) {
        return {
          status: 'error',
          errorCode: 'UNSUPPORTED_ENTITY_TYPE',
          errorMessage: `No table mapping for entity type "${operation.entityType}"`,
        };
      }

      // For create operations: insert with idempotency key
      if (operation.operation === 'create') {
        const { main, payers, splits } = this.extractExpenseAggregate(operation);
        const { error } = await client
          .from(table)
          .insert({
            id: operation.entityId,
            ...main,
            version: operation.localVersion,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            // unique_violation — either a genuine conflict or the retry
            // of a write the server ALREADY accepted (response lost).
            // Distinguish by fetching our row: present + ours → success.
            return await this.resolveDuplicateCreate(client, table, operation);
          }
          return {
            status: 'error',
            errorCode: this.classifySupabaseError(error.code),
            errorMessage: error.message,
          };
        }

        // Aggregate children (expense payers/splits) ride along with the
        // main row; the aggregate is the unit of sync for money records.
        const childError = await this.upsertExpenseChildren(client, payers, splits);
        if (childError !== null) return childError;

        return { status: 'success' };
      }

      // For update operations: guarded update with version check
      if (operation.operation === 'update') {
        const { main, payers, splits } = this.extractExpenseAggregate(operation);
        const { error } = await client
          .from(table)
          .update({
            ...main,
            version: operation.localVersion,
          })
          .eq('id', operation.entityId)
          .eq('version', operation.baseVersion)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // No row matched the version guard → version conflict.
            return await this.resolveVersionConflict(client, table, operation);
          }
          return {
            status: 'error',
            errorCode: this.classifySupabaseError(error.code),
            errorMessage: error.message,
          };
        }

        const childError = await this.upsertExpenseChildren(client, payers, splits);
        if (childError !== null) return childError;

        return { status: 'success' };
      }

      // For delete operations: soft-delete WITH the optimistic version
      // guard (a stale delete must not clobber a newer remote version).
      // v2.5.0: the payload (which contains non-column keys like
      // `reason`) is deliberately NOT spread into the update.
      if (operation.operation === 'delete') {
        const { error } = await client
          .from(table)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', operation.entityId)
          .eq('version', operation.baseVersion)
          .select()
          .single();
        if (error) {
          if (error.code === 'PGRST116') {
            // No row matched the version guard → deleted remotely or
            // version moved on. Either way the local intent is moot.
            return { status: 'success' };
          }
          return {
            status: 'error',
            errorCode: this.classifySupabaseError(error.code),
            errorMessage: error.message,
          };
        }
        return { status: 'success' };
      }

      // For restore operations: clear deleted_at
      if (operation.operation === 'restore') {
        const { error } = await client
          .from(table)
          .update({ deleted_at: null })
          .eq('id', operation.entityId);
        if (error) {
          return {
            status: 'error',
            errorCode: this.classifySupabaseError(error.code),
            errorMessage: error.message,
          };
        }
        return { status: 'success' };
      }

      // Other operation types (upload, link, confirm, reverse) —
      // use RPC for now; the backend defines the specific functions.
      if (
        operation.operation === 'upload' ||
        operation.operation === 'link' ||
        operation.operation === 'confirm' ||
        operation.operation === 'reverse'
      ) {
        const { error } = await client.rpc(`sync_${operation.operation}`, {
          p_entity_type: operation.entityType,
          p_entity_id: operation.entityId,
          p_payload: operation.payload,
          p_idempotency_key: operation.idempotencyKey,
        });
        if (error) {
          return {
            status: 'error',
            errorCode: this.classifySupabaseError(error.code),
            errorMessage: error.message,
          };
        }
        return { status: 'success' };
      }

      return {
        status: 'error',
        errorCode: 'INVALID_PAYLOAD',
        errorMessage: `Unknown operation type: ${operation.operation}`,
      };
    } catch (err) {
      // Network errors
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Failed to fetch') || message.includes('Network request failed')) {
        return {
          status: 'error',
          errorCode: 'NETWORK_UNAVAILABLE',
          errorMessage: message,
        };
      }
      return {
        status: 'error',
        errorCode: 'SERVER_ERROR',
        errorMessage: message,
      };
    }
  }

  // ------------------------------------------------------------------
  // Payload extraction
  // ------------------------------------------------------------------

  /**
   * Normalize a sync payload into the main row for the operation's
   * table. `expense` ops carry the nested aggregate ({expense, payers,
   * splits}); `settlement` ops nest the row ({settlement}); everything
   * else is already flat (group payloads).
   */
  private extractMainRow(operation: SyncOperation): Record<string, unknown> {
    const payload = operation.payload as Record<string, unknown>;
    if (operation.entityType === 'expense' && payload && typeof payload['expense'] === 'object' && payload['expense'] !== null) {
      return payload['expense'] as Record<string, unknown>;
    }
    if (operation.entityType === 'settlement' && payload && typeof payload['settlement'] === 'object' && payload['settlement'] !== null) {
      return payload['settlement'] as Record<string, unknown>;
    }
    return { ...payload };
  }

  /** Extract the expense aggregate's child rows (empty for other types). */
  private extractExpenseAggregate(operation: SyncOperation): {
    main: Record<string, unknown>;
    payers: readonly Record<string, unknown>[];
    splits: readonly Record<string, unknown>[];
  } {
    const main = this.extractMainRow(operation);
    if (operation.entityType !== 'expense') {
      return { main, payers: [], splits: [] };
    }
    const payload = operation.payload as Record<string, unknown>;
    const payers = Array.isArray(payload?.['payers'])
      ? (payload['payers'] as readonly Record<string, unknown>[])
      : [];
    const splits = Array.isArray(payload?.['splits'])
      ? (payload['splits'] as readonly Record<string, unknown>[])
      : [];
    return { main, payers, splits };
  }

  /**
   * Upsert the aggregate children (payers + splits) after the main
   * expense row was accepted. Idempotent by row id — a retried
   * aggregate upload simply re-writes the same child rows.
   */
  private async upsertExpenseChildren(
    client: SupabaseClient,
    payers: readonly Record<string, unknown>[],
    splits: readonly Record<string, unknown>[],
  ): Promise<
    | {
        readonly status: 'error';
        readonly errorCode: string;
        readonly errorMessage: string;
        readonly retryAfterMs?: number;
      }
    | null
  > {
    if (payers.length > 0) {
      const { error } = await client.from('expense_payers').upsert(
        payers.map((p) => ({ ...p })),
        { onConflict: 'id' },
      );
      if (error) {
        return {
          status: 'error',
          errorCode: this.classifySupabaseError(error.code),
          errorMessage: `expense_payers: ${error.message}`,
        };
      }
    }
    if (splits.length > 0) {
      const { error } = await client.from('expense_splits').upsert(
        splits.map((s) => ({ ...s })),
        { onConflict: 'id' },
      );
      if (error) {
        return {
          status: 'error',
          errorCode: this.classifySupabaseError(error.code),
          errorMessage: `expense_splits: ${error.message}`,
        };
      }
    }
    return null;
  }

  /**
   * Resolve a 23505 on create: if a row with OUR id already exists, the
   * write was accepted earlier and this upload is a retry (the original
   * response was lost) → success. Otherwise it is a genuine conflict.
   */
  private async resolveDuplicateCreate(
    client: SupabaseClient,
    table: string,
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
  > {
    const { data, error } = await client
      .from(table)
      .select('id, version')
      .eq('id', operation.entityId)
      .maybeSingle();
    if (error !== null && error !== undefined) {
      return {
        status: 'error',
        errorCode: 'SERVER_ERROR',
        errorMessage: `Duplicate-key verification failed: ${error.message}`,
      };
    }
    if (data !== null && data !== undefined) {
      // Our row is already on the server — the create succeeded earlier.
      return { status: 'success' };
    }
    // The key collision is on a DIFFERENT unique constraint.
    return {
      status: 'conflict',
      cloudVersion: 0,
    };
  }

  /** Fetch the current cloud version for a version-conflict report. */
  private async resolveVersionConflict(
    client: SupabaseClient,
    table: string,
    operation: SyncOperation,
  ): Promise<
    | { readonly status: 'conflict'; readonly cloudVersion: number; readonly cloudPayload?: Readonly<Record<string, unknown>> }
    | { readonly status: 'success' }
    | { readonly status: 'error'; readonly errorCode: string; readonly errorMessage: string; readonly retryAfterMs?: number }
  > {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('id', operation.entityId)
      .maybeSingle();
    if (error !== null && error !== undefined) {
      return {
        status: 'error',
        errorCode: 'SERVER_ERROR',
        errorMessage: `Conflict verification failed: ${error.message}`,
      };
    }
    if (data === null || data === undefined) {
      // The row vanished remotely — the local intent is moot.
      return { status: 'success' };
    }
    return {
      status: 'conflict',
      cloudVersion: typeof data['version'] === 'number' ? data['version'] : 0,
      cloudPayload: data as Record<string, unknown>,
    };
  }

  private getTableForEntityType(entityType: string): string | null {
    const tableMap: Record<string, string> = {
      group: 'groups',
      group_member: 'group_members',
      group_invite: 'group_invites',
      expense: 'expenses',
      expense_payer: 'expense_payers',
      expense_split: 'expense_splits',
      receipt: 'receipts',
      receipt_item: 'receipt_items',
      settlement: 'settlements',
      settlement_reminder: 'settlement_reminders',
      payment_handle: 'member_payment_handles',
      // v2.5.0: `settlement_state_history` and `preference`
      // (`receipt_privacy_preferences`) are intentionally NOT mapped —
      // their RLS policies deny all client access, so uploads could
      // only ever fail with 42501. Unmapped types fail fast as
      // UNSUPPORTED_ENTITY_TYPE (permanent) instead of burning retries.
    };
    return tableMap[entityType] ?? null;
  }

  private classifySupabaseError(code: string): string {
    // PostgreSQL error codes
    if (code === '23505') return 'DUPLICATE_CREATION';
    if (code === '42501') return 'PERMISSION_CHANGED';
    if (code === '23503') return 'PARENT_DELETED_REMOTELY';
    if (code === 'PGRST116') return 'VERSION_CONFLICT';
    // v2.5.0: "JWT expired" (PGRST301 / 401) is a TRANSIENT auth state —
    // the token refreshes and the same op retries. It must NOT be
    // classified as DELETED_REMOTELY (which dead-ended the op as a
    // user-review conflict after an overnight token expiry).
    if (code === 'PGRST301' || code === '401') return 'AUTH_TOKEN_EXPIRED';
    // Network / server
    if (code.startsWith('08') || code.startsWith('57')) return 'SERVER_ERROR';
    if (code === '429') return 'RATE_LIMIT';
    if (code === '503') return 'SERVICE_UNAVAILABLE';
    // Default
    return 'SERVER_ERROR';
  }
}
