import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo, useRef } from 'react';
import { Group, Expense, Member, Settlement, GroupSummary, GroupBalance, ExpenseEdit, OcrHistory, GroupCollection, CategoryBudget, RecurringExpense, DeletedExpense, GroupActivity } from '../types/models';
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
  collections: GroupCollection[];
  budgets: CategoryBudget[];
  recurringExpenses: RecurringExpense[];
  isInitialized: boolean;
  
  // Group operations
  addGroup: (group: Omit<Group, 'id' | 'createdAt'>) => string;
  updateGroup: (groupId: string, updates: Partial<Group>) => void;
  deleteGroup: (groupId: string) => void;
  getGroup: (groupId: string) => Group | undefined;
  addMemberToGroup: (groupId: string, member: Member) => void;
  removeMemberFromGroup: (groupId: string, memberId: string) => void;
  updateMemberInGroup: (groupId: string, memberId: string, updates: Partial<Member>) => void;
  
  // Expense operations
  addExpense: (expense: Omit<Expense, 'id' | 'date'>) => string;
  updateExpense: (expenseId: string, updates: Partial<Expense>, editedBy?: string) => void;
  deleteExpense: (expenseId: string, deletedBy?: string) => void;
  getExpense: (expenseId: string) => Expense | undefined;
  getExpensesForGroup: (groupId: string) => Expense[];
  getExpenseEditHistory: (expenseId: string) => ExpenseEdit[];
  
  // Collection operations
  addCollection: (collection: Omit<GroupCollection, 'id' | 'createdAt'>) => string;
  updateCollection: (collectionId: string, updates: Partial<GroupCollection>) => void;
  deleteCollection: (collectionId: string) => void;
  getCollection: (collectionId: string) => GroupCollection | undefined;
  getCollectionsForGroup: (groupId: string) => GroupCollection[];
  addExpenseToCollection: (collectionId: string, expenseId: string) => void;
  removeExpenseFromCollection: (collectionId: string, expenseId: string) => void;
  
  // Budget operations
  addBudget: (budget: Omit<CategoryBudget, 'id' | 'createdAt'>) => string;
  updateBudget: (budgetId: string, updates: Partial<CategoryBudget>) => void;
  deleteBudget: (budgetId: string) => void;
  getBudget: (budgetId: string) => CategoryBudget | undefined;
  getBudgetsForGroup: (groupId?: string) => CategoryBudget[];
  
  // Recurring expense operations
  addRecurringExpense: (recurring: Omit<RecurringExpense, 'id' | 'createdAt'>) => string;
  updateRecurringExpense: (recurringId: string, updates: Partial<RecurringExpense>) => void;
  deleteRecurringExpense: (recurringId: string) => void;
  getRecurringExpense: (recurringId: string) => RecurringExpense | undefined;
  getRecurringExpensesForGroup: (groupId?: string) => RecurringExpense[];
  
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
  getGroupBalances: (groupId: string) => GroupBalance[];
  getGroupSummary: (groupId: string) => GroupSummary | null;
  getAllGroupSummaries: () => GroupSummary[];
  
  // Insights
  getGroupInsights: (groupId: string) => Insight[];
  
  // Friend operations (friends are groups with type: 'friend')
  getFriends: () => Group[];
  getFriendSummary: (friendId: string) => GroupSummary | null;
  getGroupsExcludingType: (excludeType: 'friend') => Group[];
  
  // Activity feed operations
  getDeletedExpensesForGroup: (groupId: string) => DeletedExpense[];
  getGroupActivitiesForGroup: (groupId: string) => GroupActivity[];
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
    currency: 'INR',
    createdAt: new Date().toISOString(),
    type: 'house',
  },
  {
    id: '2',
    name: 'Us Two',
    emoji: '👫',
    members: [DEFAULT_MEMBERS[0], DEFAULT_MEMBERS[1]],
    currency: 'INR',
    createdAt: new Date().toISOString(),
    type: 'friend', // 1-to-1 relationship
  },
  {
    id: '3',
    name: 'Roommates',
    emoji: '🏘️',
    members: [DEFAULT_MEMBERS[0], DEFAULT_MEMBERS[1], DEFAULT_MEMBERS[2]],
    currency: 'INR',
    createdAt: new Date().toISOString(),
    type: 'house',
  },
  {
    id: '4',
    name: 'Trips',
    emoji: '✈️',
    members: [DEFAULT_MEMBERS[0], DEFAULT_MEMBERS[1]],
    currency: 'INR',
    createdAt: new Date().toISOString(),
    type: 'trip',
  },
];

