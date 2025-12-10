import React from 'react';
import { AppRegistry, LogBox } from 'react-native';
import { AppNavigator } from './src/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { GroupsProvider } from './src/context/GroupsContext';
import { AuthProvider } from './src/context/AuthContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Require cycle:',
  'Non-serializable values were found in the navigation state',
  'TurboModuleRegistry',
]);

const App = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <GroupsProvider>
            <AppNavigator />
          </GroupsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

AppRegistry.registerComponent('BillLens', () => App);
