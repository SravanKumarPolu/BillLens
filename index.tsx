import React, { useState, useEffect } from 'react';
import { AppRegistry, View, ActivityIndicator, StyleSheet, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { AppNavigator } from './src/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { GroupsProvider, useGroups } from './src/context/GroupsContext';
import { AuthProvider } from './src/context/AuthContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { colors } from './src/theme/colors';
import { shouldLockApp } from './src/utils/securityService';
import { handleNewSMS, isSMSAutoFetchEnabled } from './src/utils/smsReaderService';

const AppContent = () => {
  const { isInitialized } = useGroups();
  const [isLocked, setIsLocked] = useState<boolean | null>(null);

  useEffect(() => {
    checkLockStatus();
    const cleanupSMS = setupSMSListener();
    return cleanupSMS;
  }, []);

  const checkLockStatus = async () => {
    const locked = await shouldLockApp();
    setIsLocked(locked);
  };

  const setupSMSListener = () => {
    if (Platform.OS !== 'android') {
      return () => {}; // Return empty cleanup function
    }

    // Listen for incoming SMS events from native module
    const eventEmitter = new NativeEventEmitter();
    const subscription = eventEmitter.addListener('SMSReceived', async (data: {
      address: string;
      body: string;
      timestamp: number;
      id: string;
    }) => {
      try {
        // Check if auto-fetch is enabled
        const enabled = await isSMSAutoFetchEnabled();
        if (!enabled) {
          return; // Auto-fetch is disabled, ignore SMS
        }

        // Process the SMS
        const processed = await handleNewSMS({
          id: data.id,
          address: data.address,
          body: data.body,
          date: data.timestamp,
          read: false,
        });

        if (processed) {
          // SMS was detected as a bill and processed
          // You could show a notification here
          console.log('Bill detected from SMS:', processed.parsedBill);
        }
      } catch (error) {
        console.error('Error processing incoming SMS:', error);
      }
    });

    return () => {
      subscription.remove();
    };
  };

  if (!isInitialized || isLocked === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <AppNavigator initialRouteName={isLocked ? 'AppLock' : undefined} />;
};

const App = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <GroupsProvider>
            <AppContent />
          </GroupsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
  },
});

AppRegistry.registerComponent('BillLens', () => App);
