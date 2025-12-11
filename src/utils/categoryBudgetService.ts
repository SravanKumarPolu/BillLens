/**
 * Category Budget Service
 * 
 * Tracks spending limits per category and alerts when exceeded
 */

import { Expense, CategoryBudget } from '../types/models';

/**
 * Check if category budget is exceeded
 */
export interface BudgetStatus {
  category: string;
  budget: CategoryBudget | null;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isExceeded: boolean;
  isWarning: boolean; // 80% threshold
}

export const checkBudgetStatus = (
  category: string,
  expenses: Expense[],
  budgets: CategoryBudget[],
  month?: number,
  year?: number
): BudgetStatus => {
  const now = new Date();
  const targetMonth = month ?? now.getMonth();
  const targetYear = year ?? now.getFullYear();

  // Find budget for this category
  const budget = budgets.find(b => b.category === category) || null;

  // Calculate spending for this month
  const monthExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.date);
    return (
      expenseDate.getMonth() === targetMonth &&
      expenseDate.getFullYear() === targetYear &&
      (e.category || 'Other') === category
    );
  });

  const spent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const limit = budget?.monthlyLimit || 0;
  const remaining = limit - spent;
  const percentageUsed = limit > 0 ? (spent / limit) * 100 : 0;
  const isExceeded = spent > limit;
  const isWarning = percentageUsed >= 80 && !isExceeded;

  return {
    category,
    budget,
    spent,
    remaining,
    percentageUsed,
    isExceeded,
    isWarning,
  };
};

/**
 * Get all budget statuses
 */
export const getAllBudgetStatuses = (
  expenses: Expense[],
  budgets: CategoryBudget[],
  month?: number,
  year?: number
): BudgetStatus[] => {
  const categories = new Set<string>();
  expenses.forEach(e => categories.add(e.category || 'Other'));
  budgets.forEach(b => categories.add(b.category));

  return Array.from(categories).map(category =>
    checkBudgetStatus(category, expenses, budgets, month, year)
  );
};

/**
 * Get budget alerts (exceeded or warning)
 */
export const getBudgetAlerts = (
  expenses: Expense[],
  budgets: CategoryBudget[],
  month?: number,
  year?: number
): BudgetStatus[] => {
  const statuses = getAllBudgetStatuses(expenses, budgets, month, year);
  return statuses.filter(s => s.isExceeded || s.isWarning);
};
