import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card } from './index';
import { formatMoney } from '../utils/formatMoney';
import { GroupBalance, Expense, Settlement, Member, Group } from '../types/models';
import { getBalanceHistory } from '../utils/settlementExplanation';

export interface LensViewProps {
  group: Group;
  balances: GroupBalance[];
  expenses: Expense[];
  settlements: Settlement[];
  currentUserId?: string;
}

/**
 * Lens View - Comprehensive breakdown showing:
 * - Complete balance history
 * - Expense-by-expense impact
 * - Settlement timeline
 * - Clear visual hierarchy
 */
const LensView: React.FC<LensViewProps> = ({
  group,
  balances,
  expenses,
  settlements,
  currentUserId = 'you',
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  // Get balance history for current user
  const userHistory = useMemo(() => {
    return getBalanceHistory(currentUserId, expenses, settlements, group.members);
  }, [currentUserId, expenses, settlements, group.members]);

  // Calculate total expenses and settlements
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSettlements = settlements
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + s.amount, 0);

  // Get current user balance
  const userBalance = balances.find(b => b.memberId === currentUserId)?.balance || 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.surfaceLight }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Lens View</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Complete breakdown of your balance history
      </Text>

      {/* Summary Card */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Current Balance</Text>
          <Text style={[
            styles.summaryValue,
            { color: userBalance > 0 ? colors.accent : userBalance < 0 ? colors.error : colors.textPrimary }
          ]}>
            {formatMoney(userBalance, true)}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Expenses</Text>
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
            {formatMoney(totalExpenses)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Settled</Text>
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
            {formatMoney(totalSettlements)}
          </Text>
        </View>
      </Card>

      {/* Balance History Timeline */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Balance History</Text>
      {userHistory.length > 0 ? (
        <View style={styles.timeline}>
          {userHistory.map((entry, index) => {
            const isPositive = entry.change > 0;
            const isLast = index === userHistory.length - 1;
            
            return (
              <View key={index} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[
                    styles.timelineDot,
                    { backgroundColor: isPositive ? colors.accent : colors.error },
                    isLast && styles.timelineDotCurrent
                  ]} />
                  {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.borderSubtle }]} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={[styles.timelineDescription, { color: colors.textPrimary }]}>
                    {entry.description}
                  </Text>
                  <View style={styles.timelineMeta}>
                    <Text style={[styles.timelineDate, { color: colors.textSecondary }]}>
                      {new Date(entry.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                    <Text style={[
                      styles.timelineChange,
                      { color: isPositive ? colors.accent : colors.error }
                    ]}>
                      {isPositive ? '+' : ''}{formatMoney(entry.change)}
                    </Text>
                  </View>
                  <Text style={[styles.timelineBalance, { color: colors.textSecondary }]}>
                    Balance after: {formatMoney(entry.balanceAfter, true)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No balance history yet. Add expenses to see your balance timeline.
          </Text>
        </Card>
      )}

      {/* Recent Expenses Impact */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>Recent Expenses</Text>
      {expenses
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map(expense => {
          const userSplit = expense.splits?.find(s => s.memberId === currentUserId);
          const userPaid = expense.paidBy === currentUserId;
          const impact = userPaid ? expense.amount : (userSplit ? -userSplit.amount : 0);

          if (Math.abs(impact) < 0.01) return null;

          return (
            <Card key={expense.id} style={styles.expenseCard}>
              <View style={styles.expenseHeader}>
                <View style={styles.expenseLeft}>
                  <Text style={[styles.expenseTitle, { color: colors.textPrimary }]}>
                    {expense.merchant || expense.title}
                  </Text>
                  <Text style={[styles.expenseDate, { color: colors.textSecondary }]}>
                    {new Date(expense.date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>
                <View style={styles.expenseRight}>
                  <Text style={[
                    styles.expenseImpact,
                    { color: impact > 0 ? colors.accent : colors.error }
                  ]}>
                    {impact > 0 ? '+' : ''}{formatMoney(impact)}
                  </Text>
                  <Text style={[styles.expenseTotal, { color: colors.textSecondary }]}>
                    Total: {formatMoney(expense.amount)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.expenseDetail, { color: colors.textSecondary }]}>
                {userPaid
                  ? `You paid this expense`
                  : userSplit
                  ? `Your share: ${formatMoney(userSplit.amount)}`
                  : 'Not included'}
              </Text>
            </Card>
          );
        })}
    </ScrollView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },
  title: {
    ...typography.h2,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    marginBottom: recommendedSpacing.extraLoose,
  },
  summaryCard: {
    padding: 20,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    ...typography.body,
  },
  summaryValue: {
    ...typography.money,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: 16,
  },
  timeline: {
    marginBottom: 24,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
    marginRight: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: colors.surfaceLight,
  },
  timelineDotCurrent: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 20,
  },
  timelineContent: {
    flex: 1,
  },
  timelineDescription: {
    ...typography.body,
    marginBottom: 4,
  },
  timelineMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timelineDate: {
    ...typography.caption,
  },
  timelineChange: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  timelineBalance: {
    ...typography.caption,
  },
  emptyCard: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  expenseCard: {
    padding: 16,
    marginBottom: 12,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  expenseLeft: {
    flex: 1,
  },
  expenseTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  expenseDate: {
    ...typography.caption,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  expenseImpact: {
    ...typography.money,
    marginBottom: 4,
  },
  expenseTotal: {
    ...typography.caption,
  },
  expenseDetail: {
    ...typography.bodySmall,
  },
});

export default LensView;
