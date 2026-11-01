
import type { Settlement } from '@domain/entities/settlement';
import type { PaginatedResult, Pagination } from '@domain/repositories/repository-contracts';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { GroupId } from '@shared-types/index';

/**
 * Use case: List disputed settlements for a group.
 *
 * Phase 6 Track 5 / Prompt 57 — backs the dispute-resolution
 * queue. Returns all settlements in the group that are in
 * `disputed` status, ordered by settlementDate DESC.
 *
 * The receiver (or an admin, where policy allows) uses this list
 * to resolve disputes — either accepting the payment
 * (`ResolveDisputeUseCase` with `resolution: 'completed'`) or
 * rejecting it (`resolution: 'cancelled'`).
 *
 * ── Permission ──
 *
 * The caller is responsible for filtering the results to the
 * disputes the current user can resolve (typically the receiver
 * of each settlement). This use case returns all disputed
 * settlements for the group; the UI filters further if needed.
 */
export class ListDisputedSettlementsUseCase {
  constructor(private readonly settlements: SettlementRepository) {}

  async execute(input: ListDisputedSettlementsInput): Promise<ListDisputedSettlementsOutput> {
    const page = await this.settlements.listDisputed(
      input.groupId,
      input.pagination,
    );
    // Defensive: filter out soft-deleted.
    const items = page.items.filter((s) => s.deletedAt === undefined);
    return {
      items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

export interface ListDisputedSettlementsInput {
  readonly groupId: GroupId;
  readonly pagination: Pagination;
}

export type ListDisputedSettlementsOutput = PaginatedResult<Settlement>;
