import React from 'react';
import { AppRegistry, View, ActivityIndicator, StyleSheet } from 'react-native';
import { AppNavigator } from './src/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { GroupsProvider, useGroups } from './src/context/GroupsContext';
import { AuthProvider } from './src/context/AuthContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { colors } from './src/theme/colors';

const AppContent = () => {
  const { isInitialized } = useGroups();

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <AppNavigator />;
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
