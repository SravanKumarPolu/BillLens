/**
 * UPI Service for handling UPI deep links and payments
 * Supports GPay, PhonePe, Paytm, and generic UPI
 */

import { Linking, Platform, Alert } from 'react-native';

export type UPIPaymentApp = 'gpay' | 'phonepe' | 'paytm' | 'upi';

export interface UPIPaymentParams {
  payeeVpa?: string; // Virtual Payment Address (e.g., user@paytm)
  payeeName?: string;
  amount: number;
  transactionNote?: string;
  merchantId?: string;
}

/**
 * Generate UPI payment URL
 */
export const generateUPIUrl = (params: UPIPaymentParams): string => {
  const { payeeVpa, payeeName, amount, transactionNote, merchantId } = params;
  
  // Build UPI URL
  const upiParams = new URLSearchParams();
  
  if (payeeVpa) {
    upiParams.append('pa', payeeVpa);
  }
  if (payeeName) {
    upiParams.append('pn', payeeName);
  }
  upiParams.append('am', amount.toFixed(2));
  upiParams.append('cu', 'INR');
  if (transactionNote) {
    upiParams.append('tn', transactionNote);
  }
  if (merchantId) {
    upiParams.append('mc', merchantId);
  }
  
  return `upi://pay?${upiParams.toString()}`;
};

/**
 * Generate app-specific deep links
 */
export const generateAppDeepLink = (
  app: UPIPaymentApp,
  params: UPIPaymentParams
): string | null => {
  const { payeeVpa, payeeName, amount, transactionNote } = params;
  
  switch (app) {
    case 'gpay':
      // Google Pay deep link format
      if (payeeVpa) {
        return `tez://upi/pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName || '')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(transactionNote || 'Payment')}`;
      }
      return null;
      
    case 'phonepe':
      // PhonePe deep link format
      if (payeeVpa) {
        return `phonepe://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName || '')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(transactionNote || 'Payment')}`;
      }
      return null;
      
    case 'paytm':
      // Paytm deep link format
      if (payeeVpa) {
        return `paytmmp://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName || '')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(transactionNote || 'Payment')}`;
      }
      return null;
      
    case 'upi':
    default:
      // Generic UPI link
      return generateUPIUrl(params);
  }
};

/**
 * Check if a UPI app is installed
 */
export const checkAppInstalled = async (app: UPIPaymentApp): Promise<boolean> => {
  const appSchemes: Record<UPIPaymentApp, string> = {
    gpay: 'tez://',
    phonepe: 'phonepe://',
    paytm: 'paytmmp://',
    upi: 'upi://',
  };
  
  const scheme = appSchemes[app];
  if (!scheme) return false;
  
  try {
    const canOpen = await Linking.canOpenURL(scheme);
    return canOpen;
  } catch {
    return false;
  }
};

/**
 * Open UPI payment app
 */
export const openUPIApp = async (
  app: UPIPaymentApp,
  params: UPIPaymentParams
): Promise<boolean> => {
  try {
    const deepLink = generateAppDeepLink(app, params);
    if (!deepLink) {
      Alert.alert('Error', 'Invalid payment parameters');
      return false;
    }
    
    const canOpen = await Linking.canOpenURL(deepLink);
    if (canOpen) {
      await Linking.openURL(deepLink);
      return true;
    } else {
      // Fallback to generic UPI
      const upiUrl = generateUPIUrl(params);
      const canOpenUPI = await Linking.canOpenURL(upiUrl);
      if (canOpenUPI) {
        await Linking.openURL(upiUrl);
        return true;
      } else {
        Alert.alert(
          'UPI App Not Found',
          'Please install a UPI app (GPay, PhonePe, Paytm) to make payments.'
        );
        return false;
      }
    }
  } catch (error) {
    console.error('Error opening UPI app:', error);
    Alert.alert('Error', 'Failed to open payment app');
    return false;
  }
};

/**
 * Get list of available UPI apps
 */
export const getAvailableUPIApps = async (): Promise<UPIPaymentApp[]> => {
  const apps: UPIPaymentApp[] = ['gpay', 'phonepe', 'paytm', 'upi'];
  const available: UPIPaymentApp[] = [];
  
  for (const app of apps) {
    const installed = await checkAppInstalled(app);
    if (installed) {
      available.push(app);
    }
  }
  
  // Always include generic UPI as fallback
  if (!available.includes('upi')) {
    available.push('upi');
  }
  
  return available;
};

/**
 * Get display name for UPI app
 */
export const getAppDisplayName = (app: UPIPaymentApp): string => {
  const names: Record<UPIPaymentApp, string> = {
    gpay: 'Google Pay',
    phonepe: 'PhonePe',
    paytm: 'Paytm',
    upi: 'UPI',
  };
  return names[app] || 'UPI';
};

