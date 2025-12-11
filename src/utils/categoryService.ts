/**
 * Category Service
 * 
 * Manages custom categories for groups and personal expenses
 * Supports default categories and custom category creation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group } from '../types/models';

const DEFAULT_CATEGORIES = [
  // Essential categories
  'Food',
  'Groceries',
  'Rent',
  'Utilities',
  'Shopping',
  'Travel',
  'Entertainment',
  'Medical',
  'Education',
  'Business',
  'Miscellaneous',
  
  // Additional common categories
  'Transport',
  'WiFi',
  'Internet',
  'Phone',
  'Insurance',
  'Healthcare',
  'Fitness',
  'Dining Out',
  'Fast Food',
  'Coffee',
  'Alcohol',
  'Subscriptions',
  'OTT',
  'Streaming',
  'Gaming',
  'Books',
  'Clothing',
  'Electronics',
  'Home & Garden',
  'Pet Care',
  'Childcare',
  'Personal Care',
  'Beauty',
  'Gifts',
  'Donations',
  'Taxes',
  'Fees',
  'Banking',
  'Investments',
  'Savings',
  'Other',
];

const CUSTOM_CATEGORIES_KEY = '@billlens:customCategories';
const GROUP_CATEGORIES_KEY_PREFIX = '@billlens:groupCategories:';

export interface CustomCategory {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  groupId?: string; // If null, applies globally
  createdAt: string;
}

/**
 * Get all categories (default + custom) for a group
 * Returns 30+ default categories plus any custom categories
 */
