/**
 * Fairness Score and Reliability Meter
 * 
 * Calculates how fair expense splitting is in a group
 * and provides a reliability score based on data quality
 */

import { Expense, Group, GroupBalance, Settlement } from '../types/models';

export interface FairnessScore {
  score: number; // 0-100, higher is more fair
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'unfair';
  factors: {
    paymentDistribution: number; // 0-100
    splitEquality: number; // 0-100
    balanceDistribution: number; // 0-100
  };
  issues: string[];
  recommendations: string[];
}

export interface ReliabilityMeter {
  score: number; // 0-100, higher is more reliable
  level: 'high' | 'medium' | 'low';
  factors: {
    dataCompleteness: number; // 0-100
    splitAccuracy: number; // 0-100
    settlementCompleteness: number; // 0-100
  };
  warnings: string[];
}

/**
 * Calculate fairness score for a group
 */
export const calculateFairnessScore = (
  expenses: Expense[],
  group: Group,
  balances: GroupBalance[]
): FairnessScore => {
  if (expenses.length === 0) {
    return {
      score: 100,
      level: 'excellent',
      factors: {
        paymentDistribution: 100,
        splitEquality: 100,
        balanceDistribution: 100,
      },
      issues: [],
      recommendations: ['Add expenses to calculate fairness score'],
    };
  }

  const memberCount = group.members.length;
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expectedShare = totalExpenses / memberCount;

  // Factor 1: Payment Distribution (how evenly people pay)
  const paymentTotals = new Map<string, number>();
  expenses.forEach(e => {
    paymentTotals.set(e.paidBy, (paymentTotals.get(e.paidBy) || 0) + e.amount);
  });

  let paymentDistributionScore = 100;
  const paymentDeviations: number[] = [];
  
  group.members.forEach(member => {
    const paid = paymentTotals.get(member.id) || 0;
    const deviation = Math.abs(paid - expectedShare) / expectedShare;
    paymentDeviations.push(deviation);
  });

  const avgDeviation = paymentDeviations.reduce((a, b) => a + b, 0) / paymentDeviations.length;
  paymentDistributionScore = Math.max(0, 100 - (avgDeviation * 100));

  // Factor 2: Split Equality (how equal splits are)
  let splitEqualityScore = 100;
  const splitInequalities: number[] = [];

  expenses.forEach(expense => {
    if (!expense.splits || expense.splits.length < 2) return;
    
    const splitAmounts = expense.splits.map(s => s.amount);
    const avgSplit = splitAmounts.reduce((a, b) => a + b, 0) / splitAmounts.length;
    const maxDeviation = Math.max(...splitAmounts.map(a => Math.abs(a - avgSplit)));
    const deviationRatio = avgSplit > 0 ? maxDeviation / avgSplit : 0;
    
    if (deviationRatio > 0.1) { // More than 10% deviation
      splitInequalities.push(deviationRatio);
    }
  });

  if (splitInequalities.length > 0) {
    const avgInequality = splitInequalities.reduce((a, b) => a + b, 0) / splitInequalities.length;
    splitEqualityScore = Math.max(0, 100 - (avgInequality * 200));
  }

  // Factor 3: Balance Distribution (how balanced final balances are)
  let balanceDistributionScore = 100;
  const balanceDeviations: number[] = [];

  balances.forEach(balance => {
    const deviation = Math.abs(balance.balance) / (totalExpenses / memberCount);
    balanceDeviations.push(deviation);
  });

  const avgBalanceDeviation = balanceDeviations.reduce((a, b) => a + b, 0) / balanceDeviations.length;
  balanceDistributionScore = Math.max(0, 100 - (avgBalanceDeviation * 50));

  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    (paymentDistributionScore * 0.4) +
    (splitEqualityScore * 0.3) +
    (balanceDistributionScore * 0.3)
  );

  // Determine level
  let level: FairnessScore['level'] = 'excellent';
  if (overallScore < 50) level = 'unfair';
  else if (overallScore < 70) level = 'poor';
  else if (overallScore < 85) level = 'fair';
  else if (overallScore < 95) level = 'good';
  else level = 'excellent';

  // Identify issues
  const issues: string[] = [];
  if (paymentDistributionScore < 70) {
    issues.push('Uneven payment distribution - some people pay more than others');
  }
  if (splitEqualityScore < 70) {
    issues.push('Many unequal splits - consider using equal splits more often');
  }
  if (balanceDistributionScore < 70) {
    issues.push('Unbalanced final balances - consider settling up');
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (paymentDistributionScore < 80) {
    recommendations.push('Try to distribute expenses more evenly among group members');
  }
  if (splitEqualityScore < 80) {
    recommendations.push('Use equal splits when possible for fairness');
  }
  if (balanceDistributionScore < 80) {
    recommendations.push('Settle outstanding balances to maintain fairness');
  }
  if (issues.length === 0) {
    recommendations.push('Great job! Your group maintains fair expense splitting');
  }

  return {
    score: overallScore,
    level,
    factors: {
      paymentDistribution: Math.round(paymentDistributionScore),
      splitEquality: Math.round(splitEqualityScore),
      balanceDistribution: Math.round(balanceDistributionScore),
    },
    issues,
    recommendations,
  };
};

