/**
 * Notification Service
 * 
 * Handles smart notifications and reminders:
 * - Remind to settle
 * - Remind to add rent/recurring expenses
 * - Notify when expense added
 * - Notify when imbalance is high
 */

import { Group, GroupBalance, Expense } from '../types/models';
import { formatMoney } from './formatMoney';

export interface Notification {
  id: string;
  type: 'settle_reminder' | 'rent_reminder' | 'expense_added' | 'imbalance_alert' | 'month_end' | 'upi_reminder';
  title: string;
  message: string;
  groupId: string;
  severity: 'high' | 'medium' | 'low';
  actionable: boolean;
  actionData?: any;
  createdAt: string;
}

export interface NotificationSettings {
  settleReminders: boolean;
  rentReminders: boolean;
  expenseNotifications: boolean;
  imbalanceAlerts: boolean;
  monthEndReports: boolean;
  upiReminders: boolean;
  reminderFrequency: 'daily' | 'weekly' | 'never';
}

const DEFAULT_SETTINGS: NotificationSettings = {
  settleReminders: true,
  rentReminders: true,
  expenseNotifications: true,
  imbalanceAlerts: true,
  monthEndReports: true,
  upiReminders: true,
  reminderFrequency: 'weekly',
};

/**
 * Check if settlement reminder is needed
 */
export const checkSettlementReminder = (
  groupId: string,
  balances: GroupBalance[],
  lastSettlementDate?: string
): Notification | null => {
  const userBalance = balances.find(b => b.memberId === 'you');
  if (!userBalance) return null;

  const balanceAmount = Math.abs(userBalance.balance);
  
  // Remind if balance is significant (> ₹100)
  if (balanceAmount < 100) return null;

  // Check if it's been a while since last settlement
  const shouldRemind = !lastSettlementDate || 
    (Date.now() - new Date(lastSettlementDate).getTime()) > 7 * 24 * 60 * 60 * 1000; // 7 days

  if (!shouldRemind) return null;

  const isOwed = userBalance.balance > 0;
  const message = isOwed
    ? `You are owed ${formatMoney(balanceAmount)}. Time to settle up?`
    : `You owe ${formatMoney(balanceAmount)}. Don't forget to settle!`;

  return {
    id: `settle-${groupId}-${Date.now()}`,
    type: 'settle_reminder',
    title: 'Settlement Reminder',
    message,
    groupId,
    severity: balanceAmount > 1000 ? 'high' : 'medium',
    actionable: true,
    actionData: { action: 'navigate', screen: 'SettleUp', params: { groupId } },
    createdAt: new Date().toISOString(),
  };
};

/**
 * Check if rent reminder is needed
 */
export const checkRentReminder = (
  groupId: string,
  expenses: Expense[],
  currentDate: Date = new Date()
): Notification | null => {
  // Check if rent was added this month
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  const thisMonthRent = expenses.some(expense => {
    const expenseDate = new Date(expense.date);
    return (
      expense.category === 'Rent' &&
      expenseDate.getMonth() === currentMonth &&
      expenseDate.getFullYear() === currentYear
    );
  });

  // Remind on 1st of month if rent not added
  const isFirstOfMonth = currentDate.getDate() <= 3; // Remind on 1st, 2nd, or 3rd

  if (thisMonthRent || !isFirstOfMonth) return null;

  return {
    id: `rent-${groupId}-${Date.now()}`,
    type: 'rent_reminder',
    title: 'Rent Reminder',
    message: "It's the start of a new month. Don't forget to add this month's rent!",
    groupId,
    severity: 'medium',
    actionable: true,
    actionData: { action: 'navigate', screen: 'AddExpense', params: { groupId, category: 'Rent' } },
    createdAt: new Date().toISOString(),
  };
};

/**
 * Generate notification when expense is added
 */
export const generateExpenseAddedNotification = (
  groupId: string,
  expense: Expense,
  groupName: string
): Notification => {
  const payerName = expense.paidBy === 'you' ? 'You' : expense.paidBy;
  
  return {
    id: `expense-${expense.id}`,
    type: 'expense_added',
    title: 'New Expense Added',
    message: `${payerName} added ${formatMoney(expense.amount, false, expense.currency || 'INR')} for ${expense.merchant || expense.title} in ${groupName}`,
    groupId,
    severity: 'low',
    actionable: true,
    actionData: { action: 'navigate', screen: 'GroupDetail', params: { groupId } },
    createdAt: new Date().toISOString(),
  };
};

/**
 * Check if imbalance alert is needed
 */
