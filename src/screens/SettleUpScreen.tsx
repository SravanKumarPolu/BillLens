import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'SettleUp'>;

type Payment = {
  id: string;
  from: string;
  to: string;
  amount: string;
};

const MOCK_PAYMENTS: Payment[] = [
  { id: '1', from: 'You', to: 'Priya', amount: '₹650' },
  { id: '2', from: 'Arjun', to: 'You', amount: '₹200' },
];

const SettleUpScreen: React.FC<Props> = () => {
  const handlePay = (payment: Payment) => {
    // TODO: launch UPI intent; for now, no-op.
    // Intent example: upi://pay?pa=...&am=...
  };

  const renderItem = ({ item }: { item: Payment }) => (
    <View style={styles.paymentRow}>
      <View>
        <Text style={styles.paymentTitle}>
          {item.from} → {item.to}
        </Text>
        <Text style={styles.paymentSubtitle}>Suggested to clear balances</Text>
      </View>
      <View style={styles.paymentRight}>
        <Text style={styles.paymentAmount}>{item.amount}</Text>
        <TouchableOpacity
          style={styles.upiButton}
          onPress={() => handlePay(item)}
        >
          <Text style={styles.upiLabel}>Pay via UPI</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settle up</Text>
      <Text style={styles.subtitle}>Pay these to become all settled.</Text>

      <FlatList
        data={MOCK_PAYMENTS}
        keyExtractor={p => p.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />

      <Text style={styles.footerNote}>UPI-aware, but logging payments stays simple.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  list: {
    paddingBottom: 24,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  paymentTitle: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  paymentSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: 4,
  },
  upiButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  upiLabel: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 12,
  },
});

export default SettleUpScreen;
