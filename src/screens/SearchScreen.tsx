import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { globalSearch, SearchResult, SearchOptions } from '../utils/searchService';
import { Expense, Group } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

const SearchScreen: React.FC<Props> = ({ navigation }) => {
  const { expenses, groups, getAllGroupSummaries } = useGroups();
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [isPriorityOnly, setIsPriorityOnly] = useState(false);
  const styles = createStyles(colors);

  // Get all expenses from all groups
  const allExpenses = useMemo(() => {
    const summaries = getAllGroupSummaries() || [];
    return summaries.flatMap(s => s.expenses);
  }, [getAllGroupSummaries]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    allExpenses.forEach(e => {
      if (e.category) cats.add(e.category);
    });
    return Array.from(cats).sort();
  }, [allExpenses]);

  // Search options
  const searchOptions: SearchOptions = useMemo(() => ({
    groupId: selectedGroupId,
    category: selectedCategory,
    isPriority: isPriorityOnly || undefined,
    limit: 50,
  }), [selectedGroupId, selectedCategory, isPriorityOnly]);

  // Perform search
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }
    return globalSearch(allExpenses, groups, searchQuery, searchOptions);
  }, [searchQuery, allExpenses, groups, searchOptions]);

  const handleResultPress = (result: SearchResult) => {
    if (result.type === 'expense') {
      const expense = result.data as Expense;
      navigation.navigate('GroupDetail', { groupId: expense.groupId });
    } else if (result.type === 'group') {
      const group = result.data as Group;
      navigation.navigate('GroupDetail', { groupId: group.id });
    }
  };

  const renderResult = ({ item }: { item: SearchResult }) => {
    if (item.type === 'expense') {
      const expense = item.data as Expense;
      return (
        <Card
          style={styles.resultCard}
          onPress={() => handleResultPress(item)}
        >
          <View style={styles.resultHeader}>
            <View style={styles.resultLeft}>
              <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>
                {expense.merchant || expense.title}
              </Text>
              <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]}>
                {expense.category} • {new Date(expense.date).toLocaleDateString('en-IN')}
              </Text>
            </View>
            <View style={styles.resultRight}>
              <Text style={[styles.resultAmount, { color: colors.textPrimary }]}>
                {formatMoney(expense.amount, false, expense.currency || 'INR')}
              </Text>
              {expense.isPriority && (
                <Text style={styles.priorityBadge}>⭐</Text>
              )}
            </View>
          </View>
        </Card>
      );
    } else if (item.type === 'group') {
      const group = item.data as Group;
      return (
        <Card
          style={styles.resultCard}
          onPress={() => handleResultPress(item)}
        >
          <View style={styles.resultHeader}>
            <Text style={styles.groupEmoji}>{group.emoji}</Text>
            <View style={styles.resultLeft}>
              <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>
                {group.name}
              </Text>
              <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]}>
                {group.members.length} members
              </Text>
            </View>
          </View>
        </Card>
      );
    }
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Search</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { 
            backgroundColor: colors.surfaceCard, 
            color: colors.textPrimary,
            borderColor: colors.borderSubtle 
          }]}
          placeholder="Search expenses, merchants, categories..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
      </View>

      {/* Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        <TouchableOpacity
          style={[
            styles.filterChip,
            { 
              backgroundColor: !selectedGroupId ? colors.primary : colors.surfaceCard,
              borderColor: colors.borderSubtle 
            }
          ]}
          onPress={() => setSelectedGroupId(undefined)}
        >
          <Text style={[
            styles.filterText,
            { color: !selectedGroupId ? colors.white : colors.textPrimary }
          ]}>
            All Groups
          </Text>
        </TouchableOpacity>

        {groups.map(group => (
          <TouchableOpacity
            key={group.id}
            style={[
              styles.filterChip,
              { 
                backgroundColor: selectedGroupId === group.id ? colors.primary : colors.surfaceCard,
                borderColor: colors.borderSubtle 
              }
            ]}
            onPress={() => setSelectedGroupId(group.id)}
          >
            <Text style={[
              styles.filterText,
              { color: selectedGroupId === group.id ? colors.white : colors.textPrimary }
            ]}>
              {group.emoji} {group.name}
            </Text>
          </TouchableOpacity>
        ))}

        {categories.map(category => (
          <TouchableOpacity
            key={category}
            style={[
              styles.filterChip,
              { 
                backgroundColor: selectedCategory === category ? colors.accent : colors.surfaceCard,
                borderColor: colors.borderSubtle 
              }
            ]}
            onPress={() => setSelectedCategory(selectedCategory === category ? undefined : category)}
          >
            <Text style={[
              styles.filterText,
              { color: selectedCategory === category ? colors.white : colors.textPrimary }
            ]}>
              {category}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[
            styles.filterChip,
            { 
              backgroundColor: isPriorityOnly ? colors.warning : colors.surfaceCard,
              borderColor: colors.borderSubtle 
            }
          ]}
          onPress={() => setIsPriorityOnly(!isPriorityOnly)}
        >
          <Text style={[
            styles.filterText,
            { color: isPriorityOnly ? colors.white : colors.textPrimary }
          ]}>
            ⭐ Priority Only
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Results */}
      {searchQuery.length > 0 ? (
        searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={item => item.id}
            renderItem={renderResult}
            contentContainerStyle={styles.resultsList}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
              No results found
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Try different keywords or adjust filters
            </Text>
          </View>
        )
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
            Start typing to search
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Search across all expenses, merchants, and categories
          </Text>
        </View>
      )}
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
  backButton: {
    minWidth: 60,
  },
  backButtonText: {
    ...typography.navigation,
  },
  title: {
    ...typography.h2,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    minWidth: 60,
  },
  searchContainer: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  searchInput: {
    ...typography.body,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  filtersContainer: {
    marginBottom: 16,
  },
  filtersContent: {
    paddingHorizontal: 24,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  resultsList: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  resultCard: {
    marginBottom: 12,
    padding: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLeft: {
    flex: 1,
    marginRight: 12,
  },
  resultTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  resultSubtitle: {
    ...typography.bodySmall,
  },
  resultRight: {
    alignItems: 'flex-end',
  },
  resultAmount: {
    ...typography.money,
    marginBottom: 4,
  },
  priorityBadge: {
    fontSize: 16,
  },
  groupEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
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
});

export default SearchScreen;
