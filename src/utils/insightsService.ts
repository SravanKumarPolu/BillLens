/**
 * BillLens Insights Service
 * 
 * Provides AI-powered insights, unfairness detection, mistake prevention,
 * and settlement optimization for expense splitting.
 * 
 * Features:
 * - Detects unfair expense patterns
 * - Prevents common mistakes
 * - Provides smart suggestions
 * - Optimizes settlement transactions
 */

import { Expense, Group, GroupBalance, Settlement, Member } from '../types/models';

// ============================================================================
// Types
// ============================================================================

export interface Insight {
  id: string;
  type: 'unfairness' | 'mistake' | 'suggestion' | 'warning' | 'info';
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  actionable: boolean;
  actionLabel?: string;
  actionData?: any;
}

export interface UnfairnessPattern {
  memberId: string;
  memberName: string;
  issue: 'pays_more' | 'pays_less' | 'unequal_splits' | 'always_pays';
  severity: 'high' | 'medium' | 'low';
  evidence: {
    description: string;
    amount: number;
    percentage: number;
    count: number;
  };
}

export interface MistakeDetection {
  expenseId: string;
  type: 'duplicate' | 'amount_mismatch' | 'split_mismatch' | 'date_anomaly' | 'category_mismatch';
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestedFix?: {
    field: string;
    oldValue: any;
    newValue: any;
  };
}

export interface SpendingPattern {
  memberId: string;
  memberName: string;
  pattern: 'consistent' | 'sporadic' | 'increasing' | 'decreasing';
  averagePerMonth: number;
  trend: number; // Percentage change
  categoryBreakdown: Record<string, number>;
}

export interface SettlementOptimization {
  originalCount: number;
  optimizedCount: number;
  savings: number; // Number of transactions saved
  optimizedPayments: Array<{
    fromMemberId: string;
    toMemberId: string;
    amount: number;
  }>;
}

// ============================================================================
// Unfairness Detection
// ============================================================================

/**
 * Detects unfair patterns in expense splitting
 */
