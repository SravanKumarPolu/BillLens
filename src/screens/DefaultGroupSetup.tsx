import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'DefaultGroupSetup'>;

type Preset = 'home' | 'two' | 'trip' | 'custom';

const DefaultGroupSetup: React.FC<Props> = ({ navigation }) => {
  const [selected, setSelected] = useState<Preset | null>('home');
  const [customName, setCustomName] = useState('');

  const handleContinue = () => {
    // In a real app, create the group and store it; here we just go home.
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who are you sharing with?</Text>
      <Text style={styles.subtitle}>Pick a default group. You can change this anytime.</Text>

      <TouchableOpacity
        style={[styles.card, selected === 'home' && styles.cardSelected]}
        onPress={() => setSelected('home')}
      >
        <Text style={styles.cardEmoji}>🏠</Text>
        <View style={styles.cardTextWrapper}>
          <Text style={styles.cardTitle}>Our Home</Text>
          <Text style={styles.cardSubtitle}>For roommates and flatmates.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, selected === 'two' && styles.cardSelected]}
        onPress={() => setSelected('two')}
      >
        <Text style={styles.cardEmoji}>👫</Text>
        <View style={styles.cardTextWrapper}>
          <Text style={styles.cardTitle}>Us Two</Text>
          <Text style={styles.cardSubtitle}>For couples or best friends.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, selected === 'trip' && styles.cardSelected]}
        onPress={() => setSelected('trip')}
      >
        <Text style={styles.cardEmoji}>✈️</Text>
        <View style={styles.cardTextWrapper}>
          <Text style={styles.cardTitle}>Trip or Event</Text>
          <Text style={styles.cardSubtitle}>For Goa trips, weddings, and parties.</Text>
        </View>
      </TouchableOpacity>

      <View style={[styles.card, selected === 'custom' && styles.cardSelected]}>
        <TouchableOpacity onPress={() => setSelected('custom')} style={styles.customHeader}>
          <Text style={styles.cardEmoji}>✨</Text>
          <Text style={styles.cardTitle}>Custom group</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="e.g. Flat 502, Movie Nights"
          placeholderTextColor={colors.textSecondary}
          value={customName}
          onChangeText={setCustomName}
          onFocus={() => setSelected('custom')}
        />
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
        <Text style={styles.primaryLabel}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    backgroundColor: colors.surfaceLight,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  cardEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  cardTextWrapper: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    marginTop: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceCard,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  primaryButton: {
    marginTop: 24,
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

export default DefaultGroupSetup;
