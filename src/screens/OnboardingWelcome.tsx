import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { typography, recommendedSpacing } from '../theme/typography';
import { Button } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingWelcome'>;

const OnboardingWelcome: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner} />
        </View>
        <View style={styles.receipt} />
      </View>
      <Text style={styles.title}>BillLens</Text>
      <Text style={styles.tagline}>Snap. Read. Settle.</Text>

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
    marginBottom: 16,
  },
  logoOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
  },
  receipt: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    width: 34,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.white,
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
