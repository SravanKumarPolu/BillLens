import React, { useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView, BackHandler } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card, Button, InsightsCard, NotificationBadge } from '../components';
import { useGroups } from '../context/GroupsContext';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../utils/formatMoney';
import { generateInsights } from '../utils/insightsService';
import { getPendingNotifications } from '../utils/notificationService';
import { calculateDashboardStats } from '../utils/dashboardService';
import { BarChart } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { getAllGroupSummaries, getGroupSummary, getGroupInsights, getGroup, getGroupsExcludingType, getFriends, getFriendSummary, getRecurringExpensesForGroup } = useGroups();
  const { user, syncData, isSyncing, lastSyncDate, syncStatus } = useAuth();
  const { colors, theme, toggleTheme } = useTheme();
  const allGroupSummaries = getAllGroupSummaries() || [];
  // Separate groups and friends
  const groupSummaries = allGroupSummaries.filter(summary => summary.group.type !== 'friend');
  const friends = getFriends();
  const friendSummaries = friends.map(friend => getFriendSummary(friend.id)).filter((s): s is typeof s => s !== null);

  // Handle Android hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Check if we can go back in the navigation stack
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true; // Prevent default back behavior
      }
      // If no back history, allow default behavior (exit app or go to system home)
      return false;
    });

    return () => backHandler.remove();
  }, [navigation]);

  // Calculate today's total
  const todayTotal = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return groupSummaries.reduce((total, summary) => {
      const todayExpenses = summary.expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= today;
      });
      return total + todayExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    }, 0);
  }, [groupSummaries]);

  // Calculate monthly total across all groups
  const monthlyTotal = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return groupSummaries.reduce((total, summary) => {
      const monthExpenses = summary.expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return (
          expenseDate.getMonth() === currentMonth &&
          expenseDate.getFullYear() === currentYear
        );
      });
      return total + monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    }, 0);
  }, [groupSummaries]);

  // Calculate total pending amount (what user owes or is owed)
  const pendingAmount = useMemo(() => {
    return groupSummaries.reduce((total, summary) => {
      const userBalance = summary.balances.find(b => b.memberId === 'you')?.balance || 0;
      // If user owes money (negative balance), add to pending
      // If user is owed money (positive balance), it's not "pending" for them to pay
      return total + (userBalance < 0 ? Math.abs(userBalance) : 0);
    }, 0);
  }, [groupSummaries]);

  // Get notifications count
  const notificationsCount = useMemo(() => {
    let count = 0;
    groupSummaries.forEach(summary => {
      const group = getGroup(summary.group.id);
      if (!group) return;
      const recurringExpenses = getRecurringExpensesForGroup(summary.group.id);
      const notifications = getPendingNotifications(
        summary.group.id,
        group,
        summary.expenses,
        summary.balances,
        undefined,
        {
          settleReminders: true,
          rentReminders: true,
          expenseNotifications: false,
          expenseEditNotifications: false,
          expenseDeleteNotifications: false,
          commentNotifications: false,
          settlementNotifications: false,
          recurringExpenseNotifications: true, // Enable recurring expense reminders
          imbalanceAlerts: true,
          monthEndReports: true,
          upiReminders: true,
          priorityReminders: true,
          reminderFrequency: 'weekly',
        },
        recurringExpenses
      );
      count += notifications.length;
    });
    return count;
  }, [groupSummaries, getGroup]);

  // Calculate dashboard stats
  const dashboardStats = useMemo(() => {
    return calculateDashboardStats(groupSummaries);
  }, [groupSummaries]);

  // Get top insights across all groups
  const topInsights = useMemo(() => {
    const allInsights: Array<{ insight: any; groupId: string; groupName: string }> = [];
    
    groupSummaries.forEach(summary => {
      const insights = getGroupInsights(summary.group.id);
      insights.forEach(insight => {
        allInsights.push({
          insight,
          groupId: summary.group.id,
          groupName: summary.group.name,
        });
      });
    });

    // Sort by priority/severity and take top 3
    return allInsights
      .sort((a, b) => {
        // Prioritize warnings and mistakes
        if (a.insight.type === 'warning' && b.insight.type !== 'warning') return -1;
        if (a.insight.type !== 'warning' && b.insight.type === 'warning') return 1;
        if (a.insight.type === 'mistake' && b.insight.type !== 'mistake') return -1;
        if (a.insight.type !== 'mistake' && b.insight.type === 'mistake') return 1;
        return 0;
      })
      .slice(0, 3)
      .map(item => item.insight);
  }, [groupSummaries, getGroupInsights]);

  const handleProfilePress = useCallback(() => {
    if (user) {
      // Show sync menu or profile
      navigation.navigate('BackupRestore');
    } else {
      // Show login option
      navigation.navigate('Login');
    }
  }, [user, navigation]);

  const handleSync = useCallback(async () => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }
    
    try {
      await syncData();
    } catch (error) {
      // Error handling in syncData
    }
  }, [user, navigation, syncData]);

  const styles = createStyles(colors);

  const renderGroup = useCallback(({ item }: { item: typeof groupSummaries[0] }) => (
    <Card
      onPress={() => navigation.navigate('GroupDetail', { groupId: item.group.id })}
      style={styles.groupCard}
      elevated
    >
      <View style={styles.groupContent}>
        <Text style={styles.groupEmoji}>{item.group.emoji}</Text>
        <View style={styles.groupTextWrapper}>
          <Text style={[styles.groupName, { color: colors.textPrimary }]}>{item.group.name}</Text>
          <Text style={[styles.groupSummary, { color: colors.textSecondary }]}>{item.summaryText}</Text>
        </View>
      </View>
    </Card>
  ), [navigation, colors]);

  return (
    <View style={styles.container}>
      {/* Sync Status Indicator */}
      {isSyncing && (
        <View style={[styles.syncIndicator, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.syncText, { color: colors.primary }]}>
            🔄 Syncing... {syncStatus.syncProgress > 0 ? `${syncStatus.syncProgress}%` : ''}
          </Text>
        </View>
      )}
      {!isSyncing && syncStatus.pendingChanges > 0 && (
        <View style={[styles.syncIndicator, { backgroundColor: colors.warning + '20' }]}>
          <Text style={[styles.syncText, { color: colors.warning }]}>
            ⚠️ {syncStatus.pendingChanges} pending change{syncStatus.pendingChanges > 1 ? 's' : ''}
          </Text>
        </View>
      )}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            // Go back to DefaultGroupSetup screen (previous step in onboarding)
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              // If no back history, navigate to DefaultGroupSetup
              navigation.navigate('DefaultGroupSetup');
            }
          }} 
          style={styles.backButton}
        >
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>BillLens</Text>
        <TouchableOpacity 
          onPress={() => navigation.navigate('Search')}
          style={styles.searchButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.searchIcon}>🔍</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => navigation.navigate('Notifications')}
          style={styles.notificationButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.notificationIcon}>🔔</Text>
          <NotificationBadge count={notificationsCount} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('SMSSettings')}
            style={styles.settingsButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.settingsIcon}>📱</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => navigation.navigate('Achievements')}
            style={styles.achievementsButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.achievementsIcon}>🏆</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleProfilePress}
            style={styles.profileButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.profile}>
              {user ? (isSyncing ? '🔄' : '☁️') : '☁️'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={toggleTheme}
            style={styles.themeToggleButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.themeToggleIcon}>
              {theme === 'dark' ? '🌙' : '☀️'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Enhanced Dashboard */}
      {groupSummaries.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.summaryCardsContainer}
        >
          <Card style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
            <Text style={[styles.summaryLabel, { color: colors.white }]}>Today</Text>
            <Text style={[styles.summaryValue, { color: colors.white }]}>
              {formatMoney(dashboardStats.totalSpentToday)}
            </Text>
          </Card>
          
          <Card style={[styles.summaryCard, { backgroundColor: colors.accent }]}>
            <Text style={[styles.summaryLabel, { color: colors.white }]}>This Month</Text>
            <Text style={[styles.summaryValue, { color: colors.white }]}>
              {formatMoney(dashboardStats.totalSpentThisMonth)}
            </Text>
          </Card>
          
          <Card style={[styles.summaryCard, { 
            backgroundColor: dashboardStats.pendingAmount > 0 ? colors.warning : colors.success 
          }]}>
            <Text style={[styles.summaryLabel, { color: colors.white }]}>Pending</Text>
            <Text style={[styles.summaryValue, { color: colors.white }]}>
              {formatMoney(dashboardStats.pendingAmount)}
            </Text>
          </Card>

          <Card style={[styles.summaryCard, { 
            backgroundColor: dashboardStats.moneyHealthScore >= 80 ? colors.success :
                              dashboardStats.moneyHealthScore >= 60 ? colors.warning : colors.error
          }]}>
            <Text style={[styles.summaryLabel, { color: colors.white }]}>Money Health</Text>
            <Text style={[styles.summaryValue, { color: colors.white }]}>
              {dashboardStats.moneyHealthScore}/100
            </Text>
          </Card>
        </ScrollView>
      )}

      {/* Daily Insights */}
      {dashboardStats.dailyInsights.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Today's Insights</Text>
          {dashboardStats.dailyInsights.slice(0, 2).map((insight, index) => (
            <Card key={index} style={styles.insightCard}>
              <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>
                {insight.title}
              </Text>
              <Text style={[styles.insightMessage, { color: colors.textSecondary }]}>
                {insight.message}
              </Text>
            </Card>
          ))}
        </View>
      )}

      {/* Category Breakdown */}
      {dashboardStats.categoryBreakdown.length > 0 && (
        <View style={styles.categorySection}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Spending by Category</Text>
          <Card style={styles.chartCard}>
            <BarChart
              data={dashboardStats.categoryBreakdown.slice(0, 5).map(cat => ({
                label: cat.category,
                value: cat.amount,
              }))}
              currency="INR"
              showValues={true}
            />
          </Card>
        </View>
      )}

      {/* Top Spending Group */}
      {dashboardStats.topSpendingGroup.amount > 0 && (
        <Card style={styles.topGroupCard}>
          <Text style={[styles.topGroupLabel, { color: colors.textSecondary }]}>
            You spend most with
          </Text>
          <View style={styles.topGroupRow}>
            <Text style={styles.topGroupEmoji}>{dashboardStats.topSpendingGroup.group.emoji}</Text>
            <View style={styles.topGroupInfo}>
              <Text style={[styles.topGroupName, { color: colors.textPrimary }]}>
                {dashboardStats.topSpendingGroup.group.name}
              </Text>
              <Text style={[styles.topGroupAmount, { color: colors.textSecondary }]}>
                {formatMoney(dashboardStats.topSpendingGroup.amount)} ({dashboardStats.topSpendingGroup.percentage.toFixed(0)}%)
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Group-wise Totals Section */}
      {groupSummaries.length > 1 && (
        <View style={styles.insightsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Group-wise Totals</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupTotalsContainer}
          >
            {groupSummaries.map(summary => {
              const now = new Date();
              const currentMonth = now.getMonth();
              const currentYear = now.getFullYear();
              const monthTotal = summary.expenses
                .filter(e => {
                  const date = new Date(e.date);
                  return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
                })
                .reduce((sum, e) => sum + e.amount, 0);
              
              return (
                <Card 
                  key={summary.group.id}
                  onPress={() => navigation.navigate('Analytics', { groupId: summary.group.id })}
                  style={styles.groupTotalCard}
                  elevated
                >
                  <Text style={styles.groupTotalEmoji}>{summary.group.emoji}</Text>
                  <Text style={[styles.groupTotalName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {summary.group.name}
                  </Text>
                  <Text style={[styles.groupTotalAmount, { color: colors.textPrimary }]}>
                    {formatMoney(monthTotal)}
                  </Text>
                  <Text style={[styles.groupTotalLabel, { color: colors.textSecondary }]}>
                    this month
                  </Text>
                </Card>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Insights Preview */}
      {topInsights.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Insights</Text>
          <InsightsCard
            insights={topInsights}
            maxVisible={3}
            onInsightPress={(insight) => {
              // Find the group for this insight and navigate
              const groupSummary = allGroupSummaries.find(summary => {
                const groupInsights = getGroupInsights(summary.group.id);
                return groupInsights.some(i => i.id === insight.id);
              });
              if (groupSummary) {
                navigation.navigate('GroupDetail', { groupId: groupSummary.group.id });
              }
            }}
          />
        </View>
      )}

      {/* Friends Section */}
      {friendSummaries.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Friends</Text>
          <FlatList
            data={friendSummaries}
            keyExtractor={item => item?.group.id || ''}
            renderItem={({ item }) => {
              if (!item) return null;
              return (
                <Card
                  onPress={() => navigation.navigate('GroupDetail', { groupId: item.group.id })}
                  style={styles.groupCard}
                  elevated
                >
                  <View style={styles.groupContent}>
                    <Text style={styles.groupEmoji}>{item.group.emoji}</Text>
                    <View style={styles.groupTextWrapper}>
                      <Text style={[styles.groupName, { color: colors.textPrimary }]}>{item.group.name}</Text>
                      <Text style={[styles.groupSummary, { color: colors.textSecondary }]}>{item.summaryText}</Text>
                    </View>
                  </View>
                </Card>
              );
            }}
            contentContainerStyle={styles.groupsList}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Your groups</Text>

      {groupSummaries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🏠</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No groups yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Create your first group to start splitting expenses
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupSummaries}
          keyExtractor={item => item.group.id}
          renderItem={renderGroup}
          contentContainerStyle={styles.groupsList}
          showsVerticalScrollIndicator={false}
        />
      )}

      {(groupSummaries.length > 0 || friendSummaries.length > 0) && (
        <View style={styles.actionButtonsRow}>
          <Button
            title="+ New group"
            onPress={() => navigation.navigate('CreateGroup')}
            variant="secondary"
            fullWidth={false}
            style={styles.newGroupButton}
          />
          <Button
            title="+ Add friend"
            onPress={() => navigation.navigate('CreateGroup', { suggestedType: 'friend' })}
            variant="secondary"
            fullWidth={false}
            style={styles.newGroupButton}
          />
        </View>
      )}

      {/* Personal Spending Link */}
      <Card
        onPress={() => navigation.navigate('PersonalSpending')}
        style={styles.personalSpendingCard}
        elevated
      >
        <View style={styles.personalSpendingContent}>
          <Text style={styles.personalSpendingIcon}>📊</Text>
          <View style={styles.personalSpendingText}>
            <Text style={[styles.personalSpendingTitle, { color: colors.textPrimary }]}>
              Personal Spending Dashboard
            </Text>
            <Text style={[styles.personalSpendingSubtitle, { color: colors.textSecondary }]}>
              View your personal expenses, trends, and analytics
            </Text>
          </View>
          <Text style={[styles.personalSpendingArrow, { color: colors.primary }]}>→</Text>
        </View>
      </Card>

      <Button
        title="📷 Add from screenshot"
        onPress={() => navigation.navigate('CaptureOptions', {})}
        variant="primary"
        style={styles.fab}
      />
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
  },
  syncIndicator: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncText: {
    ...typography.bodySmall,
    ...typography.emphasis.medium,
  },
  summaryCardsScroll: {
    marginBottom: recommendedSpacing.comfortable,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: recommendedSpacing.loose,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    ...typography.navigation,
  },
  appName: {
    ...typography.display,
  },
  profileButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  searchIcon: {
    fontSize: 24, // Emoji icon, not typography
  },
  notificationButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    position: 'relative',
  },
  notificationIcon: {
    fontSize: 24, // Emoji icon, not typography
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    fontSize: 24, // Emoji icon, not typography
  },
  achievementsButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementsIcon: {
    fontSize: 24, // Emoji icon, not typography
  },
  profile: {
    fontSize: 24, // Emoji icon, not typography
  },
  themeToggleButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeToggleIcon: {
    fontSize: 20, // Emoji icon, not typography
  },
  summaryCardsContainer: {
    paddingHorizontal: 24,
    paddingBottom: recommendedSpacing.comfortable,
    gap: 12,
  },
  summaryCard: {
    minWidth: 140,
    padding: recommendedSpacing.loose,
    marginRight: 12,
  },
  summaryLabel: {
    ...typography.caption,
    opacity: 0.9,
    marginBottom: 4,
  },
  summaryValue: {
    ...typography.h3,
    ...typography.emphasis.bold,
  },
  insightsSection: {
    paddingHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
  },
  sectionTitle: {
    ...typography.label,
    ...typography.emphasis.semibold,
    paddingHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
  },
  groupsList: {
    paddingHorizontal: 24,
    paddingTop: recommendedSpacing.default,
  },
  groupCard: {
    marginBottom: recommendedSpacing.comfortable,
    padding: recommendedSpacing.loose,
  },
  groupContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupEmoji: {
    fontSize: 32, // Emoji icon, not typography
    marginRight: recommendedSpacing.comfortable,
  },
  groupTextWrapper: {
    flex: 1,
  },
  groupName: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  groupSummary: {
    ...typography.bodySmall,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 64, // Emoji icon, not typography
    marginBottom: recommendedSpacing.loose,
  },
  emptyTitle: {
    ...typography.h3,
    marginBottom: recommendedSpacing.default,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    textAlign: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginTop: recommendedSpacing.loose,
    gap: recommendedSpacing.comfortable,
  },
  newGroupButton: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
  },
  personalSpendingCard: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 80, // Space for FAB
    padding: 20,
  },
  personalSpendingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  personalSpendingIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  personalSpendingText: {
    flex: 1,
  },
  personalSpendingTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  personalSpendingSubtitle: {
    ...typography.bodySmall,
  },
  personalSpendingArrow: {
    ...typography.h3,
    marginLeft: 8,
  },
  insightCard: {
    marginBottom: 8,
    padding: 12,
  },
  insightTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  insightMessage: {
    ...typography.bodySmall,
  },
  categorySection: {
    paddingHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
  },
  chartCard: {
    padding: 16,
  },
  topGroupCard: {
    marginHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
    padding: 16,
  },
  topGroupLabel: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  topGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topGroupEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  topGroupInfo: {
    flex: 1,
  },
  topGroupName: {
    ...typography.h4,
    marginBottom: 4,
  },
  topGroupAmount: {
    ...typography.bodySmall,
  },
  groupTotalsContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  groupTotalCard: {
    minWidth: 140,
    padding: 16,
    alignItems: 'center',
  },
  groupTotalEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  groupTotalName: {
    ...typography.body,
    ...typography.emphasis.semibold,
    marginBottom: 4,
    textAlign: 'center',
  },
  groupTotalAmount: {
    ...typography.h3,
    ...typography.emphasis.bold,
    marginBottom: 2,
  },
  groupTotalLabel: {
    ...typography.caption,
  },
});

export default HomeScreen;
