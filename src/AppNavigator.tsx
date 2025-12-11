import React from 'react';
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
import MonthlyReportScreen from './screens/MonthlyReportScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ItemizedSplitScreen from './screens/ItemizedSplitScreen';
import RentSplitScreen from './screens/RentSplitScreen';
import ReceiptGalleryScreen from './screens/ReceiptGalleryScreen';
import AchievementsScreen from './screens/AchievementsScreen';
import BackupRestoreScreen from './screens/BackupRestoreScreen';
import { colors } from './theme/colors';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="OnboardingWelcome"
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
        <Stack.Screen name="MonthlyReport" component={MonthlyReportScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="ItemizedSplit" component={ItemizedSplitScreen} />
        <Stack.Screen name="RentSplit" component={RentSplitScreen} />
        <Stack.Screen name="ReceiptGallery" component={ReceiptGalleryScreen} />
        <Stack.Screen name="Achievements" component={AchievementsScreen} />
        <Stack.Screen name="BackupRestore" component={BackupRestoreScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
