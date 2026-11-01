import type { MemberCurrencyBalance } from '@domain/services/balances/balance-engine';
import type { GroupId, MemberId } from '@shared-types/index';


import { type GetGroupBalancesUseCase } from './get-group-balances.usecase';

/**
 * Use case: Get the per-currency balance for a single member of a group.
 *
 * Phase 6 Prompt 51 — required use case `GetMemberBalanceUseCase`.
 *
 * Loads the group's full balance data and filters to just the
 * balances for the requested member. Returns one
 * `MemberCurrencyBalance` per currency the member has any activity
 * in (paid, shared, sent, or received).
 *
 * Returns an empty array if the member has no activity in any
 * currency, or if the group does not exist (the caller distinguishes
 * via the `notFound` flag).
 *
 * Spec rule (Prompt 51): "For each member and currency: net balance
 * = paid − share + settlements received − settlements sent." This
 * use case is the read-side surface for that rule.
 */
export class GetMemberBalanceUseCase {
  constructor(private readonly getGroupBalances: GetGroupBalancesUseCase) {}

  async execute(input: GetMemberBalanceInput): Promise<GetMemberBalanceOutput> {
    const groupResult = await this.getGroupBalances.execute({
      groupId: input.groupId,
    });
    if (groupResult.notFound) {
      return { notFound: true, balances: [] };
    }
    const balances: MemberCurrencyBalance[] = [];
    for (const r of groupResult.results) {
      const mb = r.memberCurrencyBalances.find(
        (b) => b.memberId === input.memberId,
      );
      if (mb !== undefined) {
        balances.push(mb);
      }
    }
    return { notFound: false, balances };
  }
}

export interface GetMemberBalanceInput {
  readonly groupId: GroupId;
  readonly memberId: MemberId;
}

export interface GetMemberBalanceOutput {
  /** True if the group does not exist or the caller lacks access. */
  readonly notFound: boolean;
  /** One per currency the member has activity in. Empty if no activity. */
  readonly balances: readonly MemberCurrencyBalance[];
}
