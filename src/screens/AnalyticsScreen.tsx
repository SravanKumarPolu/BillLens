import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';
import { Card, CalendarView, BarChart, PieChart, LineChart } from '../components';
import { Expense } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

interface CategoryTotal {
  category: string;
  amount: number;
  count: number;
}

interface MonthlyTotal {
  month: string;
  year: number;
  amount: number;
  count: number;
}

const AnalyticsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getExpensesForGroup, getGroup } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const group = getGroup(groupId);
  const allExpenses = getExpensesForGroup(groupId);

  // Calculate monthly totals - optimized with useMemo (last 6 months for trend)
  const monthlyTotals = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Get last 6 months for trend analysis
    const months: MonthlyTotal[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      
      const monthExpenses = allExpenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return (
          expenseDate.getMonth() === date.getMonth() &&
          expenseDate.getFullYear() === date.getFullYear()
        );
      });

      const total = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      
      months.push({
        month: date.toLocaleDateString('en-IN', { month: 'short' }),
        year: date.getFullYear(),
        amount: total,
        count: monthExpenses.length,
      });
    }

    return months; // Show oldest to newest
  }, [allExpenses]);

  // Calculate category breakdown - optimized with useMemo
  const categoryBreakdown = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Only current month expenses
    const currentMonthExpenses = allExpenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return (
        expenseDate.getMonth() === currentMonth &&
        expenseDate.getFullYear() === currentYear
      );
    });

    const categoryMap = new Map<string, { amount: number; count: number }>();

    currentMonthExpenses.forEach(expense => {
      const category = expense.category || 'Other';
      const existing = categoryMap.get(category) || { amount: 0, count: 0 };
      categoryMap.set(category, {
        amount: existing.amount + expense.amount,
        count: existing.count + 1,
      });
    });

    const breakdown: CategoryTotal[] = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount); // Sort by amount descending

    return breakdown;
  }, [allExpenses]);

  // Current month total
  const currentMonthTotal = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return allExpenses
      .filter(expense => {
        const expenseDate = new Date(expense.date);
        return (
          expenseDate.getMonth() === currentMonth &&
          expenseDate.getFullYear() === currentYear
        );
      })
      .reduce((sum, exp) => sum + exp.amount, 0);
  }, [allExpenses]);

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>Group not found</Text>
      </View>
    );
  }

  const getCategoryEmoji = (category: string): string => {
    const emojiMap: Record<string, string> = {
      Food: '🍔',
      Groceries: '🛒',
      Utilities: '⚡',
      Rent: '🏠',
      WiFi: '📶',
      Maid: '🧹',
      OTT: '📺',
      Other: '📝',
    };
    return emojiMap[category] || '📝';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={[styles.topHeader, { backgroundColor: colors.surfaceLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Analytics</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {group.name}
          </Text>
        </View>

      {/* Current Month Total */}
      <Card style={styles.totalCard}>
        <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>This month</Text>
        <Text style={[styles.totalAmount, { color: colors.textPrimary }]}>
          {formatMoney(currentMonthTotal)}
        </Text>
        <Text style={[styles.totalCount, { color: colors.textSecondary }]}>
          {allExpenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            const now = new Date();
            return (
              expenseDate.getMonth() === now.getMonth() &&
              expenseDate.getFullYear() === now.getFullYear()
            );
          }).length} expenses
        </Text>
        <View style={styles.reportButtons}>
          <TouchableOpacity
            style={styles.monthReportButton}
            onPress={() => navigation.navigate('MonthlyReport', { groupId })}
          >
            <Text style={[styles.monthReportButtonText, { color: colors.primary }]}>
              Monthly Report →
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.monthReportButton}
            onPress={() => navigation.navigate('RecurringExpensesReport', { groupId })}
          >
            <Text style={[styles.monthReportButtonText, { color: colors.primary }]}>
              Recurring Expenses →
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Calendar View */}
      <Card style={styles.calendarCard}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Calendar View</Text>
        <CalendarView
          expenses={allExpenses}
          currency={group.currency || 'INR'}
          onDatePress={(date) => {
            // Navigate to expense detail or filter by date
            const dateExpenses = allExpenses.filter(e => e.date.startsWith(date));
            if (dateExpenses.length > 0) {
              // Could navigate to a filtered expense list
              Alert.alert(
                'Expenses on this date',
                `${dateExpenses.length} expense(s) totaling ${formatMoney(
                  dateExpenses.reduce((sum, e) => sum + e.amount, 0),
                  false,
                  group.currency || 'INR'
                )}`
              );
            }
          }}
        />
      </Card>

      {/* Monthly Spending Graph with Trend Lines */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Monthly Spending Trend</Text>
        <Card style={styles.chartCard}>
          <LineChart
            data={monthlyTotals.map(month => ({
              label: month.month,
              value: month.amount,
            }))}
            currency={group.currency || 'INR'}
            showValues={true}
            showTrendLine={true}
            height={200}
          />
        </Card>
        
        {/* Monthly Totals List */}
        {monthlyTotals.slice(-3).map((month, index) => (
          <Card key={`${month.month}-${month.year}`} style={styles.monthCard}>
            <View style={styles.monthHeader}>
              <Text style={[styles.monthName, { color: colors.textPrimary }]}>
                {month.month} {month.year}
              </Text>
              <Text style={[styles.monthAmount, { color: colors.textPrimary }]}>
                {formatMoney(month.amount)}
              </Text>
            </View>
            <Text style={[styles.monthCount, { color: colors.textSecondary }]}>
              {month.count} {month.count === 1 ? 'expense' : 'expenses'}
            </Text>
          </Card>
        ))}
      </View>

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            This month by category
          </Text>
          
          {/* Pie Chart for Categories */}
          <Card style={styles.chartCard}>
            <PieChart
              data={categoryBreakdown.map(cat => ({
                label: cat.category,
                value: cat.amount,
              }))}
              total={currentMonthTotal}
              currency={group.currency || 'INR'}
              size={220}
            />
          </Card>
          
          {/* Bar Chart (alternative view) */}
          <Card style={styles.chartCard}>
            <BarChart
              data={categoryBreakdown.map(cat => ({
                label: cat.category,
                value: cat.amount,
              }))}
              currency={group.currency || 'INR'}
              showValues={true}
            />
          </Card>

          {/* Category List */}
          {categoryBreakdown.map(category => {
            const percentage = currentMonthTotal > 0 
              ? (category.amount / currentMonthTotal) * 100 
              : 0;
            
            return (
              <Card key={category.category} style={styles.categoryCard}>
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryLeft}>
                    <Text style={styles.categoryEmoji}>
                      {getCategoryEmoji(category.category)}
                    </Text>
                    <View>
                      <Text style={[styles.categoryName, { color: colors.textPrimary }]}>
                        {category.category}
                      </Text>
                      <Text style={[styles.categoryCount, { color: colors.textSecondary }]}>
                        {category.count} {category.count === 1 ? 'expense' : 'expenses'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.categoryRight}>
                    <Text style={[styles.categoryAmount, { color: colors.textPrimary }]}>
                      {formatMoney(category.amount)}
                    </Text>
                    <Text style={[styles.categoryPercentage, { color: colors.textSecondary }]}>
                      {percentage.toFixed(0)}%
                    </Text>
                  </View>
                </View>
                {/* Simple progress bar */}
                <View style={[styles.progressBarContainer, { backgroundColor: colors.borderSubtle }]}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${percentage}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {categoryBreakdown.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
            No expenses this month
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Add expenses to see analytics
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
  topHeader: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 8,
    backgroundColor: colors.surfaceLight,
    zIndex: 10,
  },
  backButton: {
    marginBottom: 8,
  },
  backButtonText: {
    ...typography.navigation,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    ...typography.h1,
    marginBottom: recommendedSpacing.tight,
  },
  subtitle: {
    ...typography.body,
  },
  totalCard: {
    marginBottom: 32,
    padding: 20,
    alignItems: 'center',
  },
  totalLabel: {
    ...typography.body,
    marginBottom: 8,
  },
  totalAmount: {
    ...typography.moneyLarge,
    marginBottom: 4,
  },
  totalCount: {
    ...typography.bodySmall,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: 12,
  },
  monthCard: {
    marginBottom: 8,
    padding: 16,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  monthName: {
    ...typography.h4,
  },
  monthAmount: {
    ...typography.money,
  },
  monthCount: {
    ...typography.bodySmall,
  },
  categoryCard: {
    marginBottom: 12,
    padding: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryName: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  categoryCount: {
    ...typography.bodySmall,
  },
  categoryRight: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    ...typography.money,
    marginBottom: recommendedSpacing.tight,
  },
  categoryPercentage: {
    ...typography.bodySmall,
  },
  progressBarContainer: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyEmoji: {
    fontSize: 64, // Emoji icon, not typography
    marginBottom: recommendedSpacing.loose,
  },
  emptyText: {
    ...typography.h3,
    marginBottom: 8,
  },
  emptySubtext: {
    ...typography.body,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 80,
  },
  reportButtons: {
    marginTop: 16,
    gap: 8,
  },
  monthReportButton: {
    paddingVertical: 8,
  },
  monthReportButtonText: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  calendarCard: {
    marginBottom: 32,
    padding: 20,
  },
  chartCard: {
    marginBottom: 16,
    padding: 20,
  },
});

export default AnalyticsScreen;