export const checkImbalanceAlert = (
  groupId: string,
  balances: GroupBalance[],
  expenses: Expense[]
): Notification | null => {
  if (expenses.length < 5) return null; // Need at least 5 expenses

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const memberCount = balances.length;
  const expectedPerPerson = totalExpenses / memberCount;

  // Check for high imbalance
  const imbalances = balances
    .map(balance => {
      const memberExpenses = expenses.filter(e => {
        if (e.payers && e.payers.length > 0) {
          return e.payers.some(p => p.memberId === balance.memberId);
        }
        return e.paidBy === balance.memberId;
      });
      
      const totalPaid = memberExpenses.reduce((sum, e) => {
        if (e.payers && e.payers.length > 0) {
          const payer = e.payers.find(p => p.memberId === balance.memberId);
          return sum + (payer?.amount || 0);
        }
        return sum + e.amount;
      }, 0);

      return {
        memberId: balance.memberId,
        deviation: Math.abs(totalPaid - expectedPerPerson),
        percentage: expectedPerPerson > 0 ? (Math.abs(totalPaid - expectedPerPerson) / expectedPerPerson) * 100 : 0,
      };
    })
    .filter(i => i.percentage > 30); // More than 30% deviation

  if (imbalances.length === 0) return null;

  const maxImbalance = imbalances.reduce((max, i) => 
    i.percentage > max.percentage ? i : max
  );

  if (maxImbalance.percentage < 40) return null; // Only alert for >40% imbalance

  return {
    id: `imbalance-${groupId}-${Date.now()}`,
    type: 'imbalance_alert',
    title: 'Spending Imbalance Detected',
    message: `Someone is paying ${maxImbalance.percentage.toFixed(0)}% more than their fair share. Consider redistributing expenses.`,
    groupId,
    severity: maxImbalance.percentage > 60 ? 'high' : 'medium',
    actionable: true,
    actionData: { action: 'navigate', screen: 'GroupDetail', params: { groupId } },
    createdAt: new Date().toISOString(),
  };
};

/**
 * Generate month-end report notification
 */
export const generateMonthEndNotification = (
  groupId: string,
  groupName: string,
  totalSpent: number,
  currency: string = 'INR'
): Notification => {
  return {
    id: `month-end-${groupId}-${Date.now()}`,
    type: 'month_end',
    title: 'Monthly Report Ready',
    message: `Your ${groupName} monthly report is ready. Total spent: ${formatMoney(totalSpent, false, currency)}`,
    groupId,
    severity: 'low',
    actionable: true,
    actionData: { action: 'navigate', screen: 'Analytics', params: { groupId } },
    createdAt: new Date().toISOString(),
  };
};

/**
 * Generate UPI payment reminder
 * India-first: Reminds users to settle via UPI
 */
export const generateUPIReminder = (
  groupId: string,
  amount: number,
  toMemberName: string,
  currency: string = 'INR'
): Notification => {
  return {
    id: `upi-reminder-${groupId}-${Date.now()}`,
    type: 'upi_reminder',
    title: 'UPI Payment Reminder',
    message: `Reminder: Pay ${toMemberName} ${formatMoney(amount, false, currency)} via UPI`,
    groupId,
    severity: 'medium',
    actionable: true,
    actionData: { action: 'navigate', screen: 'SettleUp', params: { groupId } },
    createdAt: new Date().toISOString(),
  };
};

/**
 * Check if UPI reminder is needed
 * India-first: Reminds users to settle via UPI when balance is high
 */
export const checkUPIReminder = (
  groupId: string,
  balances: GroupBalance[],
  currency: string = 'INR'
): Notification | null => {
  // Find highest balance owed to user
  const highestOwed = balances
    .filter(b => b.balance > 0)
    .sort((a, b) => b.balance - a.balance)[0];

  if (!highestOwed || highestOwed.balance < 100) {
    // Only remind for amounts >= ₹100
    return null;
  }

  // Check if last reminder was more than 3 days ago (would need to track this)
  // For now, always return reminder if condition met
  return generateUPIReminder(
    groupId,
    highestOwed.balance,
    'member', // Would need member name lookup
    currency
  );
};

/**
 * Get all pending notifications for a group
 */
export const getPendingNotifications = (
  groupId: string,
  group: Group,
  expenses: Expense[],
  balances: GroupBalance[],
  lastSettlementDate?: string,
  settings: NotificationSettings = DEFAULT_SETTINGS
): Notification[] => {
  const notifications: Notification[] = [];

  if (settings.settleReminders) {
    const settleReminder = checkSettlementReminder(groupId, balances, lastSettlementDate);
    if (settleReminder) notifications.push(settleReminder);
  }

  if (settings.rentReminders) {
    const rentReminder = checkRentReminder(groupId, expenses);
    if (rentReminder) notifications.push(rentReminder);
  }

  if (settings.imbalanceAlerts) {
    const imbalanceAlert = checkImbalanceAlert(groupId, balances, expenses);
    if (imbalanceAlert) notifications.push(imbalanceAlert);
  }

  if (settings.upiReminders) {
    const upiReminder = checkUPIReminder(groupId, balances, group.currency || 'INR');
    if (upiReminder) notifications.push(upiReminder);
  }

  return notifications.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
};