/**
 * Calculate reliability meter for data quality
 */
export const calculateReliabilityMeter = (
  expenses: Expense[],
  settlements: Settlement[]
): ReliabilityMeter => {
  if (expenses.length === 0) {
    return {
      score: 0,
      level: 'low',
      factors: {
        dataCompleteness: 0,
        splitAccuracy: 0,
        settlementCompleteness: 0,
      },
      warnings: ['No expenses recorded yet'],
    };
  }

  // Factor 1: Data Completeness
  let completeExpenses = 0;
  expenses.forEach(expense => {
    if (
      expense.merchant &&
      expense.amount > 0 &&
      expense.splits &&
      expense.splits.length > 0
    ) {
      completeExpenses++;
    }
  });
  const dataCompleteness = (completeExpenses / expenses.length) * 100;

  // Factor 2: Split Accuracy (splits sum to total)
  let accurateSplits = 0;
  expenses.forEach(expense => {
    if (expense.splits && expense.splits.length > 0) {
      const splitTotal = expense.splits.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(splitTotal - expense.amount) < 0.01) {
        accurateSplits++;
      }
    }
  });
  const splitAccuracy = expenses.length > 0
    ? (accurateSplits / expenses.length) * 100
    : 100;

  // Factor 3: Settlement Completeness
  const completedSettlements = settlements.filter(s => s.status === 'completed').length;
  const settlementCompleteness = settlements.length > 0
    ? (completedSettlements / settlements.length) * 100
    : 100;

  // Calculate overall score
  const overallScore = Math.round(
    (dataCompleteness * 0.4) +
    (splitAccuracy * 0.4) +
    (settlementCompleteness * 0.2)
  );

  // Determine level
  let level: ReliabilityMeter['level'] = 'high';
  if (overallScore < 70) level = 'low';
  else if (overallScore < 85) level = 'medium';
  else level = 'high';

  // Generate warnings
  const warnings: string[] = [];
  if (dataCompleteness < 90) {
    warnings.push('Some expenses are missing merchant names or splits');
  }
  if (splitAccuracy < 95) {
    warnings.push('Some expense splits do not match the total amount');
  }
  if (settlementCompleteness < 100 && settlements.length > 0) {
    warnings.push('Some settlements are marked as pending');
  }
  if (warnings.length === 0) {
    warnings.push('All data looks accurate and complete');
  }

  return {
    score: overallScore,
    level,
    factors: {
      dataCompleteness: Math.round(dataCompleteness),
      splitAccuracy: Math.round(splitAccuracy),
      settlementCompleteness: Math.round(settlementCompleteness),
    },
    warnings,
  };
};
