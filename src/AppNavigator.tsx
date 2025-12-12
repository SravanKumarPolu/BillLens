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
import AppLockScreen from './screens/AppLockScreen';
import SMSSettingsScreen from './screens/SMSSettingsScreen';
import SearchScreen from './screens/SearchScreen';
import CollectionsScreen from './screens/CollectionsScreen';
import CollectionDetailScreen from './screens/CollectionDetailScreen';
import BudgetManagementScreen from './screens/BudgetManagementScreen';
import ActivityFeedScreen from './screens/ActivityFeedScreen';
import RecurringExpensesReportScreen from './screens/RecurringExpensesReportScreen';
import ExpenseDetailScreen from './screens/ExpenseDetailScreen';
import PersonalSpendingScreen from './screens/PersonalSpendingScreen';
import { useTheme } from './theme/ThemeProvider';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
  initialRouteName?: keyof RootStackParamList;
}

export const AppNavigator = ({ initialRouteName }: AppNavigatorProps = {}) => {
  const { colors } = useTheme();
  
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRouteName || "OnboardingWelcome"}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surfaceLight },
          // Smooth screen transitions for 2025 premium feel
          animation: 'slide_from_right',
          animationDuration: 300,
          animationTypeForReplace: 'push',
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
        <Stack.Screen name="AppLock" component={AppLockScreen} />
        <Stack.Screen name="SMSSettings" component={SMSSettingsScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Collections" component={CollectionsScreen} />
        <Stack.Screen name="CollectionDetail" component={CollectionDetailScreen} />
        <Stack.Screen name="BudgetManagement" component={BudgetManagementScreen} />
        <Stack.Screen name="ActivityFeed" component={ActivityFeedScreen} />
        <Stack.Screen name="RecurringExpensesReport" component={RecurringExpensesReportScreen} />
        <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} />
        <Stack.Screen name="PersonalSpending" component={PersonalSpendingScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
