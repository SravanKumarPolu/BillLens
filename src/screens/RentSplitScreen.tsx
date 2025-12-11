import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, Button, Input } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { calculateRentSplit } from '../utils/indiaFirstService';
import { normalizeSplits } from '../utils/mathUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'RentSplit'>;

const RentSplitScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params || {};
  const { getGroup, addExpense } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const group = getGroup(groupId || '1');
  const members = group?.members || [];

  const [totalRent, setTotalRent] = useState('');
  const [electricity, setElectricity] = useState('');
  const [water, setWater] = useState('');
  const [internet, setInternet] = useState('');
  const [maintenance, setMaintenance] = useState('');
  const [other, setOther] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>(members.map(m => m.id));
  const [paidBy, setPaidBy] = useState<string>('you');

  const rentSplit = useMemo(() => {
    const rent = parseFloat(totalRent) || 0;
    const utils = {
      electricity: parseFloat(electricity) || 0,
      water: parseFloat(water) || 0,
      internet: parseFloat(internet) || 0,
      maintenance: parseFloat(maintenance) || 0,
      other: parseFloat(other) || 0,
    };

    if (rent <= 0 || selectedMembers.length === 0) {
      return null;
    }

    return calculateRentSplit(rent, utils, selectedMembers);
  }, [totalRent, electricity, water, internet, maintenance, other, selectedMembers]);

  const handleToggleMember = (memberId: string) => {
    if (selectedMembers.includes(memberId)) {
      if (selectedMembers.length > 1) {
        setSelectedMembers(selectedMembers.filter(id => id !== memberId));
      }
    } else {
      setSelectedMembers([...selectedMembers, memberId]);
    }
  };

  const handleSave = () => {
    if (!rentSplit) {
      Alert.alert('Error', 'Please enter rent amount and select members');
      return;
    }

    const totalAmount = rentSplit.totalRent + 
      (rentSplit.utilities?.electricity || 0) +
      (rentSplit.utilities?.water || 0) +
      (rentSplit.utilities?.internet || 0) +
      (rentSplit.utilities?.maintenance || 0) +
      (rentSplit.utilities?.other || 0);

    // Create splits
    const splits = selectedMembers.map(memberId => ({
      memberId,
      amount: rentSplit.perPerson,
    }));

    const normalizedSplits = normalizeSplits(splits, totalAmount);

    // Create expense
    addExpense({
      groupId: groupId || '1',
      title: 'Rent + Utilities',
      merchant: 'Rent',
      amount: totalAmount,
      category: 'Rent',
      paidBy,
      splits: normalizedSplits,
      currency: group?.currency || 'INR',
    });

    Alert.alert('Success', 'Rent split added', [
      { text: 'OK', onPress: () => navigation.navigate('GroupDetail', { groupId: groupId || '1' }) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Rent Split</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Rent Amount */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Rent Amount</Text>
          <Input
            label="Total Rent"
            value={totalRent}
            onChangeText={setTotalRent}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.inputContainer}
          />
        </Card>

        {/* Utilities */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Utilities (Optional)</Text>
          <Input
            label="Electricity"
            value={electricity}
            onChangeText={setElectricity}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.inputContainer}
          />
          <Input
            label="Water"
            value={water}
            onChangeText={setWater}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.inputContainer}
          />
          <Input
            label="Internet/WiFi"
            value={internet}
            onChangeText={setInternet}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.inputContainer}
          />
          <Input
            label="Maintenance"
            value={maintenance}
            onChangeText={setMaintenance}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.inputContainer}
          />
          <Input
            label="Other"
            value={other}
            onChangeText={setOther}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.inputContainer}
          />
        </Card>

        {/* Split Between */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Split Between</Text>
          <View style={styles.memberChips}>
            {members.map(member => {
              const isSelected = selectedMembers.includes(member.id);
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
                  onPress={() => handleToggleMember(member.id)}
                  disabled={isSelected && selectedMembers.length === 1}
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
        </Card>

        {/* Paid By */}
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Paid By</Text>
          <View style={styles.memberChips}>
            {members.map(member => (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.memberChip,
                  {
                    borderColor: paidBy === member.id ? colors.accent : colors.borderSubtle,
                    backgroundColor: paidBy === member.id ? colors.accent + '20' : 'transparent',
                  },
                ]}
                onPress={() => setPaidBy(member.id)}
              >
                <Text
                  style={[
                    styles.memberChipText,
                    { color: paidBy === member.id ? colors.accent : colors.textSecondary },
                  ]}
                >
                  {member.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Summary */}
        {rentSplit && (
          <Card style={styles.summaryCard}>
            <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>Split Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Rent per person</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {formatMoney(rentSplit.totalRent / selectedMembers.length, false, group?.currency || 'INR')}
              </Text>
            </View>
            {(rentSplit.utilities?.electricity || 0) > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Electricity per person</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {formatMoney((rentSplit.utilities?.electricity || 0) / selectedMembers.length, false, group?.currency || 'INR')}
                </Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total per person</Text>
              <Text style={[styles.totalValue, { color: colors.primary }]}>
                {formatMoney(rentSplit.perPerson, false, group?.currency || 'INR')}
              </Text>
            </View>
          </Card>
        )}
      </ScrollView>

      <Button
        title="Save Rent Split"
        onPress={handleSave}
        variant="primary"
        fullWidth={true}
        style={styles.saveButton}
        disabled={!rentSplit}
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
  backButton: {
    minWidth: 60,
  },
  backButtonText: {
    ...typography.navigation,
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
  sectionCard: {
    marginBottom: 16,
    padding: 16,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  memberChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
  },
  memberChipText: {
    ...typography.body,
  },
  summaryCard: {
    marginBottom: 16,
    padding: 20,
    backgroundColor: colors.primary + '10',
  },
  summaryTitle: {
    ...typography.h4,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    ...typography.body,
  },
  summaryValue: {
    ...typography.body,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  totalLabel: {
    ...typography.h4,
  },
  totalValue: {
    ...typography.moneyLarge,
  },
  saveButton: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
  },
});

export default RentSplitScreen;
