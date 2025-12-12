import React, { useEffect } from 'react';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { typography, recommendedSpacing } from '../theme/typography';
import { Button, Logo, RotatingTagline } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingWelcome'>;

// Taglines to rotate through
const TAGLINES = [
  'Where every split stays fair.',
  'Transparent balances. Every time.',
  'Clear splits. Zero confusion.',
  'Smarter bill splitting for real life.',
  'Recalculation-proof expense sharing.',
  'Intelligent splits. Perfect settlements.',
  'Fairness made simple.',
  'No fights. No confusion. Just fairness.',
  'Settle up without stress.',
  'Sharing expenses made easy.',
  'For friends, roommates, and real life.',
  'Money harmony for every group.',
  'Peaceful bill sharing for every group.',
  'The intelligent way to split bills.',
  'Split. Track. Settle. Simple.',
  "Your group's money, finally organized.",
  'Real-time settlements. Zero confusion.',
];

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
      <RotatingTagline
        taglines={TAGLINES}
        mode="daily"
        transitionDuration={500}
        typographyStyle="h3"
        style={styles.taglineContainer}
        textStyle={styles.tagline}
      />
      <Text style={styles.description}>
        Whether it's a quick dinner split or managing a shared home, BillLens makes money management effortless, fair, and automatic.
      </Text>

      <View style={styles.bullets}>
        <Text style={styles.bullet}>• Effortless: Screenshot-first—point at any bill or UPI screen</Text>
        <Text style={styles.bullet}>• Fair: Smart splits ensure everyone pays their fair share</Text>
        <Text style={styles.bullet}>• Automatic: AI extracts amounts and suggests splits in seconds</Text>
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
  taglineContainer: {
    marginTop: recommendedSpacing.tight,
    marginBottom: recommendedSpacing.default,
    minHeight: 30, // Prevent layout shift during transitions
  },
  tagline: {
    // Additional text styling if needed
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: recommendedSpacing.extraLoose,
    textAlign: 'center',
    paddingHorizontal: recommendedSpacing.loose,
    lineHeight: 22,
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