export const detectUnfairness = (
  expenses: Expense[],
  group: Group,
  balances: GroupBalance[]
): UnfairnessPattern[] => {
  const patterns: UnfairnessPattern[] = [];
  
  if (expenses.length === 0) return patterns;

  // Calculate who pays how much
  const memberPayments = new Map<string, { total: number; count: number }>();
  const memberOwed = new Map<string, { total: number; count: number }>();
  
  expenses.forEach(expense => {
    // Track who paid
    const paidBy = expense.paidBy;
    const current = memberPayments.get(paidBy) || { total: 0, count: 0 };
    memberPayments.set(paidBy, {
      total: current.total + expense.amount,
      count: current.count + 1,
    });

    // Track who owes
    expense.splits?.forEach(split => {
      const current = memberOwed.get(split.memberId) || { total: 0, count: 0 };
      memberOwed.set(split.memberId, {
        total: current.total + split.amount,
        count: current.count + 1,
      });
    });
  });

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const memberCount = group.members.length;

  // Check for members who always pay
  memberPayments.forEach((data, memberId) => {
    const member = group.members.find(m => m.id === memberId);
    if (!member) return;

    const paymentPercentage = (data.total / totalExpenses) * 100;
    const expectedPercentage = 100 / memberCount;

    // If someone pays more than 70% of expenses (high threshold)
    if (paymentPercentage > 70 && expenses.length >= 3) {
      patterns.push({
        memberId,
        memberName: member.name,
        issue: 'always_pays',
        severity: 'high',
        evidence: {
          description: `${member.name} has paid ${paymentPercentage.toFixed(1)}% of all expenses`,
          amount: data.total,
          percentage: paymentPercentage,
          count: data.count,
        },
      });
    }

    // If someone pays significantly more than their fair share
    if (paymentPercentage > expectedPercentage * 1.5 && expenses.length >= 5) {
      patterns.push({
        memberId,
        memberName: member.name,
        issue: 'pays_more',
        severity: paymentPercentage > expectedPercentage * 2 ? 'high' : 'medium',
        evidence: {
          description: `${member.name} pays ${paymentPercentage.toFixed(1)}% but should pay ${expectedPercentage.toFixed(1)}%`,
          amount: data.total - (totalExpenses * expectedPercentage / 100),
          percentage: paymentPercentage - expectedPercentage,
          count: data.count,
        },
      });
    }
  });

  // Check for members who pay less
  group.members.forEach(member => {
    const paid = memberPayments.get(member.id)?.total || 0;
    const owed = memberOwed.get(member.id)?.total || 0;
    const net = paid - owed;
    const expectedNet = totalExpenses / memberCount - (totalExpenses / memberCount);

    // If someone consistently pays less than they owe
    if (net < -expectedNet * 0.3 && expenses.length >= 5) {
      patterns.push({
        memberId: member.id,
        memberName: member.name,
        issue: 'pays_less',
        severity: net < -expectedNet * 0.5 ? 'high' : 'medium',
        evidence: {
          description: `${member.name} has a net balance of ₹${Math.abs(net).toFixed(2)} (owes more than pays)`,
          amount: Math.abs(net),
          percentage: (Math.abs(net) / totalExpenses) * 100,
          count: memberOwed.get(member.id)?.count || 0,
        },
      });
    }
  });

  // Check for unequal splits in recent expenses
  const recentExpenses = expenses
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  recentExpenses.forEach(expense => {
    if (!expense.splits || expense.splits.length < 2) return;

    const splitAmounts = expense.splits.map(s => s.amount);
    const avgSplit = splitAmounts.reduce((a, b) => a + b, 0) / splitAmounts.length;
    const maxDeviation = Math.max(...splitAmounts.map(a => Math.abs(a - avgSplit)));

    // If splits deviate more than 30% from average
    if (maxDeviation > avgSplit * 0.3 && avgSplit > 0) {
      const unfairMember = expense.splits.find(s => Math.abs(s.amount - avgSplit) === maxDeviation);
      if (unfairMember) {
        const member = group.members.find(m => m.id === unfairMember.memberId);
        if (member) {
          // Only add if not already detected for this member
          const existing = patterns.find(p => p.memberId === member.id && p.issue === 'unequal_splits');
          if (!existing) {
            patterns.push({
              memberId: member.id,
              memberName: member.name,
              issue: 'unequal_splits',
              severity: maxDeviation > avgSplit * 0.5 ? 'high' : 'medium',
              evidence: {
                description: `Recent expenses have unequal splits involving ${member.name}`,
                amount: maxDeviation,
                percentage: (maxDeviation / avgSplit) * 100,
                count: 1,
              },
            });
          }
        }
      }
    }
  });

  return patterns;
};

// ============================================================================
// Mistake Detection
// ============================================================================

/**
 * Detects common mistakes in expenses
 */
