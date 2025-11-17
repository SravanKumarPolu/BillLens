import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewBill'>;

const categories = ['Food', 'Groceries', 'Utilities', 'Rent', 'OTT', 'Other'];

const ReviewBillScreen: React.FC<Props> = ({ navigation, route }) => {
  const { imageUri, groupId } = route.params;
  const [merchant, setMerchant] = useState('Swiggy');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState<string>('Food');

  const handleNext = () => {
    // TODO: store draft bill and pass its id; using a dummy id for now.
    navigation.navigate('ConfigureSplit', { draftBillId: 'draft-1' });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Check bill details</Text>
      <Text style={styles.subtitle}>Edit anything if it looks off.</Text>

      <View style={styles.imageWrapper}>
        <Image source={{ uri: imageUri }} style={styles.image} />
      </View>

      <Text style={styles.label}>Merchant</Text>
      <TextInput
        value={merchant}
        onChangeText={setMerchant}
        style={styles.input}
        placeholder="e.g. Swiggy, Blinkit"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={styles.label}>Total amount</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        style={styles.input}
        placeholder="₹0"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.chip, category === cat && styles.chipSelected]}
            onPress={() => setCategory(cat)}
          >
            <Text
              style={[styles.chipLabel, category === cat && styles.chipLabelSelected]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
        <Text style={styles.primaryLabel}>Next: split bill</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
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
    marginBottom: 20,
  },
  imageWrapper: {
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceCard,
    marginBottom: 20,
  },
  image: {
    flex: 1,
    resizeMode: 'cover',
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceCard,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceCard,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipLabelSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReviewBillScreen;
