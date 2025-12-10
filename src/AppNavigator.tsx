import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './navigation/types';
import OnboardingWelcome from './screens/OnboardingWelcome';
import PermissionsScreen from './screens/PermissionsScreen';
import DefaultGroupSetup from './screens/DefaultGroupSetup';
import HomeScreen from './screens/HomeScreen';
import LoginScreen from './screens/LoginScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import CaptureOptionsScreen from './screens/CaptureOptionsScreen';
import OcrProcessingScreen from './screens/OcrProcessingScreen';
import ReviewBillScreen from './screens/ReviewBillScreen';
import ConfigureSplitScreen from './screens/ConfigureSplitScreen';
import AddExpenseScreen from './screens/AddExpenseScreen';
import GroupDetailScreen from './screens/GroupDetailScreen';
import SettleUpScreen from './screens/SettleUpScreen';
import TemplatesScreen from './screens/TemplatesScreen';
import LedgerScreen from './screens/LedgerScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import LensViewScreen from './screens/LensViewScreen';
import BackupRestoreScreen from './screens/BackupRestoreScreen';
import { colors } from './theme/colors';
import { useGroups } from './context/GroupsContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  const { isInitialized } = useGroups();

  // Show loading screen while initializing
  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surfaceLight },
        }}
      >
        <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcome} />
        <Stack.Screen name="Permissions" component={PermissionsScreen} />
        <Stack.Screen name="DefaultGroupSetup" component={DefaultGroupSetup} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
        <Stack.Screen name="CaptureOptions" component={CaptureOptionsScreen} />
        <Stack.Screen name="OcrProcessing" component={OcrProcessingScreen} />
        <Stack.Screen name="ReviewBill" component={ReviewBillScreen} />
        <Stack.Screen name="ConfigureSplit" component={ConfigureSplitScreen} />
        <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
        <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
        <Stack.Screen name="SettleUp" component={SettleUpScreen} />
        <Stack.Screen name="Templates" component={TemplatesScreen} />
        <Stack.Screen name="Ledger" component={LedgerScreen} />
        <Stack.Screen name="Analytics" component={AnalyticsScreen} />
        <Stack.Screen name="LensView" component={LensViewScreen} />
        <Stack.Screen name="BackupRestore" component={BackupRestoreScreen} />
      </Stack.Navigator>
    </NavigationContainer>
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
