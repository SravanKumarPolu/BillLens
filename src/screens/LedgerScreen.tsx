import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';
import { Card, Chip } from '../components';
import { Expense } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Ledger'>;

type CategoryFilter = 'All' | 'Food' | 'Groceries' | 'Utilities' | 'Others';

const LedgerScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getGroup, getExpensesForGroup } = useGroups();
  const { colors } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('All');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const group = getGroup(groupId);
  const allExpenses = getExpensesForGroup(groupId);

  // Filter and sort expenses
  const filteredAndSortedExpenses = useMemo(() => {
    let filtered = allExpenses;

    // Apply category filter
    if (selectedCategory !== 'All') {
      if (selectedCategory === 'Others') {
        // Others = everything except Food, Groceries, Utilities
        filtered = filtered.filter(
          exp => !['Food', 'Groceries', 'Utilities'].includes(exp.category)
        );
      } else {
        filtered = filtered.filter(exp => exp.category === selectedCategory);
      }
    }

    // Sort by date
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return sorted;
  }, [allExpenses, selectedCategory, sortOrder]);

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>Group not found</Text>
      </View>
    );
  }

  const categories: CategoryFilter[] = ['All', 'Food', 'Groceries', 'Utilities', 'Others'];

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if today
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    // Check if yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    // Check if this week
    const daysDiff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
      return date.toLocaleDateString('en-IN', { weekday: 'short' });
    }
    // Otherwise show date
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  };

  const getMemberNames = (expense: Expense): string => {
    const memberNames = expense.splits
      .map(split => {
        const member = group.members.find(m => m.id === split.memberId);
        return member?.name || 'Someone';
      })
      .filter((name, index, arr) => arr.indexOf(name) === index); // Remove duplicates

    if (memberNames.length === 0) return 'No one';
    if (memberNames.length === 1) return memberNames[0];
    if (memberNames.length === 2) return `${memberNames[0]} and ${memberNames[1]}`;
    if (memberNames.length === 3) return `${memberNames[0]}, ${memberNames[1]}, and ${memberNames[2]}`;
    return `${memberNames[0]}, ${memberNames[1]}, and ${memberNames.length - 2} others`;
  };

  const getPaidByName = (expense: Expense): string => {
    const paidBy = group.members.find(m => m.id === expense.paidBy);
    return paidBy?.name || 'Someone';
  };

  const renderExpense = ({ item }: { item: Expense }) => {
    const paidByName = getPaidByName(item);
    const memberNames = getMemberNames(item);
    const isYouPaid = item.paidBy === 'you';

    return (
      <Card style={styles.expenseCard}>
        <View style={styles.expenseHeader}>
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={styles.expenseImage} />
          ) : (
            <View style={[styles.expenseImagePlaceholder, { backgroundColor: colors.borderSubtle }]}>
              <Text style={styles.imagePlaceholderText}>📷</Text>
            </View>
          )}
          <View style={styles.expenseInfo}>
            <Text style={[styles.expenseMerchant, { color: colors.textPrimary }]}>
              {item.merchant || item.title || 'Expense'}
            </Text>
            <Text style={[styles.expenseDate, { color: colors.textSecondary }]}>
              {formatDate(item.date)}
            </Text>
          </View>
          <Text style={[styles.expenseAmount, { color: colors.textPrimary }]}>
            {formatMoney(item.amount)}
          </Text>
        </View>

        <View style={[styles.expenseDetails, { borderTopColor: colors.borderSubtle }]}>
          <Text style={[styles.expenseDetailText, { color: colors.textSecondary }]}>
            {isYouPaid ? 'You' : paidByName} paid this, split with {memberNames}
          </Text>
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Expense history</Text>
        <TouchableOpacity
          onPress={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
          style={styles.sortButton}
        >
          <Text style={[styles.sortButtonText, { color: colors.textSecondary }]}>
            {sortOrder === 'newest' ? '↓ Newest' : '↑ Oldest'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContainer}
        style={styles.filtersScroll}
      >
        {categories.map(category => (
          <Chip
            key={category}
            label={category}
            variant="default"
            selected={selectedCategory === category}
            onPress={() => setSelectedCategory(category)}
            style={styles.filterChip}
          />
        ))}
      </ScrollView>

      {/* Expenses List */}
      {filteredAndSortedExpenses.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyEmoji]}>📝</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
            {selectedCategory === 'All'
              ? 'No expenses yet'
              : `No ${selectedCategory.toLowerCase()} expenses`}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Add your first expense to get started!
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedExpenses}
          keyExtractor={item => item.id}
          renderItem={renderExpense}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
  title: {
    ...typography.h2,
    flex: 1,
    textAlign: 'center',
  },
  sortButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  sortButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  filtersScroll: {
    maxHeight: 50,
  },
  filtersContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 8,
  },
  filterChip: {
    marginRight: 8,
  },
  list: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  expenseCard: {
    marginBottom: 16,
    padding: 16,
  },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  expenseImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#E5E7EB',
  },
  expenseImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 24,
  },
  expenseInfo: {
    flex: 1,
    marginRight: 8,
  },
  expenseMerchant: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  expenseDate: {
    ...typography.bodySmall,
  },
  expenseAmount: {
    ...typography.money,
  },
  expenseDetails: {
    paddingTop: 12,
    borderTopWidth: 1,
    marginTop: 4,
  },
  expenseDetailText: {
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
  emptyText: {
    ...typography.h3,
    marginBottom: recommendedSpacing.default,
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

export default LedgerScreen;

