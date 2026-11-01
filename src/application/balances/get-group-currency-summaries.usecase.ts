import type { CurrencyBalanceResult } from '@domain/services/balances/balance-engine';
import type { CurrencyCode } from '@domain/value-objects/currency-code';
import type { GroupId } from '@shared-types/index';


import { type GetGroupBalancesUseCase } from './get-group-balances.usecase';

/**
 * Use case: Get the list of currencies present in a group's balances.
 *
 * Phase 6 Prompt 51 — required use case `GetGroupCurrencySummariesUseCase`.
 *
 * Returns a list of `CurrencySummary` objects — one per currency the
 * group has any expense or settlement activity in. Each summary
 * includes the currency code, the number of members with non-zero
 * balances in that currency, the total expense amount in that
 * currency (across all expenses), and the total settlement amount
 * (across all settlements).
 *
 * Backs the group-balance header UI (which currency chips to show,
 * and which one is "primary").
 */
export class GetGroupCurrencySummariesUseCase {
  constructor(private readonly getGroupBalances: GetGroupBalancesUseCase) {}

  async execute(
    input: GetGroupCurrencySummariesInput,
  ): Promise<GetGroupCurrencySummariesOutput> {
    const groupResult = await this.getGroupBalances.execute({
      groupId: input.groupId,
    });
    if (groupResult.notFound) {
      return { notFound: true, summaries: [] };
    }
    const summaries: CurrencySummary[] = groupResult.results.map((r) => ({
      currencyCode: r.currencyCode,
      nonZeroMemberCount: r.memberCurrencyBalances.filter(
        (b) => b.netBalanceMinor !== 0,
      ).length,
      totalExpenseCount: r.memberCurrencyBalances.reduce(
        (acc, b) => acc + b.expenseCount,
        0,
      ),
      totalSettlementCount: r.memberCurrencyBalances.reduce(
        (acc, b) => acc + b.settlementCount,
        0,
      ),
      isBalanced: r.isBalanced,
    }));
    return { notFound: false, summaries };
  }
}

export interface GetGroupCurrencySummariesInput {
  readonly groupId: GroupId;
}

export interface CurrencySummary {
  readonly currencyCode: CurrencyCode;
  readonly nonZeroMemberCount: number;
  readonly totalExpenseCount: number;
  readonly totalSettlementCount: number;
  readonly isBalanced: boolean;
}

export interface GetGroupCurrencySummariesOutput {
  /** True if the group does not exist or the caller lacks access. */
  readonly notFound: boolean;
  /** One CurrencySummary per currency the group has activity in. */
  readonly summaries: readonly CurrencySummary[];
}

// Type alias for external consumers who want the CurrencyBalanceResult shape
export type { CurrencyBalanceResult };