export const getCategories = async (groupId?: string): Promise<string[]> => {
  try {
    // Get custom categories
    const customCategories = await getCustomCategories(groupId);
    const customNames = customCategories.map(c => c.name);

    // Combine with default categories (30+ categories)
    const allCategories = [...DEFAULT_CATEGORIES, ...customNames];

    // Remove duplicates and sort (default categories first, then custom)
    const uniqueCategories = Array.from(new Set(allCategories));
    return uniqueCategories.sort((a, b) => {
      const aIsDefault = DEFAULT_CATEGORIES.includes(a);
      const bIsDefault = DEFAULT_CATEGORIES.includes(b);
      if (aIsDefault && !bIsDefault) return -1;
      if (!aIsDefault && bIsDefault) return 1;
      return a.localeCompare(b);
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    return DEFAULT_CATEGORIES;
  }
};

/**
 * Get custom categories for a group or globally
 */
export const getCustomCategories = async (groupId?: string): Promise<CustomCategory[]> => {
  try {
    const key = groupId 
      ? `${GROUP_CATEGORIES_KEY_PREFIX}${groupId}`
      : CUSTOM_CATEGORIES_KEY;
    
    const json = await AsyncStorage.getItem(key);
    if (json) {
      return JSON.parse(json);
    }
    return [];
  } catch (error) {
    console.error('Error getting custom categories:', error);
    return [];
  }
};

/**
 * Add a custom category
 */
export const addCustomCategory = async (
  name: string,
  groupId?: string,
  emoji?: string,
  color?: string
): Promise<CustomCategory> => {
  try {
    const customCategory: CustomCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      emoji,
      color,
      groupId,
      createdAt: new Date().toISOString(),
    };

    const key = groupId 
      ? `${GROUP_CATEGORIES_KEY_PREFIX}${groupId}`
      : CUSTOM_CATEGORIES_KEY;

    const existing = await getCustomCategories(groupId);
    const updated = [...existing, customCategory];

    await AsyncStorage.setItem(key, JSON.stringify(updated));
    
    // Trigger category sync
    try {
      const { syncCategories } = await import('./categoryService');
      // Get userId from auth context if available
      // For now, we'll sync on next app sync
      await syncCategories(''); // Empty userId for now, will be set during actual sync
    } catch (syncError) {
      // Ignore sync errors, categories will sync on next app sync
      console.warn('Category sync error:', syncError);
    }
    
    return customCategory;
  } catch (error) {
    console.error('Error adding custom category:', error);
    throw error;
  }
};

/**
 * Delete a custom category
 */
export const deleteCustomCategory = async (
  categoryId: string,
  groupId?: string
): Promise<void> => {
  try {
    const key = groupId 
      ? `${GROUP_CATEGORIES_KEY_PREFIX}${groupId}`
      : CUSTOM_CATEGORIES_KEY;

    const existing = await getCustomCategories(groupId);
    const updated = existing.filter(c => c.id !== categoryId);

    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (error) {
    console.error('Error deleting custom category:', error);
    throw error;
  }
};

/**
 * Update a custom category
 */
export const updateCustomCategory = async (
  categoryId: string,
  updates: Partial<CustomCategory>,
  groupId?: string
): Promise<void> => {
  try {
    const key = groupId 
      ? `${GROUP_CATEGORIES_KEY_PREFIX}${groupId}`
      : CUSTOM_CATEGORIES_KEY;

    const existing = await getCustomCategories(groupId);
    const updated = existing.map(c =>
      c.id === categoryId ? { ...c, ...updates } : c
    );

    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (error) {
    console.error('Error updating custom category:', error);
    throw error;
  }
};

/**
 * Get category emoji (from custom or default mapping)
 */
export const getCategoryEmoji = (category: string): string => {
  const defaultEmojis: Record<string, string> = {
    // Essential categories
    Food: '🍔',
    Groceries: '🛒',
    Rent: '🏠',
    Utilities: '⚡',
    Shopping: '🛍️',
    Travel: '✈️',
    Entertainment: '🎬',
    Medical: '🏥',
    Education: '📚',
    Business: '💼',
    Miscellaneous: '📋',
    
    // Additional categories
    Transport: '🚗',
    WiFi: '📶',
    Internet: '🌐',
    Phone: '📱',
    Insurance: '🛡️',
    Healthcare: '🏥',
    Fitness: '💪',
    'Dining Out': '🍽️',
    'Fast Food': '🍟',
    Coffee: '☕',
    Alcohol: '🍷',
    Subscriptions: '📱',
    OTT: '📺',
    Streaming: '📡',
    Gaming: '🎮',
    Books: '📖',
    Clothing: '👕',
    Electronics: '💻',
    'Home & Garden': '🏡',
    'Pet Care': '🐾',
    Childcare: '👶',
    'Personal Care': '🧴',
    Beauty: '💄',
    Gifts: '🎁',
    Donations: '❤️',
    Taxes: '📊',
    Fees: '💳',
    Banking: '🏦',
    Investments: '📈',
    Savings: '💰',
    Other: '📝',
  };

  return defaultEmojis[category] || '📝';
};

/**
 * Get category color (from custom or default mapping)
 */
export const getCategoryColor = (category: string): string => {
  const defaultColors: Record<string, string> = {
    // Essential categories
    Food: '#FF6B6B',
    Groceries: '#4ECDC4',
    Rent: '#95E1D3',
    Utilities: '#FFE66D',
    Shopping: '#C7CEEA',
    Travel: '#A8D8EA',
    Entertainment: '#FF8B94',
    Medical: '#FFB6C1',
    Education: '#B4E4FF',
    Business: '#FFD93D',
    Miscellaneous: '#D3D3D3',
    
    // Additional categories
    Transport: '#A8D8EA',
    WiFi: '#A8E6CF',
    Internet: '#A8E6CF',
    Phone: '#FFAAA5',
    Insurance: '#95E1D3',
    Healthcare: '#FFB6C1',
    Fitness: '#FF6B6B',
    'Dining Out': '#FF8B94',
    'Fast Food': '#FF6B6B',
    Coffee: '#8B4513',
    Alcohol: '#9370DB',
    Subscriptions: '#FFAAA5',
    OTT: '#FFAAA5',
    Streaming: '#FFAAA5',
    Gaming: '#9370DB',
    Books: '#B4E4FF',
    Clothing: '#C7CEEA',
    Electronics: '#A8D8EA',
    'Home & Garden': '#95E1D3',
    'Pet Care': '#FFD3A5',
    Childcare: '#FFB6C1',
    'Personal Care': '#FFB6C1',
    Beauty: '#FFB6C1',
    Gifts: '#FF8B94',
    Donations: '#FF6B6B',
    Taxes: '#FFE66D',
    Fees: '#FFE66D',
    Banking: '#A8D8EA',
    Investments: '#4ECDC4',
    Savings: '#4ECDC4',
    Other: '#D3D3D3',
  };

  return defaultColors[category] || '#D3D3D3';
};

/**
 * Sync categories across devices
 * This function should be called during app sync to ensure categories are synced
 * Categories are automatically synced as part of the AppData structure
 */
export const syncCategories = async (userId: string): Promise<void> => {
  try {
    // Get all custom categories (global)
    const globalCategories = await getCustomCategories();
    
    // Store categories in sync-able format
    const categoriesData = {
      global: globalCategories,
      lastSynced: new Date().toISOString(),
    };
    
    // Save to storage for sync (this will be included in AppData.customCategories)
    await AsyncStorage.setItem(
      `${CUSTOM_CATEGORIES_KEY}:sync`,
      JSON.stringify(categoriesData)
    );
    
    // Categories are automatically included in AppData.customCategories
    // and will be synced through the normal sync flow
  } catch (error) {
    console.error('Error syncing categories:', error);
  }
};

/**
 * Get all custom categories for sync (global + per-group)
 */
export const getAllCategoriesForSync = async (): Promise<{
  global: CustomCategory[];
  groups: Record<string, CustomCategory[]>;
}> => {
  try {
    const global = await getCustomCategories();
    
    // Get all group categories
    // In production, this would get all groups from GroupsContext
    // For now, we'll return global categories
    const groups: Record<string, CustomCategory[]> = {};
    
    // TODO: Iterate through all groups and get their custom categories
    // const allGroups = getGroups(); // Would need GroupsContext
    // for (const group of allGroups) {
    //   const groupCategories = await getCustomCategories(group.id);
    //   if (groupCategories.length > 0) {
    //     groups[group.id] = groupCategories;
    //   }
    // }
    
    return { global, groups };
  } catch (error) {
    console.error('Error getting categories for sync:', error);
    return { global: [], groups: {} };
  }
};

/**
 * Load synced categories from cloud/other devices
 * This is called during app initialization or after sync
 */
export const loadSyncedCategories = async (
  syncedCategoriesData?: {
    global?: CustomCategory[];
    groups?: Record<string, CustomCategory[]>;
  }
): Promise<void> => {
  try {
    // If synced data is provided, use it; otherwise load from storage
    let categoriesData = syncedCategoriesData;
    
    if (!categoriesData) {
      const syncKey = `${CUSTOM_CATEGORIES_KEY}:sync`;
      const syncedData = await AsyncStorage.getItem(syncKey);
      if (syncedData) {
        categoriesData = JSON.parse(syncedData);
      }
    }
    
    if (categoriesData) {
      // Merge synced global categories with local ones
      if (categoriesData.global && Array.isArray(categoriesData.global)) {
        const localCategories = await getCustomCategories();
        const syncedCategories = categoriesData.global as CustomCategory[];
        
        // Merge: keep local if newer, otherwise use synced
        const merged = [...localCategories];
        syncedCategories.forEach(synced => {
          const localIndex = merged.findIndex(c => c.id === synced.id);
          if (localIndex >= 0) {
            // Compare timestamps, keep newer
            const localTime = new Date(merged[localIndex].createdAt).getTime();
            const syncedTime = new Date(synced.createdAt).getTime();
            if (syncedTime > localTime) {
              merged[localIndex] = synced;
            }
          } else {
            // New category from sync
            merged.push(synced);
          }
        });
        
        // Save merged categories
        await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(merged));
      }
      
      // Merge group-specific categories
      if (categoriesData.groups && typeof categoriesData.groups === 'object') {
        for (const [groupId, syncedGroupCategories] of Object.entries(categoriesData.groups)) {
          if (Array.isArray(syncedGroupCategories)) {
            const localGroupCategories = await getCustomCategories(groupId);
            const merged = [...localGroupCategories];
            
            syncedGroupCategories.forEach(synced => {
              const localIndex = merged.findIndex(c => c.id === synced.id);
              if (localIndex >= 0) {
                const localTime = new Date(merged[localIndex].createdAt).getTime();
                const syncedTime = new Date(synced.createdAt).getTime();
                if (syncedTime > localTime) {
                  merged[localIndex] = synced;
                }
              } else {
                merged.push(synced);
              }
            });
            
            // Save merged group categories
            const groupKey = `${GROUP_CATEGORIES_KEY_PREFIX}${groupId}`;
            await AsyncStorage.setItem(groupKey, JSON.stringify(merged));
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading synced categories:', error);
  }
};
