/**
 * UnavailableRemoteSyncPort — the default `RemoteSyncPort` when the
 * bootstrap does not inject the real Supabase adapter (no project
 * configured, or a test harness).
 *
 * Why this exists: the composition root used to construct
 * `SupabaseRemoteSyncPort` unconditionally, which forced a static
 * import of supabase-js into the web entry chunk even though the app is
 * offline-first and cloud is optional (performance standard: optional
 * services are lazy). The unavailable adapter mirrors exactly what the
 * Supabase adapter itself returns when no credentials exist — the
 * `NOT_CONFIGURED` retriable error — so behaviour is unchanged: the
 * sync loop is not started unless a project is configured, and any
 * accidental call fails honestly instead of pretending to upload.
 */

import type { RemoteSyncPort } from '@application/sync/sync-coordinator-types';

export class UnavailableRemoteSyncPort implements RemoteSyncPort {
  async uploadOperation(): Promise<
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
    return {
      status: 'error',
      errorCode: 'NOT_CONFIGURED',
      errorMessage:
        'Cloud sync is not configured (set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY). ' +
        'Operations stay queued locally and retry once configured.',
    };
  }
}
