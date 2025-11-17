import React from 'react';
import { AppRegistry } from 'react-native';
import { AppNavigator } from './src/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { GroupsProvider } from './src/context/GroupsContext';
import { AuthProvider } from './src/context/AuthContext';

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GroupsProvider>
          <AppNavigator />
        </GroupsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

AppRegistry.registerComponent('BillLens', () => App);
