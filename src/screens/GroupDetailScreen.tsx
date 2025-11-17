import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

type Expense = {
  id: string;
  title: string;
  subtitle: string;
  amount: string;
};

const MOCK_EXPENSES: Expense[] = [
  { id: '1', title: 'Zomato order', subtitle: 'You paid · Split among 3', amount: '₹780' },
  { id: '2', title: 'Rent – November', subtitle: 'Priya paid · Split among 2', amount: '₹12,000' },
];

const GroupDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const groupName = groupId === '2' ? 'Us Two' : 'Our Home';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.groupEmoji}>{groupId === '2' ? '👫' : '🏠'}</Text>
        <View style={styles.headerTextWrapper}>
          <Text style={styles.groupName}>{groupName}</Text>
          <Text style={styles.balanceSummary}>You owe Priya ₹450</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.settleButton}
        onPress={() => navigation.navigate('SettleUp', { groupId })}
      >
        <Text style={styles.settleLabel}>Settle up</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Recent expenses</Text>

      <FlatList
        data={MOCK_EXPENSES}
        keyExtractor={e => e.id}
        renderItem={({ item }) => (
          <View style={styles.expenseCard}>
            <View>
              <Text style={styles.expenseTitle}>{item.title}</Text>
              <Text style={styles.expenseSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.expenseAmount}>{item.amount}</Text>
          </View>
        )}
        contentContainerStyle={styles.expensesList}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CaptureOptions', { groupId })}
      >
        <Text style={styles.fabIcon}>📷</Text>
        <Text style={styles.fabLabel}>Add from screenshot</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupEmoji: {
    fontSize: 32,
    marginRight: 10,
  },
  headerTextWrapper: {
    flex: 1,
  },
  groupName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  balanceSummary: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  settleButton: {
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    alignItems: 'center',
  },
  settleLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
  },
  expensesList: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  expenseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  expenseTitle: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  expenseSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  fab: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    marginRight: 8,
    fontSize: 18,
  },
  fabLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default GroupDetailScreen;
