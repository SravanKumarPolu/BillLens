import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { Group, Expense, Member, Settlement, GroupSummary, GroupBalance, ExpenseEdit, OcrHistory } from '../types/models';
import { saveAppData, loadAppData, type AppData } from '../utils/storageService';
import { generateInsights, type Insight } from '../utils/insightsService';
import { verifyBalancesSumToZero, normalizeAmount } from '../utils/mathUtils';
import { getCachedBalances, cacheBalances, clearBalanceCache } from '../utils/balanceCache';

export interface TemplateLastAmount {
  templateId: string;
  amount: number;
  lastUsed: string; // ISO date string
}

interface GroupsContextType {
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  templateLastAmounts: TemplateLastAmount[];
  ocrHistory: OcrHistory[];
  isInitialized: boolean;
  
  // Group operations
  addGroup: (group: Omit<Group, 'id' | 'createdAt'>) => string;
  updateGroup: (groupId: string, updates: Partial<Group>) => void;
  deleteGroup: (groupId: string) => void;
  getGroup: (groupId: string) => Group | undefined;
  
  // Expense operations
  addExpense: (expense: Omit<Expense, 'id' | 'date'>) => string;
  updateExpense: (expenseId: string, updates: Partial<Expense>, editedBy?: string) => void;
  deleteExpense: (expenseId: string) => void;
  getExpense: (expenseId: string) => Expense | undefined;
  getExpensesForGroup: (groupId: string) => Expense[];
  getExpenseEditHistory: (expenseId: string) => ExpenseEdit[];
  
  // OCR History operations
  addOcrHistory: (history: Omit<OcrHistory, 'id' | 'timestamp'>) => string;
  getOcrHistory: (groupId?: string) => OcrHistory[];
  
  // Template operations
  getTemplateLastAmount: (templateId: string) => number | null;
  updateTemplateLastAmount: (templateId: string, amount: number) => void;
  
  // Settlement operations
  addSettlement: (settlement: Omit<Settlement, 'id' | 'date' | 'status' | 'createdAt' | 'version' | 'previousVersionId'>) => string;
  completeSettlement: (settlementId: string) => void;
  getSettlementsForGroup: (groupId: string) => Settlement[];
  getSettlementHistory: (groupId: string) => Settlement[]; // Immutable history
  
  // Balance calculations
  calculateGroupBalances: (groupId: string) => GroupBalance[];
  getGroupSummary: (groupId: string) => GroupSummary | null;
  getAllGroupSummaries: () => GroupSummary[];
  
  // Insights
  getGroupInsights: (groupId: string) => Insight[];
}

const GroupsContext = createContext<GroupsContextType | undefined>(undefined);

// Default members
const DEFAULT_MEMBERS: Member[] = [
  { id: 'you', name: 'You' },
  { id: 'priya', name: 'Priya' },
  { id: 'arjun', name: 'Arjun' },
];

// Default groups matching the requirements
const DEFAULT_GROUPS: Group[] = [
  {
    id: '1',
    name: 'Our Home',
    emoji: '🏠',
    members: [DEFAULT_MEMBERS[0], DEFAULT_MEMBERS[1], DEFAULT_MEMBERS[2]],
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Us Two',
    emoji: '👫',
    members: [DEFAULT_MEMBERS[0], DEFAULT_MEMBERS[1]],
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Roommates',
    emoji: '🏘️',
    members: [DEFAULT_MEMBERS[0], DEFAULT_MEMBERS[1], DEFAULT_MEMBERS[2]],
    createdAt: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'Trips',
    emoji: '✈️',
    members: [DEFAULT_MEMBERS[0], DEFAULT_MEMBERS[1]],
    createdAt: new Date().toISOString(),
  },
];

