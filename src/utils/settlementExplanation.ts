/**
 * Settlement Explanation Service
 * 
 * Provides clear explanations of balance changes after settlements
 * to prevent confusion (addressing Splid's pain point of sudden changes)
 */

import { GroupBalance, Settlement, Expense, Member } from '../types/models';
import { formatMoney } from './formatMoney';

export interface BalanceChange {
  memberId: string;
  memberName: string;
  beforeBalance: number;
  afterBalance: number;
  change: number;
  explanation: string;
}

export interface SettlementExplanation {
  settlement: Settlement;
  fromMember: Member;
  toMember: Member;
  balanceChanges: BalanceChange[];
  summary: string;
}

/**
 * Explains what changed after a settlement
 * Shows before/after balances for transparency
 */
export const explainSettlement = (
  settlement: Settlement,
  balancesBefore: GroupBalance[],
  balancesAfter: GroupBalance[],
  members: Member[]
): SettlementExplanation => {
  const fromMember = members.find(m => m.id === settlement.fromMemberId);
  const toMember = members.find(m => m.id === settlement.toMemberId);

  if (!fromMember || !toMember) {
    throw new Error('Members not found for settlement');
  }

  const balanceChanges: BalanceChange[] = [];

  // Calculate changes for both parties
  const fromBefore = balancesBefore.find(b => b.memberId === settlement.fromMemberId)?.balance || 0;
  const fromAfter = balancesAfter.find(b => b.memberId === settlement.fromMemberId)?.balance || 0;
  const fromChange = fromAfter - fromBefore;

  const toBefore = balancesBefore.find(b => b.memberId === settlement.toMemberId)?.balance || 0;
  const toAfter = balancesAfter.find(b => b.memberId === settlement.toMemberId)?.balance || 0;
  const toChange = toAfter - toBefore;

  balanceChanges.push({
    memberId: settlement.fromMemberId,
    memberName: fromMember.name,
    beforeBalance: fromBefore,
    afterBalance: fromAfter,
    change: fromChange,
    explanation: `${fromMember.name} paid ₹${formatMoney(settlement.amount)} to ${toMember.name}. Balance changed from ${formatMoney(fromBefore)} to ${formatMoney(fromAfter)}.`,
  });

  balanceChanges.push({
    memberId: settlement.toMemberId,
    memberName: toMember.name,
    beforeBalance: toBefore,
    afterBalance: toAfter,
    change: toChange,
    explanation: `${toMember.name} received ₹${formatMoney(settlement.amount)} from ${fromMember.name}. Balance changed from ${formatMoney(toBefore)} to ${formatMoney(toAfter)}.`,
  });

  // Create summary
  let summary = '';
  if (fromAfter === 0 && toAfter === 0) {
    summary = `Settlement cleared all balances between ${fromMember.name} and ${toMember.name}.`;
  } else if (fromAfter === 0) {
    summary = `${fromMember.name} is now fully settled. ${toMember.name} now has a balance of ${formatMoney(toAfter)}.`;
  } else if (toAfter === 0) {
    summary = `${toMember.name} is now fully settled. ${fromMember.name} now has a balance of ${formatMoney(fromAfter)}.`;
  } else {
    summary = `After this payment, ${fromMember.name} has ${formatMoney(fromAfter)} and ${toMember.name} has ${formatMoney(toAfter)}.`;
  }

  return {
    settlement,
    fromMember,
    toMember,
    balanceChanges,
    summary,
  };
};

/**
 * Gets balance history explanation for a member
 * Shows how their balance changed over time
 */
export const getBalanceHistory = (
  memberId: string,
  expenses: Expense[],
  settlements: Settlement[],
  members: Member[]
): Array<{
  date: string;
  description: string;
  change: number;
  balanceAfter: number;
}> => {
  const history: Array<{
    date: string;
    description: string;
    change: number;
    balanceAfter: number;
  }> = [];

  let runningBalance = 0;

  // Process expenses
  expenses
    .filter(e => e.paidBy === memberId || e.splits?.some(s => s.memberId === memberId))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach(expense => {
      if (expense.paidBy === memberId) {
        runningBalance += expense.amount;
        history.push({
          date: expense.date,
          description: `Paid ₹${formatMoney(expense.amount)} for ${expense.merchant || expense.title}`,
          change: expense.amount,
          balanceAfter: runningBalance,
        });
      }

      const memberSplit = expense.splits?.find(s => s.memberId === memberId);
      if (memberSplit) {
        runningBalance -= memberSplit.amount;
        history.push({
          date: expense.date,
          description: `Owed ₹${formatMoney(memberSplit.amount)} for ${expense.merchant || expense.title}`,
          change: -memberSplit.amount,
          balanceAfter: runningBalance,
        });
      }
    });

  // Process settlements
  settlements
    .filter(s => (s.fromMemberId === memberId || s.toMemberId === memberId) && s.status === 'completed')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach(settlement => {
      const otherMember = members.find(
        m => m.id === (settlement.fromMemberId === memberId ? settlement.toMemberId : settlement.fromMemberId)
      );

      if (settlement.fromMemberId === memberId) {
        runningBalance -= settlement.amount;
        history.push({
          date: settlement.date,
          description: `Paid ₹${formatMoney(settlement.amount)} to ${otherMember?.name || 'someone'}`,
          change: -settlement.amount,
          balanceAfter: runningBalance,
        });
      } else {
        runningBalance += settlement.amount;
        history.push({
          date: settlement.date,
          description: `Received ₹${formatMoney(settlement.amount)} from ${otherMember?.name || 'someone'}`,
          change: settlement.amount,
          balanceAfter: runningBalance,
        });
      }
    });

  return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
