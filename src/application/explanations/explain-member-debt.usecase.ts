
import type { BalanceQueryPort } from '@application/balances/balance-query.port';
import { memberIdsOf } from '@application/balances/balance-query.port';
import type { BalanceExplanationEntry } from '@domain/services/balances/balance-engine';
import { calculateGroupBalancesByCurrency } from '@domain/services/balances/balance-engine';
import type { GroupId, MemberId } from '@shared-types/index';

/**
 * Use case: Explain a member's debt (why they owe money).
 *
 * Phase 6 Prompt 55 — required use case `ExplainMemberDebtUseCase`.
 *
 * Produces a structured breakdown of why a member owes money in a
 * specific currency: which expenses they participated in, how much
 * they paid, how much their share was, and their net per expense.
 *
 * The spec example:
 *
 *   Restaurant
 *   Your share: £24
 *
 *   Taxi
 *   Your share: £10
 *
 *   Hotel
 *   Your share: £18
 *
 *   You paid for groceries
 *   Credit: £10
 *
 *   Current amount owed: £42
 *
 * This use case returns the structured data; the UI renders the
 * list. The explanation is generated from the balance engine's
 * `explanations` map — never from generative AI (the spec says:
 * "Do not use generative AI to invent amounts, participants,
 * causes, settlement status, or rounding explanations").
 */
export class ExplainMemberDebtUseCase {
  constructor(private readonly balanceQuery: BalanceQueryPort) {}

  async execute(input: ExplainMemberDebtInput): Promise<ExplainMemberDebtOutput> {
    const data = await this.balanceQuery.loadGroupBalanceInput(input.groupId);
    if (data === null) {
      return { notFound: true, breakdowns: [] };
    }
    const results = calculateGroupBalancesByCurrency({
      groupId: input.groupId as string,
      members: memberIdsOf(data),
      expenses: data.expenses,
      payers: data.payers,
      splits: data.splits,
      settlements: data.settlements,
    });

    const breakdowns: MemberDebtBreakdown[] = [];
    for (const r of results) {
      const entries = r.explanations.get(input.memberId as string) ?? [];
      if (entries.length === 0) continue;
      const memberBalance = r.memberCurrencyBalances.find((b) => b.memberId === input.memberId);
      if (memberBalance === undefined) continue;

      // Only include currencies where the member has a non-zero balance
      // (i.e. they actually owe or are owed)
      if (memberBalance.netBalanceMinor === 0) continue;

      const owes = memberBalance.netBalanceMinor < 0;
      const owesMinor = Math.abs(memberBalance.netBalanceMinor);

      // Build the per-expense breakdown
      const expenseEntries: ExpenseExplanationEntry[] = entries.map((e: BalanceExplanationEntry) => ({
        expenseId: e.expenseId,
        expenseTitle: e.expenseTitle,
        paidByMemberId: e.paidByMemberId,
        memberPaidMinor: e.memberPaidMinor,
        memberShareMinor: e.memberShareMinor,
        memberNetForExpenseMinor: e.memberNetForExpenseMinor,
      }));

      breakdowns.push({
        currencyCode: r.currencyCode,
        owes,
        netBalanceMinor: memberBalance.netBalanceMinor,
        owesMinor,
        expenseEntries,
        paidMinor: memberBalance.paidMinor,
        shareMinor: memberBalance.shareMinor,
        settlementsSentMinor: memberBalance.settlementsSentMinor,
        settlementsReceivedMinor: memberBalance.settlementsReceivedMinor,
      });
    }

    return { notFound: false, breakdowns };
  }
}

export interface ExplainMemberDebtInput {
  readonly groupId: GroupId;
  readonly memberId: MemberId;
}

export interface ExpenseExplanationEntry {
  readonly expenseId: string;
  readonly expenseTitle: string;
  readonly paidByMemberId?: MemberId;
  readonly memberPaidMinor: number;
  readonly memberShareMinor: number;
  readonly memberNetForExpenseMinor: number;
}

export interface MemberDebtBreakdown {
  readonly currencyCode: string;
  /** true if the member owes money; false if they should receive. */
  readonly owes: boolean;
  readonly netBalanceMinor: number;
  readonly owesMinor: number;
  readonly expenseEntries: readonly ExpenseExplanationEntry[];
  readonly paidMinor: number;
  readonly shareMinor: number;
  readonly settlementsSentMinor: number;
  readonly settlementsReceivedMinor: number;
}

export interface ExplainMemberDebtOutput {
  readonly notFound: boolean;
  readonly breakdowns: readonly MemberDebtBreakdown[];
}

/**
 * Use case: Explain a member's credit (why they should receive money).
 *
 * Phase 6 Prompt 55 — required use case `ExplainMemberCreditUseCase`.
 *
 * Same as `ExplainMemberDebtUseCase` but filters to currencies where
 * the member has a positive balance (should receive). The structured
 * data is the same — the difference is the filter and the `owes` flag.
 */
export class ExplainMemberCreditUseCase {
  constructor(private readonly balanceQuery: BalanceQueryPort) {}

  async execute(input: ExplainMemberDebtInput): Promise<ExplainMemberDebtOutput> {
    const debtUseCase = new ExplainMemberDebtUseCase(this.balanceQuery);
    const result = await debtUseCase.execute(input);
    if (result.notFound) {
      return result;
    }
    // Filter to only currencies where the member should receive (netBalance > 0)
    return {
      notFound: false,
      breakdowns: result.breakdowns.filter((b) => !b.owes),
    };
  }
}
