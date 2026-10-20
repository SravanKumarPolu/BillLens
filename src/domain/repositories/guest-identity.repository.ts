import type { GuestIdentityId, UserId } from '@shared-types/index';

import type { GuestIdentity } from '../entities/guest-identity';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `GuestIdentity` entity.
 *
 * Guest identities are LOCAL-FIRST — they live in SQLite on the device
 * and are uploaded to the cloud only during the guest → cloud upgrade
 * flow. The cloud stores them in `guest_identity_links` so multiple
 * devices can be linked to a single cloud `User`.
 */
export interface GuestIdentityRepository {
  findById(id: GuestIdentityId): Promise<GuestIdentity | null>;
  save(identity: GuestIdentity): Promise<void>;
  findByLinkedUserId(userId: UserId): Promise<readonly GuestIdentity[]>;
  list(pagination: Pagination): Promise<PaginatedResult<GuestIdentity>>;
  softDelete(id: GuestIdentityId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
