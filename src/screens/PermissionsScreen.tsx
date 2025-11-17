import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { Button, Card } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Permissions'>;

const PermissionsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  
  const handleContinue = () => {
    // TODO: request camera and gallery permissions
    navigation.navigate('DefaultGroupSetup');
  };

  const handleSkip = () => {
    navigation.navigate('DefaultGroupSetup');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
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
    paddingTop: 80,
  },
  title: {
    ...typography.h1,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    marginBottom: 24,
  },
  card: {
    marginBottom: 12,
  },
  cardTitle: {
    ...typography.h4,
    marginBottom: 4,
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
