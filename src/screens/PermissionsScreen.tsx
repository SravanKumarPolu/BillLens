import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Button, Card } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Permissions'>;

const PermissionsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  
  // Handle Android hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Go back to OnboardingWelcome screen
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('OnboardingWelcome');
      }
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [navigation]);
  
  const handleContinue = () => {
    // TODO: request camera and gallery permissions
    navigation.navigate('DefaultGroupSetup');
  };

  const handleSkip = () => {
    navigation.navigate('DefaultGroupSetup');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            // Go back to OnboardingWelcome screen (previous step in onboarding)
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('OnboardingWelcome');
            }
          }} 
          style={styles.backButton}
        >
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Let BillLens see your bills</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        We only use your camera and gallery to read bill amounts. You choose what to share.
      </Text>

      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Camera access</Text>
        <Text style={[styles.cardText, { color: colors.textSecondary }]}>Snap paper bills in one tap.</Text>
      </Card>
      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Photos & media</Text>
        <Text style={[styles.cardText, { color: colors.textSecondary }]}>Read screenshots from Swiggy, Blinkit, UPI and more.</Text>
      </Card>

      <Button
        title="Continue"
        onPress={handleContinue}
        variant="positive"
        style={styles.primaryButton}
      />

      <Button
        title="Skip for now"
        onPress={handleSkip}
        variant="secondary"
        style={styles.secondaryButton}
      />
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
    marginBottom: 12,
  },
  cardTitle: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  cardText: {
    ...typography.bodySmall,
  },
  primaryButton: {
    marginTop: 32,
    marginBottom: 12,
  },
  secondaryButton: {
    marginBottom: 12,
  },
});

export default PermissionsScreen;
