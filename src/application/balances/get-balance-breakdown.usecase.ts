import type { BalanceExplanationEntry, CurrencyBalanceResult } from '@domain/services/balances/balance-engine';
import type { GroupId, MemberId } from '@shared-types/index';


import { type GetGroupBalancesUseCase } from './get-group-balances.usecase';

/**
 * Use case: Get the per-expense balance breakdown for a single member.
 *
 * Phase 6 Prompt 51 — required use case `GetBalanceBreakdownUseCase`.
 *
 * Returns, for each currency the member has activity in, the list of
 * expenses that contributed to their balance: which expense, how much
 * they paid for it, how much their share was, and what their net for
 * that expense was. Backs the explanation UI (Prompt 55 source
 * contribution breakdown).
 *
 * The breakdown is grouped by currency so the UI can render each
 * currency's contribution separately, honouring the multi-currency
 * separation rule.
 */
export class GetBalanceBreakdownUseCase {
  constructor(private readonly getGroupBalances: GetGroupBalancesUseCase) {}

  async execute(input: GetBalanceBreakdownInput): Promise<GetBalanceBreakdownOutput> {
    const groupResult = await this.getGroupBalances.execute({
      groupId: input.groupId,
    });
    if (groupResult.notFound) {
      return { notFound: true, breakdowns: [] };
    }
    const breakdowns: CurrencyBreakdown[] = [];
    for (const r of groupResult.results) {
      const entries = r.explanations.get(input.memberId as string) ?? [];
      if (entries.length > 0) {
        breakdowns.push({
          currencyCode: r.currencyCode,
          entries,
        });
      }
    }
    return { notFound: false, breakdowns };
  }
}

export interface GetBalanceBreakdownInput {
  readonly groupId: GroupId;
  readonly memberId: MemberId;
}

/**
 * The per-expense breakdown for one currency.
 */
export interface CurrencyBreakdown {
  readonly currencyCode: CurrencyBalanceResult['currencyCode'];
  readonly entries: readonly BalanceExplanationEntry[];
}

export interface GetBalanceBreakdownOutput {
  /** True if the group does not exist or the caller lacks access. */
  readonly notFound: boolean;
  /** One CurrencyBreakdown per currency the member has expense activity in. */
  readonly breakdowns: readonly CurrencyBreakdown[];
}
