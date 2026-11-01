
import type { Settlement } from '@domain/entities/settlement';
import type { PaginatedResult, Pagination } from '@domain/repositories/repository-contracts';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { GroupId, MemberId } from '@shared-types/index';

/**
 * Use case: List settlements for a group, optionally filtered.
 *
 * Phase 6 Prompt 52 — required use case `ListSettlementsUseCase`.
 *
 * Backs the settlement history screen (Prompt 58) and the
 * pending-confirmation / disputed dashboards. The filter object is
 * optional — empty filter returns all active settlements for the
 * group, ordered by settlementDate DESC (the repository's default
 * ordering).
 *
 * Returns only active (non-deleted) settlements. The audit view (with
 * soft-deleted records) goes through `listStateHistory` on the
 * repository, not this use case.
 */
export class ListSettlementsUseCase {
  constructor(private readonly settlements: SettlementRepository) {}

  async execute(input: ListSettlementsInput): Promise<ListSettlementsOutput> {
    const page = await this.settlements.listByFilter(
      input.groupId,
      input.filter ?? {},
      input.pagination,
    );
    // Filter out soft-deleted settlements (defensive — repository
    // implementations should already do this, but the use case is
    // the last line of defence before the UI).
    const activeItems = page.items.filter((s) => s.deletedAt === undefined);
    return {
      items: activeItems,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

export interface ListSettlementsInput {
  readonly groupId: GroupId;
  readonly filter?: SettlementListFilterInput;
  readonly pagination: Pagination;
}

/**
 * Filter input for the list use case. Each field is optional —
 * `undefined` means "no filter on this field".
 *
 * Mirrors `SettlementListFilter` on the repository contract but is
 * declared separately so the application layer can evolve it
 * independently (e.g. add UI-only fields like `hasEvidence` later).
 */
export interface SettlementListFilterInput {
  readonly payerMemberId?: MemberId;
  readonly receiverMemberId?: MemberId;
  readonly currencyCode?: string;
  readonly method?: Settlement['method'];
  readonly status?: Settlement['status'];
  readonly statuses?: readonly Settlement['status'][];
}

export type ListSettlementsOutput = PaginatedResult<Settlement>;
