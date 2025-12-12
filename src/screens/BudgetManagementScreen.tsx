import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Alert, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, Button, Modal, BackButton } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { checkBudgetStatus, getAllBudgetStatuses, getBudgetAlerts, type BudgetStatus } from '../utils/categoryBudgetService';
import { getCategories } from '../utils/categoryService';
import { CategoryBudget, RecurringExpense } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'BudgetManagement'>;

const BudgetManagementScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params || {};
  const { 
    getGroup, 
    expenses, 
    budgets, 
    recurringExpenses,
    getBudgetsForGroup,
    getRecurringExpensesForGroup,
    getExpensesForGroup,
    addBudget,
    updateBudget,
    deleteBudget,
    addRecurringExpense,
    updateRecurringExpense,
    deleteRecurringExpense,
  } = useGroups();
  const { colors } = useTheme();
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [recurringName, setRecurringName] = useState('');
  const [recurringAmount, setRecurringAmount] = useState('');
  const [recurringCategory, setRecurringCategory] = useState('');
  const [recurringFrequency, setRecurringFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const styles = createStyles(colors);

  const group = groupId ? getGroup(groupId) : null;
  const groupBudgets = getBudgetsForGroup(groupId);
  const groupRecurring = getRecurringExpensesForGroup(groupId);
  const groupExpenses = groupId ? getExpensesForGroup(groupId) : [];
  const [categories, setCategories] = useState<string[]>([]);

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      const cats = await getCategories(groupId);
      setCategories(cats);
    };
    loadCategories();
  }, [groupId]);

  // Get budget statuses
  const budgetStatuses = useMemo(() => {
    return getAllBudgetStatuses(groupExpenses, groupBudgets);
  }, [groupExpenses, groupBudgets]);

  // Get budget alerts
  const budgetAlerts = useMemo(() => {
    return getBudgetAlerts(groupExpenses, groupBudgets);
  }, [groupExpenses, groupBudgets]);

  const handleSaveBudget = () => {
    if (!selectedCategory || !budgetAmount) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amount = parseFloat(budgetAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (editingBudgetId) {
      updateBudget(editingBudgetId, {
        category: selectedCategory,
        monthlyLimit: amount,
        currency: group?.currency || 'INR',
      });
    } else {
      addBudget({
        category: selectedCategory,
        monthlyLimit: amount,
        currency: group?.currency || 'INR',
        groupId: groupId,
      });
    }

    setSelectedCategory('');
    setBudgetAmount('');
    setEditingBudgetId(null);
    setShowBudgetModal(false);
  };

  const handleSaveRecurring = () => {
    if (!recurringName || !recurringAmount || !recurringCategory) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amount = parseFloat(recurringAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Calculate next due date based on frequency
    const now = new Date();
    let nextDue = new Date();
    if (recurringFrequency === 'daily') {
      nextDue.setDate(now.getDate() + 1);
    } else if (recurringFrequency === 'weekly') {
      nextDue.setDate(now.getDate() + 7);
    } else if (recurringFrequency === 'monthly') {
      nextDue.setMonth(now.getMonth() + 1);
    } else if (recurringFrequency === 'yearly') {
      nextDue.setFullYear(now.getFullYear() + 1);
    }

    if (editingRecurringId) {
      updateRecurringExpense(editingRecurringId, {
        name: recurringName,
        category: recurringCategory,
        amount,
        frequency: recurringFrequency,
        nextDueDate: nextDue.toISOString(),
      });
    } else {
      addRecurringExpense({
        groupId: groupId,
        name: recurringName,
        category: recurringCategory,
        amount,
        currency: group?.currency || 'INR',
        frequency: recurringFrequency,
        startDate: now.toISOString(),
        nextDueDate: nextDue.toISOString(),
        isActive: true,
        reminderDaysBefore: 3,
      });
    }

    setRecurringName('');
    setRecurringAmount('');
    setRecurringCategory('');
    setRecurringFrequency('monthly');
    setEditingRecurringId(null);
    setShowRecurringModal(false);
  };

  const handleEditBudget = (budget: CategoryBudget) => {
    setSelectedCategory(budget.category);
    setBudgetAmount(budget.monthlyLimit.toString());
    setEditingBudgetId(budget.id);
    setShowBudgetModal(true);
  };

  const handleEditRecurring = (recurring: RecurringExpense) => {
    setRecurringName(recurring.name);
    setRecurringAmount(recurring.amount.toString());
    setRecurringCategory(recurring.category);
    setRecurringFrequency(recurring.frequency);
    setEditingRecurringId(recurring.id);
    setShowRecurringModal(true);
  };

  const handleDeleteBudget = (budgetId: string, category: string) => {
    Alert.alert(
      'Delete Budget',
      `Are you sure you want to delete the budget for ${category}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteBudget(budgetId),
        },
      ]
    );
  };

  const handleDeleteRecurring = (recurringId: string, name: string) => {
    Alert.alert(
      'Delete Recurring Expense',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteRecurringExpense(recurringId),
        },
      ]
    );
  };

  const renderBudget = (status: BudgetStatus) => {
    const budget = status.budget;
    if (!budget) return null;

    const currency = budget.currency || 'INR';

    return (
      <Card key={status.category} style={styles.budgetCard}>
        <View style={styles.budgetHeader}>
          <View style={styles.budgetLeft}>
            <Text style={[styles.budgetCategory, { color: colors.textPrimary }]}>
              {status.category}
            </Text>
            <Text style={[styles.budgetLimit, { color: colors.textSecondary }]}>
              Limit: {formatMoney(budget.monthlyLimit, false, currency)}
            </Text>
          </View>
          <View style={styles.budgetRight}>
            <Text style={[
              styles.budgetSpent,
              { color: status.isExceeded ? colors.error : status.isWarning ? colors.warning : colors.textPrimary }
            ]}>
              {formatMoney(status.spent, false, currency)}
            </Text>
            <Text style={[styles.budgetPercentage, { 
              color: status.isExceeded ? colors.error : status.isWarning ? colors.warning : colors.textSecondary 
            }]}>
              {status.percentageUsed.toFixed(0)}%
            </Text>
          </View>
        </View>
        <View style={[styles.progressBarContainer, { backgroundColor: colors.borderSubtle }]}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${Math.min(status.percentageUsed, 100)}%`,
                backgroundColor: status.isExceeded ? colors.error : status.isWarning ? colors.warning : colors.accent,
              },
            ]}
          />
        </View>
        <View style={styles.budgetActions}>
          <TouchableOpacity
            onPress={() => handleEditBudget(budget)}
            style={styles.actionButton}
          >
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDeleteBudget(budget.id, status.category)}
            style={styles.actionButton}
          >
            <Text style={[styles.actionButtonText, { color: colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  const renderRecurring = (recurring: RecurringExpense) => {
    const nextDue = new Date(recurring.nextDueDate);
    const isOverdue = nextDue < new Date() && recurring.isActive;

    return (
      <Card key={recurring.id} style={styles.recurringCard}>
        <View style={styles.recurringHeader}>
          <View style={styles.recurringLeft}>
            <Text style={[styles.recurringName, { color: colors.textPrimary }]}>
              {recurring.name}
            </Text>
            <Text style={[styles.recurringCategory, { color: colors.textSecondary }]}>
              {recurring.category} • {recurring.frequency}
            </Text>
            <Text style={[
              styles.recurringDue,
              { color: isOverdue ? colors.error : colors.textSecondary }
            ]}>
              Next due: {nextDue.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
              {isOverdue && ' (Overdue)'}
            </Text>
          </View>
          <View style={styles.recurringRight}>
            <Text style={[styles.recurringAmount, { color: colors.textPrimary }]}>
              {formatMoney(recurring.amount, false, recurring.currency)}
            </Text>
            {!recurring.isActive && (
              <Text style={[styles.inactiveBadge, { color: colors.textSecondary }]}>Inactive</Text>
            )}
          </View>
        </View>
        <View style={styles.recurringActions}>
          <TouchableOpacity
            onPress={() => handleEditRecurring(recurring)}
            style={styles.actionButton}
          >
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => updateRecurringExpense(recurring.id, { isActive: !recurring.isActive })}
            style={styles.actionButton}
          >
            <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>
              {recurring.isActive ? 'Deactivate' : 'Activate'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDeleteRecurring(recurring.id, recurring.name)}
            style={styles.actionButton}
          >
            <Text style={[styles.actionButtonText, { color: colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {groupId ? 'Group Budget' : 'Personal Budget'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Budget Alerts */}
        {budgetAlerts.length > 0 && (
          <View style={styles.alertsSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>⚠️ Budget Alerts</Text>
            {budgetAlerts.map(alert => (
              <Card key={alert.category} style={[styles.alertCard, { 
                borderLeftColor: alert.isExceeded ? colors.error : colors.warning 
              }]}>
                <Text style={[styles.alertText, { color: colors.textPrimary }]}>
                  {alert.category}: {alert.isExceeded ? 'Exceeded' : 'Warning'} - {formatMoney(alert.spent, false, alert.budget?.currency || 'INR')} / {formatMoney(alert.budget?.monthlyLimit || 0, false, alert.budget?.currency || 'INR')}
                </Text>
              </Card>
            ))}
          </View>
        )}

        {/* Budgets Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Category Budgets</Text>
            <TouchableOpacity
              onPress={() => {
                setEditingBudgetId(null);
                setSelectedCategory('');
                setBudgetAmount('');
                setShowBudgetModal(true);
              }}
              style={styles.addButton}
            >
              <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {budgetStatuses.length > 0 ? (
            budgetStatuses.map(status => renderBudget(status))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No budgets set. Add a budget to track spending limits.
              </Text>
            </Card>
          )}
        </View>

        {/* Recurring Expenses Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recurring Expenses</Text>
            <View style={styles.sectionHeaderRight}>
              {groupId && groupRecurring.length > 0 && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('RecurringExpensesReport', { groupId })}
                  style={styles.reportButton}
                >
                  <Text style={[styles.reportButtonText, { color: colors.primary }]}>Report →</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  setEditingRecurringId(null);
                  setRecurringName('');
                  setRecurringAmount('');
                  setRecurringCategory('');
                  setRecurringFrequency('monthly');
                  setShowRecurringModal(true);
                }}
                style={styles.addButton}
              >
                <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {groupRecurring.length > 0 ? (
            groupRecurring.map(recurring => renderRecurring(recurring))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No recurring expenses. Add subscriptions and regular bills.
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Budget Modal */}
      <Modal
        visible={showBudgetModal}
        onClose={() => {
          setShowBudgetModal(false);
          setSelectedCategory('');
          setBudgetAmount('');
          setEditingBudgetId(null);
        }}
        title={editingBudgetId ? 'Edit Budget' : 'Add Budget'}
        variant="glass"
      >
        <View style={styles.modalContent}>
          <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  { 
                    borderColor: selectedCategory === cat ? colors.accent : colors.borderSubtle,
                    backgroundColor: selectedCategory === cat ? colors.accent + '20' : 'transparent'
                  }
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[
                  styles.categoryChipText,
                  { color: selectedCategory === cat ? colors.accent : colors.textSecondary }
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.modalLabel, { color: colors.textSecondary, marginTop: 16 }]}>Monthly Limit</Text>
          <TextInput
            style={[styles.amountInput, { 
              backgroundColor: colors.surfaceCard, 
              color: colors.textPrimary,
              borderColor: colors.borderSubtle 
            }]}
            value={budgetAmount}
            onChangeText={setBudgetAmount}
            placeholder="Enter amount"
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />

          <View style={styles.modalButtons}>
            <Button
              title="Cancel"
              onPress={() => {
                setShowBudgetModal(false);
                setSelectedCategory('');
                setBudgetAmount('');
                setEditingBudgetId(null);
              }}
              variant="secondary"
              style={styles.modalButton}
            />
            <Button
              title={editingBudgetId ? 'Update' : 'Add'}
              onPress={handleSaveBudget}
              variant="primary"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Recurring Expense Modal */}
      <Modal
        visible={showRecurringModal}
        onClose={() => {
          setShowRecurringModal(false);
          setRecurringName('');
          setRecurringAmount('');
          setRecurringCategory('');
          setEditingRecurringId(null);
        }}
        title={editingRecurringId ? 'Edit Recurring Expense' : 'Add Recurring Expense'}
        variant="glass"
      >
        <ScrollView style={styles.modalContent}>
          <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Name</Text>
          <TextInput
            style={[styles.textInput, { 
              backgroundColor: colors.surfaceCard, 
              color: colors.textPrimary,
              borderColor: colors.borderSubtle 
            }]}
            value={recurringName}
            onChangeText={setRecurringName}
            placeholder="e.g., Netflix, Rent, Gym"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.modalLabel, { color: colors.textSecondary, marginTop: 16 }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  { 
                    borderColor: recurringCategory === cat ? colors.accent : colors.borderSubtle,
                    backgroundColor: recurringCategory === cat ? colors.accent + '20' : 'transparent'
                  }
                ]}
                onPress={() => setRecurringCategory(cat)}
              >
                <Text style={[
                  styles.categoryChipText,
                  { color: recurringCategory === cat ? colors.accent : colors.textSecondary }
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.modalLabel, { color: colors.textSecondary, marginTop: 16 }]}>Amount</Text>
          <TextInput
            style={[styles.amountInput, { 
              backgroundColor: colors.surfaceCard, 
              color: colors.textPrimary,
              borderColor: colors.borderSubtle 
            }]}
            value={recurringAmount}
            onChangeText={setRecurringAmount}
            placeholder="Enter amount"
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.modalLabel, { color: colors.textSecondary, marginTop: 16 }]}>Frequency</Text>
          <View style={styles.frequencyRow}>
            {(['monthly', 'weekly', 'yearly'] as const).map(freq => (
              <TouchableOpacity
                key={freq}
                style={[
                  styles.frequencyChip,
                  { 
                    borderColor: recurringFrequency === freq ? colors.accent : colors.borderSubtle,
                    backgroundColor: recurringFrequency === freq ? colors.accent + '20' : 'transparent'
                  }
                ]}
                onPress={() => setRecurringFrequency(freq)}
              >
                <Text style={[
                  styles.frequencyChipText,
                  { color: recurringFrequency === freq ? colors.accent : colors.textSecondary }
                ]}>
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalButtons}>
            <Button
              title="Cancel"
              onPress={() => {
                setShowRecurringModal(false);
                setRecurringName('');
                setRecurringAmount('');
                setRecurringCategory('');
                setEditingRecurringId(null);
              }}
              variant="secondary"
              style={styles.modalButton}
            />
            <Button
              title={editingRecurringId ? 'Update' : 'Add'}
              onPress={handleSaveRecurring}
              variant="primary"
              style={styles.modalButton}
            />
          </View>
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
  alertsSection: {
    marginBottom: 32,
  },
  alertCard: {
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  alertText: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    ...typography.h4,
  },
  addButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addButtonText: {
    ...typography.body,
    ...typography.emphasis.semibold,
    color: colors.primary,
  },
  reportButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  reportButtonText: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  budgetCard: {
    padding: 16,
    marginBottom: 12,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  budgetLeft: {
    flex: 1,
  },
  budgetCategory: {
    ...typography.h4,
    marginBottom: 4,
  },
  budgetLimit: {
    ...typography.bodySmall,
  },
  budgetRight: {
    alignItems: 'flex-end',
  },
  budgetSpent: {
    ...typography.money,
    marginBottom: 4,
  },
  budgetPercentage: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  progressBarContainer: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  budgetActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionButtonText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  recurringCard: {
    padding: 16,
    marginBottom: 12,
  },
  recurringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  recurringLeft: {
    flex: 1,
  },
  recurringName: {
    ...typography.h4,
    marginBottom: 4,
  },
  recurringCategory: {
    ...typography.bodySmall,
    marginBottom: 4,
  },
  recurringDue: {
    ...typography.bodySmall,
  },
  recurringRight: {
    alignItems: 'flex-end',
  },
  recurringAmount: {
    ...typography.money,
    marginBottom: 4,
  },
  inactiveBadge: {
    ...typography.caption,
  },
  recurringActions: {
    flexDirection: 'row',
    gap: 16,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  modalContent: {
    paddingVertical: 8,
  },
  modalLabel: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  categoryScroll: {
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
  },
  categoryChipText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  amountInput: {
    ...typography.body,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  textInput: {
    ...typography.body,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  frequencyChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    flex: 1,
  },
  frequencyChipText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
});

export default BudgetManagementScreen;
