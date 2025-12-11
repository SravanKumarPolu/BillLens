/**
 * Personal Expense Service
 * 
 * Tracks personal expenses separately from group expenses
 * Allows users to track individual spending alongside shared expenses
 */

import { Expense } from '../types/models';

const PERSONAL_GROUP_ID = 'personal';

/**
 * Check if expense is personal
 */
export const isPersonalExpense = (expense: Expense): boolean => {
  return expense.groupId === PERSONAL_GROUP_ID || expense.isPersonal === true;
};

/**
 * Filter personal expenses
 */
export const getPersonalExpenses = (expenses: Expense[]): Expense[] => {
  return expenses.filter(isPersonalExpense);
};

/**
 * Filter group expenses (exclude personal)
 */
export const getGroupExpenses = (expenses: Expense[]): Expense[] => {
  return expenses.filter(e => !isPersonalExpense(e));
};

/**
 * Get blended insights (personal + group)
 */
export interface BlendedInsights {
  totalPersonalSpending: number;
  totalGroupSpending: number;
  totalSpending: number;
  personalByCategory: Record<string, number>;
  groupByCategory: Record<string, number>;
  blendedByCategory: Record<string, number>;
  monthlyTrend: Array<{
    month: string;
    personal: number;
    group: number;
    total: number;
  }>;
}

export const calculateBlendedInsights = (
  allExpenses: Expense[],
  currency: string = 'INR'
): BlendedInsights => {
  const personal = getPersonalExpenses(allExpenses);
  const group = getGroupExpenses(allExpenses);

  const totalPersonal = personal.reduce((sum, e) => sum + e.amount, 0);
  const totalGroup = group.reduce((sum, e) => sum + e.amount, 0);
  const total = totalPersonal + totalGroup;

  // Category breakdown
  const personalByCategory: Record<string, number> = {};
  const groupByCategory: Record<string, number> = {};
  const blendedByCategory: Record<string, number> = {};

  personal.forEach(e => {
    const cat = e.category || 'Other';
    personalByCategory[cat] = (personalByCategory[cat] || 0) + e.amount;
    blendedByCategory[cat] = (blendedByCategory[cat] || 0) + e.amount;
  });

  group.forEach(e => {
    const cat = e.category || 'Other';
    groupByCategory[cat] = (groupByCategory[cat] || 0) + e.amount;
    blendedByCategory[cat] = (blendedByCategory[cat] || 0) + e.amount;
  });

  // Monthly trend
  const monthlyMap = new Map<string, { personal: number; group: number }>();

  [...personal, ...group].forEach(e => {
    const date = new Date(e.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthData = monthlyMap.get(monthKey) || { personal: 0, group: 0 };

    if (isPersonalExpense(e)) {
      monthData.personal += e.amount;
    } else {
      monthData.group += e.amount;
    }

    monthlyMap.set(monthKey, monthData);
  });

  const monthlyTrend = Array.from(monthlyMap.entries())
    .map(([month, data]) => ({
      month,
      personal: data.personal,
      group: data.group,
      total: data.personal + data.group,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalPersonalSpending: totalPersonal,
    totalGroupSpending: totalGroup,
    totalSpending: total,
    personalByCategory,
    groupByCategory,
    blendedByCategory,
    monthlyTrend,
  };
};
