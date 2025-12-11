/**
 * Monthly Report Service
 * 
 * Generates comprehensive monthly reports with:
 * - Who spends more analysis
 * - Category-wise breakdown
 * - Group fairness analysis
 * - "You paid extra" insights
 */

import { Expense, Group, GroupBalance, Member } from '../types/models';
import { formatMoney } from './formatMoney';
import { formatCurrency } from './currencyService';

export interface MonthlyReport {
  month: string; // e.g., "December 2024"
  year: number;
  monthNumber: number;
  group: Group;
  totalSpent: number;
  totalExpenses: number;
  perPersonSpending: Array<{
    member: Member;
    totalPaid: number;
    totalOwed: number;
    netSpent: number;
    percentageOfTotal: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    total: number;
    percentage: number;
    perPerson: Record<string, number>;
  }>;
  fairnessAnalysis: {
    score: number; // 0-100
    whoSpendsMore: Array<{
      member: Member;
      extraPaid: number;
      percentage: number;
    }>;
    whoSpendsLess: Array<{
      member: Member;
      underPaid: number;
      percentage: number;
    }>;
  };
  insights: Array<{
    type: 'spending_imbalance' | 'category_imbalance' | 'fairness' | 'trend';
    title: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  topSpender: {
    member: Member;
    amount: number;
    percentage: number;
  };
  settlementStatus: {
    isSettled: boolean;
    totalPending: number;
    pendingPayments: Array<{
      from: Member;
      to: Member;
      amount: number;
    }>;
  };
}

/**
 * Generate monthly report for a group
 */
export const generateMonthlyReport = (
  group: Group,
  expenses: Expense[],
  balances: GroupBalance[],
  month?: number,
  year?: number
): MonthlyReport | null => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();

  // Filter expenses for the target month
  const monthExpenses = expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return (
      expenseDate.getMonth() === targetMonth &&
      expenseDate.getFullYear() === targetYear
    );
  });

  if (monthExpenses.length === 0) {
    return null; // No expenses for this month
  }

  const groupCurrency = group.currency || 'INR';
  const totalSpent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Calculate per-person spending
  const perPersonSpending = group.members.map(member => {
    // Total paid
    const paidExpenses = monthExpenses.filter(e => {
      if (e.payers && e.payers.length > 0) {
        return e.payers.some(p => p.memberId === member.id);
      }
      return e.paidBy === member.id;
    });

    const totalPaid = paidExpenses.reduce((sum, expense) => {
      if (expense.payers && expense.payers.length > 0) {
        const payer = expense.payers.find(p => p.memberId === member.id);
        return sum + (payer?.amount || 0);
      }
      return sum + expense.amount;
    }, 0);

    // Total owed
    const owedExpenses = monthExpenses.filter(e =>
      e.splits?.some(s => s.memberId === member.id)
    );

    const totalOwed = owedExpenses.reduce((sum, expense) => {
      const split = expense.splits?.find(s => s.memberId === member.id);
      return sum + (split?.amount || 0);
    }, 0);

    // Add extra items
    const extraItemsOwed = monthExpenses.reduce((sum, expense) => {
      if (!expense.extraItems) return sum;
      return sum + expense.extraItems.reduce((itemSum, item) => {
        if (item.splitBetween && item.splitBetween.includes(member.id)) {
          return itemSum + (item.amount / item.splitBetween.length);
        }
        if (!item.splitBetween && expense.splits?.some(s => s.memberId === member.id)) {
          const splitCount = expense.splits?.length || 1;
          return itemSum + (item.amount / splitCount);
        }
        return itemSum;
      }, 0);
    }, 0);

    const finalTotalOwed = totalOwed + extraItemsOwed;
    const netSpent = totalPaid - finalTotalOwed;
    const percentageOfTotal = totalSpent > 0 ? (totalPaid / totalSpent) * 100 : 0;

    return {
      member,
      totalPaid,
      totalOwed: finalTotalOwed,
      netSpent,
      percentageOfTotal,
    };
  });

  // Category breakdown
  const categoryMap = new Map<string, { total: number; perPerson: Record<string, number> }>();

  monthExpenses.forEach(expense => {
    const category = expense.category || 'Other';
    const existing = categoryMap.get(category) || { total: 0, perPerson: {} };

    existing.total += expense.amount;

    // Track per-person spending in this category
    expense.splits?.forEach(split => {
      existing.perPerson[split.memberId] = (existing.perPerson[split.memberId] || 0) + split.amount;
    });

    categoryMap.set(category, existing);
  });

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      total: data.total,
      percentage: totalSpent > 0 ? (data.total / totalSpent) * 100 : 0,
      perPerson: data.perPerson,
    }))
    .sort((a, b) => b.total - a.total);

  // Fairness analysis
  const expectedPerPerson = totalSpent / group.members.length;
  const whoSpendsMore: Array<{ member: Member; extraPaid: number; percentage: number }> = [];
  const whoSpendsLess: Array<{ member: Member; underPaid: number; percentage: number }> = [];

  perPersonSpending.forEach(person => {
    const deviation = person.totalPaid - expectedPerPerson;
    if (deviation > expectedPerPerson * 0.1) {
      // Paid more than 10% above average
      whoSpendsMore.push({
        member: person.member,
        extraPaid: deviation,
        percentage: (deviation / expectedPerPerson) * 100,
      });
    } else if (deviation < -expectedPerPerson * 0.1) {
      // Paid more than 10% below average
      whoSpendsLess.push({
        member: person.member,
        underPaid: Math.abs(deviation),
        percentage: (Math.abs(deviation) / expectedPerPerson) * 100,
      });
    }
  });

  // Calculate fairness score (0-100)
  const deviations = perPersonSpending.map(p => Math.abs(p.totalPaid - expectedPerPerson));
  const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
  const fairnessScore = Math.max(0, 100 - (avgDeviation / expectedPerPerson) * 100);

  // Generate insights
  const insights: Array<{
    type: 'spending_imbalance' | 'category_imbalance' | 'fairness' | 'trend';
    title: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
  }> = [];

  // Spending imbalance insights
  whoSpendsMore.forEach(person => {
    insights.push({
      type: 'spending_imbalance',
      title: `${person.member.name} Paid Extra`,
      message: `${person.member.name} paid ${formatCurrency(person.extraPaid, groupCurrency)} more than their fair share (${person.percentage.toFixed(1)}% above average)`,
      severity: person.percentage > 30 ? 'high' : person.percentage > 15 ? 'medium' : 'low',
    });
  });

  // Category imbalance insights
  categoryBreakdown.forEach(category => {
    const maxSpender = Object.entries(category.perPerson)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (maxSpender && category.total > 0) {
      const member = group.members.find(m => m.id === maxSpender[0]);
      const percentage = (maxSpender[1] / category.total) * 100;
      
      if (member && percentage > 60) {
        insights.push({
          type: 'category_imbalance',
          title: `${member.name} Paid Most for ${category.category}`,
          message: `${member.name} paid ${formatCurrency(maxSpender[1], groupCurrency)} (${percentage.toFixed(0)}%) of all ${category.category} expenses this month`,
          severity: percentage > 80 ? 'high' : 'medium',
        });
      }
    }
  });

  // Fairness insight
  if (fairnessScore < 70) {
    insights.push({
      type: 'fairness',
      title: 'Spending Imbalance Detected',
      message: `This month's spending is ${(100 - fairnessScore).toFixed(0)}% imbalanced. Consider redistributing expenses.`,
      severity: fairnessScore < 50 ? 'high' : 'medium',
    });
  } else if (fairnessScore >= 90) {
    insights.push({
      type: 'fairness',
      title: 'Great Balance!',
      message: 'Expenses are fairly distributed this month. Keep it up!',
      severity: 'low',
    });
  }

  // Top spender
  const topSpenderData = perPersonSpending
    .sort((a, b) => b.totalPaid - a.totalPaid)[0];

  // Settlement status
  const userBalance = balances.find(b => b.memberId === 'you');
  const isSettled = balances.every(b => Math.abs(b.balance) < 0.01);
  
  // Generate pending payments (simplified)
  const pendingPayments: Array<{ from: Member; to: Member; amount: number }> = [];
  const debtors = balances.filter(b => b.balance < -0.01);
  const creditors = balances.filter(b => b.balance > 0.01);

  debtors.forEach(debtor => {
    const debtorMember = group.members.find(m => m.id === debtor.memberId);
    if (!debtorMember) return;

    creditors.forEach(creditor => {
      const creditorMember = group.members.find(m => m.id === creditor.memberId);
      if (!creditorMember) return;

      const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      if (amount > 0.01) {
        pendingPayments.push({
          from: debtorMember,
          to: creditorMember,
          amount,
        });
      }
    });
  });

  const totalPending = balances
    .filter(b => b.balance < 0)
    .reduce((sum, b) => sum + Math.abs(b.balance), 0);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return {
    month: `${monthNames[targetMonth]} ${targetYear}`,
    year: targetYear,
    monthNumber: targetMonth,
    group,
    totalSpent,
    totalExpenses: monthExpenses.length,
    perPersonSpending,
    categoryBreakdown,
    fairnessAnalysis: {
      score: fairnessScore,
      whoSpendsMore,
      whoSpendsLess,
    },
    insights,
    topSpender: {
      member: topSpenderData.member,
      amount: topSpenderData.totalPaid,
      percentage: topSpenderData.percentageOfTotal,
    },
    settlementStatus: {
      isSettled,
      totalPending,
      pendingPayments: pendingPayments.slice(0, 5), // Top 5 pending payments
    },
  };
};

