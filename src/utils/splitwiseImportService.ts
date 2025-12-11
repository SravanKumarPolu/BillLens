/**
 * Splitwise Import Service
 * 
 * Imports expenses and balances from Splitwise
 * Supports CSV and JSON export formats from Splitwise
 */

import { Expense, Group, Member, Settlement } from '../types/models';

// Generate unique ID
const generateId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export interface SplitwiseImportResult {
  success: boolean;
  groupsCreated: number;
  expensesImported: number;
  settlementsImported: number;
  errors: string[];
  warnings: string[];
}

export interface SplitwiseExpense {
  description: string;
  cost: number;
  currency_code: string;
  date: string;
  category?: string;
  paid_by?: string;
  users?: Array<{
    user: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
    };
    paid_share?: number;
    owed_share?: number;
  }>;
}

export interface SplitwiseGroup {
  id: number;
  name: string;
  members: Array<{
    id: number;
    first_name: string;
    last_name: string;
    email: string;
  }>;
  expenses?: SplitwiseExpense[];
}

/**
 * Parse Splitwise CSV export
 */
export const parseSplitwiseCSV = (csvText: string): SplitwiseGroup[] => {
  // Splitwise CSV format:
  // Description,Cost,Currency,Date,Category,Paid by,Users
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Invalid CSV format');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const groups: Map<string, SplitwiseGroup> = new Map();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < headers.length) continue;

    const expense: SplitwiseExpense = {
      description: values[headers.indexOf('description')] || '',
      cost: parseFloat(values[headers.indexOf('cost')] || '0'),
      currency_code: values[headers.indexOf('currency')] || 'INR',
      date: values[headers.indexOf('date')] || new Date().toISOString(),
      category: values[headers.indexOf('category')] || undefined,
      paid_by: values[headers.indexOf('paid by')] || undefined,
    };

    // Try to extract group name (might be in description or separate column)
    const groupName = values[headers.indexOf('group')] || 'Imported from Splitwise';
    
    if (!groups.has(groupName)) {
      groups.set(groupName, {
        id: Date.now() + i,
        name: groupName,
        members: [],
        expenses: [],
      });
    }

    const group = groups.get(groupName)!;
    if (group.expenses) {
      group.expenses.push(expense);
    }
  }

  return Array.from(groups.values());
};

/**
 * Parse Splitwise JSON export
 */
export const parseSplitwiseJSON = (jsonText: string): SplitwiseGroup[] => {
  try {
    const data = JSON.parse(jsonText);
    
    // Handle different Splitwise export formats
    if (Array.isArray(data)) {
      // Array of groups
      return data;
    } else if (data.groups && Array.isArray(data.groups)) {
      // Object with groups array
      return data.groups;
    } else if (data.expenses && Array.isArray(data.expenses)) {
      // Single group with expenses
      return [{
        id: data.id || Date.now(),
        name: data.name || 'Imported from Splitwise',
        members: data.members || [],
        expenses: data.expenses,
      }];
    } else {
      throw new Error('Unsupported JSON format');
    }
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Convert Splitwise expense to BillLens expense
 */
const convertSplitwiseExpense = (
  swExpense: SplitwiseExpense,
  groupId: string,
  memberMap: Map<number, string>
): Expense => {
  const paidByMemberId = swExpense.paid_by 
    ? memberMap.get(parseInt(swExpense.paid_by)) || 'you'
    : 'you';

  // Calculate splits from users array
  const splits: Array<{ memberId: string; amount: number }> = [];
  if (swExpense.users && swExpense.users.length > 0) {
    swExpense.users.forEach(user => {
      const memberId = memberMap.get(user.user.id) || `member_${user.user.id}`;
      const owedShare = user.owed_share || 0;
      if (owedShare > 0) {
        splits.push({
          memberId,
          amount: owedShare,
        });
      }
    });
  } else {
    // If no users array, split equally (would need member count)
    // This is a fallback - ideally Splitwise export should have users
  }

  return {
    id: generateId(),
    groupId,
    title: swExpense.description,
    merchant: swExpense.description,
    amount: swExpense.cost,
    currency: swExpense.currency_code || 'INR',
    category: swExpense.category || 'Other',
    paidBy: paidByMemberId,
    splits: splits.length > 0 ? splits : [],
    date: swExpense.date || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
};

/**
 * Import Splitwise data into BillLens
 */
export const importFromSplitwise = async (
  data: string,
  format: 'csv' | 'json',
  currentUserId: string = 'you'
): Promise<SplitwiseImportResult> => {
  const result: SplitwiseImportResult = {
    success: false,
    groupsCreated: 0,
    expensesImported: 0,
    settlementsImported: 0,
    errors: [],
    warnings: [],
  };

  try {
    // Parse data
    const splitwiseGroups = format === 'csv' 
      ? parseSplitwiseCSV(data)
      : parseSplitwiseJSON(data);

    if (splitwiseGroups.length === 0) {
      result.errors.push('No groups found in import data');
      return result;
    }

    // This function would be called from GroupsContext
    // For now, return the parsed data structure
    result.success = true;
    result.groupsCreated = splitwiseGroups.length;
    
    // Count expenses
    splitwiseGroups.forEach(group => {
      if (group.expenses) {
        result.expensesImported += group.expenses.length;
      }
    });

    result.warnings.push('Import data parsed successfully. Use importGroups() to create groups.');

    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    return result;
  }
};

/**
 * Create BillLens groups and expenses from Splitwise data
 * This should be called from GroupsContext after parsing
 */
export const createGroupsFromSplitwise = (
  splitwiseGroups: SplitwiseGroup[],
  currentUserId: string = 'you'
): {
  groups: Omit<Group, 'id' | 'createdAt'>[];
  expenses: Omit<Expense, 'id' | 'date'>[];
} => {
  const groups: Omit<Group, 'id' | 'createdAt'>[] = [];
  const expenses: Omit<Expense, 'id' | 'date'>[] = [];

  // Map Splitwise user IDs to BillLens member IDs
  const memberMap = new Map<number, string>();
  memberMap.set(parseInt(currentUserId) || 0, 'you');

  splitwiseGroups.forEach(swGroup => {
    // Create members
    const members: Member[] = [
      { id: 'you', name: 'You' }, // Current user
    ];

    swGroup.members.forEach((swMember, index) => {
      const memberId = `member_${swMember.id}`;
      members.push({
        id: memberId,
        name: `${swMember.first_name} ${swMember.last_name}`.trim(),
        email: swMember.email,
      });
      memberMap.set(swMember.id, memberId);
    });

    // Create group
    const group: Omit<Group, 'id' | 'createdAt'> = {
      name: swGroup.name,
      emoji: '💰', // Default emoji
      members,
      currency: 'INR', // Default, could be extracted from expenses
      adminId: 'you', // Current user is admin
    };
    groups.push(group);

    // Create expenses (we'll need group ID after creation)
    // This is a simplified version - actual implementation would need group IDs
    if (swGroup.expenses) {
      swGroup.expenses.forEach(swExpense => {
        // Expenses will be created after groups are created
        // This is just the structure
      });
    }
  });

  return { groups, expenses };
};
