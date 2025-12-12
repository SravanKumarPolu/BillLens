import React, { useMemo, useEffect, useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView, BackHandler, Animated, Platform, Dimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card, Button, InsightsCard, NotificationBadge, BackButton } from '../components';
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
  const backButtonScale = useRef(new Animated.Value(1)).current;
  const backButtonOpacity = useRef(new Animated.Value(0)).current;
  const canGoBack = navigation.canGoBack();
  
  // Track scroll positions for pagination dots
  const [summaryCardIndex, setSummaryCardIndex] = useState(0);
  const [groupTotalsIndex, setGroupTotalsIndex] = useState(0);
  const summaryScrollViewRef = useRef<ScrollView>(null);
  const groupTotalsScrollViewRef = useRef<ScrollView>(null);
  const allGroupSummaries = getAllGroupSummaries() || [];
  // Separate groups and friends
  const groupSummaries = allGroupSummaries.filter(summary => summary.group.type !== 'friend');
  const friends = getFriends();
  const friendSummaries = friends.map(friend => getFriendSummary(friend.id)).filter((s): s is typeof s => s !== null);

  // Animate back button appearance
  useEffect(() => {
    if (canGoBack) {
      Animated.parallel([
        Animated.timing(backButtonOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(backButtonScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 300,
        }),
      ]).start();
    } else {
      Animated.timing(backButtonOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [canGoBack, backButtonOpacity, backButtonScale]);

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

  // Back button press animation
  const handleBackPressIn = useCallback(() => {
    Animated.spring(backButtonScale, {
      toValue: 0.92,
      useNativeDriver: true,
      damping: 15,
      stiffness: 400,
    }).start();
  }, [backButtonScale]);

  const handleBackPressOut = useCallback(() => {
    Animated.spring(backButtonScale, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 400,
    }).start();
  }, [backButtonScale]);

  const handleBackPress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
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

  // Calculate snap offsets for summary cards (4 cards: Today, This Month, Pending, Money Health)
  const summaryCardSnapOffsets = useMemo(() => {
    const cardWidth = 150;
    const gap = 12;
    const paddingLeft = 20;
    const offsets: number[] = [];
    
    // Calculate offset for each card
    for (let i = 0; i < 4; i++) {
      offsets.push(paddingLeft + i * (cardWidth + gap));
    }
    return offsets;
  }, []);

  // Calculate snap offsets for group totals cards
  const groupTotalsSnapOffsets = useMemo(() => {
    const cardWidth = 160;
    const gap = 12;
    const paddingLeft = 20;
    const offsets: number[] = [];
    
    // Calculate offset for each group card
    for (let i = 0; i < groupSummaries.length; i++) {
      offsets.push(paddingLeft + i * (cardWidth + gap));
    }
    return offsets;
  }, [groupSummaries.length]);

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

  // Modern Action Buttons Component with animations
  const ModernActionButtons: React.FC<{
    onNewGroup: () => void;
    onAddFriend: () => void;
    colors: any;
  }> = ({ onNewGroup, onAddFriend, colors }) => {
    const newGroupScale = useRef(new Animated.Value(1)).current;
    const addFriendScale = useRef(new Animated.Value(1)).current;

    const handlePressIn = (scaleAnim: Animated.Value) => {
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        damping: 15,
        stiffness: 400,
      }).start();
    };

    const handlePressOut = (scaleAnim: Animated.Value) => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 400,
      }).start();
    };

    return (
      <View style={styles.actionButtonsRow}>
        <Animated.View style={{ flex: 1, transform: [{ scale: newGroupScale }] }}>
          <TouchableOpacity
            style={[styles.modernActionButton, { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle }]}
            onPress={onNewGroup}
            onPressIn={() => handlePressIn(newGroupScale)}
            onPressOut={() => handlePressOut(newGroupScale)}
            activeOpacity={1}
          >
            <Text style={styles.modernActionButtonIcon}>➕</Text>
            <Text style={[styles.modernActionButtonText, { color: colors.textPrimary }]}>New group</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={{ flex: 1, transform: [{ scale: addFriendScale }] }}>
          <TouchableOpacity
            style={[styles.modernActionButton, { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle }]}
            onPress={onAddFriend}
            onPressIn={() => handlePressIn(addFriendScale)}
            onPressOut={() => handlePressOut(addFriendScale)}
            activeOpacity={1}
          >
            <Text style={styles.modernActionButtonIcon}>👤</Text>
            <Text style={[styles.modernActionButtonText, { color: colors.textPrimary }]}>Add friend</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

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
      {/* Main ScrollView for vertical scrolling */}
      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        scrollEventThrottle={16}
      >
      {/* Sync Status Indicator */}
      {isSyncing && (
        <View style={[styles.syncIndicator, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.syncText, { color: colors.primary }]}>
            🔄 Syncing... {syncStatus.syncProgress > 0 ? `${syncStatus.syncProgress}%` : ''}
          </Text>
        </View>
      )}
      {!isSyncing && user && syncStatus.pendingChanges > 0 && (
        <View style={[styles.syncIndicator, { backgroundColor: colors.warning + '20' }]}>
          <Text style={[styles.syncText, { color: colors.warning }]}>
            ⚠️ {syncStatus.pendingChanges} pending change{syncStatus.pendingChanges > 1 ? 's' : ''}
          </Text>
        </View>
      )}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {canGoBack && (
            <BackButton 
              onPress={handleBackPress}
              style={styles.backButtonContainer}
            />
          )}
        <Text style={[styles.appName, { color: colors.textPrimary }]}>BillLens</Text>
        </View>
        <View style={styles.headerRight}>
        <TouchableOpacity 
          onPress={() => navigation.navigate('Search')}
            style={styles.headerIconButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Search expenses and groups"
          accessibilityRole="button"
          accessibilityHint="Opens the search screen to find expenses and groups"
        >
            <Text style={styles.headerIcon}>🔍</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => navigation.navigate('Notifications')}
            style={styles.headerIconButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={notificationsCount > 0 ? `Notifications, ${notificationsCount} unread` : 'Notifications'}
          accessibilityRole="button"
          accessibilityHint="Opens notifications screen"
        >
            <Text style={styles.headerIcon}>🔔</Text>
          <NotificationBadge count={notificationsCount} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleProfilePress}
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={user ? (isSyncing ? 'Profile, syncing' : 'Profile, synced') : 'Profile, sign in'}
            accessibilityRole="button"
            accessibilityHint={user ? "Opens backup and sync settings" : "Opens sign in screen"}
          >
            <Text style={styles.headerIcon}>
              {user ? (isSyncing ? '🔄' : '☁️') : '☁️'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Enhanced Dashboard */}
      {groupSummaries.length > 0 && (
        <View style={styles.summaryCardsWrapper}>
          <View style={styles.scrollContainer}>
            {/* Left fade indicator */}
            {summaryCardIndex > 0 && (
              <View 
                style={[
                  styles.edgeFade,
                  styles.leftFade,
                  { backgroundColor: colors.surfaceLight },
                ]} 
                pointerEvents="none"
              />
            )}
            
            <ScrollView 
              ref={summaryScrollViewRef}
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.summaryCardsContainer}
              style={styles.summaryCardsScrollView}
              nestedScrollEnabled={true}
              bounces={true}
              alwaysBounceHorizontal={true}
              pagingEnabled={false}
              snapToOffsets={summaryCardSnapOffsets}
              decelerationRate={0.9}
              disableIntervalMomentum={false}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const cardWidth = 150;
                const gap = 12;
                const paddingLeft = 20;
                const index = Math.round((offsetX - paddingLeft) / (cardWidth + gap));
                setSummaryCardIndex(Math.max(0, Math.min(3, index)));
              }}
              onScroll={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const cardWidth = 150;
                const gap = 12;
                const paddingLeft = 20;
                const index = Math.round((offsetX - paddingLeft) / (cardWidth + gap));
                setSummaryCardIndex(Math.max(0, Math.min(3, index)));
              }}
            >
              <Card key="summary-today" style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
                <Text style={[styles.summaryLabel, { color: colors.white }]}>Today</Text>
                <Text style={[styles.summaryValue, { color: colors.white }]}>
                  {formatMoney(dashboardStats.totalSpentToday)}
                </Text>
              </Card>
              
              <Card key="summary-month" style={[styles.summaryCard, { backgroundColor: colors.accent }]}>
                <Text style={[styles.summaryLabel, { color: colors.white }]}>This Month</Text>
                <Text style={[styles.summaryValue, { color: colors.white }]}>
                  {formatMoney(dashboardStats.totalSpentThisMonth)}
                </Text>
              </Card>
              
              <Card key="summary-pending" style={[styles.summaryCard, { 
                backgroundColor: dashboardStats.pendingAmount > 0 ? colors.warning : colors.success 
              }]}>
                <Text style={[styles.summaryLabel, { color: colors.white }]}>Pending</Text>
                <Text style={[styles.summaryValue, { color: colors.white }]}>
                  {formatMoney(dashboardStats.pendingAmount)}
                </Text>
              </Card>

              <Card key="summary-health" style={[styles.summaryCard, { 
                backgroundColor: dashboardStats.moneyHealthScore >= 80 ? colors.success :
                                  dashboardStats.moneyHealthScore >= 60 ? colors.warning : colors.error
              }]}>
                <Text style={[styles.summaryLabel, { color: colors.white }]}>Money Health</Text>
                <Text style={[styles.summaryValue, { color: colors.white }]}>
                  {dashboardStats.moneyHealthScore}/100
                </Text>
              </Card>
            </ScrollView>
            
            {/* Right fade indicator */}
            {summaryCardIndex < 3 && (
              <View 
                style={[
                  styles.edgeFade,
                  styles.rightFade,
                  { backgroundColor: colors.surfaceLight },
                ]} 
                pointerEvents="none"
              />
            )}
          </View>
          
          {/* Pagination Dots */}
          <View style={styles.paginationContainer}>
            {[0, 1, 2, 3].map((index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  const cardWidth = 150;
                  const gap = 12;
                  const paddingLeft = 20;
                  const offset = paddingLeft + index * (cardWidth + gap);
                  summaryScrollViewRef.current?.scrollTo({ x: offset, animated: true });
                }}
                accessibilityLabel={`Summary card ${index + 1} of 4`}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <View
                  style={[
                    styles.paginationDot,
                    {
                      backgroundColor: summaryCardIndex === index ? colors.primary : colors.borderSubtle,
                      width: summaryCardIndex === index ? 24 : 12,
                      height: 12,
                      opacity: summaryCardIndex === index ? 1 : 0.4,
                    }
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Daily Insights - Only show if we have insights and no top insights section */}
      {dashboardStats.dailyInsights.length > 0 && topInsights.length === 0 && (
        <View style={styles.insightsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Insights</Text>
          {dashboardStats.dailyInsights.slice(0, 2).map((insight, index) => (
            <Card key={`daily-insight-${index}-${insight.type}`} style={styles.insightCard} elevated>
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

      {/* Group-wise Totals Section with Tabs */}
      {groupSummaries.length > 0 && (
        <View style={styles.groupTotalsSection}>
          <Text style={[styles.sectionTitle, styles.groupTotalsTitle, { color: colors.textPrimary }]}>Group-wise Totals</Text>
          {groupSummaries.length > 1 ? (
            <View style={styles.groupTotalsScrollWrapper}>
              <View style={styles.scrollContainer}>
                {/* Left fade indicator */}
                {groupTotalsIndex > 0 && (
                  <View 
                    style={[
                      styles.edgeFade,
                      styles.leftFade,
                      { backgroundColor: colors.surfaceLight },
                    ]} 
                    pointerEvents="none"
                  />
                )}
                
                <ScrollView 
                  ref={groupTotalsScrollViewRef}
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.groupTotalsContainer}
                  style={styles.groupTotalsScrollView}
                  nestedScrollEnabled={true}
                  bounces={true}
                  alwaysBounceHorizontal={true}
                  pagingEnabled={false}
                  snapToOffsets={groupTotalsSnapOffsets}
                  decelerationRate={0.9}
                  disableIntervalMomentum={false}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={(e) => {
                    const offsetX = e.nativeEvent.contentOffset.x;
                    const cardWidth = 160;
                    const gap = 12;
                    const paddingLeft = 20;
                    const index = Math.round((offsetX - paddingLeft) / (cardWidth + gap));
                    setGroupTotalsIndex(Math.max(0, Math.min(groupSummaries.length - 1, index)));
                  }}
                  onScroll={(e) => {
                    const offsetX = e.nativeEvent.contentOffset.x;
                    const cardWidth = 160;
                    const gap = 12;
                    const paddingLeft = 20;
                    const index = Math.round((offsetX - paddingLeft) / (cardWidth + gap));
                    setGroupTotalsIndex(Math.max(0, Math.min(groupSummaries.length - 1, index)));
                  }}
                >
              {groupSummaries.map((summary, index) => {
              const now = new Date();
              const currentMonth = now.getMonth();
              const currentYear = now.getFullYear();
              const monthTotal = summary.expenses
                .filter(e => {
                  const date = new Date(e.date);
                  return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
                })
                .reduce((sum, e) => sum + e.amount, 0);
              
                // Color palette for tabs
                const tabColors = [colors.primary, colors.accent, colors.accentAmber, colors.info];
                const tabColor = tabColors[index % tabColors.length];
                
              return (
                <Card 
                  key={summary.group.id}
                  onPress={() => navigation.navigate('Analytics', { groupId: summary.group.id })}
                    style={[styles.groupTotalCard, { 
                      borderTopWidth: 4, 
                      borderTopColor: tabColor,
                      marginTop: 0,
                    }]}
                  elevated
                >
                    <View style={styles.groupTotalHeader}>
                  <Text style={styles.groupTotalEmoji}>{summary.group.emoji}</Text>
                  <Text style={[styles.groupTotalName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {summary.group.name}
                  </Text>
                    </View>
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
                
                {/* Right fade indicator */}
                {groupTotalsIndex < groupSummaries.length - 1 && (
                  <View 
                    style={[
                      styles.edgeFade,
                      styles.rightFade,
                      { backgroundColor: colors.surfaceLight },
                    ]} 
                    pointerEvents="none"
                  />
                )}
              </View>
              
              {/* Pagination Dots */}
              {groupSummaries.length > 1 && (
                <View style={styles.paginationContainer}>
                  {groupSummaries.map((_, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => {
                        const cardWidth = 160;
                        const gap = 12;
                        const paddingLeft = 20;
                        const offset = paddingLeft + index * (cardWidth + gap);
                        groupTotalsScrollViewRef.current?.scrollTo({ x: offset, animated: true });
                      }}
                      accessibilityLabel={`Group ${index + 1} of ${groupSummaries.length}`}
                      accessibilityRole="button"
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <View
                        style={[
                          styles.paginationDot,
                          {
                            backgroundColor: groupTotalsIndex === index ? colors.primary : colors.borderSubtle,
                            width: groupTotalsIndex === index ? 24 : 12,
                            height: 12,
                            opacity: groupTotalsIndex === index ? 1 : 0.4,
                          }
                        ]}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ) : groupSummaries.length === 1 ? (
            // Show single group total card when only one group
            <View style={styles.groupTotalsScrollWrapper}>
              <View style={styles.groupTotalsContainer}>
                {(() => {
                  const summary = groupSummaries[0];
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
                      style={[styles.groupTotalCard, { 
                        borderTopWidth: 4, 
                        borderTopColor: colors.primary,
                        marginTop: 0,
                      }]}
                      elevated
                    >
                      <View style={styles.groupTotalHeader}>
                        <Text style={styles.groupTotalEmoji}>{summary.group.emoji}</Text>
                        <Text style={[styles.groupTotalName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {summary.group.name}
                        </Text>
                      </View>
                      <Text style={[styles.groupTotalAmount, { color: colors.textPrimary }]}>
                        {formatMoney(monthTotal)}
                      </Text>
                      <Text style={[styles.groupTotalLabel, { color: colors.textSecondary }]}>
                        this month
                      </Text>
                    </Card>
                  );
                })()}
              </View>
            </View>
          ) : null}
        </View>
      )}

      {/* Insights Preview - Always show when there are groups, InsightsCard handles empty state */}
      {groupSummaries.length > 0 && (
        <View style={styles.insightsSection}>
          <InsightsCard
            insights={topInsights || []}
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
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Friends</Text>
          <View style={styles.groupsList}>
            {friendSummaries.map((item) => {
              if (!item) return null;
              return (
                <Card
                  key={item.group.id}
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
            })}
          </View>
        </>
      )}

      <View style={styles.yourGroupsSection}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your groups</Text>
      </View>

      {groupSummaries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🏠</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No groups yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Create your first group to start splitting expenses
          </Text>
        </View>
      ) : (
        <View style={styles.groupsList}>
          {groupSummaries.map((item) => React.cloneElement(renderGroup({ item }), { key: item.group.id }))}
        </View>
      )}

      {(groupSummaries.length > 0 || friendSummaries.length > 0) && (
        <ModernActionButtons
          onNewGroup={() => navigation.navigate('CreateGroup')}
          onAddFriend={() => navigation.navigate('CreateGroup', { suggestedType: 'friend' })}
          colors={colors}
          />
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
      </ScrollView>

      {/* Fixed FAB Button - Positioned absolutely to avoid overlap */}
      <View style={styles.fabContainer}>
      <Button
        title="📷 Add from screenshot"
        onPress={() => navigation.navigate('CaptureOptions', {})}
        variant="primary"
        style={styles.fab}
      />
      </View>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
  },
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 160, // Extra space for FAB button and safe area
    flexGrow: 1,
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
  summaryCardsWrapper: {
    marginBottom: recommendedSpacing.comfortable,
  },
  summaryCardsScroll: {
    marginBottom: recommendedSpacing.comfortable,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: recommendedSpacing.comfortable,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonContainer: {
    marginRight: 12,
  },
  appName: {
    ...typography.display,
    ...typography.emphasis.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerIcon: {
    fontSize: 22,
  },
  summaryCardsScrollView: {
    marginHorizontal: 0,
  },
  summaryCardsContainer: {
    paddingLeft: 20, // Reduced to show peek of next card
    paddingRight: 20, // Reduced to show peek of next card
    paddingBottom: recommendedSpacing.comfortable,
    gap: 12,
    alignItems: 'flex-start', // Align cards to top
  },
  scrollContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  edgeFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 30,
    zIndex: 1,
  },
  leftFade: {
    left: 0,
    opacity: 0.7,
  },
  rightFade: {
    right: 0,
    opacity: 0.7,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  paginationDot: {
    height: 12,
    borderRadius: 6,
  },
  summaryCard: {
    width: 150, // Fixed width for consistent sizing and snap calculation
    padding: 18,
    marginRight: 0, // Gap handles spacing
    borderRadius: 16,
    flexShrink: 0, // Prevent cards from shrinking
  },
  summaryLabel: {
    ...typography.caption,
    ...typography.emphasis.medium,
    opacity: 0.95,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  summaryValue: {
    ...typography.h2,
    ...typography.emphasis.bold,
    letterSpacing: -0.5,
  },
  insightsSection: {
    marginBottom: recommendedSpacing.comfortable,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    ...typography.h4,
    ...typography.emphasis.semibold,
    paddingHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
    marginTop: recommendedSpacing.default,
  },
  groupTotalsTitle: {
    marginBottom: 20, // Extra spacing to prevent overlap with colored borders
  },
  groupsList: {
    paddingHorizontal: 0,
    paddingTop: recommendedSpacing.default,
    paddingBottom: recommendedSpacing.loose,
  },
  groupCard: {
    marginBottom: recommendedSpacing.comfortable,
    padding: recommendedSpacing.loose,
    marginHorizontal: 24,
  },
  groupContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupEmoji: {
    fontSize: 36, // Emoji icon, not typography
    marginRight: recommendedSpacing.comfortable,
  },
  groupTextWrapper: {
    flex: 1,
  },
  groupName: {
    ...typography.h4,
    ...typography.emphasis.semibold,
    marginBottom: recommendedSpacing.tight,
  },
  groupSummary: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 80,
    paddingBottom: 40,
  },
  emptyEmoji: {
    fontSize: 72, // Emoji icon, not typography
    marginBottom: recommendedSpacing.loose,
  },
  emptyTitle: {
    ...typography.h3,
    ...typography.emphasis.bold,
    marginBottom: recommendedSpacing.default,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  yourGroupsSection: {
    marginTop: recommendedSpacing.default,
    marginBottom: recommendedSpacing.comfortable,
    paddingTop: recommendedSpacing.default,
    paddingBottom: recommendedSpacing.tight,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginTop: recommendedSpacing.default,
    marginBottom: recommendedSpacing.loose,
    gap: 12,
  },
  modernActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    minHeight: 56, // Better touch target
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modernActionButtonIcon: {
    fontSize: 22,
    marginRight: 10,
    lineHeight: 22,
  },
  modernActionButtonText: {
    ...typography.body,
    ...typography.emphasis.semibold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  fabContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    paddingTop: 12,
    backgroundColor: colors.surfaceLight,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  fab: {
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  personalSpendingCard: {
    marginHorizontal: 24,
    marginTop: recommendedSpacing.default,
    marginBottom: recommendedSpacing.loose,
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
    padding: 16,
    marginHorizontal: 24,
    overflow: 'visible',
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
    overflow: 'visible',
  },
  chartCard: {
    padding: 16,
    overflow: 'visible',
  },
  topGroupCard: {
    marginHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
    padding: 16,
    overflow: 'visible',
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
  groupTotalsSection: {
    marginBottom: recommendedSpacing.comfortable,
  },
  groupTotalsScrollWrapper: {
    marginTop: 0, // No additional margin needed since title has marginBottom
  },
  groupTotalsScrollView: {
    marginHorizontal: 0,
  },
  groupTotalsContainer: {
    paddingLeft: 20, // Reduced to show peek of next card
    paddingRight: 20, // Reduced to show peek of next card
    paddingTop: 0,
    gap: 12,
    paddingBottom: 8,
  },
  groupTotalCard: {
    width: 160, // Fixed width for consistent sizing and snap calculation
    padding: 16,
    paddingTop: 14,
    alignItems: 'flex-start',
    marginTop: 0,
    marginBottom: 0,
    marginRight: 0, // Gap handles spacing
    flexShrink: 0, // Prevent cards from shrinking
  },
  groupTotalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  groupTotalEmoji: {
    fontSize: 24,
    marginRight: 8,
  },
  groupTotalName: {
    ...typography.body,
    ...typography.emphasis.semibold,
    flex: 1,
  },
  groupTotalAmount: {
    ...typography.h3,
    ...typography.emphasis.bold,
    marginBottom: 4,
    marginTop: 4,
  },
  groupTotalLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  emptyInsightCard: {
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 24,
    overflow: 'visible',
  },
  emptyInsightText: {
    ...typography.body,
    textAlign: 'center',
  },
});

export default HomeScreen;
