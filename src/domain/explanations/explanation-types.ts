import type { MemberId } from '@shared-types/index';

export interface ExpenseContribution {
  readonly expenseId: string;
  readonly expenseTitle: string;
  readonly paidByMemberId?: MemberId;
  readonly memberPaidMinor: number;
  readonly memberShareMinor: number;
  readonly memberNetForExpenseMinor: number;
  readonly expenseDate: string;
}

export interface SettlementExplanation {
  readonly settlementId: string;
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly amountMinor: number;
  readonly date: string;
  readonly impactOnMember: 'reduced_debt' | 'reduced_credit' | 'no_impact';
}

export interface RoundingExplanation {
  readonly expenseId: string;
  readonly totalAmountMinor: number;
  readonly splitSumMinor: number;
  readonly remainderMinor: number;
  readonly distributionMethod: string;
  readonly membersReceivingExtra: readonly MemberId[];
}

export interface BalanceExplanation {
  readonly memberId: MemberId;
  readonly paidMinor: number;
  readonly shareMinor: number;
  readonly settlementsSentMinor: number;
  readonly settlementsReceivedMinor: number;
  readonly netBalanceMinor: number;
  readonly expenseContributions: readonly ExpenseContribution[];
  readonly settlementImpact: readonly SettlementExplanation[];
  readonly roundingNotes: readonly RoundingExplanation[];
  readonly summaryKey: 'creditor' | 'debtor' | 'settled';
  readonly summaryText: string;
}
