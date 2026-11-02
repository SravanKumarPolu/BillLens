
import type { Settlement } from '@domain/entities/settlement';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { SettlementId } from '@shared-types/index';

/**
 * Use case: Get a single settlement by ID.
 *
 * Phase 6 Prompt 52 — required use case `GetSettlementUseCase`.
 *
 * Returns the settlement or `null` if not found. Does NOT throw on
 * not-found — callers (UI, sync, audit) handle null explicitly. Soft-
 * deleted settlements are NOT returned (this is the active-record
 * view; for the audit view, use `listStateHistory` on the repository).
 *
 * This use case is a thin wrapper around `settlementRepo.findById`.
 * It exists for two reasons:
 *   1. The application layer's public surface should be uniformly
 *      use cases, not raw repository calls — easier to mock, log,
 *      permission-check, and audit.
 *   2. Future permission checks ("can the actor view this group's
 *      settlements?") belong here, not in the repository.
 */
export class GetSettlementUseCase {
  constructor(private readonly settlements: SettlementRepository) {}

  async execute(input: GetSettlementInput): Promise<GetSettlementOutput> {
    const settlement = await this.settlements.findById(input.settlementId);
    // Filter out soft-deleted settlements (the audit view goes through
    // listStateHistory, not this use case).
    if (settlement === null || settlement.deletedAt !== undefined) {
      return { settlement: null };
    }
    return { settlement };
  }
}

export interface GetSettlementInput {
  readonly settlementId: SettlementId;
}

export interface GetSettlementOutput {
  readonly settlement: Settlement | null;
}