/**
 * Generate "You paid extra" insights for current user
 */
export const generateYouPaidExtraInsights = (
  report: MonthlyReport
): Array<{
  category: string;
  extraPaid: number;
  percentage: number;
  message: string;
}> => {
  const insights: Array<{
    category: string;
    extraPaid: number;
    percentage: number;
    message: string;
  }> = [];

  const userMember = report.group.members.find(m => m.id === 'you');
  if (!userMember) return insights;

  // Check category-wise spending
  report.categoryBreakdown.forEach(category => {
    const userSpent = category.perPerson['you'] || 0;
    const categoryTotal = category.total;
    const expectedShare = categoryTotal / report.group.members.length;
    
    if (userSpent > expectedShare * 1.2) {
      // User paid 20%+ more than fair share
      const extraPaid = userSpent - expectedShare;
      insights.push({
        category: category.category,
        extraPaid,
        percentage: (extraPaid / expectedShare) * 100,
        message: `You paid ${formatCurrency(extraPaid, report.group.currency || 'INR')} extra for ${category.category} this month`,
      });
    }
  });

  // Check overall spending
  const userSpending = report.perPersonSpending.find(p => p.member.id === 'you');
  if (userSpending) {
    const expectedTotal = report.totalSpent / report.group.members.length;
    if (userSpending.totalPaid > expectedTotal * 1.15) {
      insights.push({
        category: 'Overall',
        extraPaid: userSpending.totalPaid - expectedTotal,
        percentage: ((userSpending.totalPaid - expectedTotal) / expectedTotal) * 100,
        message: `You paid ${formatCurrency(userSpending.totalPaid - expectedTotal, report.group.currency || 'INR')} more than your fair share overall this month`,
      });
    }
  }

  return insights.sort((a, b) => b.extraPaid - a.extraPaid);
};
