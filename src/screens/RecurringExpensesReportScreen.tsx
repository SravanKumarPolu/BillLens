import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';
import { Card, BarChart, LineChart } from '../components';
import { RecurringExpense } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'RecurringExpensesReport'>;

const RecurringExpensesReportScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getGroup, getRecurringExpensesForGroup, getExpensesForGroup, calculateGroupBalances } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const group = getGroup(groupId);
  const recurringExpenses = getRecurringExpensesForGroup(groupId);
  const allExpenses = getExpensesForGroup(groupId);
  const balances = calculateGroupBalances(groupId);

  // Calculate recurring expense statistics
  const reportData = useMemo(() => {
    const activeRecurring = recurringExpenses.filter(re => re.isActive);
    const totalMonthly = activeRecurring.reduce((sum, re) => {
      if (re.frequency === 'monthly') return sum + re.amount;
      if (re.frequency === 'weekly') return sum + (re.amount * 4.33); // Approximate monthly
      if (re.frequency === 'yearly') return sum + (re.amount / 12);
      if (re.frequency === 'daily') return sum + (re.amount * 30);
      return sum;
    }, 0);

    // Group by category
    const categoryMap = new Map<string, { total: number; count: number; items: RecurringExpense[] }>();
    activeRecurring.forEach(re => {
      const existing = categoryMap.get(re.category) || { total: 0, count: 0, items: [] };
      const monthlyAmount = re.frequency === 'monthly' 
        ? re.amount 
        : re.frequency === 'weekly' 
        ? re.amount * 4.33 
        : re.frequency === 'yearly' 
        ? re.amount / 12 
        : re.amount * 30;
      categoryMap.set(re.category, {
        total: existing.total + monthlyAmount,
        count: existing.count + 1,
        items: [...existing.items, re],
      });
    });

    // Calculate upcoming expenses (next 3 months)
    const upcomingExpenses = activeRecurring
      .filter(re => {
        const nextDue = new Date(re.nextDueDate);
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
        return nextDue <= threeMonthsFromNow;
      })
      .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());

    // Monthly projection for next 6 months
    const monthlyProjections = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() + i, 1);
      let monthTotal = 0;
      
      activeRecurring.forEach(re => {
        const nextDue = new Date(re.nextDueDate);
        const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        
        // Check if this recurring expense falls in this month
        if (nextDue >= monthStart && nextDue <= monthEnd) {
          monthTotal += re.amount;
        }
        
        // For monthly expenses, add if they've started
        if (re.frequency === 'monthly' && nextDue <= monthEnd) {
          const startDate = new Date(re.startDate);
          if (startDate <= monthEnd) {
            monthTotal += re.amount;
          }
        }
      });
      
      monthlyProjections.push({
        month: month.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        amount: monthTotal,
      });
    }

    return {
      totalMonthly,
      activeCount: activeRecurring.length,
      categoryBreakdown: Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        total: data.total,
        count: data.count,
        items: data.items,
      })).sort((a, b) => b.total - a.total),
      upcomingExpenses,
      monthlyProjections,
    };
  }, [recurringExpenses]);

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
          <Text style={[styles.title, { color: colors.textPrimary }]}>Recurring Expenses</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {group.name}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Monthly Total</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {formatMoney(reportData.totalMonthly, false, group.currency || 'INR')}
              </Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Active</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {reportData.activeCount}
              </Text>
            </View>
          </View>
        </Card>

        {/* Monthly Projection Chart */}
        {reportData.monthlyProjections.length > 0 && (
          <Card style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              6-Month Projection
            </Text>
            <LineChart
              data={reportData.monthlyProjections.map(proj => ({
                label: proj.month.split(' ')[0], // Just month name
                value: proj.amount,
              }))}
              currency={group.currency || 'INR'}
              showValues={true}
              showTrendLine={true}
              height={200}
            />
          </Card>
        )}

        {/* Category Breakdown */}
        {reportData.categoryBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              By Category
            </Text>
            <Card style={styles.chartCard}>
              <BarChart
                data={reportData.categoryBreakdown.map(cat => ({
                  label: cat.category,
                  value: cat.total,
                }))}
                currency={group.currency || 'INR'}
                showValues={true}
              />
            </Card>
            
            {reportData.categoryBreakdown.map(category => (
              <Card key={category.category} style={styles.categoryCard}>
                <View style={styles.categoryHeader}>
                  <Text style={[styles.categoryName, { color: colors.textPrimary }]}>
                    {category.category}
                  </Text>
                  <Text style={[styles.categoryAmount, { color: colors.textPrimary }]}>
                    {formatMoney(category.total, false, group.currency || 'INR')}/month
                  </Text>
                </View>
                <Text style={[styles.categoryCount, { color: colors.textSecondary }]}>
                  {category.count} {category.count === 1 ? 'expense' : 'expenses'}
                </Text>
                {category.items.map(item => (
                  <View key={item.id} style={styles.recurringItem}>
                    <Text style={[styles.recurringItemName, { color: colors.textPrimary }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.recurringItemAmount, { color: colors.textSecondary }]}>
                      {formatMoney(item.amount, false, item.currency || group.currency || 'INR')} / {item.frequency}
                    </Text>
                    <Text style={[styles.recurringItemDue, { color: colors.textSecondary }]}>
                      Next: {new Date(item.nextDueDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                  </View>
                ))}
              </Card>
            ))}
          </View>
        )}

        {/* Upcoming Expenses */}
        {reportData.upcomingExpenses.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Upcoming (Next 3 Months)
            </Text>
            {reportData.upcomingExpenses.map(expense => (
              <Card key={expense.id} style={styles.upcomingCard}>
                <View style={styles.upcomingHeader}>
                  <Text style={[styles.upcomingName, { color: colors.textPrimary }]}>
                    {expense.name}
                  </Text>
                  <Text style={[styles.upcomingAmount, { color: colors.textPrimary }]}>
                    {formatMoney(expense.amount, false, expense.currency || group.currency || 'INR')}
                  </Text>
                </View>
                <View style={styles.upcomingDetails}>
                  <Text style={[styles.upcomingDetail, { color: colors.textSecondary }]}>
                    {expense.category} • {expense.frequency}
                  </Text>
                  <Text style={[styles.upcomingDate, { color: colors.textSecondary }]}>
                    Due: {new Date(expense.nextDueDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        {recurringExpenses.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
              No recurring expenses
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Add recurring expenses to track subscriptions and regular bills
            </Text>
          </View>
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
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  summaryCard: {
    marginBottom: 24,
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.bodySmall,
    marginBottom: 4,
  },
  summaryValue: {
    ...typography.h3,
    ...typography.emphasis.bold,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: 16,
  },
  chartCard: {
    marginBottom: 16,
    padding: 20,
  },
  categoryCard: {
    marginBottom: 12,
    padding: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryName: {
    ...typography.h4,
  },
  categoryAmount: {
    ...typography.money,
  },
  categoryCount: {
    ...typography.bodySmall,
    marginBottom: 12,
  },
  recurringItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    marginBottom: 8,
  },
  recurringItemName: {
    ...typography.body,
    ...typography.emphasis.medium,
    marginBottom: 4,
  },
  recurringItemAmount: {
    ...typography.bodySmall,
    marginBottom: 2,
  },
  recurringItemDue: {
    ...typography.caption,
  },
  upcomingCard: {
    marginBottom: 12,
    padding: 16,
  },
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  upcomingName: {
    ...typography.h4,
    flex: 1,
  },
  upcomingAmount: {
    ...typography.money,
  },
  upcomingDetails: {
    marginTop: 4,
  },
  upcomingDetail: {
    ...typography.bodySmall,
    marginBottom: 2,
  },
  upcomingDate: {
    ...typography.caption,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
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
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 80,
  },
});

export default RecurringExpensesReportScreen;
