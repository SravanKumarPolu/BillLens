/**
 * Storage Service for local persistence and backup/restore
 * Uses AsyncStorage for React Native
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group, Expense, Settlement, OcrHistory, GroupCollection, CategoryBudget, RecurringExpense, DeletedExpense, GroupActivity } from '../types/models';
import { TemplateLastAmount } from '../context/GroupsContext';

const STORAGE_KEYS = {
  GROUPS: '@billlens:groups',
  EXPENSES: '@billlens:expenses',
  SETTLEMENTS: '@billlens:settlements',
  TEMPLATE_AMOUNTS: '@billlens:templateAmounts',
  OCR_HISTORY: '@billlens:ocrHistory',
  COLLECTIONS: '@billlens:collections',
  BUDGETS: '@billlens:budgets',
  RECURRING_EXPENSES: '@billlens:recurringExpenses',
  DELETED_EXPENSES: '@billlens:deletedExpenses',
  GROUP_ACTIVITIES: '@billlens:groupActivities',
  CUSTOM_CATEGORIES: '@billlens:customCategories',
  PENDING_SYNC_CHANGES: '@billlens:pendingSyncChanges',
  NOTIFICATIONS: '@billlens:notifications',
  BACKUP: '@billlens:backup',
};

export interface AppData {
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  templateLastAmounts: TemplateLastAmount[];
  ocrHistory?: OcrHistory[];
  collections?: GroupCollection[];
  budgets?: CategoryBudget[];
  recurringExpenses?: RecurringExpense[];
  deletedExpenses?: DeletedExpense[];
  groupActivities?: GroupActivity[];
  customCategories?: any; // Custom categories for sync
}

/**
 * Save all app data to local storage
 */
export const saveAppData = async (data: AppData): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(data.groups)),
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(data.expenses)),
      AsyncStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(data.settlements)),
      AsyncStorage.setItem(STORAGE_KEYS.TEMPLATE_AMOUNTS, JSON.stringify(data.templateLastAmounts)),
      AsyncStorage.setItem(STORAGE_KEYS.OCR_HISTORY, JSON.stringify(data.ocrHistory || [])),
      AsyncStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(data.collections || [])),
      AsyncStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(data.budgets || [])),
      AsyncStorage.setItem(STORAGE_KEYS.RECURRING_EXPENSES, JSON.stringify(data.recurringExpenses || [])),
      AsyncStorage.setItem(STORAGE_KEYS.DELETED_EXPENSES, JSON.stringify(data.deletedExpenses || [])),
      AsyncStorage.setItem(STORAGE_KEYS.GROUP_ACTIVITIES, JSON.stringify(data.groupActivities || [])),
      // Custom categories are stored separately in categoryService, but we include them in sync data
      AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, JSON.stringify(data.customCategories || [])),
    ]);
  } catch (error) {
    console.error('Error saving app data:', error);
    throw error;
  }
};

/**
 * Load all app data from local storage
 */
export const loadAppData = async (): Promise<AppData | null> => {
  try {
    const [groupsStr, expensesStr, settlementsStr, templateAmountsStr, ocrHistoryStr, collectionsStr, budgetsStr, recurringExpensesStr, deletedExpensesStr, groupActivitiesStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.GROUPS),
      AsyncStorage.getItem(STORAGE_KEYS.EXPENSES),
      AsyncStorage.getItem(STORAGE_KEYS.SETTLEMENTS),
      AsyncStorage.getItem(STORAGE_KEYS.TEMPLATE_AMOUNTS),
      AsyncStorage.getItem(STORAGE_KEYS.OCR_HISTORY),
      AsyncStorage.getItem(STORAGE_KEYS.COLLECTIONS),
      AsyncStorage.getItem(STORAGE_KEYS.BUDGETS),
      AsyncStorage.getItem(STORAGE_KEYS.RECURRING_EXPENSES),
      AsyncStorage.getItem(STORAGE_KEYS.DELETED_EXPENSES),
      AsyncStorage.getItem(STORAGE_KEYS.GROUP_ACTIVITIES),
      AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_CATEGORIES),
    ]);

    if (!groupsStr) {
      return null; // No saved data
    }

    return {
      groups: JSON.parse(groupsStr),
      expenses: expensesStr ? JSON.parse(expensesStr) : [],
      settlements: settlementsStr ? JSON.parse(settlementsStr) : [],
      templateLastAmounts: templateAmountsStr ? JSON.parse(templateAmountsStr) : [],
      ocrHistory: ocrHistoryStr ? JSON.parse(ocrHistoryStr) : [],
      collections: collectionsStr ? JSON.parse(collectionsStr) : [],
      budgets: budgetsStr ? JSON.parse(budgetsStr) : [],
      recurringExpenses: recurringExpensesStr ? JSON.parse(recurringExpensesStr) : [],
      deletedExpenses: deletedExpensesStr ? JSON.parse(deletedExpensesStr) : [],
      groupActivities: groupActivitiesStr ? JSON.parse(groupActivitiesStr) : [],
      customCategories: undefined, // Custom categories are managed by categoryService
    };
  } catch (error) {
    console.error('Error loading app data:', error);
    return null;
  }
};

/**
 * Create a backup of all app data
 */
export const createBackup = async (): Promise<string> => {
  try {
    const data = await loadAppData();
    if (!data) {
      throw new Error('No data to backup');
    }

    const backup = {
      ...data,
      backupDate: new Date().toISOString(),
      version: '1.0',
    };

    const backupString = JSON.stringify(backup);
    await AsyncStorage.setItem(STORAGE_KEYS.BACKUP, backupString);
    
    return backupString; // Return as string for export/sharing
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
};

/**
 * Restore app data from backup
 */
export const restoreBackup = async (backupString: string): Promise<void> => {
  try {
    const backup = JSON.parse(backupString);
    
    // Validate backup structure
    if (!backup.groups || !Array.isArray(backup.groups)) {
      throw new Error('Invalid backup format');
    }

    const data: AppData = {
      groups: backup.groups,
      expenses: backup.expenses || [],
      settlements: backup.settlements || [],
      templateLastAmounts: backup.templateLastAmounts || [],
      ocrHistory: backup.ocrHistory || [],
      collections: backup.collections || [],
      budgets: backup.budgets || [],
      recurringExpenses: backup.recurringExpenses || [],
      deletedExpenses: backup.deletedExpenses || [],
      groupActivities: backup.groupActivities || [],
      customCategories: backup.customCategories || [],
    };

    await saveAppData(data);
  } catch (error) {
    console.error('Error restoring backup:', error);
    throw error;
  }
};

/**
 * Clear all app data (for testing or reset)
 */
export const clearAllData = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.GROUPS),
      AsyncStorage.removeItem(STORAGE_KEYS.EXPENSES),
      AsyncStorage.removeItem(STORAGE_KEYS.SETTLEMENTS),
      AsyncStorage.removeItem(STORAGE_KEYS.TEMPLATE_AMOUNTS),
      AsyncStorage.removeItem(STORAGE_KEYS.OCR_HISTORY),
      AsyncStorage.removeItem(STORAGE_KEYS.COLLECTIONS),
      AsyncStorage.removeItem(STORAGE_KEYS.BUDGETS),
      AsyncStorage.removeItem(STORAGE_KEYS.RECURRING_EXPENSES),
      AsyncStorage.removeItem(STORAGE_KEYS.BACKUP),
    ]);
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
};

