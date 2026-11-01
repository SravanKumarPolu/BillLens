import type { MemberId } from '@shared-types/index';

import type { Expense } from '../entities/expense';
import type { ExpenseSplit } from '../entities/expense-split';

import type { RoundingExplanation } from './explanation-types';

export function buildRoundingExplanations(
  expenses: readonly Expense[],
  splits: readonly ExpenseSplit[],
): readonly RoundingExplanation[] {
  const result: RoundingExplanation[] = [];
  const splitsByExpense = new Map<string, ExpenseSplit[]>();
  for (const s of splits) {
    const list = splitsByExpense.get(s.expenseId as string) ?? [];
    list.push(s);
    splitsByExpense.set(s.expenseId as string, list);
  }
  for (const expense of expenses) {
    if (expense.deletedAt) continue;
    const expenseSplits = splitsByExpense.get(expense.id as string) ?? [];
    const splitSum = expenseSplits.reduce((acc, s) => acc + s.amountMinor, 0);
    if (splitSum === expense.amountMinor) continue; // No rounding
    const remainder = expense.amountMinor - splitSum;
    // Find which members got the extra minor units
    const sorted = [...expenseSplits].sort((a, b) =>
      (a.memberId as string).localeCompare(b.memberId as string),
    );
    const membersReceivingExtra: MemberId[] = [];
    for (let i = 0; i < Math.abs(remainder); i++) {
      const split = sorted[i % sorted.length];
      if (split) membersReceivingExtra.push(split.memberId);
    }
    result.push({
      expenseId: expense.id as string,
      totalAmountMinor: expense.amountMinor,
      splitSumMinor: splitSum,
      remainderMinor: remainder,
      distributionMethod: remainder > 0 ? 'earliest_indices' : 'largest_remainder',
      membersReceivingExtra,
    });
  }
  return result;
}
