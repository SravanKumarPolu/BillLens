import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';
import { Card, BackButton } from '../components';
import { Expense, Member } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'PerPersonStats'>;

interface PersonStats {
  member: Member;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
  expenseCount: number;
  categoryBreakdown: Record<string, number>;
  monthlyBreakdown: Array<{
    month: string;
    year: number;
    paid: number;
    owed: number;
  }>;
}

const PerPersonStatsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getExpensesForGroup, getGroup, calculateGroupBalances } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const group = getGroup(groupId);
  const allExpenses = getExpensesForGroup(groupId);
  const balances = calculateGroupBalances(groupId);

  // Calculate per-person statistics
  const personStats = useMemo(() => {
    if (!group) return [];

    const stats: PersonStats[] = group.members.map(member => {
      // Calculate total paid
      const paidExpenses = allExpenses.filter(e => {
        if (e.payers && e.payers.length > 0) {
          return e.payers.some(p => p.memberId === member.id);
        }
        return e.paidBy === member.id;
      });

      const totalPaid = paidExpenses.reduce((sum, expense) => {
        if (expense.payers && expense.payers.length > 0) {
          const payer = expense.payers.find(p => p.memberId === member.id);
          return sum + (payer?.amount || 0);
        }
        return sum + expense.amount;
      }, 0);

      // Calculate total owed
      const owedExpenses = allExpenses.filter(e =>
        e.splits?.some(s => s.memberId === member.id)
      );

      const totalOwed = owedExpenses.reduce((sum, expense) => {
        const split = expense.splits?.find(s => s.memberId === member.id);
        return sum + (split?.amount || 0);
      }, 0);

      // Add extra items
      const extraItemsOwed = allExpenses.reduce((sum, expense) => {
        if (!expense.extraItems) return sum;
        return sum + expense.extraItems.reduce((itemSum, item) => {
          if (item.splitBetween && item.splitBetween.includes(member.id)) {
            return itemSum + (item.amount / item.splitBetween.length);
          }
          if (!item.splitBetween && expense.splits?.some(s => s.memberId === member.id)) {
            // Split equally among all who owe the expense
            const splitCount = expense.splits?.length || 1;
            return itemSum + (item.amount / splitCount);
          }
          return itemSum;
        }, 0);
      }, 0);

      const finalTotalOwed = totalOwed + extraItemsOwed;

      // Net balance
      const balance = balances.find(b => b.memberId === member.id);
      const netBalance = balance?.balance || 0;

      // Category breakdown
      const categoryBreakdown: Record<string, number> = {};
      paidExpenses.forEach(expense => {
        const category = expense.category || 'Other';
        const amount = expense.payers && expense.payers.length > 0
          ? (expense.payers.find(p => p.memberId === member.id)?.amount || 0)
          : expense.amount;
        categoryBreakdown[category] = (categoryBreakdown[category] || 0) + amount;
      });

      // Monthly breakdown
      const monthlyMap = new Map<string, { paid: number; owed: number }>();
      const now = new Date();

      // Process paid expenses
      paidExpenses.forEach(expense => {
        const date = new Date(expense.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const existing = monthlyMap.get(monthKey) || { paid: 0, owed: 0 };
        const amount = expense.payers && expense.payers.length > 0
          ? (expense.payers.find(p => p.memberId === member.id)?.amount || 0)
          : expense.amount;
        monthlyMap.set(monthKey, { ...existing, paid: existing.paid + amount });
      });

      // Process owed expenses
      owedExpenses.forEach(expense => {
        const date = new Date(expense.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const existing = monthlyMap.get(monthKey) || { paid: 0, owed: 0 };
        const split = expense.splits?.find(s => s.memberId === member.id);
        monthlyMap.set(monthKey, { ...existing, owed: existing.owed + (split?.amount || 0) });
      });

      const monthlyBreakdown = Array.from(monthlyMap.entries())
        .map(([key, data]) => {
          const [year, month] = key.split('-').map(Number);
          return {
            month: new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'short' }),
            year,
            paid: data.paid,
            owed: data.owed,
          };
        })
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month.localeCompare(b.month);
        })
        .slice(-6); // Last 6 months

      return {
        member,
        totalPaid,
        totalOwed: finalTotalOwed,
        netBalance,
        expenseCount: paidExpenses.length + owedExpenses.length,
        categoryBreakdown,
        monthlyBreakdown,
      };
    });

    return stats;
  }, [group, allExpenses, balances]);

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Group not found</Text>
      </View>
    );
  }

  const groupCurrency = group.currency || 'INR';

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={[styles.topHeader, { backgroundColor: colors.surfaceLight }]}>
        <BackButton style={styles.backButtonContainer} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Per-Person Statistics</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {group.name}
          </Text>
        </View>

        {personStats.map((stat, index) => (
          <Card key={stat.member.id} style={styles.personCard}>
            <View style={styles.personHeader}>
              <Text style={[styles.personName, { color: colors.textPrimary }]}>
                {stat.member.name}
              </Text>
              <Text style={[styles.expenseCount, { color: colors.textSecondary }]}>
                {stat.expenseCount} {stat.expenseCount === 1 ? 'expense' : 'expenses'}
              </Text>
            </View>

            {/* Summary */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Paid</Text>
                <Text style={[styles.summaryValue, { color: colors.accent }]}>
                  {formatMoney(stat.totalPaid, false, groupCurrency)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Owed</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {formatMoney(stat.totalOwed, false, groupCurrency)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Net</Text>
                <Text style={[
                  styles.summaryValue,
                  { color: stat.netBalance >= 0 ? colors.accent : colors.error }
                ]}>
                  {formatMoney(stat.netBalance, true, groupCurrency)}
                </Text>
              </View>
            </View>

            {/* Category Breakdown */}
            {Object.keys(stat.categoryBreakdown).length > 0 && (
              <View style={styles.categorySection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  Spending by Category
                </Text>
                {Object.entries(stat.categoryBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, amount]) => {
                    const percentage = stat.totalPaid > 0
                      ? (amount / stat.totalPaid) * 100
                      : 0;
                    return (
                      <View key={category} style={styles.categoryRow}>
                        <View style={styles.categoryLeft}>
                          <Text style={[styles.categoryName, { color: colors.textPrimary }]}>
                            {category}
                          </Text>
                          <Text style={[styles.categoryPercentage, { color: colors.textSecondary }]}>
                            {percentage.toFixed(0)}%
                          </Text>
                        </View>
                        <Text style={[styles.categoryAmount, { color: colors.textPrimary }]}>
                          {formatMoney(amount, false, groupCurrency)}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            )}

            {/* Monthly Breakdown */}
            {stat.monthlyBreakdown.length > 0 && (
              <View style={styles.monthlySection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  Last 6 Months
                </Text>
                {stat.monthlyBreakdown.map((month, idx) => (
                  <View key={idx} style={styles.monthRow}>
                    <Text style={[styles.monthName, { color: colors.textSecondary }]}>
                      {month.month} {month.year}
                    </Text>
                    <View style={styles.monthAmounts}>
                      <Text style={[styles.monthPaid, { color: colors.accent }]}>
                        Paid: {formatMoney(month.paid, false, groupCurrency)}
                      </Text>
                      <Text style={[styles.monthOwed, { color: colors.textSecondary }]}>
                        Owed: {formatMoney(month.owed, false, groupCurrency)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        ))}

        {personStats.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
              No expenses yet
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Add expenses to see per-person statistics
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
  backButtonContainer: {
    marginBottom: 8,
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
  personCard: {
    marginBottom: 20,
    padding: 20,
  },
  personHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  personName: {
    ...typography.h3,
  },
  expenseCount: {
    ...typography.bodySmall,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    ...typography.bodySmall,
    marginBottom: 4,
  },
  summaryValue: {
    ...typography.money,
  },
  categorySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryLeft: {
    flex: 1,
  },
  categoryName: {
    ...typography.body,
    marginBottom: 2,
  },
  categoryPercentage: {
    ...typography.caption,
  },
  categoryAmount: {
    ...typography.money,
  },
  monthlySection: {
    marginTop: 8,
  },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  monthName: {
    ...typography.body,
  },
  monthAmounts: {
    alignItems: 'flex-end',
  },
  monthPaid: {
    ...typography.bodySmall,
    marginBottom: 2,
  },
  monthOwed: {
    ...typography.bodySmall,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyEmoji: {
    fontSize: 64,
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
});

export default PerPersonStatsScreen;
