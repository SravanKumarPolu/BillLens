import type { CaptureSourceId, PaymentEvidenceId } from '@shared-types/index';

import type { PaymentEvidence } from '../entities/payment-evidence';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `PaymentEvidence` entity (capture intelligence layer).
 *
 * PaymentEvidence is a screenshot or image proving a payment was made
 * (UPI, card, or bank screenshot). It is NOT the same as a receipt — it
 * proves money changed hands but does not define what the payment was
 * for, who participated, or how it should be split.
 *
 * The user MUST confirm all of the above before an expense is created.
 * The ExpenseDraft entity is the editable bridge between PaymentEvidence
 * and a final Expense.
 */
export interface PaymentEvidenceRepository {
  findById(id: PaymentEvidenceId): Promise<PaymentEvidence | null>;
  findByCaptureSource(captureSourceId: CaptureSourceId): Promise<PaymentEvidence | null>;
  listByGroup(groupId: string, pagination: Pagination): Promise<PaginatedResult<PaymentEvidence>>;
  save(evidence: PaymentEvidence): Promise<void>;
  softDelete(id: PaymentEvidenceId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
