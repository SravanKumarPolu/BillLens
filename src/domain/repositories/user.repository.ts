import type { UserId } from '@shared-types/index';

import type { User } from '../entities/user';
import type { EmailAddress } from '../value-objects/email-address';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `User` (registered cloud-account) entity.
 *
 * The domain layer declares this interface; the infrastructure layer
 * provides the concrete implementation (Supabase-backed for cloud,
 * in-memory double for tests).
 *
 * Conventions:
 *   - Methods return Promise<T> (storage is async even if local).
 *   - Methods take domain entities / value objects, never raw DB rows.
 *   - Soft-delete is a first-class operation with metadata.
 *   - No `query(sql)` method — that leaks storage details.
 */
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: EmailAddress): Promise<User | null>;
  save(user: User): Promise<void>;
  softDelete(id: UserId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
  list(pagination: Pagination): Promise<PaginatedResult<User>>;
}
