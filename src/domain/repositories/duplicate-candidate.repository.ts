import type { DuplicateCandidateId } from '@shared-types/index';

import type { DuplicateCandidate } from '../entities/duplicate-candidate';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `DuplicateCandidate` entity (capture intelligence layer).
 *
 * A DuplicateCandidate records a potential duplicate detected during
 * capture/extraction — comparing a newly-captured entity against existing
 * entities in the same group. The user resolves the candidate via
 * `resolve`; once resolved, the candidate is immutable.
 *
 * The repository does NOT mutate the underlying entities — it only
 * records and resolves the candidate. Any merge/replacement of the
 * underlying entities is performed by the application layer.
 */
export interface DuplicateCandidateRepository {
  findById(id: DuplicateCandidateId): Promise<DuplicateCandidate | null>;
  listPending(groupId: string, pagination: Pagination): Promise<PaginatedResult<DuplicateCandidate>>;
  listByEntity(entityId: string): Promise<readonly DuplicateCandidate[]>;
  save(candidate: DuplicateCandidate): Promise<void>;
  resolve(id: DuplicateCandidateId, resolution: DuplicateCandidate['resolution'], resolvedBy?: string): Promise<void>;
  softDelete(id: DuplicateCandidateId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
