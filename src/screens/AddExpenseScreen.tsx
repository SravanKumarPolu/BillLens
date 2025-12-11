import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, TextInput, Image, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Input, Button, SplitRatioInput, Modal } from '../components';
import { createEqualSplits, normalizeSplits, verifySplitsSum } from '../utils/mathUtils';
import { ExpensePayer, ExtraItem } from '../types/models';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../utils/currencyService';
import { formatMoney } from '../utils/formatMoney';
import { learnSplitPatterns, getSuggestedSplitPattern, suggestAmount, suggestCategory, learnCategoryPatterns } from '../utils/patternLearningService';
import { getCategories } from '../utils/categoryService';

type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>;

const AddExpenseScreen: React.FC<Props> = ({ navigation, route }) => {
  const { imageUri, groupId, parsedAmount, parsedMerchant, parsedDate, expenseId } = route.params || {};
  const { getExpense, updateExpense, getGroup, addExpense, getExpensesForGroup } = useGroups();
  const { colors } = useTheme();
  
  // Bill details state
  const [merchant, setMerchant] = useState(parsedMerchant || '');
  const [amount, setAmount] = useState(parsedAmount || '');
  
  // Determine category from merchant name if it matches a template
  const getCategoryFromMerchant = (merchantName: string): string => {
    const lower = merchantName.toLowerCase();
    if (lower.includes('rent')) return 'Rent';
    if (lower.includes('electric') || lower.includes('eb') || lower.includes('power')) return 'Utilities';
    if (lower.includes('wifi') || lower.includes('internet')) return 'WiFi';
    if (lower.includes('grocery') || lower.includes('blinkit') || lower.includes('bigbasket')) return 'Groceries';
    if (lower.includes('maid') || lower.includes('help')) return 'Maid';
    if (lower.includes('netflix') || lower.includes('prime') || lower.includes('ott') || lower.includes('disney')) return 'OTT';
    return 'Food'; // Default
  };
  
  const [category, setCategory] = useState<string>(getCategoryFromMerchant(merchant));

  // Split configuration state
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [paidBy, setPaidBy] = useState<string>('you');
  
  // Multiple payers state
  const [payerMode, setPayerMode] = useState<'single' | 'multiple'>('single');
  const [payers, setPayers] = useState<ExpensePayer[]>([]);
  const [showPayerModal, setShowPayerModal] = useState(false);
  const [editingPayerIndex, setEditingPayerIndex] = useState<number | null>(null);
  
  // Extra items state
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [showExtraItemModal, setShowExtraItemModal] = useState(false);
  const [editingExtraItemIndex, setEditingExtraItemIndex] = useState<number | null>(null);
  
  // Currency state
  const currentGroupId = groupId || '1';
  const group = getGroup(currentGroupId);
  const [currency, setCurrency] = useState<string>(group?.currency || 'INR');
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  
  // Priority and payment mode state
  const [isPriority, setIsPriority] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'bank_transfer' | 'card' | 'other' | undefined>(undefined);
  const [categories, setCategories] = useState<string[]>(['Food', 'Groceries', 'Utilities', 'Rent', 'WiFi', 'Maid', 'OTT', 'Other']);

  const styles = createStyles(colors);

  // Load dynamic categories
  useEffect(() => {
    const loadCategories = async () => {
      const dynamicCategories = await getCategories(group?.id);
      if (dynamicCategories.length > 0) {
        setCategories(dynamicCategories);
      }
    };
    if (group) {
      loadCategories();
    }
  }, [group]);
  
  // Pattern learning - get suggestions
  const groupExpenses = useMemo(() => getExpensesForGroup(currentGroupId), [currentGroupId, getExpensesForGroup]);
  const splitPatterns = useMemo(() => learnSplitPatterns(groupExpenses), [groupExpenses]);
  
  // Auto-suggest amount and category when merchant changes (only for new expenses)
  useEffect(() => {
    if (!expenseId && merchant && group && groupExpenses.length > 0) {
      // Suggest category
      const categoryPatterns = learnCategoryPatterns(groupExpenses);
      const categorySuggestion = suggestCategory(merchant, categoryPatterns);
      if (categorySuggestion && categorySuggestion.confidence > 0.6 && !category) {
        setCategory(categorySuggestion.category);
      }
      
      // Suggest amount if not already set
      if (!amount) {
        const amountSuggestion = suggestAmount(category || categorySuggestion?.category || 'Other', groupExpenses);
        if (amountSuggestion && amountSuggestion.confidence > 0.6) {
          setAmount(amountSuggestion.suggestedAmount.toString());
        }
      }
      
      // Suggest split pattern if not already configured
      if (selectedIds.length === 0) {
        const suggestedPattern = getSuggestedSplitPattern(
          category || categorySuggestion?.category || 'Other',
          group,
          splitPatterns
        );
        if (suggestedPattern) {
          setSelectedIds(suggestedPattern.memberIds);
          setMode(suggestedPattern.mode);
          if (suggestedPattern.customAmounts) {
            setCustomAmounts(suggestedPattern.customAmounts);
          }
        }
      }
    }
  }, [merchant, group, groupExpenses, splitPatterns, expenseId, category, amount, selectedIds.length]);

  // Load existing expense data if editing
  useEffect(() => {
    if (expenseId) {
      const expense = getExpense(expenseId);
      if (expense) {
        setMerchant(expense.merchant || expense.title || '');
        setAmount(expense.amount.toString());
        setCategory(expense.category || 'Other');
        setCurrency(expense.currency || group?.currency || 'INR');
        setPaidBy(expense.paidBy || 'you');
        
        // Load multiple payers if exists
        if (expense.payers && expense.payers.length > 0) {
          setPayerMode('multiple');
          setPayers(expense.payers);
        } else {
          setPayerMode('single');
        }
        
        // Load extra items if exists
        if (expense.extraItems && expense.extraItems.length > 0) {
          setExtraItems(expense.extraItems);
        }
        
        // Load priority and payment mode
        setIsPriority(expense.isPriority || false);
        setPaymentMode(expense.paymentMode);
        
        // Load split configuration
        if (expense.splits && expense.splits.length > 0) {
          const splitAmounts = expense.splits.map(s => s.amount);
          const isEqual = splitAmounts.every(amt => Math.abs(amt - splitAmounts[0]) < 0.01);
          
          if (isEqual) {
            setMode('equal');
            setSelectedIds(expense.splits.map(s => s.memberId));
          } else {
            setMode('custom');
            setSelectedIds(expense.splits.map(s => s.memberId));
            const custom: Record<string, number> = {};
            expense.splits.forEach(s => {
              custom[s.memberId] = s.amount;
            });
            setCustomAmounts(custom);
          }
        }
      } else {
        Alert.alert('Error', 'Expense not found', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } else {
      // Set default currency from group
      setCurrency(group?.currency || 'INR');
    }
  }, [expenseId, getExpense, navigation, group]);

  // Initialize members selection
  useEffect(() => {
    if (group && group.members && selectedIds.length === 0) {
      // Initialize with all members selected
      setSelectedIds(group.members.map(m => m.id));
    }
  }, [group, selectedIds.length]);

  // Update total amount when amount changes
  const totalAmount = parseFloat(amount) || 0;

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Group not found</Text>
      </View>
    );
  }

  const toggleMember = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  // Multiple payers handlers
  const handleAddPayer = () => {
    setEditingPayerIndex(null);
    setShowPayerModal(true);
  };

  const handleSavePayer = (memberId: string, amount: number) => {
    if (editingPayerIndex !== null) {
      const updated = [...payers];
      updated[editingPayerIndex] = { memberId, amount };
      setPayers(updated);
    } else {
      setPayers([...payers, { memberId, amount }]);
    }
    setShowPayerModal(false);
    setEditingPayerIndex(null);
  };

  const handleRemovePayer = (index: number) => {
    setPayers(payers.filter((_, i) => i !== index));
  };

  const handleEditPayer = (index: number) => {
    setEditingPayerIndex(index);
    setShowPayerModal(true);
  };

  // Extra items handlers
  const handleAddExtraItem = () => {
    setEditingExtraItemIndex(null);
    setShowExtraItemModal(true);
  };

  const handleSaveExtraItem = (item: Omit<ExtraItem, 'id'>) => {
    const newItem: ExtraItem = {
      ...item,
      id: editingExtraItemIndex !== null 
        ? extraItems[editingExtraItemIndex].id 
        : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    };
    
    if (editingExtraItemIndex !== null) {
      const updated = [...extraItems];
      updated[editingExtraItemIndex] = newItem;
      setExtraItems(updated);
    } else {
      setExtraItems([...extraItems, newItem]);
    }
    setShowExtraItemModal(false);
    setEditingExtraItemIndex(null);
  };

  const handleRemoveExtraItem = (index: number) => {
    setExtraItems(extraItems.filter((_, i) => i !== index));
  };

  const handleEditExtraItem = (index: number) => {
    setEditingExtraItemIndex(index);
    setShowExtraItemModal(true);
  };

  const handleSave = () => {
    // Validate bill details
    if (!merchant.trim()) {
      Alert.alert('Error', 'Please enter a merchant name');
      return;
    }

    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Validate split configuration
    if (selectedIds.length === 0) {
      Alert.alert('Error', 'Please select at least one person');
      return;
    }

    // Calculate splits with proper normalization
    let splits: Array<{ memberId: string; amount: number }> = [];
    
    if (mode === 'equal') {
      // Use math utils to ensure exact total
      splits = createEqualSplits(amountNum, selectedIds);
    } else {
      // Custom mode - validate that amounts match total
      const totalCustom = selectedIds.reduce((sum, id) => sum + (customAmounts[id] || 0), 0);
      const difference = Math.abs(totalCustom - amountNum);
      
      if (difference > 0.01) {
        Alert.alert(
          'Amount Mismatch',
          `Custom split total (₹${totalCustom.toFixed(2)}) doesn't match expense total (₹${amountNum.toFixed(2)}). Difference: ₹${difference.toFixed(2)}.\n\nWould you like to adjust the amounts automatically?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Adjust Automatically',
              onPress: () => {
                // Distribute the difference proportionally
                const adjustment = amountNum - totalCustom;
                const adjustmentPerPerson = adjustment / selectedIds.length;
                const adjustedAmounts: Record<string, number> = {};
                selectedIds.forEach(id => {
                  adjustedAmounts[id] = (customAmounts[id] || 0) + adjustmentPerPerson;
                });
                setCustomAmounts(adjustedAmounts);
                // Retry save after adjustment
                setTimeout(() => handleSave(), 100);
              },
            },
            {
              text: 'Use Equal Split',
              onPress: () => {
                setMode('equal');
                // Retry save after mode change
                setTimeout(() => handleSave(), 100);
              },
            },
          ]
        );
        return;
      }
      
      // Amounts match, normalize custom splits to ensure exact total
      const customSplits = selectedIds.map(memberId => ({
        memberId,
        amount: customAmounts[memberId] || 0,
      }));
      splits = normalizeSplits(customSplits, amountNum);
    }

    // Verify splits sum to total (safety check)
    if (!verifySplitsSum(splits, amountNum)) {
      console.warn('[AddExpense] Split verification failed, normalizing...');
      splits = normalizeSplits(splits, amountNum);
    }

    // Prepare payers array if multiple payers mode
    const finalPayers = payerMode === 'multiple' && payers.length > 0 
      ? payers 
      : undefined;
    
    // Use single payer for backward compatibility if not using multiple payers
    const finalPaidBy = payerMode === 'single' ? paidBy : (payers[0]?.memberId || paidBy);

    // If editing, update the expense
    if (expenseId) {
      const existingExpense = getExpense(expenseId);
      if (!existingExpense) {
        Alert.alert('Error', 'Expense not found');
        return;
      }
      updateExpense(expenseId, {
        merchant: merchant.trim() || 'Expense',
        title: merchant.trim() || 'Expense',
        amount: amountNum,
        currency,
        category: category || existingExpense.category,
        imageUri: imageUri || existingExpense.imageUri,
        paidBy: finalPaidBy,
        payers: finalPayers,
        splits,
        extraItems: extraItems.length > 0 ? extraItems : undefined,
        isPriority: isPriority || undefined,
        paymentMode: paymentMode,
      });
      navigation.goBack();
      return;
    }

    // Create new expense
    addExpense({
      groupId: currentGroupId,
      title: merchant.trim() || 'Expense',
      merchant: merchant.trim() || 'Expense',
      amount: amountNum,
      currency,
      category: category || 'Other',
      paidBy: finalPaidBy,
      payers: finalPayers,
      splits,
      extraItems: extraItems.length > 0 ? extraItems : undefined,
      imageUri,
      isPriority: isPriority || undefined,
      paymentMode: paymentMode,
    });

    // Navigate back to group detail
    navigation.navigate('GroupDetail', { groupId: currentGroupId });
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.surfaceLight }]} 
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {expenseId ? 'Edit expense' : 'Add expense'}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {expenseId ? 'Update the expense details below.' : 'Review bill details and split the expense.'}
      </Text>

      {/* Bill Image */}
      {imageUri ? (
        <View style={[styles.imageWrapper, { backgroundColor: colors.surfaceCard }]}>
          <Image source={{ uri: imageUri }} style={styles.image} />
        </View>
      ) : null}

      {/* Bill Details Section */}
      <View style={[styles.section, { backgroundColor: colors.surfaceCard }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Bill Details</Text>
        
        <Input
          label="Merchant"
          value={merchant}
          onChangeText={setMerchant}
          placeholder="e.g. Swiggy, Blinkit"
          containerStyle={styles.inputContainer}
        />

        <View style={styles.amountRow}>
          <Input
            label="Total amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={{ flex: 1, marginRight: 8 }}
          />
          <TouchableOpacity
            style={[styles.currencyButton, { borderColor: colors.borderSubtle }]}
            onPress={() => setShowCurrencyModal(true)}
          >
            <Text style={[styles.currencyButtonText, { color: colors.textPrimary }]}>
              {SUPPORTED_CURRENCIES.find(c => c.code === currency)?.symbol || '₹'}
            </Text>
            <Text style={[styles.currencyCode, { color: colors.textSecondary }]}>
              {currency}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
        <View style={styles.chipRow}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.chip,
                { borderColor: category === cat ? colors.accent : colors.borderSubtle },
                category === cat && [styles.chipSelected, { backgroundColor: colors.accent }]
              ]}
              onPress={() => setCategory(cat)}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: category === cat ? colors.white : colors.textSecondary },
                  category === cat && styles.chipLabelSelected
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Priority & Payment Mode */}
        <View style={styles.priorityPaymentRow}>
          <TouchableOpacity
            style={[
              styles.priorityButton,
              { 
                borderColor: isPriority ? colors.warning : colors.borderSubtle,
                backgroundColor: isPriority ? colors.warning + '20' : 'transparent'
              }
            ]}
            onPress={() => setIsPriority(!isPriority)}
          >
            <Text style={styles.priorityIcon}>⭐</Text>
            <Text style={[
              styles.priorityText,
              { color: isPriority ? colors.warning : colors.textSecondary }
            ]}>
              Priority
            </Text>
          </TouchableOpacity>

          <View style={styles.paymentModeContainer}>
            <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 8 }]}>Payment Mode</Text>
            <View style={styles.chipRow}>
              {[
                { value: 'cash' as const, label: '💵 Cash' },
                { value: 'upi' as const, label: '📱 UPI' },
                { value: 'bank_transfer' as const, label: '🏦 Bank' },
                { value: 'card' as const, label: '💳 Card' },
                { value: 'other' as const, label: 'Other' },
              ].map(mode => (
                <TouchableOpacity
                  key={mode.value}
                  style={[
                    styles.chip,
                    { borderColor: paymentMode === mode.value ? colors.accent : colors.borderSubtle },
                    paymentMode === mode.value && [styles.chipSelected, { backgroundColor: colors.accent }]
                  ]}
                  onPress={() => setPaymentMode(paymentMode === mode.value ? undefined : mode.value)}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: paymentMode === mode.value ? colors.white : colors.textSecondary },
                      paymentMode === mode.value && styles.chipLabelSelected
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Who Paid */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 8 }]}>Paid by</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeChip,
              { borderColor: colors.borderSubtle },
              payerMode === 'single' && [styles.modeChipActive, { backgroundColor: colors.accent, borderColor: colors.accent }]
            ]}
            onPress={() => setPayerMode('single')}
          >
            <Text
              style={[
                styles.modeLabel,
                { color: payerMode === 'single' ? colors.white : colors.textSecondary },
                payerMode === 'single' && styles.modeLabelActive
              ]}
            >
              Single payer
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeChip,
              { borderColor: colors.borderSubtle },
              payerMode === 'multiple' && [styles.modeChipActive, { backgroundColor: colors.accent, borderColor: colors.accent }]
            ]}
            onPress={() => setPayerMode('multiple')}
          >
            <Text
              style={[
                styles.modeLabel,
                { color: payerMode === 'multiple' ? colors.white : colors.textSecondary },
                payerMode === 'multiple' && styles.modeLabelActive
              ]}
            >
              Multiple payers
            </Text>
          </TouchableOpacity>
        </View>

        {payerMode === 'single' ? (
          <View style={styles.chipRow}>
            {group.members.map(member => (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.chip,
                  { borderColor: paidBy === member.id ? colors.accent : colors.borderSubtle },
                  paidBy === member.id && [styles.chipSelected, { backgroundColor: colors.accent }]
                ]}
                onPress={() => setPaidBy(member.id)}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: paidBy === member.id ? colors.white : colors.textSecondary },
                    paidBy === member.id && styles.chipLabelSelected
                  ]}
                >
                  {member.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.payersList}>
            {payers.map((payer, index) => {
              const member = group.members.find(m => m.id === payer.memberId);
              return (
                <View key={index} style={[styles.payerRow, { backgroundColor: colors.surfaceLight }]}>
                  <View style={styles.payerInfo}>
                    <Text style={[styles.payerName, { color: colors.textPrimary }]}>
                      {member?.name || 'Unknown'}
                    </Text>
                    <Text style={[styles.payerAmount, { color: colors.textSecondary }]}>
                      {formatMoney(payer.amount, false, currency)}
                    </Text>
                  </View>
                  <View style={styles.payerActions}>
                    <TouchableOpacity
                      style={styles.payerActionButton}
                      onPress={() => handleEditPayer(index)}
                    >
                      <Text style={[styles.payerActionText, { color: colors.primary }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.payerActionButton}
                      onPress={() => handleRemovePayer(index)}
                    >
                      <Text style={[styles.payerActionText, { color: colors.error }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <TouchableOpacity
              style={[styles.addButton, { borderColor: colors.borderSubtle }]}
              onPress={handleAddPayer}
            >
              <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add payer</Text>
            </TouchableOpacity>
            {payers.length > 0 && (
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
                Total paid: {formatMoney(
                  payers.reduce((sum, p) => sum + p.amount, 0),
                  false,
                  currency
                )}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Split Configuration Section */}
      <View style={[styles.section, { backgroundColor: colors.surfaceCard }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Split Configuration</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Choose people and how you want to split.
        </Text>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeChip,
              { borderColor: colors.borderSubtle },
              mode === 'equal' && [styles.modeChipActive, { backgroundColor: colors.accent, borderColor: colors.accent }]
            ]}
            onPress={() => setMode('equal')}
          >
            <Text
              style={[
                styles.modeLabel,
                { color: mode === 'equal' ? colors.white : colors.textSecondary },
                mode === 'equal' && styles.modeLabelActive
              ]}
            >
              Equal
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeChip,
              { borderColor: colors.borderSubtle },
              mode === 'custom' && [styles.modeChipActive, { backgroundColor: colors.accent, borderColor: colors.accent }]
            ]}
            onPress={() => setMode('custom')}
          >
            <Text
              style={[
                styles.modeLabel,
                { color: mode === 'custom' ? colors.white : colors.textSecondary },
                mode === 'custom' && styles.modeLabelActive
              ]}
            >
              Custom
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={group.members || []}
          keyExtractor={m => m.id}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            const shareAmount = selected && totalAmount > 0
              ? mode === 'equal'
                ? totalAmount / selectedIds.length
                : customAmounts[item.id] || 0
              : 0;
            
            return (
              <View style={[
                styles.memberRow,
                { backgroundColor: colors.surfaceLight },
                selected && [styles.memberRowSelected, { borderColor: colors.accent }]
              ]}>
                <TouchableOpacity
                  style={styles.memberLeft}
                  onPress={() => toggleMember(item.id)}
                >
                  <Text style={[styles.memberName, { color: colors.textPrimary }]}>{item.name}</Text>
                </TouchableOpacity>
                {selected && mode === 'custom' ? (
                  <SplitRatioInput
                    memberId={item.id}
                    memberName={item.name}
                    amount={customAmounts[item.id] || 0}
                    totalAmount={totalAmount}
                    onChange={(memberId, amount) => {
                      setCustomAmounts(prev => ({ ...prev, [memberId]: amount }));
                    }}
                    showPercentage={true}
                    style={{ flex: 1, marginLeft: 8 }}
                  />
                ) : (
                  <Text style={[styles.memberShare, { color: colors.textSecondary }]}>
                    {selected
                      ? formatMoney(shareAmount, false, currency)
                      : 'Not included'}
                  </Text>
                )}
              </View>
            );
          }}
          contentContainerStyle={styles.membersList}
        />

        <View style={[styles.summaryBox, { backgroundColor: colors.surfaceLight }]}>
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            Total: {formatMoney(totalAmount, false, currency)} split between {selectedIds.length} {selectedIds.length === 1 ? 'person' : 'people'}.
          </Text>
          {mode === 'custom' && (
            <Text style={[styles.summaryText, styles.summaryWarning, { color: colors.textSecondary }]}>
              Custom total: {formatMoney(selectedIds.reduce((sum, id) => sum + (customAmounts[id] || 0), 0), false, currency)}
              {Math.abs(selectedIds.reduce((sum, id) => sum + (customAmounts[id] || 0), 0) - totalAmount) > 0.01 && (
                <Text style={{ color: colors.error }}> (doesn't match total)</Text>
              )}
            </Text>
          )}
        </View>
      </View>

      {/* Extra Items Section */}
      <View style={[styles.section, { backgroundColor: colors.surfaceCard }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Extra Items</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Add special items or adjustments (optional)
          </Text>
        </View>

        {extraItems.map((item, index) => (
          <View key={item.id} style={[styles.extraItemRow, { backgroundColor: colors.surfaceLight }]}>
            <View style={styles.extraItemInfo}>
              <Text style={[styles.extraItemName, { color: colors.textPrimary }]}>
                {item.name}
              </Text>
              <Text style={[styles.extraItemAmount, { color: colors.textSecondary }]}>
                {formatMoney(item.amount, false, currency)}
              </Text>
              {item.paidBy && (
                <Text style={[styles.extraItemDetail, { color: colors.textSecondary }]}>
                  Paid by: {group.members.find(m => m.id === item.paidBy)?.name || item.paidBy}
                </Text>
              )}
              {item.splitBetween && item.splitBetween.length > 0 && (
                <Text style={[styles.extraItemDetail, { color: colors.textSecondary }]}>
                  Split between: {item.splitBetween.map(id => group.members.find(m => m.id === id)?.name || id).join(', ')}
                </Text>
              )}
            </View>
            <View style={styles.extraItemActions}>
              <TouchableOpacity
                style={styles.extraItemActionButton}
                onPress={() => handleEditExtraItem(index)}
              >
                <Text style={[styles.extraItemActionText, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.extraItemActionButton}
                onPress={() => handleRemoveExtraItem(index)}
              >
                <Text style={[styles.extraItemActionText, { color: colors.error }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.addButton, { borderColor: colors.borderSubtle }]}
          onPress={handleAddExtraItem}
        >
          <Text style={[styles.addButtonText, { color: colors.primary }]}>+ Add extra item</Text>
        </TouchableOpacity>
      </View>

      <Button
        title={expenseId ? 'Save changes' : 'Save expense'}
        onPress={handleSave}
        variant="positive"
        style={styles.primaryButton}
      />

      {/* Currency Selection Modal */}
      <Modal
        visible={showCurrencyModal}
        onClose={() => setShowCurrencyModal(false)}
        title="Select Currency"
        variant="glass"
      >
        <FlatList
          data={SUPPORTED_CURRENCIES}
          keyExtractor={item => item.code}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.currencyOption,
                { backgroundColor: currency === item.code ? colors.accent : colors.surfaceLight },
                { borderColor: colors.borderSubtle }
              ]}
              onPress={() => {
                setCurrency(item.code);
                setShowCurrencyModal(false);
              }}
            >
              <Text style={[
                styles.currencyOptionText,
                { color: currency === item.code ? colors.white : colors.textPrimary }
              ]}>
                {item.symbol} {item.name} ({item.code})
              </Text>
            </TouchableOpacity>
          )}
        />
      </Modal>

      {/* Payer Modal */}
      <PayerModal
        visible={showPayerModal}
        onClose={() => {
          setShowPayerModal(false);
          setEditingPayerIndex(null);
        }}
        group={group}
        members={group.members}
        onSave={handleSavePayer}
        editingPayer={editingPayerIndex !== null ? payers[editingPayerIndex] : undefined}
        currency={currency}
        colors={colors}
      />

      {/* Extra Item Modal */}
      <ExtraItemModal
        visible={showExtraItemModal}
        onClose={() => {
          setShowExtraItemModal(false);
          setEditingExtraItemIndex(null);
        }}
        group={group}
        members={group.members}
        onSave={handleSaveExtraItem}
        editingItem={editingExtraItemIndex !== null ? extraItems[editingExtraItemIndex] : undefined}
        currency={currency}
        colors={colors}
      />
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
  imageWrapper: {
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  image: {
    flex: 1,
    resizeMode: 'cover',
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    marginBottom: recommendedSpacing.default,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipSelected: {
    // Colors applied inline
  },
  chipLabel: {
    ...typography.label,
  },
  chipLabelSelected: {
    ...typography.label,
    ...typography.emphasis.semibold,
  },
  modeRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  modeChipActive: {
    // Colors applied inline
  },
  modeLabel: {
    ...typography.bodySmall,
  },
  modeLabelActive: {
    ...typography.label,
  },
  priorityPaymentRow: {
    marginTop: 16,
    marginBottom: 16,
  },
  priorityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  priorityIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  priorityText: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  paymentModeContainer: {
    marginTop: 8,
  },
  membersList: {
    paddingVertical: 8,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  memberRowSelected: {
    borderWidth: 1,
  },
  memberLeft: {
    flex: 1,
  },
  memberName: {
    ...typography.body,
  },
  memberShare: {
    ...typography.bodySmall,
  },
  amountInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...typography.body,
    minWidth: 80,
    textAlign: 'right',
  },
  summaryBox: {
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  summaryText: {
    ...typography.bodySmall,
  },
  summaryWarning: {
    marginTop: 4,
    ...typography.caption,
  },
  primaryButton: {
    marginTop: 8,
  },
  errorText: {
    ...typography.bodyLarge,
    textAlign: 'center',
    marginTop: 100,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  currencyButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  currencyButtonText: {
    ...typography.h4,
    marginBottom: 2,
  },
  currencyCode: {
    ...typography.caption,
  },
  payersList: {
    marginTop: 8,
  },
  payerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  payerInfo: {
    flex: 1,
  },
  payerName: {
    ...typography.body,
    marginBottom: 4,
  },
  payerAmount: {
    ...typography.bodySmall,
  },
  payerActions: {
    flexDirection: 'row',
  },
  payerActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  payerActionText: {
    ...typography.bodySmall,
  },
  addButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    ...typography.body,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  extraItemRow: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  extraItemInfo: {
    marginBottom: 8,
  },
  extraItemName: {
    ...typography.body,
    marginBottom: 4,
  },
  extraItemAmount: {
    ...typography.bodySmall,
    marginBottom: 4,
  },
  extraItemDetail: {
    ...typography.caption,
  },
  extraItemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  extraItemActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  extraItemActionText: {
    ...typography.bodySmall,
  },
  currencyOption: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  currencyOptionText: {
    ...typography.body,
  },
});

// Payer Modal Component
interface PayerModalProps {
  visible: boolean;
  onClose: () => void;
  group: any;
  members: any[];
  onSave: (memberId: string, amount: number) => void;
  editingPayer?: ExpensePayer;
  currency: string;
  colors: any;
}

const PayerModal: React.FC<PayerModalProps> = ({
  visible,
  onClose,
  members,
  onSave,
  editingPayer,
  currency,
  colors,
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState(editingPayer?.memberId || members[0]?.id || '');
  const [amount, setAmount] = useState(editingPayer?.amount.toString() || '');

  useEffect(() => {
    if (editingPayer) {
      setSelectedMemberId(editingPayer.memberId);
      setAmount(editingPayer.amount.toString());
    }
  }, [editingPayer]);

  const handleSave = () => {
    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!selectedMemberId) {
      Alert.alert('Error', 'Please select a member');
      return;
    }
    onSave(selectedMemberId, amountNum);
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={editingPayer ? 'Edit Payer' : 'Add Payer'}
      variant="glass"
    >
      <View>
        <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Member</Text>
        <View style={modalStyles.chipRow}>
          {members.map(member => (
            <TouchableOpacity
              key={member.id}
              style={[
                modalStyles.chip,
                { borderColor: selectedMemberId === member.id ? colors.accent : colors.borderSubtle },
                selectedMemberId === member.id && [modalStyles.chipSelected, { backgroundColor: colors.accent }]
              ]}
              onPress={() => setSelectedMemberId(member.id)}
            >
              <Text
                style={[
                  modalStyles.chipLabel,
                  { color: selectedMemberId === member.id ? colors.white : colors.textSecondary },
                  selectedMemberId === member.id && modalStyles.chipLabelSelected
                ]}
              >
                {member.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          containerStyle={modalStyles.inputContainer}
        />

        <View style={modalStyles.modalButtons}>
          <Button
            title="Cancel"
            onPress={onClose}
            variant="secondary"
            style={modalStyles.modalButton}
          />
          <Button
            title="Save"
            onPress={handleSave}
            variant="primary"
            style={modalStyles.modalButton}
          />
        </View>
      </View>
    </Modal>
  );
};

// Extra Item Modal Component
interface ExtraItemModalProps {
  visible: boolean;
  onClose: () => void;
  group: any;
  members: any[];
  onSave: (item: Omit<ExtraItem, 'id'>) => void;
  editingItem?: ExtraItem;
  currency: string;
  colors: any;
}

const ExtraItemModal: React.FC<ExtraItemModalProps> = ({
  visible,
  onClose,
  members,
  onSave,
  editingItem,
  currency,
  colors,
}) => {
  const [name, setName] = useState(editingItem?.name || '');
  const [amount, setAmount] = useState(editingItem?.amount.toString() || '');
  const [paidBy, setPaidBy] = useState<string | undefined>(editingItem?.paidBy);
  const [splitBetween, setSplitBetween] = useState<string[]>(editingItem?.splitBetween || []);

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setAmount(editingItem.amount.toString());
      setPaidBy(editingItem.paidBy);
      setSplitBetween(editingItem.splitBetween || []);
    }
  }, [editingItem]);

  const toggleMember = (id: string) => {
    setSplitBetween(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter item name');
      return;
    }
    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    onSave({
      name: name.trim(),
      amount: amountNum,
      paidBy,
      splitBetween: splitBetween.length > 0 ? splitBetween : undefined,
    });
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={editingItem ? 'Edit Extra Item' : 'Add Extra Item'}
      variant="glass"
    >
      <ScrollView>
        <Input
          label="Item name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Tip, Service charge"
          containerStyle={modalStyles.inputContainer}
        />

        <Input
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          containerStyle={modalStyles.inputContainer}
        />

        <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Paid by (optional)</Text>
        <View style={modalStyles.chipRow}>
          <TouchableOpacity
            style={[
              modalStyles.chip,
              { borderColor: paidBy === undefined ? colors.accent : colors.borderSubtle },
              paidBy === undefined && [modalStyles.chipSelected, { backgroundColor: colors.accent }]
            ]}
            onPress={() => setPaidBy(undefined)}
          >
            <Text
              style={[
                modalStyles.chipLabel,
                { color: paidBy === undefined ? colors.white : colors.textSecondary },
                paidBy === undefined && modalStyles.chipLabelSelected
              ]}
            >
              None
            </Text>
          </TouchableOpacity>
          {members.map(member => (
            <TouchableOpacity
              key={member.id}
              style={[
                modalStyles.chip,
                { borderColor: paidBy === member.id ? colors.accent : colors.borderSubtle },
                paidBy === member.id && [modalStyles.chipSelected, { backgroundColor: colors.accent }]
              ]}
              onPress={() => setPaidBy(member.id)}
            >
              <Text
                style={[
                  modalStyles.chipLabel,
                  { color: paidBy === member.id ? colors.white : colors.textSecondary },
                  paidBy === member.id && modalStyles.chipLabelSelected
                ]}
              >
                {member.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[modalStyles.label, { color: colors.textSecondary, marginTop: 8 }]}>
          Split between (optional, leave empty to split equally)
        </Text>
        <View style={modalStyles.chipRow}>
          {members.map(member => (
            <TouchableOpacity
              key={member.id}
              style={[
                modalStyles.chip,
                { borderColor: splitBetween.includes(member.id) ? colors.accent : colors.borderSubtle },
                splitBetween.includes(member.id) && [modalStyles.chipSelected, { backgroundColor: colors.accent }]
              ]}
              onPress={() => toggleMember(member.id)}
            >
              <Text
                style={[
                  modalStyles.chipLabel,
                  { color: splitBetween.includes(member.id) ? colors.white : colors.textSecondary },
                  splitBetween.includes(member.id) && modalStyles.chipLabelSelected
                ]}
              >
                {member.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={modalStyles.modalButtons}>
          <Button
            title="Cancel"
            onPress={onClose}
            variant="secondary"
            style={modalStyles.modalButton}
          />
          <Button
            title="Save"
            onPress={handleSave}
            variant="primary"
            style={modalStyles.modalButton}
          />
        </View>
      </ScrollView>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipSelected: {
    // Colors applied inline
  },
  chipLabel: {
    ...typography.label,
  },
  chipLabelSelected: {
    ...typography.label,
    ...typography.emphasis.semibold,
  },
});

export default AddExpenseScreen;
