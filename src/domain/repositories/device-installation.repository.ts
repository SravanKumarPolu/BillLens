import type { UserId } from '@shared-types/index';

import type { DateTime } from '../value-objects/date-time';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * A device installation — one row per device that has signed in.
 *
 * Used for push notifications (via `pushToken`) and multi-device sync.
 * A single user (profile) may have multiple device installations
 * (phone, tablet, web).
 */
export interface DeviceInstallation {
  readonly id: string;
  readonly profileId: UserId;
  readonly deviceName?: string;
  readonly platform: 'ios' | 'android' | 'web';
  readonly pushToken?: string;
  readonly appVersion?: string;
  readonly lastSeenAt: DateTime;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: number;
}

/**
 * Repository for the `DeviceInstallation` entity.
 *
 * Device installations are synchronised with the cloud so push
 * notifications can be sent to every device a user has signed in on.
 */
export interface DeviceInstallationRepository {
  findById(id: string): Promise<DeviceInstallation | null>;
  findByProfileId(profileId: UserId): Promise<readonly DeviceInstallation[]>;
  findByPushToken(token: string): Promise<DeviceInstallation | null>;
  save(installation: DeviceInstallation): Promise<void>;
  updateLastSeen(id: string, lastSeenAt: DateTime): Promise<void>;
  softDelete(id: string, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
  list(pagination: Pagination): Promise<PaginatedResult<DeviceInstallation>>;
}
