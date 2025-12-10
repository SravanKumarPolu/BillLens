/**
 * Balance Cache Service
 * 
 * Caches group balance calculations to prevent shifting values
 * and improve performance. Balances are recalculated only when
 * expenses or settlements change.
 */

import { GroupBalance, Expense, Settlement } from '../types/models';

interface CachedBalances {
  groupId: string;
  balances: GroupBalance[];
  expenseIds: Set<string>;
  settlementIds: Set<string>;
  timestamp: number;
}

// In-memory cache (cleared on app restart)
const balanceCache = new Map<string, CachedBalances>();

/**
 * Generate cache key from expense and settlement IDs
 */
const generateCacheKey = (groupId: string, expenses: Expense[], settlements: Settlement[]): string => {
  const expenseIds = expenses.map(e => e.id).sort().join(',');
  const settlementIds = settlements.map(s => s.id).sort().join(',');
  return `${groupId}:${expenseIds}:${settlementIds}`;
};

/**
 * Check if cached balances are still valid
 */
const isCacheValid = (
  groupId: string,
  expenses: Expense[],
  settlements: Settlement[],
  cached: CachedBalances
): boolean => {
  // Check if expense IDs match
  const currentExpenseIds = new Set(expenses.map(e => e.id));
  if (currentExpenseIds.size !== cached.expenseIds.size) return false;
  for (const id of currentExpenseIds) {
    if (!cached.expenseIds.has(id)) return false;
  }

  // Check if settlement IDs match
  const currentSettlementIds = new Set(settlements.map(s => s.id));
  if (currentSettlementIds.size !== cached.settlementIds.size) return false;
  for (const id of currentSettlementIds) {
    if (!cached.settlementIds.has(id)) return false;
  }

  return true;
};

/**
 * Cache balance calculation result
 */
export const cacheBalances = (
  groupId: string,
  expenses: Expense[],
  settlements: Settlement[],
  balances: GroupBalance[]
): void => {
  const expenseIds = new Set(expenses.map(e => e.id));
  const settlementIds = new Set(settlements.map(s => s.id));

  balanceCache.set(groupId, {
    groupId,
    balances: [...balances], // Deep copy
    expenseIds,
    settlementIds,
    timestamp: Date.now(),
  });
};

/**
 * Get cached balances if valid
 */
export const getCachedBalances = (
  groupId: string,
  expenses: Expense[],
  settlements: Settlement[]
): GroupBalance[] | null => {
  const cached = balanceCache.get(groupId);
  if (!cached) return null;

  if (isCacheValid(groupId, expenses, settlements, cached)) {
    return [...cached.balances]; // Return deep copy
  }

  // Cache invalid, remove it
  balanceCache.delete(groupId);
  return null;
};

/**
 * Clear cache for a specific group
 */
export const clearBalanceCache = (groupId: string): void => {
  balanceCache.delete(groupId);
};

/**
 * Clear all balance caches
 */
export const clearAllBalanceCaches = (): void => {
  balanceCache.clear();
};

/**
 * Get cache statistics (for debugging)
 */
export const getCacheStats = () => {
  return {
    cacheSize: balanceCache.size,
    cachedGroups: Array.from(balanceCache.keys()),
    oldestCache: balanceCache.size > 0
      ? Math.min(...Array.from(balanceCache.values()).map(c => c.timestamp))
      : null,
  };
};
