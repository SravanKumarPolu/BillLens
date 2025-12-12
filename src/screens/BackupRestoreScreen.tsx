import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Share, ActivityIndicator, TextInput, Modal } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { typography, recommendedSpacing } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../context/GroupsContext';
import { createBackup, restoreBackup, clearAllData } from '../utils/storageService';
import { exportRawData, exportDashboardSummary } from '../utils/exportService';
import { Card } from '../components';
import {
  getSecuritySettings,
  updateSecuritySettings,
  isBiometricAvailable,
  type SecuritySettings,
} from '../utils/securityService';

type Props = NativeStackScreenProps<RootStackParamList, 'BackupRestore'>;

const BackupRestoreScreen: React.FC<Props> = ({ navigation }) => {
  const { user, signOut, syncData, isSyncing, lastSyncDate } = useAuth();
  const { groups, expenses, settlements } = useGroups();
  const { theme, toggleTheme, colors: themeColors } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreText, setRestoreText] = useState('');
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    loadSecuritySettings();
  }, []);

  const loadSecuritySettings = async () => {
    const settings = await getSecuritySettings();
    setSecuritySettings(settings);
    const available = await isBiometricAvailable();
    setBiometricAvailable(available);
  };

  const handleToggleLock = async () => {
    if (!securitySettings) return;
    await updateSecuritySettings({ lockEnabled: !securitySettings.lockEnabled });
    await loadSecuritySettings();
  };

  const handleToggleBiometric = async () => {
    if (!securitySettings) return;
    await updateSecuritySettings({ biometricEnabled: !securitySettings.biometricEnabled });
    await loadSecuritySettings();
  };

  const handleToggleEncryption = async () => {
    if (!securitySettings) return;
    await updateSecuritySettings({ encryptionEnabled: !securitySettings.encryptionEnabled });
    await loadSecuritySettings();
  };

  const handleCreateBackup = async () => {
    setIsProcessing(true);
    try {
      // Check if encryption is enabled
      const encrypt = securitySettings?.encryptionEnabled || false;
      const backupString = await createBackup(encrypt);
      
      // Share backup file
      await Share.share({
        message: backupString,
        title: 'BillLens Backup',
      });
      
      Alert.alert(
        'Success', 
        `Backup created${encrypt ? ' (encrypted)' : ''} and ready to share. Your data stays private - you choose who to share it with.`
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to create backup');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportRawData = async () => {
    setIsProcessing(true);
    try {
      const rawData = exportRawData(groups, expenses, settlements);
      
      await Share.share({
        message: rawData,
        title: 'BillLens Raw Data Export',
      });
      
      Alert.alert('Success', 'Raw data exported successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to export raw data');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportDashboard = async () => {
    setIsProcessing(true);
    try {
      const dashboard = exportDashboardSummary(groups, expenses, settlements);
      
      await Share.share({
        message: dashboard,
        title: 'BillLens Dashboard Summary',
      });
      
      Alert.alert('Success', 'Dashboard summary exported successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to export dashboard');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreBackup = () => {
    setShowRestoreModal(true);
    setRestoreText('');
  };

  const handleConfirmRestore = async () => {
    if (!restoreText.trim()) {
      Alert.alert('Error', 'No backup data provided');
      return;
    }

    setIsProcessing(true);
    setShowRestoreModal(false);
    
    try {
      await restoreBackup(restoreText.trim());
      Alert.alert(
        'Success',
        'Backup restored successfully. The app will reload.',
        [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to restore backup. Invalid format.');
    } finally {
      setIsProcessing(false);
      setRestoreText('');
    }
  };

  const handleSync = async () => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }

    try {
      await syncData();
      Alert.alert('Success', 'Data synced successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to sync data');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your data will remain on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          onPress: async () => {
            await signOut();
            navigation.navigate('Home');
          },
        },
      ]
    );
  };

  const styles = createStyles(themeColors);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.surfaceLight }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: themeColors.primary }]}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Backup & Sync</Text>

      {user ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signed in as</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          {lastSyncDate && (
            <Text style={styles.syncInfo}>
              Last synced: {lastSyncDate.toLocaleString()}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Not signed in</Text>
          <Text style={styles.sectionText}>
            Sign in to sync your data across devices
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cloud Sync</Text>
        <Text style={styles.sectionText}>
          {user
            ? 'Sync your data to the cloud to access it on other devices'
            : 'Sign in to enable cloud sync'}
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, !user && styles.buttonDisabled]}
          onPress={handleSync}
          disabled={!user || isSyncing || isProcessing}
        >
          {isSyncing ? (
            <ActivityIndicator color={themeColors.white} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: themeColors.white }]}>Sync now</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Privacy Notice */}
      <Card style={[styles.privacyCard, { backgroundColor: themeColors.primary + '10', borderColor: themeColors.primary }]}>
        <Text style={[styles.privacyTitle, { color: themeColors.textPrimary }]}>🔒 Privacy & Security First</Text>
        <Text style={[styles.privacyText, { color: themeColors.textSecondary }]}>
          Your data belongs to you — not us. All data is stored locally on your device. Cloud sync is optional and only happens when you sign in. We never sell your data.
        </Text>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Local Backup</Text>
        <Text style={styles.sectionText}>
          Create a backup file that you can save or share. Works entirely offline - no internet required. Your data stays on your device until you choose to share it.
        </Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleCreateBackup}
          disabled={isProcessing}
        >
          <Text style={styles.secondaryButtonText}>
            {isProcessing ? 'Creating...' : 'Create backup'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Restore Backup</Text>
        <Text style={styles.sectionText}>
          Restore data from a backup file. This will replace your current data.
        </Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleRestoreBackup}
          disabled={isProcessing}
        >
          <Text style={styles.secondaryButtonText}>Restore from backup</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Export Options</Text>
        <Text style={styles.sectionText}>
          Export your data in different formats for backup or analysis.
        </Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleExportRawData}
          disabled={isProcessing}
        >
          <Text style={styles.secondaryButtonText}>
            {isProcessing ? 'Exporting...' : 'Export Raw Data (JSON)'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: 12 }]}
          onPress={handleExportDashboard}
          disabled={isProcessing}
        >
          <Text style={styles.secondaryButtonText}>
            {isProcessing ? 'Exporting...' : 'Export Dashboard Summary'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Theme Toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Theme</Text>
              <Text style={[styles.settingDescription, { color: themeColors.textSecondary }]}>
                {theme === 'dark' ? 'Dark mode' : 'Light mode'} • Tap to switch
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggle,
                theme === 'dark' && [styles.toggleActive, { backgroundColor: themeColors.primary }],
                !theme || theme === 'light' && { backgroundColor: '#ccc' },
              ]}
              onPress={toggleTheme}
            >
              <View
                style={[
                  styles.toggleThumb,
                  theme === 'dark' && [styles.toggleThumbActive, { backgroundColor: themeColors.white }],
                  (!theme || theme === 'light') && { backgroundColor: themeColors.white },
                ]}
              />
            </TouchableOpacity>
          </View>
        </Card>
      </View>

      {/* Security Section */}
      {securitySettings && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          
          <Card style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>App Lock</Text>
                <Text style={styles.settingDescription}>
                  Lock app after {securitySettings.lockTimeout} minutes of inactivity
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  securitySettings.lockEnabled && [styles.toggleActive, { backgroundColor: themeColors.primary }],
                ]}
                onPress={handleToggleLock}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    securitySettings.lockEnabled && styles.toggleThumbActive,
                  ]}
                />
              </TouchableOpacity>
            </View>
          </Card>

          {biometricAvailable && (
            <Card style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Biometric Authentication</Text>
                  <Text style={styles.settingDescription}>
                    Use fingerprint or face ID to unlock
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.toggle,
                    securitySettings.biometricEnabled && [styles.toggleActive, { backgroundColor: themeColors.primary }],
                  ]}
                  onPress={handleToggleBiometric}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      securitySettings.biometricEnabled && styles.toggleThumbActive,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </Card>
          )}

          <Card style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Data Encryption</Text>
                <Text style={styles.settingDescription}>
                  Encrypt local data (requires stronger encryption in production)
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  securitySettings.encryptionEnabled && [styles.toggleActive, { backgroundColor: themeColors.primary }],
                ]}
                onPress={handleToggleEncryption}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    securitySettings.encryptionEnabled && styles.toggleThumbActive,
                  ]}
                />
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      )}

      <View style={styles.statsSection}>
        <Text style={styles.statsTitle}>Your data</Text>
        <Text style={styles.statsText}>{groups.length} groups</Text>
        <Text style={styles.statsText}>{expenses.length} expenses</Text>
        <Text style={styles.statsText}>{settlements.length} settlements</Text>
      </View>

      {user && (
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutButtonText}>Sign out</Text>
        </TouchableOpacity>
      )}

      {/* Restore Backup Modal */}
      <Modal
        visible={showRestoreModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRestoreModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Restore Backup</Text>
            <Text style={styles.modalSubtitle}>Paste your backup data below:</Text>
            
            <TextInput
              style={styles.restoreInput}
              value={restoreText}
              onChangeText={setRestoreText}
              placeholder="Paste backup JSON here..."
              placeholderTextColor={themeColors.textSecondary}
              multiline
              textAlignVertical="top"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowRestoreModal(false);
                  setRestoreText('');
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmRestore}
                disabled={isProcessing || !restoreText.trim()}
              >
                <Text style={styles.modalButtonTextConfirm}>
                  {isProcessing ? 'Restoring...' : 'Restore'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: typeof import('../theme/colors').lightColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 32,
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
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: recommendedSpacing.extraLoose,
  },
  section: {
    marginBottom: recommendedSpacing.extraLoose,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: recommendedSpacing.default,
  },
  sectionText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: recommendedSpacing.loose,
  },
  userEmail: {
    ...typography.body,
    color: colors.primary,
    marginBottom: recommendedSpacing.tight,
  },
  syncInfo: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.white,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  statsSection: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  statsTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: recommendedSpacing.comfortable,
  },
  statsText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: recommendedSpacing.tight,
  },
  signOutButton: {
    marginTop: recommendedSpacing.loose,
    paddingVertical: recommendedSpacing.comfortable,
    alignItems: 'center',
  },
  signOutButtonText: {
    ...typography.body,
    color: colors.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: recommendedSpacing.default,
  },
  modalSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: recommendedSpacing.loose,
  },
  restoreInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 12,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 200,
    maxHeight: 300,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  modalButtonConfirm: {
    backgroundColor: colors.primary,
  },
  modalButtonTextCancel: {
    ...typography.button,
    color: colors.textPrimary,
  },
  modalButtonTextConfirm: {
    ...typography.button,
    color: colors.white,
  },
  privacyCard: {
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  privacyTitle: {
    ...typography.h4,
    marginBottom: 8,
  },
  privacyText: {
    ...typography.body,
    lineHeight: 20,
  },
  settingCard: {
    marginBottom: 12,
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
});

export default BackupRestoreScreen;

