import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, PieChart, BarChart } from '../components';
import { generateMonthlyReport, generateYouPaidExtraInsights } from '../utils/monthlyReportService';
import { formatMoney } from '../utils/formatMoney';

type Props = NativeStackScreenProps<RootStackParamList, 'MonthlyReport'>;

const MonthlyReportScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId, month, year } = route.params || {};
  const { getGroup, getExpensesForGroup, getGroupBalances } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const group = getGroup(groupId);
  const expenses = getExpensesForGroup(groupId);
  const balances = getGroupBalances(groupId);

  const report = useMemo(() => {
    if (!group) return null;
    return generateMonthlyReport(group, expenses, balances, month, year);
  }, [group, expenses, balances, month, year]);

  const youPaidExtraInsights = useMemo(() => {
    if (!report) return [];
    return generateYouPaidExtraInsights(report);
  }, [report]);

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>Group not found</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
            No expenses for this month
          </Text>
        </View>
      </View>
    );
  }

  // Prepare chart data
  const categoryChartData = report.categoryBreakdown.map((cat, index) => ({
    label: cat.category,
    value: cat.total,
  }));

  const perPersonChartData = report.perPersonSpending.map(person => ({
    label: person.member.name,
    value: person.totalPaid,
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Monthly Report</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {report.month} • {group.name}
          </Text>
        </View>

        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Spent</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {formatMoney(report.totalSpent, false, report.group.currency || 'INR')}
              </Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Expenses</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {report.totalExpenses}
              </Text>
            </View>
          </View>
        </Card>

        {/* Top Spender */}
        <Card style={styles.topSpenderCard}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Top Spender</Text>
          <View style={styles.topSpenderContent}>
            <Text style={[styles.topSpenderName, { color: colors.textPrimary }]}>
              {report.topSpender.member.name}
            </Text>
            <Text style={[styles.topSpenderAmount, { color: colors.primary }]}>
              {formatMoney(report.topSpender.amount, false, report.group.currency || 'INR')}
            </Text>
            <Text style={[styles.topSpenderPercentage, { color: colors.textSecondary }]}>
              {report.topSpender.percentage.toFixed(1)}% of total
            </Text>
          </View>
        </Card>

        {/* You Paid Extra Insights */}
        {youPaidExtraInsights.length > 0 && (
          <Card style={styles.insightsCard}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>You Paid Extra</Text>
            {youPaidExtraInsights.map((insight, index) => (
              <View key={index} style={styles.insightItem}>
                <Text style={[styles.insightMessage, { color: colors.textPrimary }]}>
                  {insight.message}
                </Text>
                <Text style={[styles.insightAmount, { color: colors.warning }]}>
                  {formatMoney(insight.extraPaid, false, report.group.currency || 'INR')}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Category Breakdown Chart */}
        {categoryChartData.length > 0 && (
          <Card style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              Spending by Category
            </Text>
            <BarChart
              data={categoryChartData}
              currency={report.group.currency || 'INR'}
              showValues={true}
            />
          </Card>
        )}

        {/* Per Person Spending Chart */}
        {perPersonChartData.length > 0 && (
          <Card style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              Spending by Person
            </Text>
            <BarChart
              data={perPersonChartData}
              currency={report.group.currency || 'INR'}
              showValues={true}
            />
          </Card>
        )}

        {/* Fairness Analysis */}
        <Card style={styles.fairnessCard}>
          <View style={styles.fairnessHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Fairness Score</Text>
            <Text style={[styles.fairnessScore, { color: colors.primary }]}>
              {report.fairnessAnalysis.score.toFixed(0)}/100
            </Text>
          </View>
          <View style={styles.fairnessBar}>
            <View
              style={[
                styles.fairnessBarFill,
                {
                  width: `${report.fairnessAnalysis.score}%`,
                  backgroundColor: report.fairnessAnalysis.score >= 80
                    ? colors.success
                    : report.fairnessAnalysis.score >= 60
                    ? colors.warning
                    : colors.error,
                },
              ]}
            />
          </View>
          {report.fairnessAnalysis.whoSpendsMore.length > 0 && (
            <View style={styles.fairnessList}>
              <Text style={[styles.fairnessLabel, { color: colors.textSecondary }]}>
                Paid More:
              </Text>
              {report.fairnessAnalysis.whoSpendsMore.map((person, index) => (
                <Text key={index} style={[styles.fairnessItem, { color: colors.textPrimary }]}>
                  {person.member.name}: {formatMoney(person.extraPaid, false, report.group.currency || 'INR')} ({person.percentage.toFixed(0)}% above average)
                </Text>
              ))}
            </View>
          )}
        </Card>

        {/* Insights */}
        {report.insights.length > 0 && (
          <Card style={styles.insightsCard}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Insights</Text>
            {report.insights.map((insight, index) => (
              <View key={index} style={styles.insightItem}>
                <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>
                  {insight.title}
                </Text>
                <Text style={[styles.insightMessage, { color: colors.textSecondary }]}>
                  {insight.message}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Settlement Status */}
        {!report.settlementStatus.isSettled && report.settlementStatus.totalPending > 0 && (
          <Card style={styles.settlementCard}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Settlement Status</Text>
            <Text style={[styles.settlementAmount, { color: colors.warning }]}>
              {formatMoney(report.settlementStatus.totalPending, false, report.group.currency || 'INR')} pending
            </Text>
            {report.settlementStatus.pendingPayments.length > 0 && (
              <View style={styles.pendingPayments}>
                {report.settlementStatus.pendingPayments.map((payment, index) => (
                  <Text key={index} style={[styles.pendingPayment, { color: colors.textPrimary }]}>
                    {payment.from.name} → {payment.to.name}: {formatMoney(payment.amount, false, report.group.currency || 'INR')}
                  </Text>
                ))}
              </View>
            )}
          </Card>
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
    paddingBottom: 8,
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
  titleSection: {
    marginBottom: 24,
  },
  title: {
    ...typography.h1,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.body,
  },
  summaryCard: {
    marginBottom: 16,
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
  topSpenderCard: {
    marginBottom: 16,
    padding: 20,
  },
  topSpenderContent: {
    alignItems: 'center',
    marginTop: 12,
  },
  topSpenderName: {
    ...typography.h3,
    marginBottom: 4,
  },
  topSpenderAmount: {
    ...typography.moneyLarge,
    marginBottom: 4,
  },
  topSpenderPercentage: {
    ...typography.bodySmall,
  },
  insightsCard: {
    marginBottom: 16,
    padding: 20,
  },
  insightItem: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  insightTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  insightMessage: {
    ...typography.body,
  },
  insightAmount: {
    ...typography.money,
    marginTop: 4,
  },
  chartCard: {
    marginBottom: 16,
    padding: 20,
  },
  fairnessCard: {
    marginBottom: 16,
    padding: 20,
  },
  fairnessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  fairnessScore: {
    ...typography.h2,
    ...typography.emphasis.bold,
  },
  fairnessBar: {
    height: 8,
    backgroundColor: colors.borderSubtle,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  fairnessBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  fairnessList: {
    marginTop: 8,
  },
  fairnessLabel: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
    marginBottom: 4,
  },
  fairnessItem: {
    ...typography.bodySmall,
    marginTop: 4,
  },
  settlementCard: {
    marginBottom: 16,
    padding: 20,
  },
  settlementAmount: {
    ...typography.h3,
    marginTop: 8,
    marginBottom: 12,
  },
  pendingPayments: {
    marginTop: 8,
  },
  pendingPayment: {
    ...typography.bodySmall,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    ...typography.h3,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 80,
  },
  sectionTitle: {
    ...typography.label,
    ...typography.emphasis.semibold,
    marginBottom: 12,
  },
});

export default MonthlyReportScreen;
