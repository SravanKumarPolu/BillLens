/**
 * SMS Reader Service
 * 
 * Reads SMS messages from device for auto-fetching bills
 * Privacy-first: Only reads SMS when user explicitly enables this feature
 * Only processes SMS that match bill patterns (Swiggy, Zomato, etc.)
 */

import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { parseSMS, isBillSMS, ParsedSMSBill } from './smsParserService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SMS_AUTO_FETCH_ENABLED_KEY = 'sms_auto_fetch_enabled';
const SMS_LAST_PROCESSED_KEY = 'sms_last_processed_timestamp';
const SMS_PROCESSED_IDS_KEY = 'sms_processed_ids';

export interface SMSMessage {
  id: string;
  address: string; // Sender phone number
  body: string; // SMS text
  date: number; // Timestamp
  read: boolean;
}

export interface ProcessedSMSBill {
  smsId: string;
  parsedBill: ParsedSMSBill;
  timestamp: number;
  expenseCreated?: boolean;
  expenseId?: string;
}

/**
 * Check if SMS auto-fetch is enabled
 */
export const isSMSAutoFetchEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(SMS_AUTO_FETCH_ENABLED_KEY);
    return value === 'true';
  } catch {
    return false;
  }
};

/**
 * Enable/disable SMS auto-fetch
 */
export const setSMSAutoFetchEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(SMS_AUTO_FETCH_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch (error) {
    console.error('Error saving SMS auto-fetch setting:', error);
  }
};

/**
 * Request SMS permissions on Android
 */
export const requestSMSPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false; // iOS doesn't support SMS reading
  }

  try {
    // Android 6.0+ requires runtime permissions
    const permissions = [
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    ];

    // Android 13+ needs READ_PHONE_STATE for some SMS operations
    if (Platform.Version >= 33) {
      permissions.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
    }

    const results = await PermissionsAndroid.requestMultiple(permissions);

    // Check if all permissions were granted
    const allGranted = Object.values(results).every(
      result => result === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      Alert.alert(
        'Permission Required',
        'SMS auto-fetch requires SMS reading permission. Please enable it in app settings.',
        [{ text: 'OK' }]
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error requesting SMS permissions:', error);
    return false;
  }
};

/**
 * Check if SMS permissions are granted
 */
export const checkSMSPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    const hasReceiveSMS = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS
    );
    const hasReadSMS = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS
    );

    return hasReceiveSMS && hasReadSMS;
  } catch {
    return false;
  }
};

/**
 * Read recent SMS messages from device
 * Uses native SMSReader module
 */
export const readRecentSMS = async (
  limit: number = 50,
  maxAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): Promise<SMSMessage[]> => {
  if (Platform.OS !== 'android') {
    return [];
  }

  const hasPermission = await checkSMSPermissions();
  if (!hasPermission) {
    return [];
  }

  try {
    const { NativeModules } = require('react-native');
    const { SMSReader } = NativeModules;

    if (!SMSReader) {
      console.warn('SMSReader native module not found');
      return [];
    }

    const smsArray = await SMSReader.readSMS(limit, maxAge);
    
    // Convert native format to our format
    return smsArray.map((sms: any) => ({
      id: sms.id || String(sms.date),
      address: sms.address || '',
      body: sms.body || '',
      date: sms.date || Date.now(),
      read: sms.read || false,
    }));
  } catch (error) {
    console.error('Error reading SMS:', error);
    return [];
  }
};

/**
 * Get processed SMS IDs to avoid duplicates
 */
const getProcessedSMSIds = async (): Promise<Set<string>> => {
  try {
    const idsJson = await AsyncStorage.getItem(SMS_PROCESSED_IDS_KEY);
    if (idsJson) {
      const ids = JSON.parse(idsJson) as string[];
      return new Set(ids);
    }
    return new Set();
  } catch {
    return new Set();
  }
};

/**
 * Save processed SMS ID
 */
const saveProcessedSMSId = async (smsId: string): Promise<void> => {
  try {
    const processedIds = await getProcessedSMSIds();
    processedIds.add(smsId);
    
    // Keep only last 1000 IDs to avoid storage bloat
    const idsArray = Array.from(processedIds);
    const recentIds = idsArray.slice(-1000);
    
    await AsyncStorage.setItem(SMS_PROCESSED_IDS_KEY, JSON.stringify(recentIds));
  } catch (error) {
    console.error('Error saving processed SMS ID:', error);
  }
};

/**
 * Process SMS messages and extract bills
 */
export const processSMSForBills = async (
  smsMessages: SMSMessage[]
): Promise<ProcessedSMSBill[]> => {
  const processedIds = await getProcessedSMSIds();
  const processedBills: ProcessedSMSBill[] = [];

  for (const sms of smsMessages) {
    // Skip if already processed
    if (processedIds.has(sms.id)) {
      continue;
    }

    // Check if SMS is a bill
    if (!isBillSMS(sms.body)) {
      continue;
    }

    // Parse the SMS
    const parsedBill = parseSMS(sms.body);

    // Only process if confidence is high enough
    if (parsedBill.confidence >= 0.5 && parsedBill.amount) {
      processedBills.push({
        smsId: sms.id,
        parsedBill,
        timestamp: sms.date,
      });

      // Mark as processed
      await saveProcessedSMSId(sms.id);
    }
  }

  return processedBills;
};

/**
 * Monitor new SMS messages (called when SMS is received)
 * This would be triggered by a native SMS broadcast receiver
 */
export const handleNewSMS = async (sms: SMSMessage): Promise<ProcessedSMSBill | null> => {
  // Check if auto-fetch is enabled
  const isEnabled = await isSMSAutoFetchEnabled();
  if (!isEnabled) {
    return null;
  }

  // Check if it's a bill SMS
  if (!isBillSMS(sms.body)) {
    return null;
  }

  // Check if already processed
  const processedIds = await getProcessedSMSIds();
  if (processedIds.has(sms.id)) {
    return null;
  }

  // Parse the SMS
  const parsedBill = parseSMS(sms.body);

  // Only process if confidence is high enough
  if (parsedBill.confidence >= 0.5 && parsedBill.amount) {
    const processed: ProcessedSMSBill = {
      smsId: sms.id,
      parsedBill,
      timestamp: sms.date,
    };

    // Mark as processed
    await saveProcessedSMSId(sms.id);

    return processed;
  }

  return null;
};

/**
 * Get last processed SMS timestamp
 */
export const getLastProcessedTimestamp = async (): Promise<number> => {
  try {
    const timestamp = await AsyncStorage.getItem(SMS_LAST_PROCESSED_KEY);
    return timestamp ? parseInt(timestamp, 10) : 0;
  } catch {
    return 0;
  }
};

/**
 * Update last processed timestamp
 */
export const updateLastProcessedTimestamp = async (timestamp: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(SMS_LAST_PROCESSED_KEY, timestamp.toString());
  } catch (error) {
    console.error('Error updating last processed timestamp:', error);
  }
};

/**
 * Clear processed SMS history (for testing/debugging)
 */
export const clearProcessedSMSHistory = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SMS_PROCESSED_IDS_KEY);
    await AsyncStorage.removeItem(SMS_LAST_PROCESSED_KEY);
  } catch (error) {
    console.error('Error clearing SMS history:', error);
  }
};
