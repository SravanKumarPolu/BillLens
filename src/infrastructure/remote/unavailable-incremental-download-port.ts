/**
 * UnavailableIncrementalDownloadPort — the default
 * `IncrementalDownloadPort` when the bootstrap does not inject the real
 * Supabase adapter (no project configured, or a test harness).
 *
 * See `unavailable-remote-sync-port.ts` for why the defaults stopped
 * constructing the Supabase adapters (lazy optional cloud). This
 * adapter mirrors the Supabase download port's own not-configured
 * behaviour: it throws the `NOT_CONFIGURED` error the coordinator's
 * classifier already understands, so nothing changes for callers.
 */

import type {
  IncrementalDownloadPort,
  RemoteChange,
  RemoteEntityType,
} from '@domain/services/sync/incremental-download';

export class UnavailableIncrementalDownloadPort implements IncrementalDownloadPort {
  async downloadChanges(
    _entityType: RemoteEntityType,
    _cursor: string | null,
    _limit: number,
  ): Promise<{
    readonly changes: readonly RemoteChange[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  }> {
    throw new Error(
      'NOT_CONFIGURED: Cloud sync is not configured (set EXPO_PUBLIC_SUPABASE_URL / ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY). The download phase stays idle until configured.',
    );
  }
}
