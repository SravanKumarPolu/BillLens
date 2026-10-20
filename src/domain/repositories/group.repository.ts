import type { GroupId, UserId } from '@shared-types/index';

import type { Group } from '../entities/group';
import type { CurrencyCode } from '../value-objects/currency-code';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `Group` entity.
 */
export interface GroupRepository {
  findById(id: GroupId): Promise<Group | null>;
  /** List all groups a user belongs to (active memberships only). */
  listByUser(userId: UserId, pagination: Pagination): Promise<PaginatedResult<Group>>;
  /** List all groups using a specific currency (used for currency-change audits). */
  listByCurrency(currency: CurrencyCode, pagination: Pagination): Promise<PaginatedResult<Group>>;
  save(group: Group): Promise<void>;
  softDelete(id: GroupId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
