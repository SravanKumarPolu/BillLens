import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert, Platform, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card, Button } from '../components';
import {
  isSMSAutoFetchEnabled,
  setSMSAutoFetchEnabled,
  requestSMSPermissions,
  checkSMSPermissions,
  readRecentSMS,
  processSMSForBills,
  clearProcessedSMSHistory,
} from '../utils/smsReaderService';
import { useGroups } from '../context/GroupsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SMSSettings'>;

const SMSSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const { addExpense, getGroup } = useGroups();
  const styles = createStyles(colors);

  const [isEnabled, setIsEnabled] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const enabled = await isSMSAutoFetchEnabled();
    const permission = await checkSMSPermissions();
    setIsEnabled(enabled);
    setHasPermission(permission);
  };

  const handleToggle = async (value: boolean) => {
    if (value && !hasPermission) {
      // Request permission first
      const granted = await requestSMSPermissions();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'SMS auto-fetch requires SMS reading permission. Please enable it in app settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                // TODO: Open app settings
                // Linking.openSettings();
              },
            },
          ]
        );
        return;
      }
      setHasPermission(true);
    }

    await setSMSAutoFetchEnabled(value);
    setIsEnabled(value);
  };

  const handleProcessRecentSMS = async () => {
    if (!hasPermission) {
      Alert.alert('Permission Required', 'Please grant SMS permission first.');
      return;
    }

    setIsProcessing(true);
    try {
      // Read recent SMS (last 50, last 7 days)
      const smsMessages = await readRecentSMS(50, 7 * 24 * 60 * 60 * 1000);

      if (smsMessages.length === 0) {
        Alert.alert(
          'No SMS Found',
          'No recent SMS messages found. Make sure you have SMS permission granted.'
        );
        setIsProcessing(false);
        return;
      }

      // Process SMS for bills
      const processedBills = await processSMSForBills(smsMessages);

      if (processedBills.length === 0) {
        Alert.alert(
          'No Bills Found',
          'No bill SMS messages found in recent SMS. BillLens looks for SMS from Swiggy, Zomato, utilities, etc.'
        );
        setIsProcessing(false);
        return;
      }

      // Show results and let user create expenses
      Alert.alert(
        'Bills Found',
        `Found ${processedBills.length} bill(s) in your SMS. You can now add them as expenses.`,
        [
          {
            text: 'View Bills',
            onPress: () => {
              // Navigate to a screen to review and add bills
              // For now, just show an alert with details
              const billDetails = processedBills
                .map(
                  (bill, index) =>
                    `${index + 1}. ${bill.parsedBill.merchant || 'Unknown'}: ₹${bill.parsedBill.amount || 0}`
                )
                .join('\n');
              Alert.alert('Found Bills', billDetails);
            },
          },
          { text: 'OK' },
        ]
      );
    } catch (error) {
      console.error('Error processing SMS:', error);
      Alert.alert('Error', 'Failed to process SMS. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'This will clear the list of processed SMS. You can process them again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearProcessedSMSHistory();
            Alert.alert('Success', 'SMS history cleared.');
          },
        },
      ]
    );
  };

  if (Platform.OS !== 'android') {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>SMS Auto-Fetch</Text>
          <View style={styles.placeholder} />
        </View>
        <Card style={styles.infoCard}>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            SMS auto-fetch is only available on Android devices.
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>SMS Auto-Fetch</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>
            📱 Auto-Fetch Bills from SMS
          </Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            BillLens can automatically detect bills from SMS messages and help you add them as expenses.
            We only read SMS that look like bills (Swiggy, Zomato, utilities, etc.) and never access
            your personal messages.
          </Text>
        </Card>

        {/* Enable/Disable Toggle */}
        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>
                Enable SMS Auto-Fetch
              </Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Automatically detect bills from incoming SMS
              </Text>
            </View>
            <Switch
              value={isEnabled}
              onValueChange={handleToggle}
              trackColor={{ false: colors.borderSubtle, true: colors.accent }}
              thumbColor={isEnabled ? colors.primary : colors.textSecondary}
            />
          </View>
        </Card>

        {/* Permission Status */}
        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>
                SMS Permission
              </Text>
              <Text
                style={[
                  styles.settingDescription,
                  { color: hasPermission ? colors.success : colors.error },
                ]}
              >
                {hasPermission ? '✓ Granted' : '✗ Not Granted'}
              </Text>
            </View>
            {!hasPermission && (
              <Button
                title="Grant Permission"
                onPress={async () => {
                  const granted = await requestSMSPermissions();
                  setHasPermission(granted);
                  if (granted) {
                    Alert.alert('Success', 'SMS permission granted.');
                  }
                }}
                variant="secondary"
                style={styles.permissionButton}
              />
            )}
          </View>
        </Card>

        {/* Process Recent SMS */}
        <Card style={styles.actionCard}>
          <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
            Process Recent SMS
          </Text>
          <Text style={[styles.actionDescription, { color: colors.textSecondary }]}>
            Scan your recent SMS messages for bills (last 7 days)
          </Text>
          <Button
            title={isProcessing ? 'Processing...' : 'Scan SMS Now'}
            onPress={handleProcessRecentSMS}
            variant="primary"
            disabled={isProcessing || !hasPermission}
            style={styles.actionButton}
          />
        </Card>

        {/* Clear History */}
        <Card style={styles.actionCard}>
          <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
            Clear Processed History
          </Text>
          <Text style={[styles.actionDescription, { color: colors.textSecondary }]}>
            Clear the list of processed SMS to re-process them
          </Text>
          <Button
            title="Clear History"
            onPress={handleClearHistory}
            variant="secondary"
            style={styles.actionButton}
          />
        </Card>

        {/* Privacy Note */}
        <Card style={styles.privacyCard}>
          <Text style={[styles.privacyTitle, { color: colors.textPrimary }]}>🔒 Privacy</Text>
          <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
            • BillLens only reads SMS that match bill patterns{'\n'}
            • Your personal messages are never accessed{'\n'}
            • All processing happens on your device{'\n'}
            • You can disable this feature anytime{'\n'}
            • Processed SMS IDs are stored locally only
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      paddingTop: 56,
      paddingHorizontal: 24,
      paddingBottom: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    backButton: {
      minWidth: 60,
    },
    backButtonText: {
      ...typography.navigation,
    },
    title: {
      ...typography.h2,
      flex: 1,
      textAlign: 'center',
    },
    placeholder: {
      minWidth: 60,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 24,
      paddingBottom: 32,
    },
    infoCard: {
      marginBottom: 16,
      padding: 20,
      backgroundColor: colors.primary + '10',
    },
    infoTitle: {
      ...typography.h3,
      marginBottom: 8,
    },
    infoText: {
      ...typography.body,
      lineHeight: 22,
    },
    settingCard: {
      marginBottom: 16,
      padding: 20,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    settingInfo: {
      flex: 1,
      marginRight: 16,
    },
    settingTitle: {
      ...typography.h4,
      marginBottom: 4,
    },
    settingDescription: {
      ...typography.bodySmall,
    },
    permissionButton: {
      minWidth: 120,
    },
    actionCard: {
      marginBottom: 16,
      padding: 20,
    },
    actionTitle: {
      ...typography.h4,
      marginBottom: 4,
    },
    actionDescription: {
      ...typography.bodySmall,
      marginBottom: 16,
    },
    actionButton: {
      marginTop: 8,
    },
    privacyCard: {
      marginTop: 8,
      marginBottom: 16,
      padding: 20,
      backgroundColor: colors.surfaceCard,
    },
    privacyTitle: {
      ...typography.h4,
      marginBottom: 12,
    },
    privacyText: {
      ...typography.bodySmall,
      lineHeight: 20,
    },
  });

export default SMSSettingsScreen;
