import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card } from '../components';
import {
  getPendingNotifications,
  type Notification,
  type NotificationSettings,
} from '../utils/notificationService';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const { getAllGroupSummaries, getGroup } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const groupSummaries = getAllGroupSummaries() || [];

  useEffect(() => {
    // Get all notifications for all groups
    const allNotifications: Notification[] = [];

    groupSummaries.forEach(summary => {
      const group = getGroup(summary.group.id);
      if (!group) return;

      const groupNotifications = getPendingNotifications(
        summary.group.id,
        group,
        summary.expenses,
        summary.balances,
        undefined, // lastSettlementDate - could be tracked
        {
          settleReminders: true,
          rentReminders: true,
          expenseNotifications: false, // Don't show historical expense notifications
          imbalanceAlerts: true,
          monthEndReports: true,
          upiReminders: true,
          priorityReminders: true,
          reminderFrequency: 'weekly',
        }
      );

      allNotifications.push(...groupNotifications);
    });

    setNotifications(allNotifications);
  }, [groupSummaries, getGroup]);

  const handleNotificationPress = (notification: Notification) => {
    if (notification.actionable && notification.actionData) {
      const { action, screen, params } = notification.actionData;
      if (action === 'navigate' && screen) {
        navigation.navigate(screen as any, params);
      }
    }
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
      case 'imbalance_alert':
        return '⚠️';
      case 'month_end':
        return '📊';
      default:
        return '🔔';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
        <View style={styles.placeholder} />
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
            <Card
              key={notification.id}
              style={[
                styles.notificationCard,
                { borderLeftColor: getSeverityColor(notification.severity) },
              ]}
              onPress={() => handleNotificationPress(notification)}
            >
              <View style={styles.notificationHeader}>
                <Text style={styles.notificationIcon}>
                  {getTypeIcon(notification.type)}
                </Text>
                <View style={styles.notificationContent}>
                  <Text style={[styles.notificationTitle, { color: colors.textPrimary }]}>
                    {notification.title}
                  </Text>
                  <Text style={[styles.notificationMessage, { color: colors.textSecondary }]}>
                    {notification.message}
                  </Text>
                  <Text style={[styles.notificationTime, { color: colors.textSecondary }]}>
                    {new Date(notification.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </Card>
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
  backButton: {
    minWidth: 60,
  },
  backButtonText: {
    ...typography.navigation,
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
});

export default NotificationsScreen;
