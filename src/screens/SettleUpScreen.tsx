import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';
import { openUPIApp, getAvailableUPIApps, getAppDisplayName, type UPIPaymentApp } from '../utils/upiService';
import { optimizeSettlements } from '../utils/insightsService';
import { explainSettlement } from '../utils/settlementExplanation';
import { Modal, Button } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'SettleUp'>;

type Payment = {
  id: string;
  fromMemberId: string;
  from: string;
  toMemberId: string;
  to: string;
  amount: number;
};

const SettleUpScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getGroupSummary, getGroup, addSettlement, calculateGroupBalances, getSettlementsForGroup } = useGroups();
  const { colors } = useTheme();
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showUPIModal, setShowUPIModal] = useState(false);
  const [availableApps, setAvailableApps] = useState<UPIPaymentApp[]>(['upi']);
  
  const summary = getGroupSummary(groupId);
  const group = getGroup(groupId);
  const styles = createStyles(colors);

  // Check available UPI apps on mount
  useEffect(() => {
    getAvailableUPIApps().then(setAvailableApps);
  }, []);

  // Calculate suggested payments based on balances (optimized)
  const suggestedPayments = useMemo(() => {
    if (!summary || !group) return [];

    const balances = calculateGroupBalances(groupId);
    
    // Use optimized settlements to minimize transactions
    const optimization = optimizeSettlements(balances, group);

    // Convert optimized payments to Payment format
    const payments: Payment[] = optimization.optimizedPayments.map(payment => {
      const fromMember = group.members.find(m => m.id === payment.fromMemberId);
      const toMember = group.members.find(m => m.id === payment.toMemberId);
      
      return {
        id: `payment-${payment.fromMemberId}-to-${payment.toMemberId}`,
        fromMemberId: payment.fromMemberId,
        from: fromMember?.name || 'Someone',
        toMemberId: payment.toMemberId,
        to: toMember?.name || 'Someone',
        amount: payment.amount,
      };
    });

    return payments.sort((a, b) => b.amount - a.amount);
  }, [summary, group, groupId, calculateGroupBalances]);

  const handlePay = async (payment: Payment) => {
    // Show UPI app selection if user is paying (from is "You")
    if (payment.from === 'You') {
      setSelectedPayment(payment);
      setShowUPIModal(true);
    } else {
      // If someone else is paying, just mark as paid
      handleMarkAsPaid(payment);
    }
  };

  const handleUPIPayment = async (app: UPIPaymentApp) => {
    if (!selectedPayment) return;
    
    setShowUPIModal(false);
    
    // Get recipient's UPI ID (in production, this would come from member profile)
    // For now, we'll use a placeholder
    const recipientVpa = ''; // Would be stored in member profile
    
    if (recipientVpa) {
      // Open UPI app with payment details
      const success = await openUPIApp(app, {
        payeeVpa: recipientVpa,
        payeeName: selectedPayment.to,
        amount: selectedPayment.amount,
        transactionNote: `Settlement for ${group ? group.name : 'group'}`,
      });
      
      if (success) {
        // Record settlement after opening UPI app
        // In production, you might want to wait for payment confirmation
        handleMarkAsPaid(selectedPayment);
      }
    } else {
      // No UPI ID stored, just mark as paid
      Alert.alert(
        'No UPI ID',
        `${selectedPayment.to} hasn't added their UPI ID. Marking as paid manually.`,
        [
          {
            text: 'OK',
            onPress: () => handleMarkAsPaid(selectedPayment),
          },
        ]
      );
    }
  };

  const handleMarkAsPaid = (payment: Payment) => {
    // Get balances before settlement for explanation
    const balancesBefore = calculateGroupBalances(groupId);
    
    // Record the settlement
    const settlementId = addSettlement({
      groupId,
      fromMemberId: payment.fromMemberId,
      toMemberId: payment.toMemberId,
      amount: payment.amount,
    });

    // Get balances after settlement
    const balancesAfter = calculateGroupBalances(groupId);
    
    // Get the settlement we just created
    const settlements = getSettlementsForGroup(groupId);
    const newSettlement = settlements.find(s => s.id === settlementId);
    
    if (newSettlement && group) {
      // Explain what changed
      try {
        const explanation = explainSettlement(
          newSettlement,
          balancesBefore,
          balancesAfter,
          group.members
        );

        // Show detailed explanation
        Alert.alert(
          'Settlement Recorded ✓',
          `${explanation.summary}\n\n${explanation.balanceChanges.map(c => c.explanation).join('\n')}`,
          [
            {
              text: 'View Details',
              onPress: () => {
                navigation.navigate('GroupDetail', { groupId });
              },
            },
            {
              text: 'OK',
            },
          ]
        );
      } catch (error) {
        // Fallback to simple message
        Alert.alert(
          'Settlement Recorded',
          `Recorded payment of ${formatMoney(payment.amount)} from ${payment.from} to ${payment.to}`,
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('GroupDetail', { groupId });
              },
            },
          ]
        );
      }
    } else {
      // Fallback
    Alert.alert(
      'Settlement Recorded',
      `Recorded payment of ${formatMoney(payment.amount)} from ${payment.from} to ${payment.to}`,
      [
        {
          text: 'OK',
          onPress: () => {
            navigation.navigate('GroupDetail', { groupId });
          },
        },
      ]
    );
    }
  };

  if (!summary || !group) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Group not found</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Payment }) => (
    <View style={styles.paymentRow}>
      <View>
        <Text style={styles.paymentTitle}>
          {item.from} → {item.to}
        </Text>
        <Text style={styles.paymentSubtitle}>Suggested to clear balances</Text>
      </View>
      <View style={styles.paymentRight}>
        <Text style={styles.paymentAmount}>{formatMoney(item.amount)}</Text>
        <TouchableOpacity
          style={styles.upiButton}
          onPress={() => handlePay(item)}
        >
          <Text style={styles.upiLabel}>
            {item.from === 'You' ? 'Pay via UPI' : 'Mark as paid'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settle up</Text>
      <Text style={styles.subtitle}>
        {suggestedPayments.length > 0
          ? 'Pay these to become all settled.'
          : 'All balances are settled!'}
      </Text>

      {suggestedPayments.length > 0 ? (
        <FlatList
          data={suggestedPayments}
          keyExtractor={p => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🎉</Text>
          <Text style={styles.emptyText}>All settled!</Text>
          <Text style={styles.emptySubtext}>No pending payments</Text>
        </View>
      )}

      {suggestedPayments.length > 0 && (
        <Text style={styles.footerNote}>
          Mark payments as completed to update balances in real-time.
        </Text>
      )}

      {/* UPI App Selection Modal */}
      <Modal
        visible={showUPIModal}
        onClose={() => setShowUPIModal(false)}
        title="Choose payment app"
        subtitle={`Pay ${selectedPayment?.to} ${formatMoney(selectedPayment?.amount || 0)}`}
        variant="glass"
        animationType="slide"
      >
        <View style={styles.modalButtonsContainer}>
          {availableApps.map(app => (
            <Button
              key={app}
              title={getAppDisplayName(app)}
              onPress={() => handleUPIPayment(app)}
              variant="primary"
              style={styles.modalButton}
            />
          ))}
          
          <Button
            title="Mark as paid (no UPI)"
            onPress={() => {
              if (selectedPayment) {
                handleMarkAsPaid(selectedPayment);
              }
              setShowUPIModal(false);
            }}
            variant="secondary"
            style={styles.modalButton}
          />
          
          <Button
            title="Cancel"
            onPress={() => setShowUPIModal(false)}
            variant="ghost"
            style={styles.modalButton}
          />
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: recommendedSpacing.loose,
  },
  list: {
    paddingBottom: 24,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  paymentTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: recommendedSpacing.tight,
  },
  paymentSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  paymentRight: {
    alignItems: 'flex-end',
    marginLeft: 16,
  },
  paymentAmount: {
    ...typography.money,
    color: colors.textPrimary,
    marginBottom: recommendedSpacing.default,
  },
  upiButton: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  upiLabel: {
    ...typography.buttonSmall,
    color: colors.accent,
  },
  footerNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: recommendedSpacing.loose,
    marginBottom: recommendedSpacing.default,
    textAlign: 'center',
  },
  errorText: {
    ...typography.bodyLarge,
    color: colors.error,
    textAlign: 'center',
    marginTop: 100,
  },
  emptyState: {
    flex: 1,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 64, // Emoji icon, not typography
    marginBottom: recommendedSpacing.loose,
  },
  emptyText: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: recommendedSpacing.default,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modalButtonsContainer: {
    gap: 12,
  },
  modalButton: {
    marginBottom: 0,
  },
});

export default SettleUpScreen;
