import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Button } from '../components';
import {
  authenticateWithBiometrics,
  isBiometricAvailable,
  recordUnlock,
  type SecuritySettings,
} from '../utils/securityService';

type AppLockScreenProps = NativeStackScreenProps<RootStackParamList, 'AppLock'>;

const AppLockScreen: React.FC<AppLockScreenProps> = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    checkBiometricAvailability();
    // Auto-trigger biometric authentication
    handleBiometricAuth();
  }, []);

  const checkBiometricAvailability = async () => {
    const available = await isBiometricAvailable();
    setBiometricAvailable(available);
  };

  const handleUnlock = async () => {
    await recordUnlock();
    // Navigate to Home screen after unlock
    navigation.replace('Home');
  };

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);
    try {
      const success = await authenticateWithBiometrics();
      if (success) {
        await handleUnlock();
      } else {
        Alert.alert('Authentication Failed', 'Please try again');
      }
    } catch (error) {
      Alert.alert('Error', 'Biometric authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSkip = async () => {
    // For demo purposes, allow skipping
    // In production, this should require password or PIN
    await handleUnlock();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.content}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>App Locked</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Authenticate to unlock BillLens
        </Text>

        {biometricAvailable && (
          <Button
            title={isAuthenticating ? 'Authenticating...' : '🔐 Unlock with Biometrics'}
            onPress={handleBiometricAuth}
            variant="primary"
            fullWidth={true}
            style={styles.biometricButton}
            disabled={isAuthenticating}
          />
        )}

        <TouchableOpacity
          onPress={handleSkip}
          style={styles.skipButton}
          disabled={isAuthenticating}
        >
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>
            Skip (Demo Mode)
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 48,
    maxWidth: 400,
  },
  lockIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  title: {
    ...typography.h1,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    marginBottom: 32,
    textAlign: 'center',
  },
  biometricButton: {
    marginBottom: 16,
  },
  skipButton: {
    paddingVertical: 12,
  },
  skipText: {
    ...typography.body,
    textDecorationLine: 'underline',
  },
});

export default AppLockScreen;
