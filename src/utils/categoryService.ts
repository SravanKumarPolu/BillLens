/**
 * Category Service
 * 
 * Manages custom categories for groups and personal expenses
 * Supports default categories and custom category creation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group } from '../types/models';

const DEFAULT_CATEGORIES = [
  'Food',
  'Groceries',
  'Utilities',
  'Rent',
  'WiFi',
  'Maid',
  'OTT',
  'Transport',
  'Entertainment',
  'Shopping',
  'Healthcare',
  'Education',
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
 */
export const getCategories = async (groupId?: string): Promise<string[]> => {
  try {
    // Get custom categories
    const customCategories = await getCustomCategories(groupId);
    const customNames = customCategories.map(c => c.name);

    // Combine with default categories
    const allCategories = [...DEFAULT_CATEGORIES, ...customNames];

    // Remove duplicates
    return Array.from(new Set(allCategories));
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
    Food: '🍔',
    Groceries: '🛒',
    Utilities: '⚡',
    Rent: '🏠',
    WiFi: '📶',
    Maid: '🧹',
    OTT: '📺',
    Transport: '🚗',
    Entertainment: '🎬',
    Shopping: '🛍️',
    Healthcare: '🏥',
    Education: '📚',
    Other: '📝',
  };

  return defaultEmojis[category] || '📝';
};

/**
 * Get category color (from custom or default mapping)
 */
export const getCategoryColor = (category: string): string => {
  const defaultColors: Record<string, string> = {
    Food: '#FF6B6B',
    Groceries: '#4ECDC4',
    Utilities: '#FFE66D',
    Rent: '#95E1D3',
    WiFi: '#A8E6CF',
    Maid: '#FFD3A5',
    OTT: '#FFAAA5',
    Transport: '#A8D8EA',
    Entertainment: '#FF8B94',
    Shopping: '#C7CEEA',
    Healthcare: '#FFB6C1',
    Education: '#B4E4FF',
    Other: '#D3D3D3',
  };

  return defaultColors[category] || '#D3D3D3';
};
