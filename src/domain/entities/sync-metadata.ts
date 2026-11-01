import type { DateTime, VersionNumber } from '../value-objects/index';

/**
 * Sync metadata attached to every synchronised entity.
 *
 * Tracks when an entity was last synced to the cloud, whether the local
 * copy is ahead of the cloud (pending sync), and the cloud-side version
 * for optimistic concurrency.
 */
export interface SyncMetadata {
  /** Cloud-side version number. May be lower than the entity's `version` if local is ahead. */
  readonly cloudVersion: VersionNumber;
  /** Last time the entity was successfully synced to the cloud. */
  readonly lastSyncedAt?: DateTime;
  /** True if local mutations are pending sync. */
  readonly hasPendingChanges: boolean;
  /** Idempotency key for the next sync operation. */
  readonly idempotencyKey?: string;
}

export const INITIAL_SYNC_METADATA: SyncMetadata = {
  cloudVersion: 0 as VersionNumber,
  hasPendingChanges: true,
};

export function createPendingSyncMetadata(previous?: SyncMetadata): SyncMetadata {
  return {
    cloudVersion: previous?.cloudVersion ?? (0 as VersionNumber),
    lastSyncedAt: previous?.lastSyncedAt,
    hasPendingChanges: true,
    idempotencyKey: previous?.idempotencyKey,
  };
}

export function createSyncedSyncMetadata(
  cloudVersion: VersionNumber,
  syncedAt: DateTime,
  idempotencyKey?: string,
): SyncMetadata {
  return {
    cloudVersion,
    lastSyncedAt: syncedAt,
    hasPendingChanges: false,
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  };
}
