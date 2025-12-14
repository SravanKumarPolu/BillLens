/**
 * Analytics Backend Service
 * Optional service to use Python backend for analytics and fairness scoring
 * Falls back to frontend implementation if backend is unavailable
 */

import { Expense, Group, GroupBalance, Settlement } from '../types/models';
import { getAnalyticsConfig } from '../config/analyticsConfig';
import { calculateFairnessScore, calculateReliabilityMeter, FairnessScore, ReliabilityMeter } from './fairnessScore';

/**
 * Get expense analytics from Python backend (optional)
 * Falls back to frontend calculation if backend is unavailable
 */
export const getExpenseAnalyticsFromBackend = async (
  expenses: Expense[],
  groupId?: string,
  startDate?: string,
  endDate?: string,
  months: number = 6
): Promise<any | null> => {
  const config = getAnalyticsConfig();
  
  if (!config.usePythonBackend || !config.pythonBackendUrl) {
    return null; // Backend not configured, use frontend
  }

  try {
    const response = await fetch(`${config.pythonBackendUrl}/analytics/expense`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expenses: expenses.map(e => ({
          id: e.id,
          date: e.date,
          amount: e.amount,
          category: e.category,
          paidBy: e.paidBy,
          splits: e.splits || [],
          merchant: e.merchant,
          title: e.title,
        })),
        group_id: groupId,
        start_date: startDate,
        end_date: endDate,
        months,
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Analytics backend failed, using frontend fallback:', error);
    return null; // Fallback to frontend
  }
};

/**
 * Get fairness score from Python backend (optional)
 * Falls back to frontend calculation if backend is unavailable
 */
export const getFairnessScoreFromBackend = async (
  expenses: Expense[],
  group: Group,
  balances: GroupBalance[]
): Promise<FairnessScore | null> => {
  const config = getAnalyticsConfig();
  
  if (!config.usePythonBackend || !config.pythonBackendUrl) {
    return null; // Backend not configured, use frontend
  }

  try {
    const response = await fetch(`${config.pythonBackendUrl}/analytics/fairness`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expenses: expenses.map(e => ({
          id: e.id,
          date: e.date,
          amount: e.amount,
          category: e.category,
          paidBy: e.paidBy,
          splits: e.splits || [],
          merchant: e.merchant,
          title: e.title,
        })),
        members: group.members.map(m => ({
          id: m.id,
          name: m.name,
        })),
        balances: balances.map(b => ({
          memberId: b.memberId,
          balance: b.balance,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const result = await response.json();
    return result as FairnessScore;
  } catch (error) {
    console.warn('Fairness score backend failed, using frontend fallback:', error);
    return null; // Fallback to frontend
  }
};

/**
 * Get reliability meter from Python backend (optional)
 * Falls back to frontend calculation if backend is unavailable
 */
export const getReliabilityMeterFromBackend = async (
  expenses: Expense[],
  settlements: Settlement[]
): Promise<ReliabilityMeter | null> => {
  const config = getAnalyticsConfig();
  
  if (!config.usePythonBackend || !config.pythonBackendUrl) {
    return null; // Backend not configured, use frontend
  }

  try {
    const response = await fetch(`${config.pythonBackendUrl}/analytics/reliability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expenses: expenses.map(e => ({
          id: e.id,
          date: e.date,
          amount: e.amount,
          category: e.category,
          paidBy: e.paidBy,
          splits: e.splits || [],
          merchant: e.merchant,
          title: e.title,
        })),
        settlements: settlements.map(s => ({
          id: s.id,
          status: s.status,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const result = await response.json();
    return result as ReliabilityMeter;
  } catch (error) {
    console.warn('Reliability meter backend failed, using frontend fallback:', error);
    return null; // Fallback to frontend
  }
};

/**
 * Hybrid function: Try backend first, fallback to frontend
 */
export const getFairnessScoreHybrid = async (
  expenses: Expense[],
  group: Group,
  balances: GroupBalance[]
): Promise<FairnessScore> => {
  const backendResult = await getFairnessScoreFromBackend(expenses, group, balances);
  if (backendResult) {
    return backendResult;
  }
  // Fallback to existing frontend implementation
  return calculateFairnessScore(expenses, group, balances);
};

/**
 * Hybrid function: Try backend first, fallback to frontend
 */
export const getReliabilityMeterHybrid = async (
  expenses: Expense[],
  settlements: Settlement[]
): Promise<ReliabilityMeter> => {
  const backendResult = await getReliabilityMeterFromBackend(expenses, settlements);
  if (backendResult) {
    return backendResult;
  }
  // Fallback to existing frontend implementation
  return calculateReliabilityMeter(expenses, settlements);
};
