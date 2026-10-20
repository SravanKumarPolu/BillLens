import type {
  SyncConflict,
  SyncConflictRepository,
} from '@domain/repositories/sync.repository';
import type { UserId } from '@shared-types/index';

import type { RemoteChangeApplier } from './remote-change-applier.port';

/**
 * ResolveRemoteConflictUseCase — v2.6.0.
 *
 * Executes the user's decision on a download-detected conflict:
 *
 *   - `keep_local` — the local edit wins. The applier re-bases the
 *     local row and its upload op onto the cloud version; the conflict
 *     record is closed as `local_wins`; the next sync uploads it.
 *   - `keep_cloud` — the remote state wins. The applier writes the
 *     cloud payload locally and cancels the stale local ops; the
 *     conflict record is closed as `cloud_wins`.
 *
 * The use case marks the conflict resolution ONLY after the data
 * operation succeeded — a failed resolution leaves the conflict open
 * and honest (the user can retry).
 */
export class ResolveRemoteConflictUseCase {
  constructor(
    private readonly applier: RemoteChangeApplier,
    private readonly conflicts: SyncConflictRepository,
  ) {}

  async execute(input: {
    readonly conflictId: string;
    readonly resolution: 'keep_local' | 'keep_cloud';
    readonly resolvedBy: UserId;
  }): Promise<{ readonly status: 'resolved' | 'not_found' | 'failed'; readonly errorMessage?: string }> {
    const conflict = await this.conflicts.findById(input.conflictId);
    if (conflict === null) return { status: 'not_found' };

    const outcome =
      input.resolution === 'keep_local'
        ? await this.applier.keepLocalVersion({
            entityType: conflict.entityType,
            entityId: conflict.entityId,
            cloudVersion: conflict.cloudVersion,
          })
        : await this.applier.applyCloudVersion({
            entityType: conflict.entityType,
            entityId: conflict.entityId,
            cloudPayload: (conflict.cloudPayload ?? {}) as Readonly<Record<string, unknown>>,
          });

    if (outcome.status === 'failed') {
      return { status: 'failed', errorMessage: outcome.errorMessage };
    }

    await this.conflicts.resolve(
      conflict.id,
      input.resolution === 'keep_local' ? 'local_wins' : 'cloud_wins',
      input.resolvedBy,
    );
    return { status: 'resolved' };
  }
}

/** The conflict view model shared with the sync settings screen. */
export interface RemoteConflictViewModel {
  readonly conflict: SyncConflict;
  /** Human-readable summary of what changed (entity + versions). */
  readonly summary: string;
}
