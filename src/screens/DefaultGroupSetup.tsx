import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'DefaultGroupSetup'>;

type Preset = 'home' | 'two' | 'trip' | 'custom';

const DefaultGroupSetup: React.FC<Props> = ({ navigation }) => {
  const { addGroup } = useGroups();
  const { colors } = useTheme();
  const [selected, setSelected] = useState<Preset | null>('home');
  const [customName, setCustomName] = useState('');

  const handleContinue = () => {
    let groupName = '';
    let emoji = '';
    let members = [{ id: 'you', name: 'You' }];

    if (selected === 'home') {
      groupName = 'Our Home';
      emoji = '🏠';
      members = [
        { id: 'you', name: 'You' },
        { id: 'priya', name: 'Priya' },
        { id: 'arjun', name: 'Arjun' },
      ];
    } else if (selected === 'two') {
      groupName = 'Us Two';
      emoji = '👫';
      members = [
        { id: 'you', name: 'You' },
        { id: 'priya', name: 'Priya' },
      ];
    } else if (selected === 'trip') {
      groupName = 'Trips';
      emoji = '✈️';
      members = [
        { id: 'you', name: 'You' },
        { id: 'priya', name: 'Priya' },
      ];
    } else if (selected === 'custom') {
      if (!customName.trim()) {
        Alert.alert('Error', 'Please enter a group name');
        return;
      }
      groupName = customName.trim();
      emoji = '✨';
      members = [
        { id: 'you', name: 'You' },
        { id: 'priya', name: 'Priya' },
      ];
    }

    // Only create if it doesn't already exist (check by name)
    // For MVP, we'll just create it
    addGroup({
      name: groupName,
      emoji,
      members,
    });

    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Permissions')} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Who are you sharing with?</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Pick a default group. You can change this anytime.</Text>

      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surfaceCard }, selected === 'home' && { borderColor: colors.accent, borderWidth: 2 }]}
        onPress={() => setSelected('home')}
      >
        <Text style={styles.cardEmoji}>🏠</Text>
        <View style={styles.cardTextWrapper}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Our Home</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>For roommates and flatmates.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surfaceCard }, selected === 'two' && { borderColor: colors.accent, borderWidth: 2 }]}
        onPress={() => setSelected('two')}
      >
        <Text style={styles.cardEmoji}>👫</Text>
        <View style={styles.cardTextWrapper}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Us Two</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>For couples or best friends.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surfaceCard }, selected === 'trip' && { borderColor: colors.accent, borderWidth: 2 }]}
        onPress={() => setSelected('trip')}
      >
        <Text style={styles.cardEmoji}>✈️</Text>
        <View style={styles.cardTextWrapper}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Trip or Event</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>For Goa trips, weddings, and parties.</Text>
        </View>
      </TouchableOpacity>

      <View style={[styles.card, { backgroundColor: colors.surfaceCard }, selected === 'custom' && { borderColor: colors.accent, borderWidth: 2 }]}>
        <TouchableOpacity onPress={() => setSelected('custom')} style={styles.customHeader}>
          <Text style={styles.cardEmoji}>✨</Text>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Custom group</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { color: colors.textPrimary, borderBottomColor: colors.borderSubtle }]}
          placeholder="e.g. Flat 502, Movie Nights"
          placeholderTextColor={colors.textSecondary}
          value={customName}
          onChangeText={setCustomName}
          onFocus={() => setSelected('custom')}
        />
      </View>

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={handleContinue}>
        <Text style={[styles.primaryLabel, { color: colors.white }]}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 8,
  },
  backButtonText: {
    ...typography.navigation,
  },
  title: {
    ...typography.h1,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    marginBottom: recommendedSpacing.extraLoose,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardEmoji: {
    fontSize: 24, // Emoji icon, not typography
    marginRight: recommendedSpacing.comfortable,
  },
  cardTextWrapper: {
    flex: 1,
  },
  cardTitle: {
    ...typography.h4,
  },
  cardSubtitle: {
    ...typography.bodySmall,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    marginTop: recommendedSpacing.default,
    paddingVertical: recommendedSpacing.default,
    borderBottomWidth: 1,
    ...typography.body,
    flex: 1,
  },
  primaryButton: {
    marginTop: recommendedSpacing.extraLoose,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryLabel: {
    ...typography.button,
  },
});

export default DefaultGroupSetup;
