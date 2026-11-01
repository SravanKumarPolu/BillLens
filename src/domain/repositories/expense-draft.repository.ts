import type { ExpenseDraftId, GroupId } from '@shared-types/index';

import type { ExpenseDraft } from '../entities/expense-draft';
import type { DateTime } from '../value-objects/date-time';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `ExpenseDraft` entity (capture intelligence layer).
 *
 * An ExpenseDraft is the editable intermediate between a captured image
 * (CaptureSource) and a final Expense. It is NEVER a financial record —
 * it becomes an Expense only after user confirmation.
 *
 * HARD RULE: saving a draft MUST NOT create an Expense, ExpensePayer, or
 * ExpenseSplit. Confirmation is a separate, explicit operation performed
 * by the application layer (see `confirmExpenseDraft` in the entity).
 */
export interface ExpenseDraftRepository {
  findById(id: ExpenseDraftId): Promise<ExpenseDraft | null>;
  listByGroup(groupId: GroupId, pagination: Pagination): Promise<PaginatedResult<ExpenseDraft>>;
  listByStatus(status: ExpenseDraft['status'], pagination: Pagination): Promise<PaginatedResult<ExpenseDraft>>;
  listByCaptureSource(captureSourceId: string): Promise<readonly ExpenseDraft[]>;
  listUpdatedSince(groupId: GroupId, since: DateTime, pagination: Pagination): Promise<PaginatedResult<ExpenseDraft>>;
  save(draft: ExpenseDraft): Promise<void>;
  softDelete(id: ExpenseDraftId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
