import {
  calculateGroupBalancesByCurrency,
  type CurrencyBalanceResult,
} from '@domain/services/balances/balance-engine';
import type { GroupId } from '@shared-types/index';


import type { BalanceQueryPort } from './balance-query.port';
import { memberIdsOf } from './balance-query.port';

/**
 * Use case: Get the per-currency balance summary for a group.
 *
 * Phase 6 Prompt 51 — required use case `GetGroupBalancesUseCase`.
 *
 * Loads all the data the balance engine needs via the
 * `BalanceQueryPort`, runs the multi-currency balance engine, and
 * returns one `CurrencyBalanceResult` per currency present in the
 * group's expenses and settlements.
 *
 * Returns an empty array if the group has no expenses and no
 * settlements, or if the group does not exist (the port returns
 * null). The caller distinguishes "group not found" (null) from
 * "group has no balances yet" (empty array) by checking the
 * `notFound` flag on the output.
 */
export class GetGroupBalancesUseCase {
  constructor(private readonly query: BalanceQueryPort) {}

  async execute(input: GetGroupBalancesInput): Promise<GetGroupBalancesOutput> {
    const data = await this.query.loadGroupBalanceInput(input.groupId);
    if (data === null) {
      return { notFound: true, results: [] };
    }
    const results = calculateGroupBalancesByCurrency({
      groupId: input.groupId as string,
      members: memberIdsOf(data),
      expenses: data.expenses,
      payers: data.payers,
      splits: data.splits,
      settlements: data.settlements,
    });
    return { notFound: false, results };
  }
}

export interface GetGroupBalancesInput {
  readonly groupId: GroupId;
}

export interface GetGroupBalancesOutput {
  /** True if the group does not exist or the caller lacks access. */
  readonly notFound: boolean;
  /** One result per currency present in the group. Empty if no balances. */
  readonly results: readonly CurrencyBalanceResult[];
}