export const detectMistakes = (
  expenses: Expense[],
  group: Group
): MistakeDetection[] => {
  const mistakes: MistakeDetection[] = [];

  // Check for duplicate expenses (same amount, same merchant, within 24 hours)
  const expenseMap = new Map<string, Expense[]>();
  expenses.forEach(expense => {
    const key = `${expense.merchant || expense.title}-${expense.amount}`;
    if (!expenseMap.has(key)) {
      expenseMap.set(key, []);
    }
    expenseMap.get(key)!.push(expense);
  });

  expenseMap.forEach((similarExpenses, key) => {
    if (similarExpenses.length >= 2) {
      // Check if they're within 24 hours
      similarExpenses.forEach((expense, index) => {
        for (let i = index + 1; i < similarExpenses.length; i++) {
          const other = similarExpenses[i];
          const timeDiff = Math.abs(
            new Date(expense.date).getTime() - new Date(other.date).getTime()
          );
          const hoursDiff = timeDiff / (1000 * 60 * 60);

          if (hoursDiff < 24) {
            mistakes.push({
              expenseId: expense.id,
              type: 'duplicate',
              severity: 'high',
              description: `Possible duplicate: Same amount (₹${expense.amount}) and merchant (${expense.merchant || expense.title}) within ${hoursDiff.toFixed(1)} hours`,
            });
          }
        }
      });
    }
  });

  // Check for split mismatches (splits don't add up to total)
  expenses.forEach(expense => {
    if (!expense.splits || expense.splits.length === 0) {
      mistakes.push({
        expenseId: expense.id,
        type: 'split_mismatch',
        severity: 'high',
        description: `Expense has no splits defined`,
      });
      return;
    }

    const splitTotal = expense.splits.reduce((sum, split) => sum + split.amount, 0);
    const difference = Math.abs(splitTotal - expense.amount);

    if (difference > 0.01) {
      mistakes.push({
        expenseId: expense.id,
        type: 'split_mismatch',
        severity: 'high',
        description: `Split total (₹${splitTotal.toFixed(2)}) doesn't match expense amount (₹${expense.amount.toFixed(2)})`,
        suggestedFix: {
          field: 'splits',
          oldValue: splitTotal,
          newValue: expense.amount,
        },
      });
    }
  });

  // Check for date anomalies (expenses in the future or very old)
  const now = new Date();
  expenses.forEach(expense => {
    const expenseDate = new Date(expense.date);
    const daysDiff = (now.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24);

    if (expenseDate > now) {
      mistakes.push({
        expenseId: expense.id,
        type: 'date_anomaly',
        severity: 'medium',
        description: `Expense date is in the future: ${expenseDate.toLocaleDateString()}`,
        suggestedFix: {
          field: 'date',
          oldValue: expense.date,
          newValue: now.toISOString(),
        },
      });
    } else if (daysDiff > 365) {
      mistakes.push({
        expenseId: expense.id,
        type: 'date_anomaly',
        severity: 'low',
        description: `Expense is very old: ${Math.floor(daysDiff)} days ago`,
      });
    }
  });

  // Check for category mismatches (merchant name suggests different category)
  const categoryKeywords: Record<string, string[]> = {
    Food: ['swiggy', 'zomato', 'restaurant', 'food', 'cafe'],
    Groceries: ['blinkit', 'bigbasket', 'zepto', 'grocery', 'supermarket'],
    Utilities: ['electric', 'power', 'eb', 'utility', 'bill'],
    Rent: ['rent', 'house', 'apartment'],
    WiFi: ['wifi', 'internet', 'broadband', 'isp'],
    Maid: ['maid', 'help', 'cleaning'],
    OTT: ['netflix', 'prime', 'disney', 'hotstar', 'ott'],
  };

  expenses.forEach(expense => {
    const merchantLower = (expense.merchant || expense.title || '').toLowerCase();
    const currentCategory = expense.category;

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (category === currentCategory) continue;

      const matches = keywords.some(keyword => merchantLower.includes(keyword));
      if (matches) {
        mistakes.push({
          expenseId: expense.id,
          type: 'category_mismatch',
          severity: 'low',
          description: `Merchant "${expense.merchant || expense.title}" suggests category "${category}" but is set to "${currentCategory}"`,
          suggestedFix: {
            field: 'category',
            oldValue: currentCategory,
            newValue: category,
          },
        });
        break;
      }
    }
  });

  return mistakes;
};

// ============================================================================
// Spending Pattern Analysis
// ============================================================================

/**
 * Analyzes spending patterns for each member
 */
