/**
 * Notification Manager
 * 
 * Manages notification storage, retrieval, and persistence
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Notification } from './notificationService';

const STORAGE_KEY = '@billlens:notifications';
const MAX_NOTIFICATIONS = 500; // Keep last 500 notifications

/**
 * Save notifications to local storage
 */
export const saveNotifications = async (notifications: Notification[]): Promise<void> => {
  try {
    // Keep only the most recent notifications
    const sorted = notifications.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const toSave = sorted.slice(0, MAX_NOTIFICATIONS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('Error saving notifications:', error);
    throw error;
  }
};

/**
 * Load notifications from local storage
 */
export const loadNotifications = async (): Promise<Notification[]> => {
  try {
    const notificationsStr = await AsyncStorage.getItem(STORAGE_KEY);
    if (!notificationsStr) {
      return [];
    }
    return JSON.parse(notificationsStr);
  } catch (error) {
    console.error('Error loading notifications:', error);
    return [];
  }
};

/**
 * Add a new notification
 */
export const addNotification = async (notification: Notification): Promise<void> => {
  try {
    const existing = await loadNotifications();
    const updated = [notification, ...existing].slice(0, MAX_NOTIFICATIONS);
    await saveNotifications(updated);
  } catch (error) {
    console.error('Error adding notification:', error);
  }
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  try {
    const notifications = await loadNotifications();
    const updated = notifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    await saveNotifications(updated);
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (): Promise<void> => {
  try {
    const notifications = await loadNotifications();
    const updated = notifications.map(n => ({ ...n, read: true }));
    await saveNotifications(updated);
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (notificationId: string): Promise<void> => {
  try {
    const notifications = await loadNotifications();
    const updated = notifications.filter(n => n.id !== notificationId);
    await saveNotifications(updated);
  } catch (error) {
    console.error('Error deleting notification:', error);
  }
};

/**
 * Clear all notifications
 */
export const clearAllNotifications = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing notifications:', error);
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (): Promise<number> => {
  try {
    const notifications = await loadNotifications();
    return notifications.filter(n => !n.read).length;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

/**
 * Get notifications for a specific group
 */
export const getNotificationsForGroup = async (groupId: string): Promise<Notification[]> => {
  try {
    const notifications = await loadNotifications();
    return notifications.filter(n => n.groupId === groupId);
  } catch (error) {
    console.error('Error getting notifications for group:', error);
    return [];
  }
};
