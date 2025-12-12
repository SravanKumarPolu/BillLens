import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Input, Button, Card } from '../components';
import { suggestGroup, parseItemizedFoodBill } from '../utils/indiaFirstService';
import { getCategories } from '../utils/categoryService';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewBill'>;

const ReviewBillScreen: React.FC<Props> = ({ navigation, route }) => {
  const { imageUri, groupId, parsedAmount, parsedMerchant, parsedDate, expenseId, ocrResult } = route.params || {};
  const { getExpense, updateExpense, getAllGroupSummaries, getGroup } = useGroups();
  const { colors } = useTheme();
  
  // Auto-fill with parsed OCR values, fallback to empty strings
  const [merchant, setMerchant] = useState(parsedMerchant || '');
  const [amount, setAmount] = useState(parsedAmount || '');
  const [categories, setCategories] = useState<string[]>(['Food', 'Groceries', 'Utilities', 'Rent', 'WiFi', 'Maid', 'OTT', 'Other']);
  
  // Load dynamic categories
  useEffect(() => {
    const loadCategories = async () => {
      const group = getGroup(groupId || '1');
      const dynamicCategories = await getCategories(group?.id);
      if (dynamicCategories.length > 0) {
        setCategories(dynamicCategories);
      }
    };
    loadCategories();
  }, [groupId, getGroup]);
  
  // Determine category from merchant name if it matches a template
  // India-first: Auto-categorize Swiggy/Zomato orders and other Indian merchants
  const getCategoryFromMerchant = (merchantName: string): string => {
    const lower = merchantName.toLowerCase();
    // Food delivery apps (Swiggy, Zomato, Uber Eats)
    if (lower.includes('swiggy') || lower.includes('zomato') || lower.includes('uber eats') || lower.includes('ubereats')) return 'Food';
    // Rent & housing
    if (lower.includes('rent')) return 'Rent';
    // Utilities
    if (lower.includes('electric') || lower.includes('eb') || lower.includes('power') || lower.includes('bses') || lower.includes('tata power') || lower.includes('reliance energy')) return 'Utilities';
    if (lower.includes('wifi') || lower.includes('internet') || lower.includes('broadband')) return 'WiFi';
    // Grocery delivery apps
    if (lower.includes('grocery') || lower.includes('blinkit') || lower.includes('bigbasket') || lower.includes('zepto') || lower.includes('dunzo') || lower.includes('grofers') || lower.includes('instamart')) return 'Groceries';
    // Services
    if (lower.includes('maid') || lower.includes('help')) return 'Maid';
    // Entertainment/OTT
    if (lower.includes('netflix') || lower.includes('prime') || lower.includes('ott') || lower.includes('disney') || lower.includes('hotstar')) return 'OTT';
    // DTH (Direct-to-Home) - categorized as OTT/Entertainment
    if (lower.includes('dth') || lower.includes('tata sky') || lower.includes('tatasky') || lower.includes('dish tv') || lower.includes('dishtv') || lower.includes('airtel digital') || lower.includes('sun direct') || lower.includes('sundirect') || lower.includes('d2h')) return 'OTT';
    return 'Food'; // Default for unrecognized merchants
  };
  
  const [category, setCategory] = useState<string>(getCategoryFromMerchant(merchant));
  
  // Get all groups for suggestion
  const groupSummaries = getAllGroupSummaries() || [];
  const allGroups = groupSummaries.map(s => s.group);
  
  // Auto-suggest group based on merchant/category
  const groupSuggestion = useMemo(() => {
    if (!parsedMerchant && !category) return null;
    return suggestGroup(parsedMerchant || '', category, allGroups);
  }, [parsedMerchant, category, allGroups]);
  
  // Check if this is itemized food delivery
  // Use pre-extracted data from OCR result if available, otherwise parse from rawText
  const itemizedSplit = useMemo(() => {
    // If OCR already extracted items, use that data (faster)
    if (ocrResult?.items && ocrResult.items.length > 0) {
      return {
        items: ocrResult.items.map((item: { name: string; price: number; quantity?: number }) => ({
          ...item,
          splitBetween: [], // Will be set by user
        })),
        total: parseFloat((ocrResult.amount || '0').replace(/[₹,]/g, '')) || 0,
        deliveryFee: ocrResult.deliveryFee,
        platformFee: ocrResult.platformFee,
        tax: ocrResult.tax,
        discount: ocrResult.discount,
      };
    }
    // Fallback: parse from rawText (for backward compatibility)
    if (!ocrResult?.rawText) return null;
    return parseItemizedFoodBill(ocrResult.rawText);
  }, [ocrResult]);
  
  const styles = createStyles(colors);

  // Load existing expense data if editing
  useEffect(() => {
    if (expenseId) {
      const expense = getExpense(expenseId);
      if (expense) {
        setMerchant(expense.merchant || expense.title || '');
        setAmount(expense.amount.toString());
        setCategory(expense.category || 'Other');
      } else {
        // Expense not found, navigate back
        Alert.alert('Error', 'Expense not found', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    }
  }, [expenseId, getExpense, navigation]);

  const handleNext = () => {
    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // If editing, update the expense directly
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
      });
      navigation.goBack();
      return;
    }

    // Otherwise, navigate to split configuration
    navigation.navigate('ConfigureSplit', {
      groupId: groupId || '1',
      amount: amountNum.toString(),
      merchant: merchant.trim() || 'Expense',
      category,
      imageUri,
      paidBy: 'you', // Default to current user paying
    });
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.surfaceLight }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {expenseId ? 'Edit expense' : 'Check bill details'}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {expenseId ? 'Update the expense details below.' : 'Edit anything if it looks off.'}
      </Text>

      {imageUri ? (
        <View style={[styles.imageWrapper, { backgroundColor: colors.surfaceCard }]}>
          <Image source={{ uri: imageUri }} style={styles.image} />
        </View>
      ) : null}

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

      {/* UPI Payment Detection Indicator */}
      {ocrResult?.isUPI && !expenseId && (
        <Card style={[styles.upiCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary }]}>
          <View style={styles.upiHeader}>
            <Text style={styles.upiIcon}>💳</Text>
            <View style={styles.upiInfo}>
              <Text style={[styles.upiTitle, { color: colors.textPrimary }]}>
                UPI Payment Detected
              </Text>
              <Text style={[styles.upiSubtitle, { color: colors.textSecondary }]}>
                {ocrResult.upiApp ? `${ocrResult.upiApp === 'gpay' ? 'Google Pay' : ocrResult.upiApp === 'phonepe' ? 'PhonePe' : ocrResult.upiApp === 'paytm' ? 'Paytm' : ocrResult.upiApp} payment detected` : 'UPI payment detected'}
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Group Suggestion */}
      {groupSuggestion && !expenseId && (
        <Card style={styles.suggestionCard}>
          <Text style={[styles.suggestionTitle, { color: colors.textPrimary }]}>
            💡 {groupSuggestion.reason}
          </Text>
          <TouchableOpacity
            style={[styles.suggestionButton, { backgroundColor: colors.primary + '20' }]}
            onPress={() => {
              if (groupSuggestion.groupId) {
                // Navigate with suggested group
                navigation.navigate('ConfigureSplit', {
                  groupId: groupSuggestion.groupId,
                  amount: amount,
                  merchant: merchant.trim() || 'Expense',
                  category,
                  imageUri,
                  paidBy: 'you',
                });
              } else {
                // Create new group
                Alert.alert(
                  'Create Group?',
                  `Create "${groupSuggestion.suggestedGroupName}" group?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Create',
                      onPress: () => {
                        // Navigate to create group with pre-filled data
                        navigation.navigate('CreateGroup', {
                          suggestedName: groupSuggestion.suggestedGroupName,
                          suggestedEmoji: groupSuggestion.suggestedEmoji,
                        } as any);
                      },
                    },
                  ]
                );
              }
            }}
          >
            <Text style={[styles.suggestionButtonText, { color: colors.primary }]}>
              {groupSuggestion.groupId ? 'Use this group' : `Create "${groupSuggestion.suggestedGroupName}"`}
            </Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* Itemized Split Option */}
      {itemizedSplit && itemizedSplit.items.length > 0 && !expenseId && (
        <Card style={styles.itemizedCard}>
          <Text style={[styles.itemizedTitle, { color: colors.textPrimary }]}>
            🍕 Itemized Split Available
          </Text>
          <Text style={[styles.itemizedText, { color: colors.textSecondary }]}>
            Split this bill item by item (like SplitKaro)
          </Text>
          <TouchableOpacity
            style={[styles.itemizedButton, { backgroundColor: colors.accent + '20' }]}
            onPress={() => {
              navigation.navigate('ItemizedSplit', {
                groupId: groupId || '1',
                items: itemizedSplit.items,
                total: itemizedSplit.total,
                deliveryFee: itemizedSplit.deliveryFee,
                tax: itemizedSplit.tax,
                discount: itemizedSplit.discount,
              });
            }}
          >
            <Text style={[styles.itemizedButtonText, { color: colors.accent }]}>
              Split Item by Item
            </Text>
          </TouchableOpacity>
        </Card>
      )}

      <Button
        title={expenseId ? 'Save changes' : 'Next: split bill'}
        onPress={handleNext}
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
  inputContainer: {
    marginBottom: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 32,
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
  label: {
    ...typography.label,
    marginBottom: 8,
  },
  primaryButton: {
    marginTop: 8,
  },
  suggestionCard: {
    marginBottom: 16,
    padding: 16,
  },
  suggestionTitle: {
    ...typography.body,
    marginBottom: 12,
  },
  suggestionButton: {
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  suggestionButtonText: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  itemizedCard: {
    marginBottom: 16,
    padding: 16,
  },
  itemizedTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  itemizedText: {
    ...typography.bodySmall,
    marginBottom: 12,
  },
  itemizedButton: {
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  itemizedButtonText: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  upiCard: {
    marginBottom: 16,
    padding: 16,
    borderWidth: 1.5,
  },
  upiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upiIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  upiInfo: {
    flex: 1,
  },
  upiTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  upiSubtitle: {
    ...typography.bodySmall,
  },
});

export default ReviewBillScreen;
