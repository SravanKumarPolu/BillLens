/**
 * Personal Spending Dashboard
 * 
 * Shows personal spending analytics separate from groups:
 * - Timeline of your own expenses
 * - Personal spending trends
 * - Category breakdown (personal)
 * - Monthly personal totals
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, Button, BackButton } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { PieChart, LineChart } from '../components/Chart';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonalSpending'>;

const PersonalSpendingScreen: React.FC<Props> = ({ navigation }) => {
  const { expenses, getAllGroupSummaries } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');

  // Filter to only expenses where current user paid
  const personalExpenses = useMemo(() => {
    return expenses.filter(e => e.paidBy === 'you');
  }, [expenses]);

  // Filter by selected period
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const cutoffDate = new Date();
    
    switch (selectedPeriod) {
      case 'week':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    return personalExpenses.filter(e => new Date(e.date) >= cutoffDate);
  }, [personalExpenses, selectedPeriod]);

  // Calculate totals
  const totalSpent = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    filteredExpenses.forEach(expense => {
      const category = expense.category || 'Other';
      breakdown[category] = (breakdown[category] || 0) + expense.amount;
    });
    
    return Object.entries(breakdown)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  // Monthly spending trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const months: Record<string, number> = {};
    const now = new Date();
    
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      months[key] = 0;
    }
    
    // Calculate spending per month
    filteredExpenses.forEach(expense => {
      const date = new Date(expense.date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (months.hasOwnProperty(key)) {
        months[key] += expense.amount;
      }
    });
    
    return Object.entries(months)
      .map(([key, amount]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          month: new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
          amount,
        };
      });
  }, [filteredExpenses]);

  // Average per expense
  const averagePerExpense = filteredExpenses.length > 0 
    ? totalSpent / filteredExpenses.length 
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Personal Spending</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {(['week', 'month', 'year'] as const).map(period => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodButton,
                selectedPeriod === period && [styles.periodButtonActive, { backgroundColor: colors.primary }],
              ]}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  { color: selectedPeriod === period ? colors.white : colors.textSecondary },
                ]}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Spent</Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {formatMoney(totalSpent)}
            </Text>
          </Card>
          <Card style={styles.summaryCard}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Expenses</Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {filteredExpenses.length}
            </Text>
          </Card>
          <Card style={styles.summaryCard}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Avg/Expense</Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {formatMoney(averagePerExpense)}
            </Text>
          </Card>
        </View>

        {/* Monthly Trend Chart */}
        {monthlyTrend.length > 0 && (
          <Card style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Monthly Spending Trend
            </Text>
            <LineChart
              data={monthlyTrend.map(m => ({ label: m.month, value: m.amount }))}
              height={200}
              showTrendLine={true}
            />
          </Card>
        )}

        {/* Category Breakdown */}
        {categoryBreakdown.length > 0 && (
          <Card style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Category Breakdown
            </Text>
            <View style={styles.categoryChartContainer}>
              <PieChart
                data={categoryBreakdown.map(c => ({ label: c.category, value: c.amount }))}
                total={totalSpent}
                size={200}
              />
            </View>
            <View style={styles.categoryList}>
              {categoryBreakdown.map(({ category, amount }) => {
                const percentage = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
                return (
                  <View key={category} style={styles.categoryItem}>
                    <View style={styles.categoryItemLeft}>
                      <View style={[styles.categoryDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.categoryName, { color: colors.textPrimary }]}>
                        {category}
                      </Text>
                    </View>
                    <View style={styles.categoryItemRight}>
                      <Text style={[styles.categoryAmount, { color: colors.textPrimary }]}>
                        {formatMoney(amount)}
                      </Text>
                      <Text style={[styles.categoryPercentage, { color: colors.textSecondary }]}>
                        {percentage.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* Recent Expenses */}
        <Card style={styles.recentCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Recent Expenses
          </Text>
          {filteredExpenses.slice(0, 10).map(expense => (
            <View key={expense.id} style={styles.expenseItem}>
              <View style={styles.expenseItemLeft}>
                <Text style={[styles.expenseMerchant, { color: colors.textPrimary }]}>
                  {expense.merchant || expense.title}
                </Text>
                <Text style={[styles.expenseCategory, { color: colors.textSecondary }]}>
                  {expense.category}
                </Text>
                <Text style={[styles.expenseDate, { color: colors.textSecondary }]}>
                  {new Date(expense.date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <Text style={[styles.expenseAmount, { color: colors.textPrimary }]}>
                {formatMoney(expense.amount, false, expense.currency)}
              </Text>
            </View>
          ))}
          {filteredExpenses.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No expenses in this period
              </Text>
            </View>
          )}
        </Card>
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
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodButtonText: {
    ...typography.body,
    ...typography.emphasis.medium,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.caption,
    marginBottom: 4,
  },
  summaryValue: {
    ...typography.h3,
    ...typography.emphasis.semibold,
  },
  chartCard: {
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 16,
  },
  categoryChartContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  categoryList: {
    gap: 12,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  categoryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  categoryName: {
    ...typography.body,
  },
  categoryItemRight: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    ...typography.body,
    ...typography.emphasis.medium,
  },
  categoryPercentage: {
    ...typography.caption,
    marginTop: 2,
  },
  recentCard: {
    padding: 20,
    marginBottom: 16,
  },
  expenseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  expenseItemLeft: {
    flex: 1,
  },
  expenseMerchant: {
    ...typography.body,
    ...typography.emphasis.medium,
    marginBottom: 4,
  },
  expenseCategory: {
    ...typography.caption,
    marginBottom: 2,
  },
  expenseDate: {
    ...typography.caption,
  },
  expenseAmount: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    ...typography.body,
  },
});

export default PersonalSpendingScreen;
