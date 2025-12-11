/**
 * Dashboard Service
 * 
 * Provides combined view analytics across all groups:
 * - Total spent today/this month
 * - Who you spend the most with
 * - Biggest category
 * - Money Health Score
 * - Daily insights
 */

import { GroupSummary, Expense, Group } from '../types/models';
import { formatMoney } from './formatMoney';
import { formatCurrency } from './currencyService';

export interface DashboardStats {
  totalSpentToday: number;
  totalSpentThisMonth: number;
  totalSpentLastMonth: number;
  pendingAmount: number;
  moneyHealthScore: number; // 0-100
  biggestCategory: {
    category: string;
    amount: number;
    percentage: number;
  };
  topSpendingGroup: {
    group: Group;
    amount: number;
    percentage: number;
  };
  dailyInsights: Array<{
    type: 'spending' | 'settlement' | 'trend' | 'reminder';
    title: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  spendingTrend: {
    direction: 'increasing' | 'decreasing' | 'stable';
    percentage: number;
  };
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
    count: number;
  }>;
}

/**
 * Calculate dashboard stats across all groups
 */
export const calculateDashboardStats = (
  groupSummaries: GroupSummary[]
): DashboardStats => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // Collect all expenses
  const allExpenses: Expense[] = [];
  groupSummaries.forEach(summary => {
    allExpenses.push(...summary.expenses);
  });

  // Today's expenses
  const todayExpenses = allExpenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return expenseDate >= today;
  });
  const totalSpentToday = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

  // This month's expenses
  const thisMonthExpenses = allExpenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return (
      expenseDate.getMonth() === currentMonth &&
      expenseDate.getFullYear() === currentYear
    );
  });
  const totalSpentThisMonth = thisMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Last month's expenses
  const lastMonthExpenses = allExpenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return (
      expenseDate.getMonth() === lastMonth &&
      expenseDate.getFullYear() === lastMonthYear
    );
  });
  const totalSpentLastMonth = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Pending amount (what user owes)
  const pendingAmount = groupSummaries.reduce((total, summary) => {
    const userBalance = summary.balances.find(b => b.memberId === 'you')?.balance || 0;
    return total + (userBalance < 0 ? Math.abs(userBalance) : 0);
  }, 0);

  // Category breakdown
  const categoryMap = new Map<string, { amount: number; count: number }>();
  thisMonthExpenses.forEach(expense => {
    const category = expense.category || 'Other';
    const existing = categoryMap.get(category) || { amount: 0, count: 0 };
    categoryMap.set(category, {
      amount: existing.amount + expense.amount,
      count: existing.count + 1,
    });
  });

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      percentage: totalSpentThisMonth > 0 ? (data.amount / totalSpentThisMonth) * 100 : 0,
      count: data.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  const biggestCategory = categoryBreakdown[0] || {
    category: 'None',
    amount: 0,
    percentage: 0,
  };

  // Top spending group
  const groupSpending = groupSummaries.map(summary => ({
    group: summary.group,
    amount: thisMonthExpenses
      .filter(e => e.groupId === summary.group.id)
      .reduce((sum, e) => sum + e.amount, 0),
  }));

  const topSpendingGroupData = groupSpending
    .sort((a, b) => b.amount - a.amount)[0] || {
    group: groupSummaries[0]?.group || {} as Group,
    amount: 0,
  };

  const topSpendingGroup = {
    group: topSpendingGroupData.group,
    amount: topSpendingGroupData.amount,
    percentage: totalSpentThisMonth > 0 
      ? (topSpendingGroupData.amount / totalSpentThisMonth) * 100 
      : 0,
  };

  // Spending trend
  const trendPercentage = lastMonthExpenses.length > 0
    ? ((totalSpentThisMonth - totalSpentLastMonth) / totalSpentLastMonth) * 100
    : 0;
  
  const spendingTrend: {
    direction: 'increasing' | 'decreasing' | 'stable';
    percentage: number;
  } = {
    direction: 
      trendPercentage > 10 ? 'increasing' :
      trendPercentage < -10 ? 'decreasing' :
      'stable',
    percentage: Math.abs(trendPercentage),
  };

  // Money Health Score (0-100)
  // Factors:
  // - Low pending amounts (higher score)
  // - Balanced spending across groups (higher score)
  // - Consistent spending (higher score)
  // - Low number of unsettled balances (higher score)
  
  let healthScore = 100;
  
  // Deduct for high pending amounts
  const pendingRatio = totalSpentThisMonth > 0 ? pendingAmount / totalSpentThisMonth : 0;
  if (pendingRatio > 0.2) healthScore -= 30; // More than 20% pending
  else if (pendingRatio > 0.1) healthScore -= 15; // More than 10% pending
  else if (pendingRatio > 0.05) healthScore -= 5; // More than 5% pending

  // Deduct for imbalanced spending
  if (groupSummaries.length > 1) {
    const groupAmounts = groupSpending.map(g => g.amount);
    const avgGroupSpending = groupAmounts.reduce((sum, a) => sum + a, 0) / groupAmounts.length;
    const maxDeviation = Math.max(...groupAmounts.map(a => Math.abs(a - avgGroupSpending)));
    const deviationRatio = avgGroupSpending > 0 ? maxDeviation / avgGroupSpending : 0;
    
    if (deviationRatio > 0.5) healthScore -= 20; // Very imbalanced
    else if (deviationRatio > 0.3) healthScore -= 10; // Somewhat imbalanced
  }

  // Deduct for increasing spending trend
  if (spendingTrend.direction === 'increasing' && spendingTrend.percentage > 30) {
    healthScore -= 15;
  }

  // Deduct for many unsettled groups
  const unsettledGroups = groupSummaries.filter(summary => {
    const userBalance = summary.balances.find(b => b.memberId === 'you')?.balance || 0;
    return Math.abs(userBalance) > 100; // More than ₹100 pending
  }).length;
  
  if (unsettledGroups > 2) healthScore -= 20;
  else if (unsettledGroups > 1) healthScore -= 10;

  healthScore = Math.max(0, Math.min(100, healthScore));

  // Daily insights
  const dailyInsights: Array<{
    type: 'spending' | 'settlement' | 'trend' | 'reminder';
    title: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
  }> = [];

  // Spending insights
  if (totalSpentToday > 0) {
    dailyInsights.push({
      type: 'spending',
      title: 'Today\'s Spending',
      message: `You've spent ${formatMoney(totalSpentToday)} today`,
      severity: totalSpentToday > 2000 ? 'high' : totalSpentToday > 1000 ? 'medium' : 'low',
    });
  }

  // Settlement reminders
  if (pendingAmount > 500) {
    dailyInsights.push({
      type: 'settlement',
      title: 'Settlement Reminder',
      message: `You have ₹${Math.round(pendingAmount)} pending across ${unsettledGroups} group${unsettledGroups > 1 ? 's' : ''}`,
      severity: pendingAmount > 2000 ? 'high' : 'medium',
    });
  }

  // Trend insights
  if (spendingTrend.direction === 'increasing' && spendingTrend.percentage > 20) {
    dailyInsights.push({
      type: 'trend',
      title: 'Spending Trend',
      message: `Your spending increased by ${spendingTrend.percentage.toFixed(0)}% this month`,
      severity: spendingTrend.percentage > 50 ? 'high' : 'medium',
    });
  }

  // Category insights
  if (biggestCategory.percentage > 40) {
    dailyInsights.push({
      type: 'spending',
      title: 'Top Category',
      message: `${biggestCategory.category} accounts for ${biggestCategory.percentage.toFixed(0)}% of your spending`,
      severity: 'low',
    });
  }

  return {
    totalSpentToday,
    totalSpentThisMonth,
    totalSpentLastMonth,
    pendingAmount,
    moneyHealthScore: healthScore,
    biggestCategory,
    topSpendingGroup,
    dailyInsights,
    spendingTrend,
    categoryBreakdown,
  };
};
