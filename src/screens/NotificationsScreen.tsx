import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, BackButton } from '../components';
import {
  getPendingNotifications,
  type Notification,
  type NotificationSettings,
} from '../utils/notificationService';
import { loadNotifications, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '../utils/notificationManager';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const { getAllGroupSummaries, getGroup } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const groupSummaries = getAllGroupSummaries() || [];

  useEffect(() => {
    const loadAllNotifications = async () => {
      // Load stored notifications (real-time events)
      const storedNotifications = await loadNotifications();
      
      // Get reminder notifications for all groups
      const reminderNotifications: Notification[] = [];

      groupSummaries.forEach(summary => {
        const group = getGroup(summary.group.id);
        if (!group) return;

        const groupReminders = getPendingNotifications(
          summary.group.id,
          group,
          summary.expenses,
          summary.balances,
          undefined, // lastSettlementDate - could be tracked
          {
            settleReminders: true,
            rentReminders: true,
            expenseNotifications: false, // Don't show historical expense notifications
            expenseEditNotifications: false,
            expenseDeleteNotifications: false,
            commentNotifications: false,
            settlementNotifications: false,
            recurringExpenseNotifications: false,
            imbalanceAlerts: true,
            monthEndReports: true,
            upiReminders: true,
            priorityReminders: true,
            reminderFrequency: 'weekly',
          }
        );

        reminderNotifications.push(...groupReminders);
      });

      // Combine stored notifications (real-time events) with reminders
      // Sort by creation date, most recent first
      const allNotifications = [...storedNotifications, ...reminderNotifications].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setNotifications(allNotifications);
    };

    loadAllNotifications();
    
    // Refresh notifications every 5 seconds to catch new ones
    const interval = setInterval(loadAllNotifications, 5000);
    return () => clearInterval(interval);
  }, [groupSummaries, getGroup]);

  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await markNotificationAsRead(notification.id);
      setNotifications(prev => 
        prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
      );
    }
    
    if (notification.actionable && notification.actionData) {
      const { action, screen, params } = notification.actionData;
      if (action === 'navigate' && screen) {
        navigation.navigate(screen as any, params);
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleDeleteNotification = async (notificationId: string) => {
    await deleteNotification(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const getSeverityColor = (severity: Notification['severity']) => {
    switch (severity) {
      case 'high':
        return colors.error;
      case 'medium':
        return colors.warning;
      case 'low':
        return colors.info;
      default:
        return colors.textSecondary;
    }
  };

  const getTypeIcon = (type: Notification['type']) => {
    switch (type) {
      case 'settle_reminder':
        return '💰';
      case 'rent_reminder':
        return '🏠';
      case 'expense_added':
        return '📝';
      case 'expense_edited':
        return '✏️';
      case 'expense_deleted':
        return '🗑️';
      case 'comment_added':
        return '💬';
      case 'settlement_added':
        return '✅';
      case 'recurring_expense_added':
        return '🔄';
      case 'imbalance_alert':
        return '⚠️';
      case 'month_end':
        return '📊';
      case 'upi_reminder':
        return '💳';
      case 'priority_bill':
        return '⭐';
      default:
        return '🔔';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleMarkAllAsRead} style={styles.markAllButton}>
            <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
              No notifications
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              You're all caught up!
            </Text>
          </View>
        ) : (
          notifications.map((notification, index) => (
            <TouchableOpacity
              key={notification.id}
              onPress={() => handleNotificationPress(notification)}
              onLongPress={() => {
                Alert.alert(
                  'Delete Notification',
                  'Are you sure you want to delete this notification?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => handleDeleteNotification(notification.id),
                    },
                  ]
                );
              }}
            >
              <Card
                style={[
                  styles.notificationCard,
                  { 
                    borderLeftColor: getSeverityColor(notification.severity),
                    opacity: notification.read ? 0.7 : 1,
                  },
                ]}
              >
              <View style={styles.notificationHeader}>
                <Text style={styles.notificationIcon}>
                  {getTypeIcon(notification.type)}
                </Text>
                <View style={styles.notificationContent}>
                  <View style={styles.notificationTitleRow}>
                    <Text style={[
                      styles.notificationTitle, 
                      { color: colors.textPrimary },
                      !notification.read && styles.notificationTitleUnread
                    ]}>
                      {notification.title}
                    </Text>
                    {!notification.read && (
                      <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <Text style={[styles.notificationMessage, { color: colors.textSecondary }]}>
                    {notification.message}
                  </Text>
                  <Text style={[styles.notificationTime, { color: colors.textSecondary }]}>
                    {formatRelativeTime(notification.createdAt)}
                  </Text>
                </View>
              </View>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButtonContainer: {
    minWidth: 60,
  },
  title: {
    ...typography.h1,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    minWidth: 60,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  notificationCard: {
    marginBottom: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  notificationMessage: {
    ...typography.body,
    marginBottom: 4,
  },
  notificationTime: {
    ...typography.caption,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    ...typography.h3,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    textAlign: 'center',
  },
  markAllButton: {
    minWidth: 80,
    paddingVertical: 4,
  },
  markAllText: {
    ...typography.bodySmall,
    ...typography.emphasis.medium,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notificationTitleUnread: {
    ...typography.emphasis.semibold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
});

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default NotificationsScreen;
