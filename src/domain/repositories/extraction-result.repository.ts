import type { CaptureSourceId, ExtractionResultId } from '@shared-types/index';

import type { ExtractionResult } from '../entities/extraction-result';

import type { DeleteMetadata, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `ExtractionResult` entity (capture intelligence layer).
 *
 * An ExtractionResult is an IMMUTABLE record of what the OCR pipeline
 * extracted from a CaptureSource. User edits happen on the ExpenseDraft,
 * not on the ExtractionResult.
 *
 * HARD RULE: there is no `update` method — once written, an extraction
 * result is immutable. If the extractor re-runs, create a new
 * ExtractionResult with a new id.
 */
export interface ExtractionResultRepository {
  findById(id: ExtractionResultId): Promise<ExtractionResult | null>;
  findByCaptureSource(captureSourceId: CaptureSourceId): Promise<ExtractionResult | null>;
  save(result: ExtractionResult): Promise<void>;
  softDelete(id: ExtractionResultId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
