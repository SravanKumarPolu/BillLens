
import type { Settlement } from '@domain/entities/settlement';
import type { PaginatedResult, Pagination } from '@domain/repositories/repository-contracts';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { GroupId } from '@shared-types/index';

/**
 * Use case: List settlements awaiting the receiver's confirmation.
 *
 * Phase 6 Track 5 / Prompt 57 — backs the receiver's "pending
 * confirmation" inbox. Returns all settlements in the group
 * that are in `pending_confirmation` status, ordered by
 * settlementDate DESC (most recent first).
 *
 * The receiver uses this list to confirm, dispute, request more
 * info, mark duplicate, or correct the amount on each settlement.
 *
 * ── Permission ──
 *
 * The caller is responsible for filtering the results to the
 * settlements where the current user is the receiver
 * (`toMemberId === currentUserMemberId`). This use case returns
 * all pending-confirmation settlements for the group; the UI
 * filters further if needed.
 */
export class ListPendingConfirmationsUseCase {
  constructor(private readonly settlements: SettlementRepository) {}

  async execute(input: ListPendingConfirmationsInput): Promise<ListPendingConfirmationsOutput> {
    const page = await this.settlements.listPendingConfirmation(
      input.groupId,
      input.pagination,
    );
    // Defensive: filter out soft-deleted (the repository should already
    // do this, but the use case is the last line of defence).
    const items = page.items.filter((s) => s.deletedAt === undefined);
    return {
      items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

export interface ListPendingConfirmationsInput {
  readonly groupId: GroupId;
  readonly pagination: Pagination;
}

export type ListPendingConfirmationsOutput = PaginatedResult<Settlement>;