export const analyzeSpendingPatterns = (
  expenses: Expense[],
  group: Group
): SpendingPattern[] => {
  const patterns: SpendingPattern[] = [];

  group.members.forEach(member => {
    const memberExpenses = expenses.filter(e => e.paidBy === member.id);
    
    if (memberExpenses.length === 0) {
      patterns.push({
        memberId: member.id,
        memberName: member.name,
        pattern: 'sporadic',
        averagePerMonth: 0,
        trend: 0,
        categoryBreakdown: {},
      });
      return;
    }

    // Calculate monthly averages
    const monthlyTotals = new Map<string, number>();
    memberExpenses.forEach(expense => {
      const date = new Date(expense.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + expense.amount);
    });

    const monthlyValues = Array.from(monthlyTotals.values());
    const averagePerMonth = monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length || 0;

    // Calculate trend (comparing last 2 months to previous 2 months)
    const sortedMonths = Array.from(monthlyTotals.entries()).sort();
    let trend = 0;
    if (sortedMonths.length >= 4) {
      const recent = sortedMonths.slice(-2).reduce((sum, [, val]) => sum + val, 0);
      const previous = sortedMonths.slice(-4, -2).reduce((sum, [, val]) => sum + val, 0);
      if (previous > 0) {
        trend = ((recent - previous) / previous) * 100;
      }
    }

    // Determine pattern
    let pattern: 'consistent' | 'sporadic' | 'increasing' | 'decreasing' = 'consistent';
    if (monthlyValues.length >= 3) {
      const variance = monthlyValues.reduce((sum, val) => {
        const diff = val - averagePerMonth;
        return sum + diff * diff;
      }, 0) / monthlyValues.length;
      const stdDev = Math.sqrt(variance);
      const coefficient = averagePerMonth > 0 ? stdDev / averagePerMonth : 0;

      if (coefficient > 0.5) {
        pattern = 'sporadic';
      } else if (trend > 20) {
        pattern = 'increasing';
      } else if (trend < -20) {
        pattern = 'decreasing';
      }
    } else {
      pattern = 'sporadic';
    }

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    memberExpenses.forEach(expense => {
      const category = expense.category || 'Other';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + expense.amount;
    });

    patterns.push({
      memberId: member.id,
      memberName: member.name,
      pattern,
      averagePerMonth,
      trend,
      categoryBreakdown,
    });
  });

  return patterns;
};

// ============================================================================
// Settlement Optimization
// ============================================================================

/**
 * Optimizes settlements to minimize number of transactions
 * Uses a simple graph-based approach to find minimum transactions
 */
