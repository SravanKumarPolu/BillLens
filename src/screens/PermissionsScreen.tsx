import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Permissions'>;

const PermissionsScreen: React.FC<Props> = ({ navigation }) => {
  const handleContinue = () => {
    // TODO: request camera and gallery permissions
    navigation.navigate('DefaultGroupSetup');
  };

  const handleSkip = () => {
    navigation.navigate('DefaultGroupSetup');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Let BillLens see your bills</Text>
      <Text style={styles.subtitle}>
        We only use your camera and gallery to read bill amounts. You choose what to share.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Camera access</Text>
        <Text style={styles.cardText}>Snap paper bills in one tap.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Photos & media</Text>
        <Text style={styles.cardText}>Read screenshots from Swiggy, Blinkit, UPI and more.</Text>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
        <Text style={styles.primaryLabel}>Continue</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={handleSkip}>
        <Text style={styles.secondaryLabel}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    backgroundColor: colors.surfaceLight,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 12,
  },
  primaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5F5',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default PermissionsScreen;