export const GroupsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [groups, setGroups] = useState<Group[]>(DEFAULT_GROUPS);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [templateLastAmounts, setTemplateLastAmounts] = useState<TemplateLastAmount[]>([]);
  const [ocrHistory, setOcrHistory] = useState<OcrHistory[]>([]);
  const [collections, setCollections] = useState<GroupCollection[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [deletedExpenses, setDeletedExpenses] = useState<DeletedExpense[]>([]);
  const [groupActivities, setGroupActivities] = useState<GroupActivity[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const syncCallbackRef = useRef<((localData: AppData, userId: string) => Promise<any>) | null>(null);

  // Load data from storage on mount and run migrations
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Run migrations first
        const { runMigrations } = await import('../utils/migrationService');
        await runMigrations();

        const savedData = await loadAppData();
        if (savedData) {
          setGroups(savedData.groups);
          setExpenses(savedData.expenses);
          setSettlements(savedData.settlements);
          setTemplateLastAmounts(savedData.templateLastAmounts);
          setOcrHistory(savedData.ocrHistory || []);
          setCollections(savedData.collections || []);
          setBudgets(savedData.budgets || []);
          setRecurringExpenses(savedData.recurringExpenses || []);
          setDeletedExpenses(savedData.deletedExpenses || []);
          setGroupActivities(savedData.groupActivities || []);
        }
      } catch (error) {
        console.error('Error loading app data:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    initializeData();
  }, []);

  // Save data to storage whenever it changes
  useEffect(() => {
    if (!isInitialized) return; // Don't save during initial load

    const saveData = async () => {
      try {
        // Get custom categories for sync
        const { getAllCategoriesForSync } = await import('../utils/categoryService');
        const categoriesData = await getAllCategoriesForSync();
        
        await saveAppData({
          groups,
          expenses,
          settlements,
          templateLastAmounts,
          ocrHistory,
          collections,
          budgets,
          recurringExpenses,
          deletedExpenses,
          groupActivities,
          customCategories: categoriesData, // Include categories in sync data
        });

        // Track changes for sync (if user is authenticated)
        const { syncService } = await import('../utils/syncService');
        // Add pending change tracking for specific entities
        // The sync service will handle incremental sync based on timestamps
      } catch (error) {
        console.error('Error saving app data:', error);
      }
    };

    // Debounce saves to avoid too frequent writes
    const timeoutId = setTimeout(saveData, 500);
    return () => clearTimeout(timeoutId);
  }, [groups, expenses, settlements, templateLastAmounts, ocrHistory, collections, budgets, recurringExpenses, deletedExpenses, groupActivities, isInitialized]);

  // Set up sync callback for real-time sync
  useEffect(() => {
    if (!isInitialized) return; // Wait for initialization
    
    const setupSync = async () => {
      try {
        const { syncService } = await import('../utils/syncService');
        
        // Create sync callback that merges downloaded data
        const syncCallback = async (localData: AppData, userId: string) => {
          const result = await syncService.sync(localData, userId);
          
          // Merge downloaded data into local state
          if (result.mergedData) {
            setGroups(result.mergedData.groups);
            setExpenses(result.mergedData.expenses);
            setSettlements(result.mergedData.settlements);
            
            // Load and merge synced categories
            if (result.mergedData && 'customCategories' in result.mergedData && result.mergedData.customCategories) {
              const { loadSyncedCategories } = await import('../utils/categoryService');
              await loadSyncedCategories(result.mergedData.customCategories);
            }
            
            // Save merged data
            await saveAppData({
              groups: result.mergedData.groups,
              expenses: result.mergedData.expenses,
              settlements: result.mergedData.settlements,
              templateLastAmounts,
              ocrHistory,
              collections,
              budgets,
              recurringExpenses,
              deletedExpenses,
              groupActivities,
            });
          }
          
          return result;
        };
        
        syncCallbackRef.current = syncCallback;
        syncService.setSyncCallback(syncCallback);
      } catch (error) {
        console.error('Error setting up sync:', error);
      }
    };

    setupSync();
    
    return () => {
      // Cleanup on unmount
      const cleanup = async () => {
        try {
          const { syncService } = await import('../utils/syncService');
          syncService.setSyncCallback(null as any);
        } catch (error) {
          // Ignore cleanup errors
        }
      };
      cleanup();
    };
  }, [isInitialized, templateLastAmounts, ocrHistory]);

  // Generate unique ID
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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
      currency: groupData.currency || 'INR', // Default to INR
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    setGroups(prev => [...prev, newGroup]);
    
    // Track for automatic sync (fire and forget)
    (async () => {
      try {
        const { syncService } = await import('../utils/syncService');
        await syncService.addPendingChange('create', 'group', newGroup.id, newGroup);
      } catch (error) {
        console.error('Error tracking group for sync:', error);
      }
    })();
    
    return newGroup.id;
  }, []);

  const updateGroup = useCallback((groupId: string, updates: Partial<Group>, updatedBy?: string) => {
    setGroups(prev => {
      const group = prev.find(g => g.id === groupId);
      if (!group) return prev;
      
      // Track changes for activity feed
      const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
      Object.keys(updates).forEach(key => {
        if (key !== 'members' && key !== 'createdAt') {
          const oldValue = (group as any)[key];
          const newValue = (updates as any)[key];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes.push({ field: key, oldValue, newValue });
          }
        }
      });
      
      // Track group activity if there are changes
      if (changes.length > 0) {
        changes.forEach(change => {
          setGroupActivities(prevActivities => [...prevActivities, {
            id: generateId(),
            groupId,
            type: 'group_updated',
            timestamp: new Date().toISOString(),
            performedBy: updatedBy || 'you',
            details: {
              field: change.field,
              oldValue: change.oldValue,
              newValue: change.newValue,
            },
          }]);
        });
      }
      
      return prev.map(group => (group.id === groupId ? { ...group, ...updates } : group));
    });
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

  // Member management operations
  const addMemberToGroup = useCallback((groupId: string, member: Member, addedBy?: string) => {
    setGroups(prev =>
      prev.map(group =>
        group.id === groupId
          ? { ...group, members: [...group.members, member] }
          : group
      )
    );
    
    // Track group activity
    setGroupActivities(prev => [...prev, {
      id: generateId(),
      groupId,
      type: 'member_added',
      timestamp: new Date().toISOString(),
      performedBy: addedBy || 'you',
      details: {
        memberId: member.id,
        memberName: member.name,
      },
    }]);
  }, []);

  const removeMemberFromGroup = useCallback((groupId: string, memberId: string, removedBy?: string) => {
    setGroups(prev => {
      const group = prev.find(g => g.id === groupId);
      const member = group?.members.find(m => m.id === memberId);
      
      // Track group activity before removing
      if (member) {
        setGroupActivities(prevActivities => [...prevActivities, {
          id: generateId(),
          groupId,
          type: 'member_removed',
          timestamp: new Date().toISOString(),
          performedBy: removedBy || 'you',
          details: {
            memberId: member.id,
            memberName: member.name,
          },
        }]);
      }
      
      return prev.map(group =>
        group.id === groupId
          ? { ...group, members: group.members.filter(m => m.id !== memberId) }
          : group
      );
    });
    // Also remove expenses/settlements where this member was involved?
    // For now, we'll keep expenses but mark them as inactive
  }, []);

  const updateMemberInGroup = useCallback((groupId: string, memberId: string, updates: Partial<Member>) => {
    setGroups(prev =>
      prev.map(group =>
        group.id === groupId
          ? {
              ...group,
              members: group.members.map(m =>
                m.id === memberId ? { ...m, ...updates } : m
              ),
            }
          : group
      )
    );
  }, []);

  // Expense operations
  const addExpense = useCallback((expenseData: Omit<Expense, 'id' | 'date'>): string => {
    const now = new Date().toISOString();
    const group = groups.find(g => g.id === expenseData.groupId);
    const groupCurrency = group?.currency || 'INR';

    const newExpense: Expense = {
      ...expenseData,
      currency: expenseData.currency || groupCurrency, // Use group currency if not specified
      id: generateId(),
      date: now,
      createdAt: now,
      updatedAt: now,
      editHistory: [],
    };
    setExpenses(prev => {
      const updated = [...prev, newExpense];
      
      // Track for automatic sync
      (async () => {
        const { syncService } = await import('../utils/syncService');
        syncService.addPendingChange('create', 'expense', newExpense.id, newExpense);
      })();
      
      // Clear balance cache for this group when expense is added
      clearBalanceCache(expenseData.groupId);
      return updated;
    });
    
    // Update template last amount if category matches a template
    const templateId = getTemplateIdFromCategory(expenseData.category);
    if (templateId) {
      updateTemplateLastAmount(templateId, expenseData.amount);
    }

    // Track for sync
    import('../utils/syncService').then(({ syncService }) => {
      syncService.addPendingChange('create', 'expense', newExpense.id, newExpense);
    }).catch(() => {
      // Ignore sync errors during local operations
    });
    
    // Generate notification for expense added (only if not by current user, or if enabled)
    (async () => {
      try {
        const { generateExpenseAddedNotification } = await import('../utils/notificationService');
        const { addNotification } = await import('../utils/notificationManager');
        const group = groups.find(g => g.id === newExpense.groupId);
        if (group) {
          const member = group.members.find(m => m.id === newExpense.paidBy);
          const memberName = member?.name || (newExpense.paidBy === 'you' ? 'You' : newExpense.paidBy);
          const notification = generateExpenseAddedNotification(
            newExpense.groupId,
            newExpense,
            group.name,
            memberName
          );
          await addNotification(notification);
        }
      } catch (error) {
        console.error('Error generating expense added notification:', error);
      }
    })();
    
    return newExpense.id;
  }, [updateTemplateLastAmount, groups]);

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
      
      // Track for automatic sync (fire and forget)
      const expenseToSync = updated.find(e => e.id === expenseId);
      if (expenseToSync) {
        (async () => {
          try {
            const { syncService } = await import('../utils/syncService');
            await syncService.addPendingChange('update', 'expense', expenseId, expenseToSync);
          } catch (error) {
            console.error('Error tracking expense update for sync:', error);
          }
        })();
        
        // Check if this is a comment addition (new comments added)
        const oldComments = expense.comments || [];
        const newComments = expenseToSync.comments || [];
        if (newComments.length > oldComments.length) {
          // New comment(s) added - generate notification
          const latestComment = newComments[newComments.length - 1];
          (async () => {
            try {
              const { generateCommentAddedNotification } = await import('../utils/notificationService');
              const { addNotification } = await import('../utils/notificationManager');
              const group = groups.find(g => g.id === expenseToSync.groupId);
              if (group && latestComment.memberId !== 'you') {
                // Only notify if comment is from someone else
                const member = group.members.find(m => m.id === latestComment.memberId);
                const memberName = member?.name || latestComment.memberId;
                const notification = generateCommentAddedNotification(
                  expenseToSync.groupId,
                  expenseId,
                  expenseToSync.merchant || expenseToSync.title,
                  group.name,
                  memberName
                );
                await addNotification(notification);
              }
            } catch (error) {
              console.error('Error generating comment notification:', error);
            }
          })();
        } else if (Object.keys(updates).some(key => key !== 'comments' && key !== 'editHistory')) {
          // Expense was edited (not just comments) - generate notification
          (async () => {
            try {
              const { generateExpenseEditedNotification } = await import('../utils/notificationService');
              const { addNotification } = await import('../utils/notificationManager');
              const group = groups.find(g => g.id === expenseToSync.groupId);
              if (group) {
                const editorId = editedBy || 'you';
                // Only notify if edited by someone else
                if (editorId !== 'you') {
                  const member = group.members.find(m => m.id === editorId);
                  const memberName = member?.name || editorId;
              const notification = generateExpenseEditedNotification(
                expenseToSync.groupId,
                expenseToSync,
                group.name,
                memberName
              );
                  await addNotification(notification);
                }
              }
            } catch (error) {
              console.error('Error generating expense edited notification:', error);
            }
          })();
        }
      }
      
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
      const expenseForCache = updated.find(e => e.id === expenseId);
      if (expenseForCache) {
        clearBalanceCache(expenseForCache.groupId);
      }
      
      return updated;
    });
  }, [updateTemplateLastAmount]);

  const deleteExpense = useCallback((expenseId: string, deletedBy?: string) => {
    // Track for automatic sync before deletion (fire and forget)
    (async () => {
      try {
        const { syncService } = await import('../utils/syncService');
        const expense = expenses.find(e => e.id === expenseId);
        if (expense) {
          await syncService.addPendingChange('delete', 'expense', expenseId, expense);
        }
      } catch (error) {
        console.error('Error tracking expense deletion for sync:', error);
      }
    })();
    setExpenses(prev => {
      const expense = prev.find(e => e.id === expenseId);
      if (expense) {
        clearBalanceCache(expense.groupId);
        
        // Track deleted expense for activity feed
        setDeletedExpenses(prevDeleted => [...prevDeleted, {
          id: generateId(),
          expenseId: expense.id,
          groupId: expense.groupId,
          deletedAt: new Date().toISOString(),
          deletedBy: deletedBy || 'you',
          expenseData: {
            title: expense.title,
            merchant: expense.merchant,
            amount: expense.amount,
            category: expense.category,
            paidBy: expense.paidBy,
          },
        }]);
        
        // Generate notification for expense deleted
        (async () => {
          try {
            const { generateExpenseDeletedNotification } = await import('../utils/notificationService');
            const { addNotification } = await import('../utils/notificationManager');
            const group = groups.find(g => g.id === expense.groupId);
            if (group) {
              const deleterId = deletedBy || 'you';
              const member = group.members.find(m => m.id === deleterId);
              const memberName = member?.name || (deleterId === 'you' ? 'You' : deleterId);
              const notification = generateExpenseDeletedNotification(
                expense.groupId,
                expense.merchant || expense.title,
                expense.amount,
                expense.currency || 'INR',
                group.name,
                memberName
              );
              await addNotification(notification);
            }
          } catch (error) {
            console.error('Error generating expense deleted notification:', error);
          }
        })();
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
  const addSettlement = useCallback((settlementData: Omit<Settlement, 'id' | 'date' | 'status' | 'createdAt' | 'version' | 'previousVersionId' | 'currency'> & { currency?: string }): string => {
    const now = new Date().toISOString();
    const group = groups.find(g => g.id === settlementData.groupId);
    const groupCurrency = group?.currency || 'INR';
    
    const newSettlement: Settlement = {
      ...settlementData,
      currency: settlementData.currency || groupCurrency, // Use group currency if not specified
      id: generateId(),
      date: now,
      status: 'completed', // Mark as completed when added
      createdAt: now, // Immutable creation timestamp
      version: 1, // Initial version
      // No previousVersionId for new settlements
    };
    setSettlements(prev => {
      // Track for automatic sync (fire and forget)
      (async () => {
        try {
          const { syncService } = await import('../utils/syncService');
          await syncService.addPendingChange('create', 'settlement', newSettlement.id, newSettlement);
        } catch (error) {
          console.error('Error tracking settlement for sync:', error);
        }
      })();
      
      // Generate notification for settlement added
      (async () => {
        try {
          const { generateSettlementAddedNotification } = await import('../utils/notificationService');
          const { addNotification } = await import('../utils/notificationManager');
          const group = groups.find(g => g.id === settlementData.groupId);
          if (group) {
            const settlerId = settlementData.fromMemberId || 'you';
            const member = group.members.find(m => m.id === settlerId);
            const memberName = member?.name || (settlerId === 'you' ? 'You' : settlerId);
            const notification = generateSettlementAddedNotification(
              settlementData.groupId,
              newSettlement,
              group.name,
              memberName
            );
            await addNotification(notification);
          }
        } catch (error) {
          console.error('Error generating settlement notification:', error);
        }
      })();
      
      const updated = [...prev, newSettlement];
      // Clear balance cache for this group when settlement is added
      clearBalanceCache(settlementData.groupId);
      return updated;
    });
    return newSettlement.id;
  }, [groups]);

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
      const groupCurrency = group.currency || 'INR';
      const expenseCurrency = expense.currency || groupCurrency;
      
      // Handle multiple payers (new) or single payer (backward compatibility)
      if (expense.payers && expense.payers.length > 0) {
        // Multiple payers: credit each payer for their contribution
        expense.payers.forEach(payer => {
          const paidAmount = normalizeAmount(payer.amount);
          // Convert to group currency if needed
          const convertedAmount = expenseCurrency === groupCurrency 
            ? paidAmount 
            : normalizeAmount(paidAmount); // TODO: Add currency conversion
          balances.set(payer.memberId, normalizeAmount((balances.get(payer.memberId) || 0) + convertedAmount));
        });
      } else if (expense.paidBy) {
        // Single payer (backward compatibility)
        const paidAmount = normalizeAmount(expense.amount);
        const convertedAmount = expenseCurrency === groupCurrency 
          ? paidAmount 
          : normalizeAmount(paidAmount); // TODO: Add currency conversion
        balances.set(expense.paidBy, normalizeAmount((balances.get(expense.paidBy) || 0) + convertedAmount));
      }
      
      // Debit those who owe (safely handle missing splits array)
      if (expense.splits && Array.isArray(expense.splits)) {
        expense.splits.forEach(split => {
          const splitAmount = normalizeAmount(split.amount);
          const convertedAmount = expenseCurrency === groupCurrency 
            ? splitAmount 
            : normalizeAmount(splitAmount); // TODO: Add currency conversion
          balances.set(split.memberId, normalizeAmount((balances.get(split.memberId) || 0) - convertedAmount));
        });
      }
      
      // Handle extra items (special case adjustments)
      if (expense.extraItems && Array.isArray(expense.extraItems)) {
        expense.extraItems.forEach(item => {
          const itemAmount = normalizeAmount(item.amount);
          const convertedAmount = expenseCurrency === groupCurrency 
            ? itemAmount 
            : normalizeAmount(itemAmount); // TODO: Add currency conversion
          
          // If item has specific payer, credit them
          if (item.paidBy) {
            balances.set(item.paidBy, normalizeAmount((balances.get(item.paidBy) || 0) + convertedAmount));
          }
          
          // If item has specific split, debit those members
          if (item.splitBetween && item.splitBetween.length > 0) {
            const perPerson = convertedAmount / item.splitBetween.length;
            item.splitBetween.forEach(memberId => {
              balances.set(memberId, normalizeAmount((balances.get(memberId) || 0) - perPerson));
            });
          }
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

  // Friend operations (friends are groups with type: 'friend')
  const getFriends = useCallback((): Group[] => {
    return groups.filter(g => g.type === 'friend');
  }, [groups]);

  const getFriendSummary = useCallback((friendId: string): GroupSummary | null => {
    // Friends are just groups with type: 'friend', so use getGroupSummary
    return getGroupSummary(friendId);
  }, [getGroupSummary]);

  const getGroupsExcludingType = useCallback((excludeType: 'friend'): Group[] => {
    return groups.filter(g => g.type !== excludeType);
  }, [groups]);

  // Activity feed operations
  const getDeletedExpensesForGroup = useCallback((groupId: string): DeletedExpense[] => {
    return deletedExpenses.filter(de => de.groupId === groupId);
  }, [deletedExpenses]);

  const getGroupActivitiesForGroup = useCallback((groupId: string): GroupActivity[] => {
    return groupActivities.filter(ga => ga.groupId === groupId);
  }, [groupActivities]);

  // Collection operations
  const addCollection = useCallback((collectionData: Omit<GroupCollection, 'id' | 'createdAt'>): string => {
    const newCollection: GroupCollection = {
      ...collectionData,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      createdAt: new Date().toISOString(),
    };
    setCollections(prev => [...prev, newCollection]);
    return newCollection.id;
  }, []);

  const updateCollection = useCallback((collectionId: string, updates: Partial<GroupCollection>) => {
    setCollections(prev =>
      prev.map(c =>
        c.id === collectionId
          ? { ...c, ...updates, updatedAt: new Date().toISOString() }
          : c
      )
    );
  }, []);

  const deleteCollection = useCallback((collectionId: string) => {
    setCollections(prev => prev.filter(c => c.id !== collectionId));
    // Remove collectionId from expenses
    setExpenses(prev =>
      prev.map(e =>
        e.collectionId === collectionId ? { ...e, collectionId: undefined } : e
      )
    );
  }, []);

  const getCollection = useCallback((collectionId: string): GroupCollection | undefined => {
    return collections.find(c => c.id === collectionId);
  }, [collections]);

  const getCollectionsForGroup = useCallback((groupId: string): GroupCollection[] => {
    return collections.filter(c => c.groupId === groupId);
  }, [collections]);

  const addExpenseToCollection = useCallback((collectionId: string, expenseId: string) => {
    setCollections(prev =>
      prev.map(c =>
        c.id === collectionId
          ? { ...c, expenseIds: [...c.expenseIds, expenseId], updatedAt: new Date().toISOString() }
          : c
      )
    );
    setExpenses(prev =>
      prev.map(e =>
        e.id === expenseId ? { ...e, collectionId } : e
      )
    );
  }, []);

  const removeExpenseFromCollection = useCallback((collectionId: string, expenseId: string) => {
    setCollections(prev =>
      prev.map(c =>
        c.id === collectionId
          ? { ...c, expenseIds: c.expenseIds.filter(id => id !== expenseId), updatedAt: new Date().toISOString() }
          : c
      )
    );
    setExpenses(prev =>
      prev.map(e =>
        e.id === expenseId ? { ...e, collectionId: undefined } : e
      )
    );
  }, []);

  // Budget operations
  const addBudget = useCallback((budgetData: Omit<CategoryBudget, 'id' | 'createdAt'>): string => {
    const newBudget: CategoryBudget = {
      ...budgetData,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      createdAt: new Date().toISOString(),
    };
    setBudgets(prev => [...prev, newBudget]);
    return newBudget.id;
  }, []);

  const updateBudget = useCallback((budgetId: string, updates: Partial<CategoryBudget>) => {
    setBudgets(prev =>
      prev.map(b =>
        b.id === budgetId
          ? { ...b, ...updates, updatedAt: new Date().toISOString() }
          : b
      )
    );
  }, []);

  const deleteBudget = useCallback((budgetId: string) => {
    setBudgets(prev => prev.filter(b => b.id !== budgetId));
  }, []);

  const getBudget = useCallback((budgetId: string): CategoryBudget | undefined => {
    return budgets.find(b => b.id === budgetId);
  }, [budgets]);

  const getBudgetsForGroup = useCallback((groupId?: string): CategoryBudget[] => {
    if (groupId === undefined) {
      return budgets.filter(b => !b.groupId); // Personal budgets
    }
    return budgets.filter(b => b.groupId === groupId);
  }, [budgets]);

  // Recurring expense operations
  const addRecurringExpense = useCallback((recurringData: Omit<RecurringExpense, 'id' | 'createdAt'>): string => {
    const newRecurring: RecurringExpense = {
      ...recurringData,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      createdAt: new Date().toISOString(),
    };
    setRecurringExpenses(prev => [...prev, newRecurring]);
    
    // Generate notification for recurring expense added
    (async () => {
      try {
        const { generateRecurringExpenseAddedNotification } = await import('../utils/notificationService');
        const { addNotification } = await import('../utils/notificationManager');
        const group = groups.find(g => g.id === recurringData.groupId);
        if (group) {
          const creatorId = 'you'; // Recurring expenses are created by current user
          const member = group.members.find(m => m.id === creatorId);
          const memberName = member?.name || 'You';
          const notification = generateRecurringExpenseAddedNotification(
            recurringData.groupId || '',
            newRecurring,
            group.name,
            memberName
          );
          await addNotification(notification);
        }
      } catch (error) {
        console.error('Error generating recurring expense notification:', error);
      }
    })();
    
    return newRecurring.id;
  }, [groups]);

  const updateRecurringExpense = useCallback((recurringId: string, updates: Partial<RecurringExpense>) => {
    setRecurringExpenses(prev =>
      prev.map(r =>
        r.id === recurringId
          ? { ...r, ...updates, updatedAt: new Date().toISOString() }
          : r
      )
    );
  }, []);

  const deleteRecurringExpense = useCallback((recurringId: string) => {
    setRecurringExpenses(prev => prev.filter(r => r.id !== recurringId));
  }, []);

  const getRecurringExpense = useCallback((recurringId: string): RecurringExpense | undefined => {
    return recurringExpenses.find(r => r.id === recurringId);
  }, [recurringExpenses]);

  const getRecurringExpensesForGroup = useCallback((groupId?: string): RecurringExpense[] => {
    if (groupId === undefined) {
      return recurringExpenses.filter(r => !r.groupId); // Personal recurring expenses
    }
    return recurringExpenses.filter(r => r.groupId === groupId);
  }, [recurringExpenses]);

  const value: GroupsContextType = {
    groups,
    expenses,
    settlements,
    templateLastAmounts,
    ocrHistory,
    collections,
    budgets,
    recurringExpenses,
    isInitialized,
    addGroup,
    updateGroup,
    deleteGroup,
    getGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    updateMemberInGroup,
    addExpense,
    updateExpense,
    deleteExpense,
    getExpense,
    getExpensesForGroup,
    getExpenseEditHistory,
    addCollection,
    updateCollection,
    deleteCollection,
    getCollection,
    getCollectionsForGroup,
    addExpenseToCollection,
    removeExpenseFromCollection,
    addBudget,
    updateBudget,
    deleteBudget,
    getBudget,
    getBudgetsForGroup,
    addRecurringExpense,
    updateRecurringExpense,
    deleteRecurringExpense,
    getRecurringExpense,
    getRecurringExpensesForGroup,
    getTemplateLastAmount,
    updateTemplateLastAmount,
    addSettlement,
    completeSettlement,
    getSettlementsForGroup,
    calculateGroupBalances,
    getGroupBalances: calculateGroupBalances, // Alias for convenience
    getGroupSummary,
    getAllGroupSummaries,
    getGroupInsights,
    getSettlementHistory,
    addOcrHistory,
    getOcrHistory,
    getFriends,
    getFriendSummary,
    getGroupsExcludingType,
    getDeletedExpensesForGroup,
    getGroupActivitiesForGroup,
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