export const GroupsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [groups, setGroups] = useState<Group[]>(DEFAULT_GROUPS);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [templateLastAmounts, setTemplateLastAmounts] = useState<TemplateLastAmount[]>([]);
  const [ocrHistory, setOcrHistory] = useState<OcrHistory[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load data from storage on mount and run migrations
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Run migrations first
        try {
          const { runMigrations } = await import('../utils/migrationService');
          await runMigrations();
        } catch (migrationError) {
          console.warn('Migration error (non-fatal):', migrationError);
        }

        try {
          const savedData = await loadAppData();
          if (savedData) {
            setGroups(savedData.groups);
            setExpenses(savedData.expenses);
            setSettlements(savedData.settlements);
            setTemplateLastAmounts(savedData.templateLastAmounts);
            setOcrHistory(savedData.ocrHistory || []);
          }
        } catch (loadError) {
          console.warn('Load data error (non-fatal):', loadError);
        }
      } catch (error) {
        console.error('Error initializing app data:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    // Initialize immediately, don't block rendering
    initializeData();
  }, []);

  // Save data to storage whenever it changes
  useEffect(() => {
    if (!isInitialized) return; // Don't save during initial load

    const saveData = async () => {
      try {
        await saveAppData({
          groups,
          expenses,
          settlements,
          templateLastAmounts,
          ocrHistory,
        });
      } catch (error) {
        console.error('Error saving app data:', error);
      }
    };

    // Debounce saves to avoid too frequent writes
    const timeoutId = setTimeout(saveData, 500);
    return () => clearTimeout(timeoutId);
  }, [groups, expenses, settlements, templateLastAmounts, isInitialized]);

  // Generate unique ID
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Template helper
  const getTemplateIdFromCategory = (category: string): string | null => {
    const categoryMap: Record<string, string> = {
      'Rent': 'rent',
      'Utilities': 'eb',
      'WiFi': 'wifi',
      'Groceries': 'groceries',
      'Maid': 'maid',
      'OTT': 'ott',
    };
    return categoryMap[category] || null;
  };

  // Template operations
  const getTemplateLastAmount = useCallback((templateId: string): number | null => {
    const template = templateLastAmounts.find(t => t.templateId === templateId);
    return template ? template.amount : null;
  }, [templateLastAmounts]);

  const updateTemplateLastAmount = useCallback((templateId: string, amount: number) => {
    setTemplateLastAmounts(prev => {
      const existing = prev.find(t => t.templateId === templateId);
      if (existing) {
        return prev.map(t =>
          t.templateId === templateId
            ? { ...t, amount, lastUsed: new Date().toISOString() }
            : t
        );
      } else {
        return [...prev, { templateId, amount, lastUsed: new Date().toISOString() }];
      }
    });
  }, []);

  // Group operations
  const addGroup = useCallback((groupData: Omit<Group, 'id' | 'createdAt'>): string => {
    const newGroup: Group = {
      ...groupData,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    setGroups(prev => [...prev, newGroup]);
    return newGroup.id;
  }, []);

  const updateGroup = useCallback((groupId: string, updates: Partial<Group>) => {
    setGroups(prev =>
      prev.map(group => (group.id === groupId ? { ...group, ...updates } : group))
    );
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    setGroups(prev => prev.filter(group => group.id !== groupId));
    // Also delete associated expenses and settlements
    setExpenses(prev => prev.filter(expense => expense.groupId !== groupId));
    setSettlements(prev => prev.filter(settlement => settlement.groupId !== groupId));
  }, []);

  const getGroup = useCallback((groupId: string): Group | undefined => {
    return groups.find(g => g.id === groupId);
  }, [groups]);

  // Expense operations
  const addExpense = useCallback((expenseData: Omit<Expense, 'id' | 'date'>): string => {
    const now = new Date().toISOString();
    const newExpense: Expense = {
      ...expenseData,
      id: generateId(),
      date: now,
      createdAt: now,
      updatedAt: now,
      editHistory: [],
    };
    setExpenses(prev => {
      const updated = [...prev, newExpense];
      // Clear balance cache for this group when expense is added
      clearBalanceCache(expenseData.groupId);
      return updated;
    });
    
    // Update template last amount if category matches a template
    const templateId = getTemplateIdFromCategory(expenseData.category);
    if (templateId) {
      updateTemplateLastAmount(templateId, expenseData.amount);
    }
    
    return newExpense.id;
  }, [updateTemplateLastAmount]);

  const updateExpense = useCallback((expenseId: string, updates: Partial<Expense>, editedBy?: string) => {
    setExpenses(prev => {
      const expense = prev.find(e => e.id === expenseId);
      if (!expense) return prev;

      // Track changes for history
      const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
      Object.keys(updates).forEach(key => {
        if (key !== 'editHistory' && key !== 'createdAt' && key !== 'updatedAt') {
          const oldValue = (expense as any)[key];
          const newValue = (updates as any)[key];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes.push({ field: key, oldValue, newValue });
          }
        }
      });

      // Create edit history entry if there are changes
      const editHistory = changes.length > 0
        ? [
            ...(expense.editHistory || []),
            {
              id: generateId(),
              expenseId,
              editedAt: new Date().toISOString(),
              editedBy: editedBy || 'you',
              changes,
            },
          ]
        : expense.editHistory || [];

      const updated = prev.map(e =>
        e.id === expenseId
          ? {
              ...e,
              ...updates,
              updatedAt: new Date().toISOString(),
              editHistory,
            }
          : e
      );
      
      // Update template last amount if amount changed
      if (updates.amount !== undefined) {
        const updatedExpense = updated.find(e => e.id === expenseId);
        if (updatedExpense) {
          const templateId = getTemplateIdFromCategory(updatedExpense.category);
          if (templateId) {
            updateTemplateLastAmount(templateId, updates.amount);
          }
        }
      }
      
      // Clear balance cache for this group when expense is updated
      const updatedExpense = updated.find(e => e.id === expenseId);
      if (updatedExpense) {
        clearBalanceCache(updatedExpense.groupId);
      }
      
      return updated;
    });
  }, [updateTemplateLastAmount]);

  const deleteExpense = useCallback((expenseId: string) => {
    setExpenses(prev => {
      const expense = prev.find(e => e.id === expenseId);
      if (expense) {
        clearBalanceCache(expense.groupId);
      }
      return prev.filter(expense => expense.id !== expenseId);
    });
  }, []);

  const getExpense = useCallback((expenseId: string): Expense | undefined => {
    return expenses.find(e => e.id === expenseId);
  }, [expenses]);

  const getExpensesForGroup = useCallback((groupId: string): Expense[] => {
    return expenses.filter(expense => expense.groupId === groupId);
  }, [expenses]);

  // Settlement operations - Settlement-proof: Immutable history
  const addSettlement = useCallback((settlementData: Omit<Settlement, 'id' | 'date' | 'status' | 'createdAt' | 'version' | 'previousVersionId'>): string => {
    const now = new Date().toISOString();
    const newSettlement: Settlement = {
      ...settlementData,
      id: generateId(),
      date: now,
      status: 'completed', // Mark as completed when added
      createdAt: now, // Immutable creation timestamp
      version: 1, // Initial version
      // No previousVersionId for new settlements
    };
    setSettlements(prev => {
      const updated = [...prev, newSettlement];
      // Clear balance cache for this group when settlement is added
      clearBalanceCache(settlementData.groupId);
      return updated;
    });
    return newSettlement.id;
  }, []);

  // Get immutable settlement history (all settlements, ordered by creation)
  const getSettlementHistory = useCallback((groupId: string): Settlement[] => {
    return settlements
      .filter(s => s.groupId === groupId)
      .sort((a, b) => {
        const dateA = a.createdAt || a.date;
        const dateB = b.createdAt || b.date;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });
  }, [settlements]);

  const completeSettlement = useCallback((settlementId: string) => {
    setSettlements(prev =>
      prev.map(s => (s.id === settlementId ? { ...s, status: 'completed' } : s))
    );
  }, []);

  const getSettlementsForGroup = useCallback((groupId: string): Settlement[] => {
    return settlements.filter(s => s.groupId === groupId);
  }, [settlements]);

  // Balance calculations with caching to prevent shifting values
  const calculateGroupBalances = useCallback((groupId: string): GroupBalance[] => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return [];

    const groupExpenses = expenses.filter(e => e.groupId === groupId);
    const groupSettlements = settlements.filter(s => s.groupId === groupId && s.status === 'completed');

    // Check cache first
    const cached = getCachedBalances(groupId, groupExpenses, groupSettlements);
    if (cached) {
      return cached;
    }

    // Initialize balances for all members
    const balances: Map<string, number> = new Map();
    group.members.forEach(member => balances.set(member.id, 0));

    // Process expenses: who paid gets credited, who owes gets debited
    groupExpenses.forEach(expense => {
      const paidBy = expense.paidBy;
      const paidAmount = normalizeAmount(expense.amount);
      
      // Credit the person who paid
      balances.set(paidBy, normalizeAmount((balances.get(paidBy) || 0) + paidAmount));
      
      // Debit those who owe (safely handle missing splits array)
      if (expense.splits && Array.isArray(expense.splits)) {
        expense.splits.forEach(split => {
          const splitAmount = normalizeAmount(split.amount);
          balances.set(split.memberId, normalizeAmount((balances.get(split.memberId) || 0) - splitAmount));
        });
      }
    });

    // Process settlements: reduce balances
    groupSettlements.forEach(settlement => {
      const settlementAmount = normalizeAmount(settlement.amount);
      // From person pays to person
      balances.set(settlement.fromMemberId, normalizeAmount((balances.get(settlement.fromMemberId) || 0) - settlementAmount));
      balances.set(settlement.toMemberId, normalizeAmount((balances.get(settlement.toMemberId) || 0) + settlementAmount));
    });

    // Convert to array format and normalize balances
    const result = Array.from(balances.entries()).map(([memberId, balance]) => ({
      memberId,
      balance: normalizeAmount(balance),
    }));

    // Verify balances sum to zero (safety check)
    if (!verifyBalancesSumToZero(result)) {
      console.warn('[GroupsContext] Balance verification failed - balances do not sum to zero:', result);
      // In a closed group, balances should sum to zero. If they don't, there's a data integrity issue.
      // We log it but don't throw to avoid breaking the app.
    }

    // Cache the result
    cacheBalances(groupId, groupExpenses, groupSettlements, result);

    return result;
  }, [groups, expenses, settlements]);

  const getGroupSummary = useCallback((groupId: string): GroupSummary | null => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;

    const groupExpenses = getExpensesForGroup(groupId);
    const groupSettlements = getSettlementsForGroup(groupId);
    const balances = calculateGroupBalances(groupId);

    // Calculate summary text for current user (id: 'you')
    const userBalance = balances.find(b => b.memberId === 'you')?.balance || 0;
    let summaryText = 'All settled';
    
    if (userBalance > 0) {
      // User is owed money
      const totalOwed = balances
        .filter(b => b.balance < 0 && b.memberId !== 'you')
        .reduce((sum, b) => sum + Math.abs(b.balance), 0);
      if (totalOwed > 0) {
        summaryText = `You are owed ₹${Math.round(totalOwed)}`;
      } else {
        summaryText = 'All settled';
      }
    } else if (userBalance < 0) {
      // User owes money
      const totalOwed = Math.abs(userBalance);
      const whoOwed = balances.find(b => b.balance > 0 && b.memberId !== 'you');
      if (whoOwed) {
        const member = group.members.find(m => m.id === whoOwed.memberId);
        summaryText = `You owe ${member?.name || 'someone'} ₹${Math.round(totalOwed)}`;
      } else {
        summaryText = `You owe ₹${Math.round(totalOwed)}`;
      }
    }

    return {
      group,
      expenses: groupExpenses,
      settlements: groupSettlements,
      balances,
      summaryText,
    };
  }, [groups, getExpensesForGroup, getSettlementsForGroup, calculateGroupBalances]);

  const getAllGroupSummaries = useCallback((): GroupSummary[] => {
    return groups
      .map(group => getGroupSummary(group.id))
      .filter((summary): summary is GroupSummary => summary !== null);
  }, [groups, getGroupSummary]);

  // Expense edit history
  const getExpenseEditHistory = useCallback((expenseId: string): ExpenseEdit[] => {
    const expense = expenses.find(e => e.id === expenseId);
    return expense?.editHistory || [];
  }, [expenses]);

  // OCR History operations
  const addOcrHistory = useCallback((history: Omit<OcrHistory, 'id' | 'timestamp'>): string => {
    const newHistory: OcrHistory = {
      ...history,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };
    setOcrHistory(prev => [...prev, newHistory]);
    return newHistory.id;
  }, []);

  const getOcrHistory = useCallback((groupId?: string): OcrHistory[] => {
    if (groupId) {
      return ocrHistory.filter(h => h.groupId === groupId);
    }
    return ocrHistory;
  }, [ocrHistory]);

  const getGroupInsights = useCallback((groupId: string): Insight[] => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return [];

    const groupExpenses = getExpensesForGroup(groupId);
    const groupSettlements = getSettlementsForGroup(groupId);
    const balances = calculateGroupBalances(groupId);

    return generateInsights(groupExpenses, group, balances, groupSettlements);
  }, [groups, getExpensesForGroup, getSettlementsForGroup, calculateGroupBalances]);

  const value: GroupsContextType = {
    groups,
    expenses,
    settlements,
    templateLastAmounts,
    ocrHistory,
    isInitialized,
    addGroup,
    updateGroup,
    deleteGroup,
    getGroup,
    addExpense,
    updateExpense,
    deleteExpense,
    getExpense,
    getExpensesForGroup,
    getExpenseEditHistory,
    getTemplateLastAmount,
    updateTemplateLastAmount,
    addSettlement,
    completeSettlement,
    getSettlementsForGroup,
    calculateGroupBalances,
    getGroupSummary,
    getAllGroupSummaries,
    getGroupInsights,
    getSettlementHistory,
    addOcrHistory,
    getOcrHistory,
  };

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
};

export const useGroups = (): GroupsContextType => {
  const context = useContext(GroupsContext);
  if (!context) {
    throw new Error('useGroups must be used within GroupsProvider');
  }
  return context;
};

