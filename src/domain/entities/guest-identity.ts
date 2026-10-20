import type { GuestIdentityId, UserId } from '@shared-types/index';

import { InvalidEntityError, VersionConflictError } from '../errors/index';
import {
  type DateTime,
  type DisplayName,
  type VersionNumber,
  asDateTime,
  asDisplayName,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asGuestIdentityId(value: string): GuestIdentityId {
  return value as GuestIdentityId;
}

/**
 * Upgrade status for a guest identity.
 *
 * - `local_only` — guest identity exists only on this device.
 * - `upgrade_pending` — user initiated cloud account creation / sign-in,
 *   but the data upload has not completed yet.
 * - `upgrade_in_progress` — data is being uploaded to the cloud account.
 * - `upgraded` — guest identity has been linked to a cloud `User`. Local
 *   data has been uploaded. The guest identity may be retained for
 *   offline access, but the cloud user is now authoritative.
 * - `upgrade_failed` — last upgrade attempt failed. User can retry.
 */
export type GuestUpgradeStatus =
  | 'local_only'
  | 'upgrade_pending'
  | 'upgrade_in_progress'
  | 'upgraded'
  | 'upgrade_failed';

/**
 * A local-only guest identity.
 *
 * Stored entirely on-device. The `deviceSecretHash` is a non-reversible
 * hash of a device-scoped secret used to prove ownership during the
 * upgrade flow. The actual secret is stored in SecureStore; only its
 * hash lives in the domain entity (and therefore in SQLite).
 */
export interface GuestIdentity {
  readonly id: GuestIdentityId;
  readonly displayName: DisplayName;
  /** Non-reversible hash of the device-scoped secret. NEVER store the secret itself. */
  readonly deviceSecretHash: string;
  readonly upgradeStatus: GuestUpgradeStatus;
  /** Set when `upgradeStatus` is `upgraded`. References the cloud User. */
  readonly linkedUserId?: UserId;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly version: VersionNumber;
}

export interface GuestIdentityCreateInput {
  readonly id: GuestIdentityId;
  readonly displayName: string;
  readonly deviceSecretHash: string;
  readonly now?: DateTime;
}

export function createGuestIdentity(input: GuestIdentityCreateInput): GuestIdentity {
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    displayName: asDisplayName(input.displayName),
    deviceSecretHash: input.deviceSecretHash,
    upgradeStatus: 'local_only',
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface GuestIdentityStartUpgradeInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function startGuestUpgrade(
  current: GuestIdentity,
  input: GuestIdentityStartUpgradeInput,
): GuestIdentity {
  if (current.upgradeStatus !== 'local_only' && current.upgradeStatus !== 'upgrade_failed') {
    throw new InvalidEntityError(
      `Cannot start upgrade from status ${current.upgradeStatus}. Must be local_only or upgrade_failed.`,
    );
  }
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `GuestIdentity version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    upgradeStatus: 'upgrade_pending',
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export interface GuestIdentityCompleteUpgradeInput {
  readonly linkedUserId: UserId;
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function completeGuestUpgrade(
  current: GuestIdentity,
  input: GuestIdentityCompleteUpgradeInput,
): GuestIdentity {
  if (current.upgradeStatus !== 'upgrade_pending' && current.upgradeStatus !== 'upgrade_in_progress') {
    throw new InvalidEntityError(
      `Cannot complete upgrade from status ${current.upgradeStatus}. Must be upgrade_pending or upgrade_in_progress.`,
    );
  }
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `GuestIdentity version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    upgradeStatus: 'upgraded',
    linkedUserId: input.linkedUserId,
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}
