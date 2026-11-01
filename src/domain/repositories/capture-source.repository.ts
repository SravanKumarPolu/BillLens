import type { CaptureSourceId, UserId } from '@shared-types/index';

import type { CaptureSource, CaptureProcessingStatus } from '../entities/capture-source';
import type { DateTime } from '../value-objects/date-time';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `CaptureSource` entity (capture intelligence layer).
 *
 * A CaptureSource represents an image captured by the user (paper receipt,
 * payment screenshot, etc.) that has not yet been processed by the OCR
 * pipeline. The repository is responsible for:
 *
 *   - Persisting the source image URI (and optional hash for dedupe).
 *   - Tracking the processing status through the OCR pipeline.
 *   - Looking up existing captures by image hash to detect duplicates
 *     before re-running extraction.
 */
export interface CaptureSourceRepository {
  findById(id: CaptureSourceId): Promise<CaptureSource | null>;
  findByImageHash(hash: string): Promise<CaptureSource | null>;
  listByStatus(status: CaptureProcessingStatus, pagination: Pagination): Promise<PaginatedResult<CaptureSource>>;
  listByUser(userId: UserId, pagination: Pagination): Promise<PaginatedResult<CaptureSource>>;
  listUpdatedSince(userId: UserId, since: DateTime, pagination: Pagination): Promise<PaginatedResult<CaptureSource>>;
  save(source: CaptureSource): Promise<void>;
  updateProcessingStatus(id: CaptureSourceId, status: CaptureProcessingStatus, error?: string): Promise<void>;
  softDelete(id: CaptureSourceId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
