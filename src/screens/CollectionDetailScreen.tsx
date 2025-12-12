import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, Button, Modal, BackButton } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { getCollectionSummary, type CollectionSummary } from '../utils/collectionService';
import { Expense } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'CollectionDetail'>;

const CollectionDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { collectionId, groupId } = route.params;
  const { 
    getCollection, 
    getGroup, 
    expenses, 
    updateCollection,
    addExpenseToCollection,
    removeExpenseFromCollection,
    getExpensesForGroup 
  } = useGroups();
  const { colors } = useTheme();
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const styles = createStyles(colors);

  const collection = getCollection(collectionId);
  const group = getGroup(groupId);
  const groupExpenses = getExpensesForGroup(groupId);

  // Get collection summary
  const summary = useMemo(() => {
    if (!collection) return null;
    return getCollectionSummary(collection, groupExpenses);
  }, [collection, groupExpenses]);

  // Get expenses not in any collection or in this collection
  const availableExpenses = useMemo(() => {
    return groupExpenses.filter(e => !e.collectionId || e.collectionId === collectionId);
  }, [groupExpenses, collectionId]);

  const handleAddExpense = (expenseId: string) => {
    if (!collection) return;
    
    if (collection.expenseIds.includes(expenseId)) {
      Alert.alert('Already Added', 'This expense is already in the collection');
      return;
    }

    addExpenseToCollection(collectionId, expenseId);
    setShowAddExpenseModal(false);
  };

  const handleRemoveExpense = (expenseId: string) => {
    Alert.alert(
      'Remove Expense',
      'Remove this expense from the collection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeExpenseFromCollection(collectionId, expenseId);
          },
        },
      ]
    );
  };

  if (!collection || !summary || !group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Collection not found</Text>
      </View>
    );
  }

  const renderExpense = ({ item }: { item: Expense }) => {
    return (
      <Card style={styles.expenseCard}>
        <View style={styles.expenseHeader}>
          <View style={styles.expenseLeft}>
            <Text style={[styles.expenseMerchant, { color: colors.textPrimary }]}>
              {item.merchant || item.title}
            </Text>
            <Text style={[styles.expenseDate, { color: colors.textSecondary }]}>
              {new Date(item.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
            <Text style={[styles.expenseCategory, { color: colors.textSecondary }]}>
              {item.category}
            </Text>
          </View>
          <View style={styles.expenseRight}>
            <Text style={[styles.expenseAmount, { color: colors.textPrimary }]}>
              {formatMoney(item.amount, false, item.currency)}
            </Text>
            <TouchableOpacity
              onPress={() => handleRemoveExpense(item.id)}
              style={styles.removeButton}
            >
              <Text style={[styles.removeButtonText, { color: colors.error }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {collection.name}
        </Text>
        <TouchableOpacity
          onPress={() => setShowAddExpenseModal(true)}
          style={styles.addButton}
        >
          <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Collection Summary */}
        <Card style={styles.summaryCard}>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>Collection Summary</Text>
          {collection.description && (
            <Text style={[styles.summaryDescription, { color: colors.textSecondary }]}>
              {collection.description}
            </Text>
          )}
          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>
                {summary.expenseCount}
              </Text>
              <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>
                Expenses
              </Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>
                {formatMoney(summary.totalAmount, false, summary.currency)}
              </Text>
              <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>
                Total
              </Text>
            </View>
            {summary.dateRange && (
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>
                  {new Date(summary.dateRange.start).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>
                  Start
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Expenses List */}
        <View style={styles.expensesSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Expenses ({summary.expenses.length})
          </Text>
          {summary.expenses.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No expenses in this collection yet. Add expenses to get started.
              </Text>
            </Card>
          ) : (
            <FlatList
              data={summary.expenses}
              keyExtractor={item => item.id}
              renderItem={renderExpense}
              scrollEnabled={false}
              contentContainerStyle={styles.expensesList}
            />
          )}
        </View>
      </ScrollView>

      {/* Add Expense Modal */}
      <Modal
        visible={showAddExpenseModal}
        onClose={() => setShowAddExpenseModal(false)}
        title="Add Expense to Collection"
        variant="glass"
      >
        <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
          {availableExpenses.filter(e => !e.collectionId).length === 0 ? (
            <View style={styles.emptyModalState}>
              <Text style={[styles.emptyModalText, { color: colors.textSecondary }]}>
                No available expenses. All expenses are already in collections or this collection.
              </Text>
            </View>
          ) : (
            availableExpenses
              .filter(e => !e.collectionId)
              .map(expense => (
                <TouchableOpacity
                  key={expense.id}
                  style={[styles.expenseOption, { backgroundColor: colors.surfaceCard }]}
                  onPress={() => handleAddExpense(expense.id)}
                >
                  <View style={styles.expenseOptionLeft}>
                    <Text style={[styles.expenseOptionMerchant, { color: colors.textPrimary }]}>
                      {expense.merchant || expense.title}
                    </Text>
                    <Text style={[styles.expenseOptionDate, { color: colors.textSecondary }]}>
                      {new Date(expense.date).toLocaleDateString('en-IN')} • {expense.category}
                    </Text>
                  </View>
                  <Text style={[styles.expenseOptionAmount, { color: colors.textPrimary }]}>
                    {formatMoney(expense.amount, false, expense.currency)}
                  </Text>
                </TouchableOpacity>
              ))
          )}
          <Button
            title="Cancel"
            onPress={() => setShowAddExpenseModal(false)}
            variant="secondary"
            style={styles.modalButton}
          />
        </ScrollView>
      </Modal>
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
    ...typography.h2,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  addButton: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  addButtonText: {
    ...typography.navigation,
    ...typography.emphasis.semibold,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  summaryCard: {
    padding: 20,
    marginBottom: 24,
  },
  summaryTitle: {
    ...typography.h3,
    marginBottom: 8,
  },
  summaryDescription: {
    ...typography.body,
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryStatValue: {
    ...typography.money,
    marginBottom: 4,
  },
  summaryStatLabel: {
    ...typography.caption,
  },
  expensesSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: 16,
  },
  expensesList: {
    gap: 12,
  },
  expenseCard: {
    padding: 16,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  expenseLeft: {
    flex: 1,
    marginRight: 12,
  },
  expenseMerchant: {
    ...typography.h4,
    marginBottom: 4,
  },
  expenseDate: {
    ...typography.bodySmall,
    marginBottom: 4,
  },
  expenseCategory: {
    ...typography.caption,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  expenseAmount: {
    ...typography.money,
    marginBottom: 8,
  },
  removeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeButtonText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 80,
  },
  modalContent: {
    maxHeight: 400,
  },
  modalScrollContent: {
    paddingVertical: 8,
  },
  expenseOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  expenseOptionLeft: {
    flex: 1,
    marginRight: 12,
  },
  expenseOptionMerchant: {
    ...typography.h4,
    marginBottom: 4,
  },
  expenseOptionDate: {
    ...typography.bodySmall,
  },
  expenseOptionAmount: {
    ...typography.money,
  },
  emptyModalState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyModalText: {
    ...typography.body,
    textAlign: 'center',
  },
  modalButton: {
    marginTop: 16,
  },
});

export default CollectionDetailScreen;
