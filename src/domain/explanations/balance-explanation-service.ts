import type { MemberId } from '@shared-types/index';

import { getCurrency } from '../entities/currency';
import type { MemberBalance, BalanceResult } from '../services/balances/balance-engine';
import type { CurrencyCode } from '../value-objects/currency-code';

import type { BalanceExplanation, ExpenseContribution } from './explanation-types';

/**
 * Build a human-readable explanation for a member's balance.
 *
 * Uses ONLY verified financial records (expenses, payers, splits, settlements).
 * Does NOT use uncontrolled AI — all explanations are deterministic and
 * derived from the same data the balance engine uses.
 */
export function explainMemberBalance(
  memberId: MemberId,
  balance: MemberBalance,
  balanceResult: BalanceResult,
  currencyCode: CurrencyCode,
): BalanceExplanation {
  const contributions = balanceResult.explanations.get(memberId as string) ?? [];
  const expenseContributions: ExpenseContribution[] = contributions.map((c) => ({
    expenseId: c.expenseId,
    expenseTitle: c.expenseTitle,
    ...(c.paidByMemberId !== undefined ? { paidByMemberId: c.paidByMemberId } : {}),
    memberPaidMinor: c.memberPaidMinor,
    memberShareMinor: c.memberShareMinor,
    memberNetForExpenseMinor: c.memberNetForExpenseMinor,
    expenseDate: '', // would come from expense entity in production
  }));

  const summaryKey: 'creditor' | 'debtor' | 'settled' =
    balance.netBalanceMinor > 0 ? 'creditor' : balance.netBalanceMinor < 0 ? 'debtor' : 'settled';
  const summaryText = buildSummaryText(summaryKey, balance, currencyCode);

  return {
    memberId,
    paidMinor: balance.paidMinor,
    shareMinor: balance.shareMinor,
    settlementsSentMinor: balance.settlementsSentMinor,
    settlementsReceivedMinor: balance.settlementsReceivedMinor,
    netBalanceMinor: balance.netBalanceMinor,
    expenseContributions,
    settlementImpact: [], // filled by SettlementExplanationBuilder
    roundingNotes: [], // filled by RoundingExplanationBuilder
    summaryKey,
    summaryText,
  };
}

function buildSummaryText(
  key: 'creditor' | 'debtor' | 'settled',
  balance: MemberBalance,
  currency: CurrencyCode,
): string {
  // v2.5.0 FIX: this formatter hardcoded ÷100 / 2 decimals — a JPY
  // amount of ¥1500 (minor 1500, 0 decimals) rendered as "15.00" and a
  // KWD amount truncated its third decimal. Use the currency registry's
  // decimalPlaces with pure integer math, exactly like the balance
  // engine's formatMoney.
  const decimals = getCurrency(currency)?.decimalPlaces ?? 2;
  const divisor = Math.pow(10, decimals);
  const major = (minor: number) => {
    const sign = minor < 0 ? '-' : '';
    return `${sign}${Math.floor(Math.abs(minor) / divisor)}.${(Math.abs(minor) % divisor)
      .toString()
      .padStart(decimals, '0')}`;
  };
  switch (key) {
    case 'creditor':
      return `Paid ${currency} ${major(balance.paidMinor)}, share ${currency} ${major(
        balance.shareMinor,
      )}. Should receive ${currency} ${major(balance.netBalanceMinor)}.`;
    case 'debtor':
      return `Paid ${currency} ${major(balance.paidMinor)}, share ${currency} ${major(
        balance.shareMinor,
      )}. Owes ${currency} ${major(Math.abs(balance.netBalanceMinor))}.`;
    case 'settled':
      return `Paid ${currency} ${major(balance.paidMinor)}, share ${currency} ${major(
        balance.shareMinor,
      )}. Settled.`;
  }
}
