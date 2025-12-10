import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { useRoute } from '@react-navigation/native';
import { createEqualSplits, normalizeSplits, verifySplitsSum } from '../utils/mathUtils';
import { SplitRatioInput } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfigureSplit'>;

const ConfigureSplitScreen: React.FC<Props> = ({ navigation }) => {
  const route = useRoute();
  const { getGroup, addExpense } = useGroups();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  
  // Get groupId from navigation state or route params
  // We need to track this from ReviewBill screen
  const params = route.params || {};
  const groupId = params.groupId || '1';
  const group = getGroup(groupId);
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    if (group && group.members) {
      // Initialize with all members selected
      setSelectedIds(group.members.map(m => m.id));
    }
  }, [group]);

  // Get amount from ReviewBill screen
  useEffect(() => {
    const amount = params.amount;
    if (amount) {
      const parsed = parseFloat(typeof amount === 'string' ? amount : String(amount));
      if (!isNaN(parsed) && parsed > 0) {
        setTotalAmount(parsed);
      }
    }
  }, [params.amount]);

  const styles = createStyles(colors);

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
    if (selectedIds.length === 0) {
      Alert.alert('Error', 'Please select at least one person');
      return;
    }

    if (totalAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Calculate splits with proper normalization
    let splits: Array<{ memberId: string; amount: number }> = [];
    
    if (mode === 'equal') {
      // Use math utils to ensure exact total
      splits = createEqualSplits(totalAmount, selectedIds);
    } else {
      // Custom mode - validate that amounts match total
      const totalCustom = selectedIds.reduce((sum, id) => sum + (customAmounts[id] || 0), 0);
      const difference = Math.abs(totalCustom - totalAmount);
      
      if (difference > 0.01) {
        Alert.alert(
          'Amount Mismatch',
          `Custom split total (₹${totalCustom.toFixed(2)}) doesn't match expense total (₹${totalAmount.toFixed(2)}). Difference: ₹${difference.toFixed(2)}.\n\nWould you like to adjust the amounts automatically?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Adjust Automatically',
              onPress: () => {
                // Distribute the difference proportionally
                const adjustment = totalAmount - totalCustom;
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
      splits = normalizeSplits(customSplits, totalAmount);
    }

    // Verify splits sum to total (safety check)
    if (!verifySplitsSum(splits, totalAmount)) {
      console.warn('[ConfigureSplit] Split verification failed, normalizing...');
      splits = normalizeSplits(splits, totalAmount);
    }

    // Get expense details from route params
    const merchant = params.merchant || 'Expense';
    const category = params.category || 'Other';
    const imageUri = params.imageUri;
    const paidBy = params.paidBy || 'you'; // Default to current user

    // Create expense
    addExpense({
      groupId,
      title: merchant,
      merchant,
      amount: totalAmount,
      category,
      paidBy,
      splits,
      imageUri,
    });

    // Navigate back to group detail
    navigation.navigate('GroupDetail', { groupId });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Who is this for?</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Choose people and how you want to split.</Text>

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
              { backgroundColor: colors.surfaceCard },
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

      <View style={[styles.summaryBox, { backgroundColor: colors.surfaceCard }]}>
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

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={handleSave}>
        <Text style={[styles.primaryLabel, { color: colors.white }]}>Save expense</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  title: {
    ...typography.h2,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    marginBottom: recommendedSpacing.loose,
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
    paddingBottom: 24,
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
    marginBottom: 12,
  },
  summaryText: {
    ...typography.bodySmall,
  },
  summaryWarning: {
    marginTop: 4,
    ...typography.caption,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryLabel: {
    ...typography.button,
  },
  errorText: {
    ...typography.bodyLarge,
    textAlign: 'center',
    marginTop: 100,
  },
});

export default ConfigureSplitScreen;
