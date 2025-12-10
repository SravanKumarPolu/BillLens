import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card } from './Card';
import { formatMoney } from '../utils/formatMoney';
import { GroupBalance, Expense, Settlement, Member } from '../types/models';

export interface BalanceBreakdownProps {
  balances: GroupBalance[];
  expenses: Expense[];
  settlements: Settlement[];
  members: Member[];
  currentUserId?: string;
}

/**
 * Clear balance breakdown component that shows:
 * - What each person owes/is owed
 * - Breakdown by expenses and settlements
 * - Clear explanation to prevent confusion
 */
const BalanceBreakdown: React.FC<BalanceBreakdownProps> = ({
  balances,
  expenses,
  settlements,
  members,
  currentUserId = 'you',
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  // Calculate breakdown for each member
  const memberBreakdowns = members.map(member => {
    const balance = balances.find(b => b.memberId === member.id);
    const balanceAmount = balance?.balance || 0;

    // Calculate what they paid
    const paidTotal = expenses
      .filter(e => e.paidBy === member.id)
      .reduce((sum, e) => sum + e.amount, 0);

    // Calculate what they owe
    const owedTotal = expenses
      .flatMap(e => e.splits || [])
      .filter(s => s.memberId === member.id)
      .reduce((sum, s) => sum + s.amount, 0);

    // Calculate settlements made (paid to others)
    const settlementsPaid = settlements
      .filter(s => s.fromMemberId === member.id && s.status === 'completed')
      .reduce((sum, s) => sum + s.amount, 0);

    // Calculate settlements received (paid by others)
    const settlementsReceived = settlements
      .filter(s => s.toMemberId === member.id && s.status === 'completed')
      .reduce((sum, s) => sum + s.amount, 0);

    return {
      member,
      balance: balanceAmount,
      paidTotal,
      owedTotal,
      settlementsPaid,
      settlementsReceived,
      netBeforeSettlements: paidTotal - owedTotal,
    };
  });

  // Filter to show only non-zero balances or current user
  const relevantBreakdowns = memberBreakdowns.filter(
    b => Math.abs(b.balance) > 0.01 || b.member.id === currentUserId
  );

  if (relevantBreakdowns.length === 0) {
    return (
      <Card style={styles.container}>
        <Text style={[styles.allSettledText, { color: colors.success }]}>
          ✓ All settled! No pending balances.
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Balance Breakdown</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Clear view of who owes what and why
      </Text>

      {relevantBreakdowns.map(breakdown => {
        const isCurrentUser = breakdown.member.id === currentUserId;
        const isOwed = breakdown.balance > 0;
        const owes = breakdown.balance < 0;

        return (
          <Card key={breakdown.member.id} style={styles.memberCard}>
            <View style={styles.memberHeader}>
              <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                {breakdown.member.name} {isCurrentUser && '(You)'}
              </Text>
              <View style={[
                styles.balanceBadge,
                { backgroundColor: isOwed ? colors.accent : owes ? colors.error : colors.borderSubtle }
              ]}>
                <Text style={[styles.balanceAmount, { color: colors.white }]}>
                  {isOwed
                    ? `+${formatMoney(breakdown.balance)}`
                    : owes
                    ? formatMoney(breakdown.balance)
                    : formatMoney(0)}
                </Text>
              </View>
            </View>

            <View style={styles.breakdown}>
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                  Paid for expenses:
                </Text>
                <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
                  {formatMoney(breakdown.paidTotal)}
                </Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                  Owed for expenses:
                </Text>
                <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
                  -{formatMoney(breakdown.owedTotal)}
                </Text>
              </View>

              {breakdown.settlementsPaid > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                    Settlements paid:
                  </Text>
                  <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
                    -{formatMoney(breakdown.settlementsPaid)}
                  </Text>
                </View>
              )}

              {breakdown.settlementsReceived > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                    Settlements received:
                  </Text>
                  <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
                    +{formatMoney(breakdown.settlementsReceived)}
                  </Text>
                </View>
              )}

              <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

              <View style={styles.breakdownRow}>
                <Text style={[styles.finalBalanceLabel, { color: colors.textPrimary }]}>
                  Final Balance:
                </Text>
                <Text style={[
                  styles.finalBalanceValue,
                  { color: isOwed ? colors.accent : owes ? colors.error : colors.textPrimary }
                ]}>
                  {isOwed
                    ? `+${formatMoney(breakdown.balance)} (owed to you)`
                    : owes
                    ? `${formatMoney(breakdown.balance)} (you owe)`
                    : formatMoney(0)}
                </Text>
              </View>
            </View>
          </Card>
        );
      })}

      <View style={[styles.infoBox, { backgroundColor: colors.surfaceCard }]}>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          💡 Tip: Balances are calculated from expenses minus settlements. This view shows exactly how each balance was derived.
        </Text>
      </View>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginBottom: recommendedSpacing.loose,
  },
  title: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  subtitle: {
    ...typography.bodySmall,
    marginBottom: recommendedSpacing.default,
  },
  memberCard: {
    marginBottom: recommendedSpacing.default,
    padding: 16,
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: recommendedSpacing.default,
  },
  memberName: {
    ...typography.h4,
    flex: 1,
  },
  balanceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  balanceAmount: {
    ...typography.buttonSmall,
    fontWeight: '600',
  },
  breakdown: {
    marginTop: recommendedSpacing.default,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: recommendedSpacing.tight,
  },
  breakdownLabel: {
    ...typography.bodySmall,
    flex: 1,
  },
  breakdownValue: {
    ...typography.body,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: recommendedSpacing.default,
  },
  finalBalanceLabel: {
    ...typography.body,
    fontWeight: '600',
  },
  finalBalanceValue: {
    ...typography.body,
    fontWeight: '600',
  },
  infoBox: {
    padding: 12,
    borderRadius: 8,
    marginTop: recommendedSpacing.default,
  },
  infoText: {
    ...typography.bodySmall,
    lineHeight: 18,
  },
  allSettledText: {
    ...typography.body,
    textAlign: 'center',
    padding: 16,
  },
});

export default BalanceBreakdown;
