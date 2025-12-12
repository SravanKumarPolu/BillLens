import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Modal, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, Button, BackButton } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { Expense, Receipt } from '../types/models';
import { downloadReceipt } from '../utils/receiptService';
import { launchImageLibrary, ImagePickerResponse, MediaType, PhotoQuality } from 'react-native-image-picker';

type Props = NativeStackScreenProps<RootStackParamList, 'ReceiptGallery'>;

const ReceiptGalleryScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getExpensesForGroup, getExpense, updateExpense } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const expenses = getExpensesForGroup(groupId);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');

  // Collect all receipts from expenses (support both receipts array and imageUri for backward compatibility)
  const allReceipts = useMemo(() => {
    const receiptList: Array<{ expense: Expense; receipt: Receipt }> = [];
    
    expenses.forEach(expense => {
      if (expense.receipts && expense.receipts.length > 0) {
        // Use receipts array
        expense.receipts.forEach(receipt => {
          receiptList.push({ expense, receipt });
        });
      } else if (expense.imageUri) {
        // Fallback to imageUri for backward compatibility
        receiptList.push({
          expense,
          receipt: {
            id: `${expense.id}-legacy`,
            uri: expense.imageUri,
            mimeType: 'image/jpeg',
            isCloudStored: false,
          },
        });
      }
    });
    
    return receiptList.sort((a, b) => 
      new Date(b.expense.date).getTime() - new Date(a.expense.date).getTime()
    );
  }, [expenses]);
  
  // Filter expenses with images (for backward compatibility with existing UI)
  const expensesWithImages = useMemo(() => {
    return expenses
      .filter(e => (e.receipts && e.receipts.length > 0) || e.imageUri)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses]);

  // Group by month for timeline view
  const timelineData = useMemo(() => {
    const grouped = new Map<string, Expense[]>();

    expensesWithImages.forEach(expense => {
      const date = new Date(expense.date);
      const monthKey = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

      if (!grouped.has(monthKey)) {
        grouped.set(monthKey, []);
      }
      grouped.get(monthKey)!.push(expense);
    });

    return Array.from(grouped.entries())
      .map(([month, expenses]) => ({
        month,
        expenses: expenses.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
      }))
      .sort((a, b) => {
        const dateA = new Date(a.expenses[0].date);
        const dateB = new Date(b.expenses[0].date);
        return dateB.getTime() - dateA.getTime();
      });
  }, [expensesWithImages]);

  const handleImagePress = (expense: Expense) => {
    setSelectedExpense(expense);
  };
  
  const handleDownloadReceipt = async (receipt: Receipt) => {
    await downloadReceipt(receipt);
  };
  
  const handleAddReceipt = async (expense: Expense) => {
    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.8 as PhotoQuality,
      includeBase64: false,
      selectionLimit: 5, // Allow multiple receipts
    };
    
    launchImageLibrary(options, (response: ImagePickerResponse) => {
      if (response.didCancel || response.errorCode) return;
      
      const assets = response.assets || [];
      if (assets.length > 0) {
        // TODO: Update expense with new receipts
        // This would require updating the expense's receipts array
        Alert.alert('Success', `Added ${assets.length} receipt(s)`);
      }
    });
  };

  const handleEditExpense = (expense: Expense) => {
    setSelectedExpense(null);
    navigation.navigate('AddExpense', {
      expenseId: expense.id,
      groupId: expense.groupId,
      imageUri: expense.imageUri,
    });
  };

  const handleDeleteExpense = (expense: Expense) => {
    Alert.alert('Delete Expense', 'Are you sure you want to delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Delete would be handled by context
          setSelectedExpense(null);
        },
      },
    ]);
  };

  const renderGridItem = ({ item }: { item: Expense }) => (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => handleImagePress(item)}
      activeOpacity={0.8}
    >
      <Image source={{ uri: item.imageUri }} style={styles.gridImage} />
      <View style={styles.gridOverlay}>
        <Text style={styles.gridAmount}>{formatMoney(item.amount)}</Text>
        <Text style={styles.gridMerchant} numberOfLines={1}>
          {item.merchant || item.title}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderTimelineSection = ({ item }: { item: { month: string; expenses: Expense[] } }) => (
    <View style={styles.timelineSection}>
      <Text style={[styles.timelineMonth, { color: colors.textPrimary }]}>{item.month}</Text>
      <View style={styles.timelineExpenses}>
        {item.expenses.map(expense => (
          <TouchableOpacity
            key={expense.id}
            style={styles.timelineItem}
            onPress={() => handleImagePress(expense)}
          >
            <Image source={{ uri: expense.imageUri }} style={styles.timelineImage} />
            <View style={styles.timelineInfo}>
              <Text style={[styles.timelineMerchant, { color: colors.textPrimary }]}>
                {expense.merchant || expense.title}
              </Text>
              <Text style={[styles.timelineDate, { color: colors.textSecondary }]}>
                {new Date(expense.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
              <Text style={[styles.timelineAmount, { color: colors.primary }]}>
                {formatMoney(expense.amount)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Receipt Gallery</Text>
        <View style={styles.viewModeButtons}>
          <TouchableOpacity
            style={[
              styles.viewModeButton,
              viewMode === 'grid' && [styles.viewModeButtonActive, { backgroundColor: colors.primary }],
            ]}
            onPress={() => setViewMode('grid')}
          >
            <Text
              style={[
                styles.viewModeText,
                { color: viewMode === 'grid' ? colors.white : colors.textSecondary },
              ]}
            >
              Grid
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewModeButton,
              viewMode === 'timeline' && [
                styles.viewModeButtonActive,
                { backgroundColor: colors.primary },
              ],
            ]}
            onPress={() => setViewMode('timeline')}
          >
            <Text
              style={[
                styles.viewModeText,
                { color: viewMode === 'timeline' ? colors.white : colors.textSecondary },
              ]}
            >
              Timeline
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {expensesWithImages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📷</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
            No receipts yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Add expenses with photos to see them here
          </Text>
        </View>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <FlatList
              data={expensesWithImages}
              keyExtractor={item => item.id}
              renderItem={renderGridItem}
              numColumns={2}
              contentContainerStyle={styles.gridContainer}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <FlatList
              data={timelineData}
              keyExtractor={item => item.month}
              renderItem={renderTimelineSection}
              contentContainerStyle={styles.timelineContainer}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* Receipt Detail Modal */}
      <Modal
        visible={selectedExpense !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedExpense(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surfaceCard }]}>
            {selectedExpense && (
              <>
                <Image
                  source={{ uri: selectedExpense.imageUri }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
                <View style={styles.modalInfo}>
                  <Text style={[styles.modalMerchant, { color: colors.textPrimary }]}>
                    {selectedExpense.merchant || selectedExpense.title}
                  </Text>
                  <Text style={[styles.modalAmount, { color: colors.primary }]}>
                    {formatMoney(selectedExpense.amount)}
                  </Text>
                  <Text style={[styles.modalDate, { color: colors.textSecondary }]}>
                    {new Date(selectedExpense.date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  
                  {/* Show all receipts for this expense */}
                  {selectedExpense.receipts && selectedExpense.receipts.length > 0 && (
                    <View style={styles.receiptsList}>
                      <Text style={[styles.receiptsTitle, { color: colors.textPrimary }]}>
                        Receipts ({selectedExpense.receipts.length})
                      </Text>
                      {selectedExpense.receipts.map((receipt, index) => (
                        <View key={receipt.id} style={styles.receiptItem}>
                          <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>
                            Receipt {index + 1}
                            {receipt.isCloudStored && ' ☁️'}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleDownloadReceipt(receipt)}
                            style={[styles.downloadButton, { backgroundColor: colors.accent }]}
                          >
                            <Text style={[styles.downloadButtonText, { color: colors.white }]}>
                              Download
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.modalActions}>
                  <Button
                    title="Add Receipt"
                    onPress={() => handleAddReceipt(selectedExpense)}
                    variant="secondary"
                    fullWidth={false}
                    style={styles.modalButton}
                  />
                  <Button
                    title="Edit"
                    onPress={() => handleEditExpense(selectedExpense)}
                    variant="secondary"
                    fullWidth={false}
                    style={styles.modalButton}
                  />
                  <Button
                    title="Close"
                    onPress={() => setSelectedExpense(null)}
                    variant="ghost"
                    fullWidth={false}
                    style={styles.modalButton}
                  />
                </View>
              </>
            )}
          </View>
        </View>
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
  viewModeButtons: {
    flexDirection: 'row',
    gap: 8,
    minWidth: 120,
  },
  viewModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  viewModeButtonActive: {
    borderColor: 'transparent',
  },
  viewModeText: {
    ...typography.bodySmall,
  },
  gridContainer: {
    padding: 12,
  },
  gridItem: {
    flex: 1,
    margin: 6,
    borderRadius: 12,
    overflow: 'hidden',
    aspectRatio: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 8,
  },
  gridAmount: {
    ...typography.body,
    color: 'white',
    fontWeight: '600',
  },
  gridMerchant: {
    ...typography.bodySmall,
    color: 'white',
  },
  timelineContainer: {
    padding: 24,
  },
  timelineSection: {
    marginBottom: 32,
  },
  timelineMonth: {
    ...typography.h3,
    marginBottom: 16,
  },
  timelineExpenses: {
    gap: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  timelineImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  timelineInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  timelineMerchant: {
    ...typography.h4,
    marginBottom: 4,
  },
  timelineDate: {
    ...typography.bodySmall,
    marginBottom: 4,
  },
  timelineAmount: {
    ...typography.money,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalImage: {
    width: '100%',
    height: 400,
  },
  modalInfo: {
    padding: 20,
  },
  modalMerchant: {
    ...typography.h3,
    marginBottom: 8,
  },
  modalAmount: {
    ...typography.moneyLarge,
    marginBottom: 8,
  },
  modalDate: {
    ...typography.body,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  modalButton: {
    flex: 1,
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
  receiptsList: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  receiptsTitle: {
    ...typography.h4,
    marginBottom: 12,
  },
  receiptItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    marginBottom: 8,
  },
  receiptLabel: {
    ...typography.body,
    flex: 1,
  },
  downloadButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  downloadButtonText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
});

export default ReceiptGalleryScreen;
