import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';
import { openUPIApp, getAvailableUPIApps, getAppDisplayName, type UPIPaymentApp } from '../utils/upiService';
import { optimizeSettlements } from '../utils/insightsService';
import { explainSettlement } from '../utils/settlementExplanation';
import { Modal, Button, BackButton } from '../components';

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
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'bank_transfer' | 'card' | 'other' | undefined>('upi');
  
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
    
    // Get group to get currency
    const group = getGroup(groupId);
    
    // Record the settlement
    const settlementId = addSettlement({
      groupId,
      fromMemberId: payment.fromMemberId,
      toMemberId: payment.toMemberId,
      amount: payment.amount,
      currency: group?.currency || 'INR',
      paymentMode: paymentMode || 'upi',
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


  // Calculate balances for display
  const balances = useMemo(() => {
    if (!summary) return [];
    return calculateGroupBalances(groupId);
  }, [summary, groupId, calculateGroupBalances]);

  // Calculate simplified summary
  const summaryInfo = useMemo(() => {
    if (!summary || !group) return null;
    
    const userBalance = balances.find(b => b.memberId === 'you')?.balance || 0;
    const totalOwed = balances
      .filter(b => b.balance < 0)
      .reduce((sum, b) => sum + Math.abs(b.balance), 0);
    const totalOwedToYou = balances
      .filter(b => b.balance > 0 && b.memberId !== 'you')
      .reduce((sum, b) => sum + b.balance, 0);
    
    return {
      userBalance,
      totalOwed,
      totalOwedToYou,
      totalTransactions: suggestedPayments.length,
    };
  }, [summary, group, balances, suggestedPayments.length]);

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Settle up</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {suggestedPayments.length > 0
              ? 'Pay these to become all settled.'
              : 'All balances are settled!'}
          </Text>
        </View>
      </View>

      {/* Simplified Summary */}
      {summaryInfo && (
        <View style={[styles.summaryCard, { backgroundColor: colors.surfaceCard }]}>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Your balance</Text>
            <Text style={[
              styles.summaryValue,
              { 
                color: summaryInfo.userBalance > 0 
                  ? colors.accent 
                  : summaryInfo.userBalance < 0 
                  ? colors.error 
                  : colors.textPrimary 
              }
            ]}>
              {summaryInfo.userBalance > 0 
                ? `+${formatMoney(summaryInfo.userBalance)}`
                : formatMoney(summaryInfo.userBalance)}
            </Text>
          </View>
          {summaryInfo.totalOwedToYou > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Owed to you</Text>
              <Text style={[styles.summaryValue, { color: colors.accent }]}>
                {formatMoney(summaryInfo.totalOwedToYou)}
              </Text>
            </View>
          )}
          {summaryInfo.totalOwed > 0 && summaryInfo.userBalance < 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>You owe</Text>
              <Text style={[styles.summaryValue, { color: colors.error }]}>
                {formatMoney(Math.abs(summaryInfo.userBalance))}
              </Text>
            </View>
          )}
          {suggestedPayments.length > 0 && (
            <View style={[styles.summaryDivider, { backgroundColor: colors.borderSubtle }]} />
          )}
          {suggestedPayments.length > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Payments needed</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {summaryInfo.totalTransactions} {summaryInfo.totalTransactions === 1 ? 'payment' : 'payments'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Who Owes Whom - Running Balances */}
      {balances.length > 0 && (
        <View style={styles.balancesSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Running Balances</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Current balance for each member
          </Text>
          {balances
            .filter(b => Math.abs(b.balance) > 0.01)
            .sort((a, b) => b.balance - a.balance)
            .map(balance => {
              const member = group?.members.find(m => m.id === balance.memberId);
              const isOwed = balance.balance > 0;
              const owes = balance.balance < 0;
              
              return (
                <View key={balance.memberId} style={[styles.balanceRow, { backgroundColor: colors.surfaceCard }]}>
                  <View style={styles.balanceLeft}>
                    <Text style={[styles.balanceMemberName, { color: colors.textPrimary }]}>
                      {member?.name || 'Unknown'}
                    </Text>
                    <Text style={[styles.balanceStatus, { color: colors.textSecondary }]}>
                      {isOwed ? 'is owed' : owes ? 'owes' : 'settled'}
                    </Text>
                  </View>
                  <Text style={[
                    styles.balanceAmount,
                    { 
                      color: isOwed ? colors.accent : owes ? colors.error : colors.textSecondary 
                    }
                  ]}>
                    {isOwed 
                      ? `+${formatMoney(balance.balance)}`
                      : formatMoney(balance.balance)}
                  </Text>
                </View>
              );
            })}
        </View>
      )}

      {/* Who Owes Whom - Suggested Payments */}
      {suggestedPayments.length > 0 && (
        <View style={styles.paymentsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Who Owes Whom</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Optimized payments to settle all balances
          </Text>
          {suggestedPayments.map(payment => (
            <View key={payment.id} style={[styles.paymentRow, { backgroundColor: colors.surfaceCard }]}>
              <View style={styles.paymentLeft}>
                <Text style={[styles.paymentTitle, { color: colors.textPrimary }]}>
                  {payment.from} → {payment.to}
                </Text>
                <Text style={[styles.paymentSubtitle, { color: colors.textSecondary }]}>
                  Suggested to clear balances
                </Text>
              </View>
              <View style={styles.paymentRight}>
                <Text style={[styles.paymentAmount, { color: colors.textPrimary }]}>
                  {formatMoney(payment.amount)}
                </Text>
                <TouchableOpacity
                  style={[styles.upiButton, { borderColor: colors.accent }]}
                  onPress={() => handlePay(payment)}
                >
                  <Text style={[styles.upiLabel, { color: colors.accent }]}>
                    {payment.from === 'You' ? 'Pay via UPI' : 'Mark as paid'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {suggestedPayments.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🎉</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>All settled!</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>No pending payments</Text>
        </View>
      )}

      {suggestedPayments.length > 0 && (
        <View style={styles.footerNoteContainer}>
          <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
            Mark payments as completed to update balances in real-time.
          </Text>
        </View>
      )}

      {/* UPI App Selection Modal */}
      <Modal
        visible={showUPIModal}
        onClose={() => setShowUPIModal(false)}
        title="Choose payment method"
        subtitle={`Pay ${selectedPayment?.to} ${formatMoney(selectedPayment?.amount || 0)}`}
        variant="glass"
        animationType="slide"
      >
        <ScrollView style={styles.modalContent}>
          <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Payment Mode</Text>
          <View style={styles.paymentModeRow}>
            {[
              { value: 'upi' as const, label: '📱 UPI' },
              { value: 'cash' as const, label: '💵 Cash' },
              { value: 'bank_transfer' as const, label: '🏦 Bank Transfer' },
              { value: 'card' as const, label: '💳 Card' },
              { value: 'other' as const, label: 'Other' },
            ].map(mode => (
              <TouchableOpacity
                key={mode.value}
                style={[
                  styles.paymentModeChip,
                  { 
                    borderColor: paymentMode === mode.value ? colors.accent : colors.borderSubtle,
                    backgroundColor: paymentMode === mode.value ? colors.accent + '20' : 'transparent'
                  }
                ]}
                onPress={() => setPaymentMode(mode.value)}
              >
                <Text style={[
                  styles.paymentModeText,
                  { color: paymentMode === mode.value ? colors.accent : colors.textSecondary }
                ]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {paymentMode === 'upi' && (
            <>
              <Text style={[styles.modalLabel, { color: colors.textSecondary, marginTop: 16 }]}>Choose UPI App</Text>
              {availableApps.map(app => (
                <Button
                  key={app}
                  title={getAppDisplayName(app)}
                  onPress={() => {
                    setPaymentMode('upi');
                    handleUPIPayment(app);
                  }}
                  variant="primary"
                  style={styles.modalButton}
                />
              ))}
            </>
          )}
          
          <Button
            title="Mark as Paid"
            onPress={() => {
              if (selectedPayment) {
                handleMarkAsPaid(selectedPayment);
              }
              setShowUPIModal(false);
            }}
            variant="primary"
            style={styles.modalButton}
          />
          
          <Button
            title="Cancel"
            onPress={() => setShowUPIModal(false)}
            variant="ghost"
            style={styles.modalButton}
          />
        </ScrollView>
      </Modal>
    </ScrollView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
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
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  paymentLeft: {
    flex: 1,
  },
  paymentTitle: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  paymentSubtitle: {
    ...typography.bodySmall,
  },
  paymentRight: {
    alignItems: 'flex-end',
    marginLeft: 16,
  },
  paymentAmount: {
    ...typography.money,
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
  },
  footerNoteContainer: {
    marginTop: recommendedSpacing.loose,
    marginBottom: recommendedSpacing.default,
    paddingHorizontal: 24,
  },
  footerNote: {
    ...typography.caption,
    textAlign: 'center',
  },
  errorText: {
    ...typography.bodyLarge,
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
    marginBottom: recommendedSpacing.default,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    textAlign: 'center',
  },
  modalButtonsContainer: {
    gap: 12,
  },
  modalContent: {
    paddingVertical: 8,
  },
  modalLabel: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  paymentModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 8,
  },
  paymentModeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
  },
  paymentModeText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  modalButton: {
    marginBottom: 12,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  summaryTitle: {
    ...typography.h4,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    ...typography.body,
  },
  summaryValue: {
    ...typography.h4,
    ...typography.emphasis.semibold,
  },
  summaryDivider: {
    height: 1,
    marginVertical: 12,
  },
  balancesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: 4,
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  balanceLeft: {
    flex: 1,
  },
  balanceMemberName: {
    ...typography.body,
    ...typography.emphasis.medium,
    marginBottom: 2,
  },
  balanceStatus: {
    ...typography.bodySmall,
  },
  balanceAmount: {
    ...typography.money,
    ...typography.emphasis.semibold,
  },
  paymentsSection: {
    marginBottom: 24,
  },
});

export default SettleUpScreen;
