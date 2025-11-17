import React from 'react';
import { AppRegistry } from 'react-native';
import { AppNavigator } from './src/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';

const App = () => {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
};

AppRegistry.registerComponent('BillLens', () => App);
