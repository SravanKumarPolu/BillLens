import React, { useState, useEffect } from 'react';
import { AppRegistry, View, ActivityIndicator, StyleSheet } from 'react-native';
import { AppNavigator } from './src/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { GroupsProvider, useGroups } from './src/context/GroupsContext';
import { AuthProvider } from './src/context/AuthContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { colors } from './src/theme/colors';
import { shouldLockApp } from './src/utils/securityService';

const AppContent = () => {
  const { isInitialized } = useGroups();
  const [isLocked, setIsLocked] = useState<boolean | null>(null);

  useEffect(() => {
    checkLockStatus();
  }, []);

  const checkLockStatus = async () => {
    const locked = await shouldLockApp();
    setIsLocked(locked);
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
