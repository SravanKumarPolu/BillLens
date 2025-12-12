import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, Button, Input, BackButton } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { ItemizedFoodSplit } from '../utils/indiaFirstService';
import { normalizeSplits } from '../utils/mathUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemizedSplit'>;

const ItemizedSplitScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId, items, total, deliveryFee, tax, discount } = route.params || {};
  const { getGroup, addExpense } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const group = getGroup(groupId || '1');
  const members = group?.members || [];

  const [itemSplits, setItemSplits] = useState<Record<string, string[]>>(() => {
    // Initialize: all items split between all members
    const initial: Record<string, string[]> = {};
    items?.forEach((item, index) => {
      initial[`item-${index}`] = members.map(m => m.id);
    });
    return initial;
  });

  const [selectedPayer, setSelectedPayer] = useState<string>('you');

  // Calculate totals
  const calculatedTotal = useMemo(() => {
    if (!items) return 0;
    
    let sum = 0;
    items.forEach((item, index) => {
      const splitMembers = itemSplits[`item-${index}`] || [];
      if (splitMembers.length > 0) {
        sum += item.price * (item.quantity || 1);
      }
    });
    
    return sum + (deliveryFee || 0) + (tax || 0) - (discount || 0);
  }, [items, itemSplits, deliveryFee, tax, discount]);

  const handleToggleMember = (itemIndex: number, memberId: string) => {
    const key = `item-${itemIndex}`;
    const current = itemSplits[key] || [];
    
    if (current.includes(memberId)) {
      setItemSplits({
        ...itemSplits,
        [key]: current.filter(id => id !== memberId),
      });
    } else {
      setItemSplits({
        ...itemSplits,
        [key]: [...current, memberId],
      });
    }
  };

  const handleSave = () => {
    if (!items || items.length === 0) {
      Alert.alert('Error', 'No items to split');
      return;
    }

    // Create splits for each item
    const allSplits: Array<{ memberId: string; amount: number }> = [];
    
    items.forEach((item, index) => {
      const splitMembers = itemSplits[`item-${index}`] || [];
      if (splitMembers.length === 0) {
        // If no one selected, split equally among all members
        const perPerson = item.price * (item.quantity || 1) / members.length;
        members.forEach(member => {
          allSplits.push({ memberId: member.id, amount: perPerson });
        });
      } else {
        const itemTotal = item.price * (item.quantity || 1);
        const perPerson = itemTotal / splitMembers.length;
        splitMembers.forEach(memberId => {
          const existing = allSplits.find(s => s.memberId === memberId);
          if (existing) {
            existing.amount += perPerson;
          } else {
            allSplits.push({ memberId, amount: perPerson });
          }
        });
      }
    });

    // Add delivery fee, tax, discount proportionally
    const extraAmount = (deliveryFee || 0) + (tax || 0) - (discount || 0);
    if (extraAmount !== 0 && allSplits.length > 0) {
      const perPerson = extraAmount / allSplits.length;
      allSplits.forEach(split => {
        split.amount += perPerson;
      });
    }

    // Normalize splits
    const normalizedSplits = normalizeSplits(allSplits, calculatedTotal);

    // Create expense
    addExpense({
      groupId: groupId || '1',
      title: 'Food Delivery',
      merchant: 'Food Delivery',
      amount: calculatedTotal,
      category: 'Food',
      paidBy: selectedPayer,
      splits: normalizedSplits,
      currency: group?.currency || 'INR',
    });

    Alert.alert('Success', 'Expense added with itemized split', [
      { text: 'OK', onPress: () => navigation.navigate('GroupDetail', { groupId: groupId || '1' }) },
    ]);
  };

  if (!items || items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>No items found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Itemized Split</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Items List */}
        {items.map((item, index) => {
          const splitMembers = itemSplits[`item-${index}`] || [];
          const itemTotal = item.price * (item.quantity || 1);
          const perPerson = splitMembers.length > 0 ? itemTotal / splitMembers.length : 0;

          return (
            <Card key={index} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: colors.textPrimary }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.itemPrice, { color: colors.textSecondary }]}>
                    {formatMoney(item.price, false, group?.currency || 'INR')}
                    {item.quantity && item.quantity > 1 && ` × ${item.quantity}`}
                  </Text>
                </View>
                <Text style={[styles.itemTotal, { color: colors.textPrimary }]}>
                  {formatMoney(itemTotal, false, group?.currency || 'INR')}
                </Text>
              </View>

              <Text style={[styles.splitLabel, { color: colors.textSecondary }]}>
                Split between:
              </Text>
              <View style={styles.memberChips}>
                {members.map(member => {
                  const isSelected = splitMembers.includes(member.id);
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.memberChip,
                        {
                          borderColor: isSelected ? colors.accent : colors.borderSubtle,
                          backgroundColor: isSelected ? colors.accent + '20' : 'transparent',
                        },
                      ]}
                      onPress={() => handleToggleMember(index, member.id)}
                    >
                      <Text
                        style={[
                          styles.memberChipText,
                          { color: isSelected ? colors.accent : colors.textSecondary },
                        ]}
                      >
                        {member.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {splitMembers.length > 0 && (
                <Text style={[styles.perPersonText, { color: colors.textSecondary }]}>
                  {formatMoney(perPerson, false, group?.currency || 'INR')} per person
                </Text>
              )}
            </Card>
          );
        })}

        {/* Extra Charges */}
        {(deliveryFee || tax || discount) && (
          <Card style={styles.extraCard}>
            <Text style={[styles.extraTitle, { color: colors.textPrimary }]}>Extra Charges</Text>
            {deliveryFee && (
              <View style={styles.extraRow}>
                <Text style={[styles.extraLabel, { color: colors.textSecondary }]}>Delivery Fee</Text>
                <Text style={[styles.extraValue, { color: colors.textPrimary }]}>
                  {formatMoney(deliveryFee, false, group?.currency || 'INR')}
                </Text>
              </View>
            )}
            {tax && (
              <View style={styles.extraRow}>
                <Text style={[styles.extraLabel, { color: colors.textSecondary }]}>Tax</Text>
                <Text style={[styles.extraValue, { color: colors.textPrimary }]}>
                  {formatMoney(tax, false, group?.currency || 'INR')}
                </Text>
              </View>
            )}
            {discount && (
              <View style={styles.extraRow}>
                <Text style={[styles.extraLabel, { color: colors.textSecondary }]}>Discount</Text>
                <Text style={[styles.extraValue, { color: colors.success }]}>
                  -{formatMoney(discount, false, group?.currency || 'INR')}
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* Total */}
        <Card style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>
              {formatMoney(calculatedTotal, false, group?.currency || 'INR')}
            </Text>
          </View>
        </Card>

        {/* Paid By */}
        <Card style={styles.payerCard}>
          <Text style={[styles.payerLabel, { color: colors.textSecondary }]}>Paid by</Text>
          <View style={styles.payerChips}>
            {members.map(member => (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.payerChip,
                  {
                    borderColor: selectedPayer === member.id ? colors.accent : colors.borderSubtle,
                    backgroundColor: selectedPayer === member.id ? colors.accent + '20' : 'transparent',
                  },
                ]}
                onPress={() => setSelectedPayer(member.id)}
              >
                <Text
                  style={[
                    styles.payerChipText,
                    { color: selectedPayer === member.id ? colors.accent : colors.textSecondary },
                  ]}
                >
                  {member.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      </ScrollView>

      <Button
        title="Save Expense"
        onPress={handleSave}
        variant="primary"
        fullWidth={true}
        style={styles.saveButton}
      />
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
    paddingBottom: 100,
  },
  itemCard: {
    marginBottom: 16,
    padding: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...typography.h4,
    marginBottom: 4,
  },
  itemPrice: {
    ...typography.bodySmall,
  },
  itemTotal: {
    ...typography.money,
  },
  splitLabel: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  memberChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
  },
  memberChipText: {
    ...typography.bodySmall,
  },
  perPersonText: {
    ...typography.bodySmall,
    marginTop: 4,
  },
  extraCard: {
    marginBottom: 16,
    padding: 16,
  },
  extraTitle: {
    ...typography.h4,
    marginBottom: 12,
  },
  extraRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  extraLabel: {
    ...typography.body,
  },
  extraValue: {
    ...typography.body,
  },
  totalCard: {
    marginBottom: 16,
    padding: 20,
    backgroundColor: colors.primary + '10',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...typography.h3,
  },
  totalValue: {
    ...typography.moneyLarge,
  },
  payerCard: {
    marginBottom: 16,
    padding: 16,
  },
  payerLabel: {
    ...typography.bodySmall,
    marginBottom: 12,
  },
  payerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  payerChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
  },
  payerChipText: {
    ...typography.body,
  },
  saveButton: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 80,
  },
});

export default ItemizedSplitScreen;
