import React, { useEffect } from 'react';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { typography, recommendedSpacing } from '../theme/typography';
import { Button, Logo } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingWelcome'>;

const OnboardingWelcome: React.FC<Props> = ({ navigation }) => {
  // Handle Android hardware back button
  // On the first screen, if there's no back history, allow default behavior (exit app)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // If we can go back in the navigation stack, do so
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true; // Prevent default back behavior
      }
      // Otherwise, allow default behavior (exit app or go to system home)
      // This ensures we don't skip intermediate screens that aren't on the stack yet
      return false;
    });

    return () => backHandler.remove();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Logo variant="primary" size={120} color={colors.primary} />
      </View>
      <Text style={styles.title}>BillLens</Text>
      <Text style={styles.tagline}>See Every Expense Clearly.</Text>

      <View style={styles.bullets}>
        <Text style={styles.bullet}>• Screenshot-first: point at any bill or UPI screen.</Text>
        <Text style={styles.bullet}>• No paywalls: OCR and splits are always free.</Text>
        <Text style={styles.bullet}>• Built for people who live together.</Text>
      </View>

      <Button
        title="Start without account"
        onPress={() => navigation.navigate('Permissions')}
        variant="primary"
        style={styles.button}
      />

      <Button
        title="Sign in to sync later"
        onPress={() => navigation.navigate('Login')}
        variant="secondary"
        style={styles.button}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    marginBottom: 24,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
  },
  tagline: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    marginTop: recommendedSpacing.tight,
    marginBottom: recommendedSpacing.extraLoose,
  },
  bullets: {
    width: '100%',
    marginBottom: recommendedSpacing.extraLoose,
  },
  bullet: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: recommendedSpacing.default,
  },
  button: {
    marginBottom: recommendedSpacing.comfortable,
  },
});

export default OnboardingWelcome;
