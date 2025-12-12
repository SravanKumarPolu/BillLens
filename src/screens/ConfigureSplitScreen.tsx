import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, ScrollView, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { createEqualSplits, normalizeSplits, verifySplitsSum } from '../utils/mathUtils';
import { SplitRatioInput, BackButton } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfigureSplit'>;

const ConfigureSplitScreen: React.FC<Props> = ({ navigation, route }) => {
  const { getGroup, addExpense } = useGroups();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'equal' | 'custom' | 'percentage' | 'shares'>('equal');
  
  // Get groupId from navigation state or route params
  // We need to track this from ReviewBill screen
  const params = route.params || {};
  const groupId = params.groupId || '1';
  const group = getGroup(groupId);
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [percentages, setPercentages] = useState<Record<string, number>>({}); // For percentage mode
  const [shares, setShares] = useState<Record<string, number>>({}); // For shares mode
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    if (group && group.members) {
      // Initialize with all members selected
      const memberIds = group.members.map(m => m.id);
      setSelectedIds(memberIds);
      // Initialize percentage mode: equal split (100% / number of members)
      if (mode === 'percentage' && memberIds.length > 0) {
        const equalPct = 100 / memberIds.length;
        const pctObj: Record<string, number> = {};
        memberIds.forEach(id => { pctObj[id] = equalPct; });
        setPercentages(pctObj);
      }
      // Initialize shares mode: 1 share per person
      if (mode === 'shares') {
        const sharesObj: Record<string, number> = {};
        memberIds.forEach(id => { sharesObj[id] = 1; });
        setShares(sharesObj);
      }
    }
  }, [group, mode]);

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
    } else if (mode === 'percentage') {
      // Percentage mode: Calculate amounts from percentages
      const totalPercentage = selectedIds.reduce((sum, id) => sum + (percentages[id] || 0), 0);
      
      if (Math.abs(totalPercentage - 100) > 0.1) {
        Alert.alert(
          'Invalid Percentage',
          `Percentages must sum to 100%. Current total: ${totalPercentage.toFixed(1)}%`,
          [{ text: 'OK' }]
        );
        return;
      }
      
      const percentageSplits = selectedIds.map(memberId => ({
        memberId,
        amount: (totalAmount * (percentages[memberId] || 0)) / 100,
      }));
      splits = normalizeSplits(percentageSplits, totalAmount);
    } else if (mode === 'shares') {
      // Shares mode: Split proportionally by shares
      const totalShares = selectedIds.reduce((sum, id) => sum + (shares[id] || 0), 0);
      
      if (totalShares <= 0) {
        Alert.alert('Error', 'At least one person must have shares > 0');
        return;
      }
      
      const sharesSplits = selectedIds.map(memberId => ({
        memberId,
        amount: (totalAmount * (shares[memberId] || 0)) / totalShares,
      }));
      splits = normalizeSplits(sharesSplits, totalAmount);
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

    // Get group to get currency
    const groupForCurrency = getGroup(groupId);
    
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
      currency: groupForCurrency?.currency || 'INR',
    });

    // Navigate back to group detail
    navigation.navigate('GroupDetail', { groupId });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Who is this for?</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Choose people and how you want to split.</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modeScrollView} contentContainerStyle={styles.modeRow}>
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
        <TouchableOpacity
          style={[
            styles.modeChip,
            { borderColor: colors.borderSubtle },
            mode === 'percentage' && [styles.modeChipActive, { backgroundColor: colors.accent, borderColor: colors.accent }]
          ]}
          onPress={() => setMode('percentage')}
        >
          <Text
            style={[
              styles.modeLabel,
              { color: mode === 'percentage' ? colors.white : colors.textSecondary },
              mode === 'percentage' && styles.modeLabelActive
            ]}
          >
            Percentage
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeChip,
            { borderColor: colors.borderSubtle },
            mode === 'shares' && [styles.modeChipActive, { backgroundColor: colors.accent, borderColor: colors.accent }]
          ]}
          onPress={() => setMode('shares')}
        >
          <Text
            style={[
              styles.modeLabel,
              { color: mode === 'shares' ? colors.white : colors.textSecondary },
              mode === 'shares' && styles.modeLabelActive
            ]}
          >
            Shares
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <FlatList
        data={group.members || []}
        keyExtractor={m => m.id}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          
          // Calculate display amount based on mode
          let displayAmount = 0;
          if (selected && totalAmount > 0) {
            if (mode === 'equal') {
              displayAmount = totalAmount / selectedIds.length;
            } else if (mode === 'percentage') {
              const pct = percentages[item.id] || 0;
              displayAmount = (totalAmount * pct) / 100;
            } else if (mode === 'shares') {
              const totalShares = selectedIds.reduce((sum, id) => sum + (shares[id] || 0), 0);
              const memberShares = shares[item.id] || 0;
              displayAmount = totalShares > 0 ? (totalAmount * memberShares) / totalShares : 0;
            } else {
              displayAmount = customAmounts[item.id] || 0;
            }
          }
          
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
              {selected && (mode === 'custom' || mode === 'percentage' || mode === 'shares') ? (
                mode === 'custom' ? (
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
                ) : mode === 'percentage' ? (
                  <View style={styles.percentageInputContainer}>
                    <TextInput
                      style={[styles.percentageInput, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                      value={percentages[item.id] ? percentages[item.id].toFixed(1) : ''}
                      onChangeText={(text) => {
                        const val = parseFloat(text.replace(/[^0-9.]/g, '')) || 0;
                        setPercentages(prev => ({ ...prev, [item.id]: Math.min(100, Math.max(0, val)) }));
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0%"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={[styles.percentageSymbol, { color: colors.textSecondary }]}>%</Text>
                    <Text style={[styles.percentageAmount, { color: colors.textSecondary }]}>
                      = ₹{displayAmount.toFixed(2)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.sharesInputContainer}>
                    <Text style={[styles.sharesLabel, { color: colors.textSecondary }]}>Shares:</Text>
                    <TextInput
                      style={[styles.sharesInput, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                      value={shares[item.id] ? shares[item.id].toString() : ''}
                      onChangeText={(text) => {
                        const val = parseInt(text.replace(/[^0-9]/g, '')) || 0;
                        setShares(prev => ({ ...prev, [item.id]: Math.max(0, val) }));
                      }}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={[styles.sharesAmount, { color: colors.textSecondary }]}>
                      = ₹{displayAmount.toFixed(2)}
                    </Text>
                  </View>
                )
              ) : (
                <Text style={[styles.memberShare, { color: colors.textSecondary }]}>
                  {selected
                    ? `₹${displayAmount.toFixed(2)}`
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
        {mode === 'percentage' && (
          <Text style={[styles.summaryText, styles.summaryWarning, { color: colors.textSecondary }]}>
            Total percentage: {selectedIds.reduce((sum, id) => sum + (percentages[id] || 0), 0).toFixed(1)}%
            {Math.abs(selectedIds.reduce((sum, id) => sum + (percentages[id] || 0), 0) - 100) > 0.1 && (
              <Text style={{ color: colors.error }}> (must equal 100%)</Text>
            )}
          </Text>
        )}
        {mode === 'shares' && (
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            Total shares: {selectedIds.reduce((sum, id) => sum + (shares[id] || 0), 0)}
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
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  backButtonContainer: {
    marginRight: 16,
    marginTop: 4,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...typography.h2,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    marginBottom: recommendedSpacing.loose,
  },
  modeScrollView: {
    marginBottom: 16,
  },
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
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
  percentageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 8,
  },
  percentageInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 60,
    textAlign: 'center',
  },
  percentageSymbol: {
    ...typography.body,
    marginLeft: 4,
  },
  percentageAmount: {
    ...typography.bodySmall,
    marginLeft: 8,
  },
  sharesInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 8,
  },
  sharesLabel: {
    ...typography.bodySmall,
    marginRight: 8,
  },
  sharesInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 50,
    textAlign: 'center',
  },
  sharesAmount: {
    ...typography.bodySmall,
    marginLeft: 8,
  },
});

export default ConfigureSplitScreen;
