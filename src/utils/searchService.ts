/**
 * Search Service
 * 
 * Provides fast search across expenses, groups, and members
 * Supports searching by merchant, amount, category, date, and more
 */

import { Expense, Group, Member } from '../types/models';

export interface SearchResult {
  type: 'expense' | 'group' | 'member';
  id: string;
  title: string;
  subtitle?: string;
  matchScore: number;
  data: Expense | Group | Member;
}

export interface SearchOptions {
  groupId?: string; // Search within specific group
  category?: string; // Filter by category
  minAmount?: number; // Minimum amount filter
  maxAmount?: number; // Maximum amount filter
  startDate?: string; // Start date filter (ISO)
  endDate?: string; // End date filter (ISO)
  isPriority?: boolean; // Filter priority bills only
  paymentMode?: string; // Filter by payment mode
  limit?: number; // Maximum results
}

/**
 * Search expenses across all groups or within a specific group
 */
export const searchExpenses = (
  expenses: Expense[],
  query: string,
  options: SearchOptions = {}
): SearchResult[] => {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const searchTerm = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  // Filter expenses based on options
  let filteredExpenses = expenses;

  if (options.groupId) {
    filteredExpenses = filteredExpenses.filter(e => e.groupId === options.groupId);
  }

  if (options.category) {
    filteredExpenses = filteredExpenses.filter(e => e.category === options.category);
  }

  if (options.minAmount !== undefined) {
    filteredExpenses = filteredExpenses.filter(e => e.amount >= options.minAmount!);
  }

  if (options.maxAmount !== undefined) {
    filteredExpenses = filteredExpenses.filter(e => e.amount <= options.maxAmount!);
  }

  if (options.startDate) {
    filteredExpenses = filteredExpenses.filter(e => e.date >= options.startDate!);
  }

  if (options.endDate) {
    filteredExpenses = filteredExpenses.filter(e => e.date <= options.endDate!);
  }

  if (options.isPriority !== undefined) {
    filteredExpenses = filteredExpenses.filter(e => e.isPriority === options.isPriority);
  }

  if (options.paymentMode) {
    filteredExpenses = filteredExpenses.filter(e => e.paymentMode === options.paymentMode);
  }

  // Search through filtered expenses
  filteredExpenses.forEach(expense => {
    let matchScore = 0;
    const matches: string[] = [];

    // Search in merchant/title (highest weight)
    const merchant = (expense.merchant || expense.title || '').toLowerCase();
    if (merchant.includes(searchTerm)) {
      matchScore += 10;
      matches.push('merchant');
    }

    // Exact merchant match (even higher weight)
    if (merchant === searchTerm) {
      matchScore += 5;
    }

    // Search in category
    const category = (expense.category || '').toLowerCase();
    if (category.includes(searchTerm)) {
      matchScore += 5;
      matches.push('category');
    }

    // Search in amount (as string)
    const amountStr = expense.amount.toString();
    if (amountStr.includes(searchTerm)) {
      matchScore += 3;
      matches.push('amount');
    }

    // Search in date
    const dateStr = new Date(expense.date).toLocaleDateString('en-IN').toLowerCase();
    if (dateStr.includes(searchTerm)) {
      matchScore += 2;
      matches.push('date');
    }

    // Search in extra items
    if (expense.extraItems) {
      expense.extraItems.forEach(item => {
        if (item.name.toLowerCase().includes(searchTerm)) {
          matchScore += 2;
          matches.push('item');
        }
      });
    }

    // Only include if there's a match
    if (matchScore > 0) {
      results.push({
        type: 'expense',
        id: expense.id,
        title: expense.merchant || expense.title,
        subtitle: `${expense.category} • ${new Date(expense.date).toLocaleDateString('en-IN')} • ₹${expense.amount.toFixed(2)}`,
        matchScore,
        data: expense,
      });
    }
  });

  // Sort by match score (highest first)
  results.sort((a, b) => b.matchScore - a.matchScore);

  // Apply limit
  if (options.limit) {
    return results.slice(0, options.limit);
  }

  return results;
};

/**
 * Search groups by name
 */
export const searchGroups = (
  groups: Group[],
  query: string,
  limit?: number
): SearchResult[] => {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const searchTerm = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  groups.forEach(group => {
    const name = group.name.toLowerCase();
    if (name.includes(searchTerm)) {
      const matchScore = name === searchTerm ? 10 : 5;
      results.push({
        type: 'group',
        id: group.id,
        title: group.name,
        subtitle: `${group.members.length} members`,
        matchScore,
        data: group,
      });
    }
  });

  results.sort((a, b) => b.matchScore - a.matchScore);
  return limit ? results.slice(0, limit) : results;
};

/**
 * Search members by name
 */
export const searchMembers = (
  members: Member[],
  query: string,
  limit?: number
): SearchResult[] => {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const searchTerm = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  members.forEach(member => {
    const name = member.name.toLowerCase();
    const email = (member.email || '').toLowerCase();
    const phone = (member.phone || '').toLowerCase();

    let matchScore = 0;
    if (name.includes(searchTerm)) {
      matchScore += name === searchTerm ? 10 : 5;
    }
    if (email.includes(searchTerm)) {
      matchScore += 3;
    }
    if (phone.includes(searchTerm)) {
      matchScore += 3;
    }

    if (matchScore > 0) {
      results.push({
        type: 'member',
        id: member.id,
        title: member.name,
        subtitle: member.email || member.phone || undefined,
        matchScore,
        data: member,
      });
    }
  });

  results.sort((a, b) => b.matchScore - a.matchScore);
  return limit ? results.slice(0, limit) : results;
};

/**
 * Global search across all entities
 */
export const globalSearch = (
  expenses: Expense[],
  groups: Group[],
  query: string,
  options: SearchOptions = {}
): SearchResult[] => {
  const results: SearchResult[] = [];

  // Search expenses
  const expenseResults = searchExpenses(expenses, query, options);
  results.push(...expenseResults);

  // Search groups
  const groupResults = searchGroups(groups, query, 5);
  results.push(...groupResults);

  // Sort all results by match score
  results.sort((a, b) => b.matchScore - a.matchScore);

  // Apply limit
  if (options.limit) {
    return results.slice(0, options.limit);
  }

  return results;
};

/**
 * Quick search - returns top 5 most relevant results
 */
export const quickSearch = (
  expenses: Expense[],
  groups: Group[],
  query: string
): SearchResult[] => {
  return globalSearch(expenses, groups, query, { limit: 5 });
};
