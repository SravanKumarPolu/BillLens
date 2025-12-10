import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, TextInput, Image, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Input, Button } from '../components';
import { createEqualSplits, normalizeSplits, verifySplitsSum } from '../utils/mathUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>;

const categories = ['Food', 'Groceries', 'Utilities', 'Rent', 'WiFi', 'Maid', 'OTT', 'Other'];

const AddExpenseScreen: React.FC<Props> = ({ navigation, route }) => {
  const { imageUri, groupId, parsedAmount, parsedMerchant, parsedDate, expenseId } = route.params || {};
  const { getExpense, updateExpense, getGroup, addExpense } = useGroups();
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

  const currentGroupId = groupId || '1';
  const group = getGroup(currentGroupId);
  const styles = createStyles(colors);

  // Load existing expense data if editing
  useEffect(() => {
    if (expenseId) {
      const expense = getExpense(expenseId);
      if (expense) {
        setMerchant(expense.merchant || expense.title || '');
        setAmount(expense.amount.toString());
        setCategory(expense.category || 'Other');
        setPaidBy(expense.paidBy || 'you');
        
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
    }
  }, [expenseId, getExpense, navigation]);

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
        category: category || existingExpense.category,
        imageUri: imageUri || existingExpense.imageUri,
        paidBy,
        splits,
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
      category: category || 'Other',
      paidBy,
      splits,
      imageUri,
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

        <Input
          label="Total amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="₹0"
          containerStyle={styles.inputContainer}
        />

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

        {/* Who Paid */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 8 }]}>Paid by</Text>
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
                      ? `₹${shareAmount.toFixed(2)}`
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
            Total: ₹{totalAmount.toFixed(2)} split between {selectedIds.length} {selectedIds.length === 1 ? 'person' : 'people'}.
          </Text>
          {mode === 'custom' && (
            <Text style={[styles.summaryText, styles.summaryWarning, { color: colors.textSecondary }]}>
              Custom total: ₹{selectedIds.reduce((sum, id) => sum + (customAmounts[id] || 0), 0).toFixed(2)}
              {Math.abs(selectedIds.reduce((sum, id) => sum + (customAmounts[id] || 0), 0) - totalAmount) > 0.01 && (
                <Text style={{ color: colors.error }}> (doesn't match total)</Text>
              )}
            </Text>
          )}
        </View>
      </View>

      <Button
        title={expenseId ? 'Save changes' : 'Save expense'}
        onPress={handleSave}
        variant="positive"
        style={styles.primaryButton}
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
    fontWeight: '600',
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
});

export default AddExpenseScreen;
