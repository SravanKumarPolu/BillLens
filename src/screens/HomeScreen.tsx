import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card, Button, InsightsCard } from '../components';
import { useGroups } from '../context/GroupsContext';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../utils/formatMoney';
import { generateInsights } from '../utils/insightsService';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { getAllGroupSummaries, getGroupSummary, getGroupInsights } = useGroups();
  const { user, syncData, isSyncing, lastSyncDate } = useAuth();
  const { colors } = useTheme();
  const groupSummaries = getAllGroupSummaries() || [];

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

  const handleProfilePress = () => {
    if (user) {
      // Show sync menu or profile
      navigation.navigate('BackupRestore');
    } else {
      // Show login option
      navigation.navigate('Login');
    }
  };

  const handleSync = async () => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }
    
    try {
      await syncData();
    } catch (error) {
      // Error handling in syncData
    }
  };

  const styles = createStyles(colors);

  const renderGroup = ({ item }: { item: typeof groupSummaries[0] }) => (
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>BillLens</Text>
        <TouchableOpacity 
          onPress={handleProfilePress}
          style={styles.profileButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.profile}>
            {user ? (isSyncing ? '🔄' : '☁️') : '☁️'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      {groupSummaries.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.summaryCardsContainer}
        >
          <Card style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
            <Text style={[styles.summaryLabel, { color: colors.white }]}>Monthly Total</Text>
            <Text style={[styles.summaryValue, { color: colors.white }]}>
              {formatMoney(monthlyTotal)}
            </Text>
          </Card>
          
          <Card style={[styles.summaryCard, { 
            backgroundColor: pendingAmount > 0 ? colors.warning : colors.success 
          }]}>
            <Text style={[styles.summaryLabel, { color: colors.white }]}>Pending</Text>
            <Text style={[styles.summaryValue, { color: colors.white }]}>
              {formatMoney(pendingAmount)}
            </Text>
          </Card>
        </ScrollView>
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
              const groupSummary = groupSummaries.find(summary => {
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

      {groupSummaries.length > 0 && (
        <Button
          title="+ New group"
          onPress={() => navigation.navigate('CreateGroup')}
          variant="secondary"
          fullWidth={false}
          style={styles.newGroupButton}
        />
      )}

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
  appName: {
    ...typography.display,
  },
  profileButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profile: {
    fontSize: 24, // Emoji icon, not typography
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
    fontWeight: '700',
  },
  insightsSection: {
    paddingHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
  },
  sectionTitle: {
    ...typography.label,
    paddingHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
    fontWeight: '600',
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
  newGroupButton: {
    marginHorizontal: 24,
    marginTop: recommendedSpacing.loose,
  },
  fab: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
  },
});

export default HomeScreen;
