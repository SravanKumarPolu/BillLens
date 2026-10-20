
import type { BalanceQueryPort } from '@application/balances/balance-query.port';
import { memberIdsOf } from '@application/balances/balance-query.port';
import { calculateGroupBalancesByCurrency } from '@domain/services/balances/balance-engine';
import type { SuggestedTransfer } from '@domain/services/balances/balance-engine';
import type { GroupId, MemberId } from '@shared-types/index';

/**
 * Use case: Compare the original (expense-level) debts with the
 * simplified settlement plan.
 *
 * Phase 6 Prompt 55 — required use case `CompareOriginalAndSimplifiedPlanUseCase`.
 *
 * The spec says:
 *
 *   "Users should be able to see:
 *     - Original balances
 *     - Simplified plan
 *     - Explanation of why the plan differs
 *     - Number of transfers saved
 *     - Members involved"
 *
 * This use case loads the group's balances, computes the simplified
 * plan (which the balance engine already does), and returns a
 * side-by-side comparison:
 *
 *   - `originalTransferCount` — the number of individual expense-
 *     level obligations (not computed by the balance engine; we
 *     estimate it as the number of non-zero member balances, since
 *     each non-zero member needs at least one transfer)
 *   - `simplifiedTransferCount` — the actual number of suggested
 *     transfers from the greedy algorithm
 *   - `transfersSaved` — the difference
 *   - `membersInvolved` — the set of members with non-zero balances
 *
 * ── Multi-currency ──
 *
 * The comparison is per-currency. Cross-currency comparisons are
 * never made.
 */
export class CompareOriginalAndSimplifiedPlanUseCase {
  constructor(private readonly balanceQuery: BalanceQueryPort) {}

  async execute(input: CompareOriginalAndSimplifiedInput): Promise<CompareOriginalAndSimplifiedOutput> {
    const data = await this.balanceQuery.loadGroupBalanceInput(input.groupId);
    if (data === null) {
      return { notFound: true, comparisons: [] };
    }
    const results = calculateGroupBalancesByCurrency({
      groupId: input.groupId as string,
      members: memberIdsOf(data),
      expenses: data.expenses,
      payers: data.payers,
      splits: data.splits,
      settlements: data.settlements,
    });

    const comparisons: CurrencyComparison[] = results.map((r) => {
      const unsettled = r.memberCurrencyBalances.filter((b) => b.netBalanceMinor !== 0);
      // The "original" transfer count is an upper bound: in the worst
      // case (no simplification), each debtor pays each creditor.
      // But a tighter bound is the number of non-zero members / 2
      // (rounded up) — each transfer settles one debtor and one creditor.
      // We use the actual expense-level obligation count: the number of
      // member pairs where one owes the other, estimated as
      // (debtors × creditors). The greedy algorithm's result is the
      // simplified count.
      const debtors = unsettled.filter((b) => b.netBalanceMinor < 0);
      const creditors = unsettled.filter((b) => b.netBalanceMinor > 0);
      const originalTransferCount = debtors.length * creditors.length;
      const simplifiedTransferCount = r.suggestedTransfers.length;
      const transfersSaved = originalTransferCount - simplifiedTransferCount;

      return {
        currencyCode: r.currencyCode,
        originalTransferCount,
        simplifiedTransferCount,
        transfersSaved,
        membersInvolved: unsettled.map((b) => b.memberId),
        simplifiedTransfers: r.suggestedTransfers,
      };
    });

    return { notFound: false, comparisons };
  }
}

export interface CompareOriginalAndSimplifiedInput {
  readonly groupId: GroupId;
}

export interface CurrencyComparison {
  readonly currencyCode: string;
  /** Worst-case transfers without simplification (debtors × creditors). */
  readonly originalTransferCount: number;
  /** Actual suggested transfers from the greedy algorithm. */
  readonly simplifiedTransferCount: number;
  readonly transfersSaved: number;
  readonly membersInvolved: readonly MemberId[];
  readonly simplifiedTransfers: readonly SuggestedTransfer[];
}

export interface CompareOriginalAndSimplifiedOutput {
  readonly notFound: boolean;
  readonly comparisons: readonly CurrencyComparison[];
}
