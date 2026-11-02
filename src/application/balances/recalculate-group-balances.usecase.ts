import type { CurrencyBalanceResult } from '@domain/services/balances/balance-engine';
import type { GroupId } from '@shared-types/index';


import { type GetGroupBalancesUseCase } from './get-group-balances.usecase';

/**
 * Use case: Force a recalculation of the group's balances.
 *
 * Phase 6 Prompt 51 — required use case `RecalculateGroupBalancesUseCase`.
 *
 * The balance engine is pure and idempotent — calling it twice on the
 * same input produces the same result. In production, balances are
 * typically computed on demand (each screen load) rather than cached.
 *
 * This use case exists for two reasons:
 *
 *   1. UI affordance: a "Refresh balances" button can call it
 *      explicitly when the user suspects stale data.
 *   2. Future cache invalidation: when a balance cache is added
 *      (deferred Track), this use case will invalidate the cache
 *      before recomputing.
 *
 * The current implementation simply calls `GetGroupBalancesUseCase`
 * — it does NOT bypass any cache (there is no cache yet). The output
 * is identical to `GetGroupBalancesUseCase`. The separation exists
 * so the UI can express intent ("recalculate now") distinct from
 * "give me the cached balance".
 */
export class RecalculateGroupBalancesUseCase {
  constructor(private readonly getGroupBalances: GetGroupBalancesUseCase) {}

  async execute(
    input: RecalculateGroupBalancesInput,
  ): Promise<RecalculateGroupBalancesOutput> {
    const result = await this.getGroupBalances.execute({ groupId: input.groupId });
    return {
      notFound: result.notFound,
      results: result.results,
    };
  }
}

export interface RecalculateGroupBalancesInput {
  readonly groupId: GroupId;
}

export interface RecalculateGroupBalancesOutput {
  readonly notFound: boolean;
  readonly results: readonly CurrencyBalanceResult[];
}
