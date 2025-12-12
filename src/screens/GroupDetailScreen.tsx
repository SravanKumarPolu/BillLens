import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';
import { Button, InsightsCard, BalanceBreakdown, FairnessMeter } from '../components';
import { calculateFairnessScore, calculateReliabilityMeter } from '../utils/fairnessScore';

// Helper function to get display label for group type
const getGroupTypeLabel = (type?: string): string => {
  switch (type) {
    case 'house':
      return 'House / Flatmates';
    case 'trip':
      return 'Trip';
    case 'event':
      return 'Event';
    case 'office':
      return 'Office';
    case 'friend':
      return 'Friend';
    case 'custom':
      return 'Custom';
    default:
      return '';
  }
};

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

const GroupDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getGroupSummary, deleteGroup, getGroup, deleteExpense, getExpense, updateGroup, getGroupInsights, calculateGroupBalances, getRecurringExpensesForGroup } = useGroups();
  const { colors } = useTheme();
  const [showMenu, setShowMenu] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  
  const summary = getGroupSummary(groupId);
  const group = getGroup(groupId);
  const insights = getGroupInsights(groupId);
  const styles = createStyles(colors);

  // Calculate fairness score and reliability meter
  const fairnessScore = useMemo(() => {
    if (!group || !summary) return null;
    return calculateFairnessScore(summary.expenses, group, summary.balances);
  }, [group, summary]);

  const reliabilityMeter = useMemo(() => {
    if (!summary) return null;
    return calculateReliabilityMeter(summary.expenses, summary.settlements);
  }, [summary]);

  if (!summary || !group) {
    return (
      <View style={styles.container}>
        <Text style={[styles.errorText, { color: colors.error }]}>Group not found</Text>
      </View>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${group.name}"? This will also delete all expenses in this group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteGroup(groupId);
            navigation.navigate('Home');
          },
        },
      ]
    );
  };

  const handleEdit = () => {
    // Note: Alert.prompt is iOS-only. For cross-platform, we'd need a modal with TextInput.
    // For MVP, group editing can be done by recreating the group or implementing a modal later.
    // The updateGroup function exists in GroupsContext and is ready to use.
    setShowMenu(false);
    navigation.navigate('CreateGroup'); // Navigate to create screen as workaround
    // TODO: Implement proper edit modal with TextInput for name/emoji editing
  };

  const handleDeleteExpense = (expenseId: string) => {
    const expense = getExpense(expenseId);
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${expense?.title || expense?.merchant || 'this expense'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteExpense(expenseId, 'you');
            setSelectedExpenseId(null);
          },
        },
      ]
    );
  };

  const handleEditExpense = (expenseId: string) => {
    const expense = getExpense(expenseId);
    if (!expense) return;
    
    // Navigate to AddExpense with expense data for editing
    navigation.navigate('AddExpense', {
      imageUri: expense.imageUri || '',
      groupId: expense.groupId,
      parsedAmount: expense.amount.toString(),
      parsedMerchant: expense.merchant || expense.title,
      parsedDate: expense.date,
      expenseId, // Pass expenseId to identify it's an edit
    });
  };

  // Format expenses for display
  const formattedExpenses = (summary.expenses || [])
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10) // Show recent 10
    .map(expense => {
      const paidBy = group.members.find(m => m.id === expense.paidBy);
      const splitCount = expense.splits?.length || 0;
      return {
        id: expense.id,
        title: expense.title || expense.merchant || 'Expense',
        subtitle: `${paidBy?.name || 'Someone'} paid · Split among ${splitCount}`,
        amount: formatMoney(expense.amount),
        expense, // Include full expense object
      };
    });

  return (
    <Pressable style={styles.container} onPress={() => showMenu && setShowMenu(false)}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <Text style={styles.groupEmoji}>{group.emoji}</Text>
            <View style={styles.headerTextWrapper}>
              <View style={styles.groupNameRow}>
                <Text style={styles.groupName}>{group.name}</Text>
                {group.type && (
                  <View style={[styles.groupTypeBadge, { backgroundColor: colors.surfaceCard }]}>
                    <Text style={[styles.groupTypeText, { color: colors.textSecondary }]}>
                      {getGroupTypeLabel(group.type)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.balanceSummary}>{summary.summaryText}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={styles.menuButton}>
          <Text style={styles.menuIcon}>⋯</Text>
        </TouchableOpacity>
      </View>

      {showMenu && (
        <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
          <TouchableOpacity style={styles.menuItem} onPress={handleEdit}>
            <Text style={styles.menuItemText}>Edit group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
            <Text style={[styles.menuItemText, styles.menuItemDanger]}>Delete group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowMenu(false)}>
            <Text style={styles.menuItemText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      )}

      {/* Collections & Budget Quick Access */}
      <View style={styles.quickAccessContainer}>
        <TouchableOpacity
          style={[styles.quickAccessButton, { backgroundColor: colors.surfaceCard }]}
          onPress={() => navigation.navigate('Collections', { groupId })}
        >
          <Text style={styles.quickAccessIcon}>📁</Text>
          <View style={styles.quickAccessText}>
            <Text style={[styles.quickAccessTitle, { color: colors.textPrimary }]}>Collections</Text>
            <Text style={[styles.quickAccessSubtitle, { color: colors.textSecondary }]}>Group related bills</Text>
          </View>
          <Text style={[styles.quickAccessArrow, { color: colors.textSecondary }]}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickAccessButton, { backgroundColor: colors.surfaceCard }]}
          onPress={() => navigation.navigate('BudgetManagement', { groupId })}
        >
          <Text style={styles.quickAccessIcon}>💰</Text>
          <View style={styles.quickAccessText}>
            <Text style={[styles.quickAccessTitle, { color: colors.textPrimary }]}>Budget & Planning</Text>
            <Text style={[styles.quickAccessSubtitle, { color: colors.textSecondary }]}>Track spending limits</Text>
          </View>
          <Text style={[styles.quickAccessArrow, { color: colors.textSecondary }]}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionButtons}>
        <Button
          title="Settle up"
          onPress={() => navigation.navigate('SettleUp', { groupId })}
          variant="positive"
          style={styles.topActionButton}
          fullWidth={false}
        />
        <Button
          title="Analytics"
          onPress={() => navigation.navigate('Analytics', { groupId })}
          variant="secondary"
          style={styles.topActionButton}
          fullWidth={false}
        />
        <Button
          title="Lens View"
          onPress={() => navigation.navigate('LensView', { groupId })}
          variant="secondary"
          style={styles.topActionButton}
          fullWidth={false}
        />
      </View>

      <View style={styles.actionButtons}>
        <Button
          title="📊 Who Pays More"
          onPress={() => navigation.navigate('PerPersonStats', { groupId })}
          variant="secondary"
          style={styles.topActionButton}
          fullWidth={false}
        />
        <Button
          title="📋 Ledger"
          onPress={() => navigation.navigate('Ledger', { groupId })}
          variant="secondary"
          style={styles.topActionButton}
          fullWidth={false}
        />
      </View>

      {/* Fairness Score and Reliability Meter */}
      {fairnessScore && reliabilityMeter && (
        <View style={styles.fairnessContainer}>
          <FairnessMeter
            fairnessScore={fairnessScore}
            reliabilityMeter={reliabilityMeter}
          />
        </View>
      )}

      {insights.length > 0 && (
        <View style={styles.insightsContainer}>
          <InsightsCard
            insights={insights}
            onInsightPress={(insight) => {
              // Handle insight actions
              if (insight.type === 'mistake' && insight.actionData?.mistake?.suggestedFix) {
                const mistake = insight.actionData.mistake;
                const expense = getExpense(mistake.expenseId);
                if (expense && mistake.suggestedFix) {
                  Alert.alert(
                    'Fix Mistake',
                    `Would you like to update ${mistake.suggestedFix.field} from ${mistake.suggestedFix.oldValue} to ${mistake.suggestedFix.newValue}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Fix',
                        onPress: () => {
                          // Navigate to edit screen with suggested fix
                          navigation.navigate('AddExpense', {
                            imageUri: expense.imageUri || '',
                            groupId: expense.groupId,
                            parsedAmount: mistake.suggestedFix.field === 'splits' 
                              ? expense.amount.toString() 
                              : expense.amount.toString(),
                            parsedMerchant: expense.merchant || expense.title,
                            parsedDate: expense.date,
                            expenseId: expense.id,
                          });
                        },
                      },
                    ]
                  );
                }
              } else if (insight.type === 'suggestion' && insight.actionData?.optimization) {
                // Show optimized settlements
                Alert.alert(
                  'Optimized Settlements',
                  `You can reduce ${insight.actionData.optimization.savings} transaction${insight.actionData.optimization.savings > 1 ? 's' : ''} by using optimized payments.`,
                  [
                    { text: 'OK' },
                    {
                      text: 'View Details',
                      onPress: () => navigation.navigate('SettleUp', { groupId }),
                    },
                  ]
                );
              }
            }}
          />
        </View>
      )}

      {/* Balance Breakdown - Clear view to prevent confusion */}
      <View style={styles.balanceBreakdownContainer}>
        <BalanceBreakdown
          balances={summary.balances}
          expenses={summary.expenses}
          settlements={summary.settlements}
          members={group.members}
          currentUserId="you"
        />
      </View>

      <View style={styles.actionButtons}>
        <Button
          title="🏠 Split Rent"
          onPress={() => navigation.navigate('RentSplit', { groupId })}
          variant="secondary"
          fullWidth={false}
          style={styles.actionButton}
        />
        <Button
          title="📷 Gallery"
          onPress={() => navigation.navigate('ReceiptGallery', { groupId })}
          variant="secondary"
          fullWidth={false}
          style={styles.actionButton}
        />
        <Button
          title="View all expenses →"
          onPress={() => navigation.navigate('Ledger', { groupId })}
          variant="ghost"
          fullWidth={false}
          style={styles.actionButton}
        />
        <Button
          title="Activity Feed →"
          onPress={() => navigation.navigate('ActivityFeed', { groupId })}
          variant="ghost"
          fullWidth={false}
          style={styles.actionButton}
        />
      </View>

      {summary.settlements && summary.settlements.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Settlement history</Text>
          <FlatList
            data={summary.settlements
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 5)}
            keyExtractor={s => s.id}
            renderItem={({ item }) => {
              const fromMember = group.members.find(m => m.id === item.fromMemberId);
              const toMember = group.members.find(m => m.id === item.toMemberId);
              return (
                <View style={styles.settlementCard}>
                  <View style={styles.settlementLeft}>
                    <Text style={styles.settlementTitle}>
                      {fromMember?.name || 'Someone'} → {toMember?.name || 'Someone'}
                    </Text>
                    <Text style={styles.settlementSubtitle}>
                      {new Date(item.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.settlementAmount}>{formatMoney(item.amount)}</Text>
                </View>
              );
            }}
            contentContainerStyle={styles.settlementsList}
            scrollEnabled={false}
          />
        </>
      )}

      <Text style={styles.sectionTitle}>Recent expenses</Text>

      {formattedExpenses.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>No expenses yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Add your first expense using the button below
          </Text>
        </View>
      ) : (
        <FlatList
          data={formattedExpenses}
          keyExtractor={e => e.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.expenseCard}
              onPress={() => navigation.navigate('ExpenseDetail', { expenseId: item.id, groupId })}
              onLongPress={() => setSelectedExpenseId(item.id)}
            >
              <View style={styles.expenseLeft}>
                <Text style={styles.expenseTitle}>{item.title}</Text>
                <Text style={styles.expenseSubtitle}>{item.subtitle}</Text>
                {item.expense?.comments && item.expense.comments.length > 0 && (
                  <View style={styles.commentBadge}>
                    <Text style={[styles.commentBadgeText, { color: colors.primary }]}>
                      💬 {item.expense.comments.length} {item.expense.comments.length === 1 ? 'comment' : 'comments'}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.expenseRight}>
                <Text style={styles.expenseAmount}>{item.amount}</Text>
                {selectedExpenseId === item.id && (
                  <View style={styles.expenseActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => {
                        handleEditExpense(item.id);
                        setSelectedExpenseId(null);
                      }}
                    >
                      <Text style={styles.actionText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.actionButtonDanger]}
                      onPress={() => {
                        handleDeleteExpense(item.id);
                        setSelectedExpenseId(null);
                      }}
                    >
                      <Text style={[styles.actionText, styles.actionTextDanger]}>Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => setSelectedExpenseId(null)}
                    >
                      <Text style={styles.actionText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </Pressable>
          )}
          contentContainerStyle={styles.expensesList}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CaptureOptions', { groupId })}
      >
        <Text style={styles.fabIcon}>📷</Text>
        <Text style={styles.fabLabel}>Add from screenshot</Text>
      </TouchableOpacity>
    </Pressable>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: recommendedSpacing.loose,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    ...typography.navigation,
  },
  headerContent: {
    flex: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupEmoji: {
    fontSize: 36, // Emoji icon, not typography
    marginRight: recommendedSpacing.comfortable,
  },
  headerTextWrapper: {
    flex: 1,
  },
  groupName: {
    ...typography.h2,
    marginBottom: recommendedSpacing.tight,
  },
  balanceSummary: {
    ...typography.body,
  },
  actionButtons: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginTop: recommendedSpacing.default,
    marginBottom: recommendedSpacing.loose,
    gap: recommendedSpacing.comfortable,
  },
  insightsContainer: {
    marginHorizontal: 24,
    marginBottom: recommendedSpacing.loose,
  },
  balanceBreakdownContainer: {
    marginHorizontal: 24,
    marginBottom: recommendedSpacing.loose,
  },
  fairnessContainer: {
    marginHorizontal: 24,
    marginBottom: recommendedSpacing.loose,
  },
  topActionButton: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.label,
    ...typography.emphasis.semibold,
    paddingHorizontal: 24,
    marginTop: recommendedSpacing.extraLoose,
    marginBottom: recommendedSpacing.comfortable,
  },
  viewAllButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'flex-end',
  },
  viewAllText: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  expensesList: {
    paddingBottom: 140,
  },
  expenseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: recommendedSpacing.loose,
    marginBottom: recommendedSpacing.comfortable,
    marginHorizontal: 24,
  },
  expenseLeft: {
    flex: 1,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  expenseTitle: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  expenseSubtitle: {
    ...typography.bodySmall,
  },
  commentBadge: {
    marginTop: 4,
  },
  commentBadgeText: {
    ...typography.caption,
    ...typography.emphasis.medium,
  },
  expenseAmount: {
    ...typography.money,
  },
  expenseActions: {
    flexDirection: 'row',
    marginTop: recommendedSpacing.default,
    gap: recommendedSpacing.default,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  actionButtonDanger: {
    backgroundColor: colors.error + '20',
    borderColor: colors.error,
  },
  actionText: {
    ...typography.caption,
    ...typography.emphasis.semibold,
  },
  actionTextDanger: {
    // Color applied inline
  },
  fab: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  fabIcon: {
    marginRight: recommendedSpacing.default,
    fontSize: 20, // Icon size, not typography
  },
  fabLabel: {
    ...typography.button,
  },
  menuButton: {
    padding: 8,
  },
  menuIcon: {
    fontSize: 20, // Icon character, not typography
  },
  menu: {
    position: 'absolute',
    top: 100,
    right: 24,
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
    minWidth: 150,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    ...typography.body,
  },
  menuItemDanger: {
    // Color applied inline
  },
  errorText: {
    ...typography.bodyLarge,
    textAlign: 'center',
    marginTop: 100,
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    marginTop: 24,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
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
  settlementsList: {
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  settlementCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  settlementLeft: {
    flex: 1,
  },
  settlementTitle: {
    ...typography.body,
    ...typography.emphasis.medium,
  },
  settlementSubtitle: {
    ...typography.caption,
    marginTop: recommendedSpacing.tight,
  },
  settlementAmount: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  quickAccessContainer: {
    marginHorizontal: 24,
    marginBottom: 24,
    gap: 12,
  },
  quickAccessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  quickAccessIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  quickAccessText: {
    flex: 1,
  },
  quickAccessTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  quickAccessSubtitle: {
    ...typography.bodySmall,
  },
  quickAccessArrow: {
    ...typography.bodyLarge,
    marginLeft: 8,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  groupTypeText: {
    ...typography.caption,
    ...typography.emphasis.medium,
  },
});

export default GroupDetailScreen;