export const optimizeSettlements = (
  balances: GroupBalance[],
  group: Group
): SettlementOptimization => {
  // Filter out zero balances
  const nonZeroBalances = balances.filter(b => Math.abs(b.balance) > 0.01);
  
  if (nonZeroBalances.length === 0) {
    return {
      originalCount: 0,
      optimizedCount: 0,
      savings: 0,
      optimizedPayments: [],
    };
  }

  // Separate debtors (negative balance) and creditors (positive balance)
  const debtors = nonZeroBalances
    .filter(b => b.balance < 0)
    .map(b => ({ ...b, balance: Math.abs(b.balance) }))
    .sort((a, b) => b.balance - a.balance);

  const creditors = nonZeroBalances
    .filter(b => b.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // Original count (naive: each debtor pays each creditor)
  const originalCount = debtors.length * creditors.length;

  // Optimized: Greedy algorithm to minimize transactions
  const optimizedPayments: Array<{
    fromMemberId: string;
    toMemberId: string;
    amount: number;
  }> = [];

  const remainingDebtors = [...debtors];
  const remainingCreditors = [...creditors];

  while (remainingDebtors.length > 0 && remainingCreditors.length > 0) {
    const debtor = remainingDebtors[0];
    const creditor = remainingCreditors[0];

    const paymentAmount = Math.min(debtor.balance, creditor.balance);

    optimizedPayments.push({
      fromMemberId: debtor.memberId,
      toMemberId: creditor.memberId,
      amount: paymentAmount,
    });

    // Update balances
    debtor.balance -= paymentAmount;
    creditor.balance -= paymentAmount;

    // Remove if settled
    if (debtor.balance < 0.01) {
      remainingDebtors.shift();
    }
    if (creditor.balance < 0.01) {
      remainingCreditors.shift();
    }
  }

  return {
    originalCount,
    optimizedCount: optimizedPayments.length,
    savings: originalCount - optimizedPayments.length,
    optimizedPayments,
  };
};

// ============================================================================
// Main Insights Generator
// ============================================================================

/**
 * Generates comprehensive insights for a group
 */
export const generateInsights = (
  expenses: Expense[],
  group: Group,
  balances: GroupBalance[],
  settlements: Settlement[]
): Insight[] => {
  const insights: Insight[] = [];

  // Unfairness detection
  const unfairnessPatterns = detectUnfairness(expenses, group, balances);
  unfairnessPatterns.forEach(pattern => {
    let message = '';
    switch (pattern.issue) {
      case 'always_pays':
        message = `${pattern.memberName} has paid ${pattern.evidence.percentage.toFixed(1)}% of all expenses (₹${pattern.evidence.amount.toFixed(2)}). Consider asking others to pay more.`;
        break;
      case 'pays_more':
        message = `${pattern.memberName} pays ${pattern.evidence.percentage.toFixed(1)}% more than their fair share. They've paid ₹${pattern.evidence.amount.toFixed(2)} extra.`;
        break;
      case 'pays_less':
        message = `${pattern.memberName} has a negative balance of ₹${pattern.evidence.amount.toFixed(2)}. They should settle up soon.`;
        break;
      case 'unequal_splits':
        message = `Recent expenses have unequal splits. ${pattern.memberName} may be paying more or less than others.`;
        break;
    }

    insights.push({
      id: `unfair-${pattern.memberId}-${pattern.issue}`,
      type: 'unfairness',
      severity: pattern.severity,
      title: 'Unfair Split Detected',
      message,
      actionable: true,
      actionLabel: 'View Details',
      actionData: { pattern },
    });
  });

  // Mistake detection
  const mistakes = detectMistakes(expenses, group);
  mistakes.forEach(mistake => {
    let title = '';
    switch (mistake.type) {
      case 'duplicate':
        title = 'Possible Duplicate Expense';
        break;
      case 'split_mismatch':
        title = 'Split Mismatch';
        break;
      case 'date_anomaly':
        title = 'Date Issue';
        break;
      case 'category_mismatch':
        title = 'Category Suggestion';
        break;
      default:
        title = 'Potential Mistake';
    }

    insights.push({
      id: `mistake-${mistake.expenseId}-${mistake.type}`,
      type: 'mistake',
      severity: mistake.severity,
      title,
      message: mistake.description,
      actionable: !!mistake.suggestedFix,
      actionLabel: mistake.suggestedFix ? 'Fix It' : undefined,
      actionData: { mistake },
    });
  });

  // Spending pattern insights
  const patterns = analyzeSpendingPatterns(expenses, group);
  patterns.forEach(pattern => {
    if (pattern.pattern === 'increasing' && pattern.trend > 30) {
      insights.push({
        id: `pattern-${pattern.memberId}-increasing`,
        type: 'suggestion',
        severity: 'low',
        title: 'Spending Trend',
        message: `${pattern.memberName}'s spending has increased by ${pattern.trend.toFixed(0)}% recently.`,
        actionable: false,
      });
    }

    if (pattern.pattern === 'sporadic' && pattern.averagePerMonth > 0) {
      insights.push({
        id: `pattern-${pattern.memberId}-sporadic`,
        type: 'info',
        severity: 'low',
        title: 'Spending Pattern',
        message: `${pattern.memberName}'s spending is irregular. Consider setting up recurring expense templates.`,
        actionable: true,
        actionLabel: 'Create Template',
      });
    }
  });

  // Settlement optimization
  const optimization = optimizeSettlements(balances, group);
  if (optimization.savings > 0) {
    insights.push({
      id: 'settlement-optimization',
      type: 'suggestion',
      severity: 'medium',
      title: 'Optimize Settlements',
      message: `You can reduce ${optimization.savings} settlement transaction${optimization.savings > 1 ? 's' : ''} by using optimized payments.`,
      actionable: true,
      actionLabel: 'View Optimized',
      actionData: { optimization },
    });
  }

  // General insights
  if (expenses.length === 0) {
    insights.push({
      id: 'no-expenses',
      type: 'info',
      severity: 'low',
      title: 'Get Started',
      message: 'Add your first expense to start tracking and splitting bills!',
      actionable: true,
      actionLabel: 'Add Expense',
    });
  } else if (expenses.length >= 10 && unfairnessPatterns.length === 0) {
    insights.push({
      id: 'fair-splitting',
      type: 'info',
      severity: 'low',
      title: 'Great Balance!',
      message: 'Your group has fair expense splitting. Keep it up!',
      actionable: false,
    });
  }

  return insights.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
};
