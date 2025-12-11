import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';
import { Card } from '../components';
import { Expense, Settlement, ExpenseComment, ExpenseEdit } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'ActivityFeed'>;

type ActivityItem = {
  id: string;
  type: 'expense_added' | 'expense_edited' | 'expense_deleted' | 'settlement' | 'comment' | 'group_change';
  timestamp: string;
  memberName: string;
  memberId: string;
  description: string;
  details?: string;
  amount?: number;
  expenseId?: string;
  settlementId?: string;
  expense?: Expense;
  settlement?: Settlement;
  editHistory?: ExpenseEdit;
  comment?: ExpenseComment;
};

const ActivityFeedScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { 
    getGroup, 
    getExpensesForGroup, 
    getSettlementsForGroup, 
    getDeletedExpensesForGroup,
    getGroupActivitiesForGroup 
  } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const group = getGroup(groupId);
  const expenses = getExpensesForGroup(groupId);
  const settlements = getSettlementsForGroup(groupId);
  const deletedExpenses = getDeletedExpensesForGroup(groupId);
  const groupActivities = getGroupActivitiesForGroup(groupId);

  // Build activity timeline
  const activities = useMemo(() => {
    const items: ActivityItem[] = [];

    if (!group) return items;

    // 1. Expense additions
    expenses.forEach(expense => {
      const paidBy = group.members.find(m => m.id === expense.paidBy);
      items.push({
        id: `expense-${expense.id}`,
        type: 'expense_added',
        timestamp: expense.createdAt || expense.date,
        memberName: paidBy?.name || 'Someone',
        memberId: expense.paidBy,
        description: `Added expense: ${expense.merchant || expense.title || 'Expense'}`,
        details: `Amount: ${formatMoney(expense.amount)}`,
        amount: expense.amount,
        expenseId: expense.id,
        expense,
      });
    });

    // 2. Expense edits (from editHistory)
    expenses.forEach(expense => {
      if (expense.editHistory && expense.editHistory.length > 0) {
        expense.editHistory.forEach(edit => {
          const editedBy = group.members.find(m => m.id === edit.editedBy) || group.members.find(m => m.id === 'you');
          const changeDescriptions = edit.changes.map(change => {
            if (change.field === 'amount') {
              return `Amount: ${formatMoney(change.oldValue)} → ${formatMoney(change.newValue)}`;
            } else if (change.field === 'merchant' || change.field === 'title') {
              return `${change.field}: ${change.oldValue} → ${change.newValue}`;
            } else if (change.field === 'category') {
              return `Category: ${change.oldValue} → ${change.newValue}`;
            } else if (change.field === 'splits') {
              return 'Split configuration changed';
            } else {
              return `${change.field} updated`;
            }
          }).join(', ');

          items.push({
            id: `edit-${edit.id}`,
            type: 'expense_edited',
            timestamp: edit.editedAt,
            memberName: editedBy?.name || 'Someone',
            memberId: edit.editedBy || 'you',
            description: `Edited expense: ${expense.merchant || expense.title || 'Expense'}`,
            details: changeDescriptions,
            expenseId: expense.id,
            expense,
            editHistory: edit,
          });
        });
      }
    });

    // 3. Comments on expenses
    expenses.forEach(expense => {
      if (expense.comments && expense.comments.length > 0) {
        expense.comments.forEach(comment => {
          const commenter = group.members.find(m => m.id === comment.memberId);
          items.push({
            id: `comment-${comment.id}`,
            type: 'comment',
            timestamp: comment.createdAt,
            memberName: commenter?.name || 'Someone',
            memberId: comment.memberId,
            description: `Commented on: ${expense.merchant || expense.title || 'Expense'}`,
            details: comment.text,
            expenseId: expense.id,
            expense,
            comment,
          });
        });
      }
    });

    // 4. Deleted expenses
    deletedExpenses.forEach(deletedExpense => {
      const deletedBy = group.members.find(m => m.id === deletedExpense.deletedBy);
      items.push({
        id: `deleted-${deletedExpense.id}`,
        type: 'expense_deleted',
        timestamp: deletedExpense.deletedAt,
        memberName: deletedBy?.name || 'Someone',
        memberId: deletedExpense.deletedBy || 'you',
        description: `Deleted expense: ${deletedExpense.expenseData.merchant || deletedExpense.expenseData.title || 'Expense'}`,
        details: `Amount: ${formatMoney(deletedExpense.expenseData.amount)}`,
        amount: deletedExpense.expenseData.amount,
        expenseId: deletedExpense.expenseId,
      });
    });

    // 5. Settlements
    settlements.forEach(settlement => {
      const fromMember = group.members.find(m => m.id === settlement.fromMemberId);
      const toMember = group.members.find(m => m.id === settlement.toMemberId);
      items.push({
        id: `settlement-${settlement.id}`,
        type: 'settlement',
        timestamp: settlement.date,
        memberName: fromMember?.name || 'Someone',
        memberId: settlement.fromMemberId,
        description: `Settled balance: ${fromMember?.name || 'Someone'} → ${toMember?.name || 'Someone'}`,
        details: `Amount: ${formatMoney(settlement.amount)} via ${settlement.paymentMode || 'unknown'}`,
        amount: settlement.amount,
        settlementId: settlement.id,
        settlement,
      });
    });

    // 6. Group changes
    groupActivities.forEach(activity => {
      const performedBy = group.members.find(m => m.id === activity.performedBy);
      let description = '';
      let details = '';

      switch (activity.type) {
        case 'member_added':
          description = `Added member: ${activity.details.memberName || 'Someone'}`;
          break;
        case 'member_removed':
          description = `Removed member: ${activity.details.memberName || 'Someone'}`;
          break;
        case 'group_updated':
          description = `Updated group: ${activity.details.field || 'settings'}`;
          if (activity.details.field && activity.details.oldValue !== undefined && activity.details.newValue !== undefined) {
            details = `${activity.details.field}: ${activity.details.oldValue} → ${activity.details.newValue}`;
          }
          break;
        default:
          description = 'Group changed';
      }

      items.push({
        id: `activity-${activity.id}`,
        type: 'group_change',
        timestamp: activity.timestamp,
        memberName: performedBy?.name || 'Someone',
        memberId: activity.performedBy || 'you',
        description,
        details,
      });
    });

    // Sort by timestamp (newest first)
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [expenses, settlements, deletedExpenses, groupActivities, group]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const getActivityIcon = (type: ActivityItem['type']): string => {
    switch (type) {
      case 'expense_added':
        return '➕';
      case 'expense_edited':
        return '✏️';
      case 'expense_deleted':
        return '🗑️';
      case 'settlement':
        return '💰';
      case 'comment':
        return '💬';
      case 'group_change':
        return '👥';
      default:
        return '📝';
    }
  };

  const getActivityColor = (type: ActivityItem['type']): string => {
    switch (type) {
      case 'expense_added':
        return colors.accent;
      case 'expense_edited':
        return colors.warning || colors.accent;
      case 'expense_deleted':
        return colors.error;
      case 'settlement':
        return colors.success || colors.accent;
      case 'comment':
        return colors.primary;
      case 'group_change':
        return colors.textSecondary;
      default:
        return colors.textSecondary;
    }
  };

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Group not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Activity Feed</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Timeline of all activities
          </Text>
        </View>
      </View>

      {activities.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>No activity yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Activities will appear here as you add expenses, make settlements, and interact with the group.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activities.map((activity, index) => {
            const isLast = index === activities.length - 1;
            const activityColor = getActivityColor(activity.type);

            return (
              <View key={activity.id} style={styles.activityItem}>
                <View style={styles.timeline}>
                  <View style={[styles.timelineDot, { backgroundColor: activityColor }]}>
                    <Text style={styles.timelineIcon}>{getActivityIcon(activity.type)}</Text>
                  </View>
                  {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.borderSubtle }]} />}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (activity.expenseId) {
                      navigation.navigate('ExpenseDetail', {
                        expenseId: activity.expenseId,
                        groupId: group.id,
                      });
                    }
                  }}
                  disabled={!activity.expenseId}
                  activeOpacity={activity.expenseId ? 0.7 : 1}
                >
                  <Card style={styles.activityCard}>
                    <View style={styles.activityHeader}>
                    <View style={styles.activityLeft}>
                      <Text style={[styles.activityDescription, { color: colors.textPrimary }]}>
                        {activity.description}
                      </Text>
                      {activity.details && (
                        <Text style={[styles.activityDetails, { color: colors.textSecondary }]}>
                          {activity.details}
                        </Text>
                      )}
                      {activity.amount !== undefined && (
                        <Text style={[styles.activityAmount, { color: activityColor }]}>
                          {formatMoney(activity.amount)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={[styles.activityFooter, { borderTopColor: colors.borderSubtle }]}>
                    <Text style={[styles.activityMember, { color: colors.textSecondary }]}>
                      {activity.memberName}
                    </Text>
                    <Text style={[styles.activityTime, { color: colors.textSecondary }]}>
                      {formatDate(activity.timestamp)}
                    </Text>
                  </View>
                  </Card>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
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
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    ...typography.navigation,
  },
  headerContent: {
    marginBottom: 8,
  },
  title: {
    ...typography.h2,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.body,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  activityItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timeline: {
    alignItems: 'center',
    marginRight: 16,
    width: 24,
  },
  timelineDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineIcon: {
    fontSize: 18,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    minHeight: 20,
  },
  activityCard: {
    flex: 1,
    padding: 16,
  },
  activityHeader: {
    marginBottom: 12,
  },
  activityLeft: {
    flex: 1,
  },
  activityDescription: {
    ...typography.body,
    ...typography.emphasis.medium,
    marginBottom: 4,
  },
  activityDetails: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  activityAmount: {
    ...typography.money,
    ...typography.emphasis.semibold,
  },
  activityFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  activityMember: {
    ...typography.caption,
    ...typography.emphasis.medium,
  },
  activityTime: {
    ...typography.caption,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: recommendedSpacing.loose,
  },
  emptyText: {
    ...typography.h3,
    marginBottom: recommendedSpacing.default,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    textAlign: 'center',
  },
  errorText: {
    ...typography.bodyLarge,
    textAlign: 'center',
    marginTop: 100,
  },
});

export default ActivityFeedScreen;
