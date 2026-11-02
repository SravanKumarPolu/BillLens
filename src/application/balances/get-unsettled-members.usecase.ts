import type { MemberCurrencyBalance } from '@domain/services/balances/balance-engine';
import type { CurrencyCode } from '@domain/value-objects/currency-code';
import type { GroupId, MemberId } from '@shared-types/index';


import { type GetGroupBalancesUseCase } from './get-group-balances.usecase';

/**
 * Use case: Get the list of members with non-zero balances in a group.
 *
 * Phase 6 Prompt 51 — required use case `GetUnsettledMembersUseCase`.
 *
 * Returns members whose `netBalanceMinor !== 0` in any currency.
 * Settled members (net balance = 0 across all currencies) are
 * excluded. Each unsettled member is returned once per currency in
 * which they have a non-zero balance.
 *
 * Backs the "Who owes / Who is owed" UI section, which the spec calls
 * out as a primary user-facing surface.
 */
export class GetUnsettledMembersUseCase {
  constructor(private readonly getGroupBalances: GetGroupBalancesUseCase) {}

  async execute(
    input: GetUnsettledMembersInput,
  ): Promise<GetUnsettledMembersOutput> {
    const groupResult = await this.getGroupBalances.execute({
      groupId: input.groupId,
    });
    if (groupResult.notFound) {
      return { notFound: true, entries: [] };
    }
    const entries: UnsettledMemberEntry[] = [];
    for (const r of groupResult.results) {
      for (const b of r.memberCurrencyBalances) {
        if (b.netBalanceMinor !== 0) {
          entries.push({
            memberId: b.memberId,
            currencyCode: b.currencyCode,
            netBalanceMinor: b.netBalanceMinor,
            // positive → should receive; negative → owes; zero excluded
            position: b.netBalanceMinor > 0 ? 'creditor' : 'debtor',
          });
        }
      }
    }
    return { notFound: false, entries };
  }
}

export interface GetUnsettledMembersInput {
  readonly groupId: GroupId;
}

export interface UnsettledMemberEntry {
  readonly memberId: MemberId;
  readonly currencyCode: CurrencyCode;
  readonly netBalanceMinor: number;
  readonly position: 'creditor' | 'debtor';
}

export interface GetUnsettledMembersOutput {
  /** True if the group does not exist or the caller lacks access. */
  readonly notFound: boolean;
  /** One entry per (member, currency) pair with non-zero balance. */
  readonly entries: readonly UnsettledMemberEntry[];
}

// Type re-export for external consumers
export type { MemberCurrencyBalance };
