/**
 * Collection Service
 * 
 * Manages group collections - combining multiple related bills
 */

import { GroupCollection, Expense } from '../types/models';

/**
 * Get all collections for a group
 */
export const getCollectionsForGroup = (
  collections: GroupCollection[],
  groupId: string
): GroupCollection[] => {
  return collections.filter(c => c.groupId === groupId);
};

/**
 * Get collection by ID
 */
export const getCollection = (
  collections: GroupCollection[],
  collectionId: string
): GroupCollection | undefined => {
  return collections.find(c => c.id === collectionId);
};

/**
 * Get expenses in a collection
 */
export const getExpensesInCollection = (
  expenses: Expense[],
  collectionId: string
): Expense[] => {
  return expenses.filter(e => e.collectionId === collectionId);
};

/**
 * Calculate collection total
 */
export const getCollectionTotal = (
  expenses: Expense[],
  collectionId: string
): number => {
  const collectionExpenses = getExpensesInCollection(expenses, collectionId);
  return collectionExpenses.reduce((sum, e) => sum + e.amount, 0);
};

/**
 * Get collection summary
 */
export interface CollectionSummary {
  collection: GroupCollection;
  expenseCount: number;
  totalAmount: number;
  currency: string;
  expenses: Expense[];
  dateRange: {
    start: string;
    end: string;
  } | null;
}

export const getCollectionSummary = (
  collection: GroupCollection,
  expenses: Expense[]
): CollectionSummary => {
  const collectionExpenses = expenses.filter(e => 
    collection.expenseIds.includes(e.id)
  );

  const totalAmount = collectionExpenses.reduce((sum, e) => sum + e.amount, 0);
  const currency = collectionExpenses[0]?.currency || 'INR';

  // Calculate date range
  let dateRange: { start: string; end: string } | null = null;
  if (collectionExpenses.length > 0) {
    const dates = collectionExpenses.map(e => new Date(e.date).getTime());
    const start = new Date(Math.min(...dates)).toISOString();
    const end = new Date(Math.max(...dates)).toISOString();
    dateRange = { start, end };
  }

  return {
    collection,
    expenseCount: collectionExpenses.length,
    totalAmount,
    currency,
    expenses: collectionExpenses,
    dateRange,
  };
};

/**
 * Validate collection
 */
export const validateCollection = (
  collection: Partial<GroupCollection>
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!collection.name || collection.name.trim().length === 0) {
    errors.push('Collection name is required');
  }

  if (!collection.groupId) {
    errors.push('Group ID is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
