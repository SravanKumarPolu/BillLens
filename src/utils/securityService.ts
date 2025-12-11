/**
 * Security Service
 * 
 * Handles app security and privacy:
 * - Local data encryption
 * - Biometric authentication
 * - App lock
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Note: For production, use react-native-keychain for secure storage
// and react-native-biometrics for biometric authentication

const SECURITY_KEYS = {
  ENCRYPTION_KEY: '@billlens:encryption_key',
  LOCK_ENABLED: '@billlens:lock_enabled',
  LAST_UNLOCK: '@billlens:last_unlock',
  BIOMETRIC_ENABLED: '@billlens:biometric_enabled',
};

export interface SecuritySettings {
  lockEnabled: boolean;
  biometricEnabled: boolean;
  lockTimeout: number; // minutes
  encryptionEnabled: boolean;
}

const DEFAULT_SETTINGS: SecuritySettings = {
  lockEnabled: false,
  biometricEnabled: false,
  lockTimeout: 5, // 5 minutes
  encryptionEnabled: false,
};

/**
 * Base64 encoding/decoding for React Native
 * Pure JavaScript implementation compatible with React Native
 */
const base64Encode = (str: string): string => {
  // Use btoa if available (web), otherwise use pure JS implementation
  if (typeof btoa !== 'undefined') {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      // Fall through to pure JS implementation
    }
  }
  
  // Pure JavaScript base64 implementation for React Native
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let i = 0; i < str.length; i += 3) {
    const a = str.charCodeAt(i);
    const b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
    const c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    output += chars.charAt((bitmap >> 18) & 63);
    output += chars.charAt((bitmap >> 12) & 63);
    output += i + 1 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
    output += i + 2 < str.length ? chars.charAt(bitmap & 63) : '=';
  }
  return output;
};

const base64Decode = (str: string): string => {
  // Use atob if available (web), otherwise use pure JS implementation
  if (typeof atob !== 'undefined') {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      // Fall through to pure JS implementation
    }
  }
  
  // Pure JavaScript base64 decode implementation for React Native
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  str = str.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  for (let i = 0; i < str.length; i += 4) {
    const enc1 = chars.indexOf(str.charAt(i));
    const enc2 = chars.indexOf(str.charAt(i + 1));
    const enc3 = chars.indexOf(str.charAt(i + 2));
    const enc4 = chars.indexOf(str.charAt(i + 3));
    const bitmap = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
    if (enc3 !== 64) output += String.fromCharCode((bitmap >> 16) & 255);
    if (enc4 !== 64) output += String.fromCharCode((bitmap >> 8) & 255);
  }
  return output;
};

/**
 * Simple encryption/decryption (XOR cipher for demo)
 * In production, use react-native-crypto-js or similar
 */
const simpleEncrypt = (text: string, key: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return base64Encode(result); // Base64 encode
};

const simpleDecrypt = (encrypted: string, key: string): string => {
  try {
    const text = base64Decode(encrypted); // Base64 decode
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch (e) {
    return '';
  }
};

/**
 * Get or generate encryption key
 */
const getEncryptionKey = async (): Promise<string> => {
  let key = await AsyncStorage.getItem(SECURITY_KEYS.ENCRYPTION_KEY);
  if (!key) {
    // Generate a simple key (in production, use secure key generation)
    key = `${Date.now()}-${Math.random().toString(36)}-${Platform.OS}`;
    await AsyncStorage.setItem(SECURITY_KEYS.ENCRYPTION_KEY, key);
  }
  return key;
};

/**
 * Encrypt data before storage
 */
export const encryptData = async (data: string): Promise<string> => {
  const settings = await getSecuritySettings();
  if (!settings.encryptionEnabled) {
    return data; // Return as-is if encryption disabled
  }

  const key = await getEncryptionKey();
  return simpleEncrypt(data, key);
};

/**
 * Decrypt data after retrieval
 */
export const decryptData = async (encryptedData: string): Promise<string> => {
  const settings = await getSecuritySettings();
  if (!settings.encryptionEnabled) {
    return encryptedData; // Return as-is if encryption disabled
  }

  const key = await getEncryptionKey();
  return simpleDecrypt(encryptedData, key);
};

/**
 * Get security settings
 */
export const getSecuritySettings = async (): Promise<SecuritySettings> => {
  try {
    const stored = await AsyncStorage.getItem('@billlens:security_settings');
    if (stored) {
      return JSON.parse(stored);
    }
    return DEFAULT_SETTINGS;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
};

/**
 * Update security settings
 */
export const updateSecuritySettings = async (settings: Partial<SecuritySettings>): Promise<void> => {
  const current = await getSecuritySettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem('@billlens:security_settings', JSON.stringify(updated));
};

/**
 * Check if app should be locked
 */
export const shouldLockApp = async (): Promise<boolean> => {
  const settings = await getSecuritySettings();
  if (!settings.lockEnabled) return false;

  const lastUnlock = await AsyncStorage.getItem(SECURITY_KEYS.LAST_UNLOCK);
  if (!lastUnlock) return true; // Never unlocked, should lock

  const lastUnlockTime = parseInt(lastUnlock, 10);
  const now = Date.now();
  const timeoutMs = settings.lockTimeout * 60 * 1000; // Convert minutes to ms

  return (now - lastUnlockTime) > timeoutMs;
};

/**
 * Record successful unlock
 */
export const recordUnlock = async (): Promise<void> => {
  await AsyncStorage.setItem(SECURITY_KEYS.LAST_UNLOCK, Date.now().toString());
};

/**
 * Check if biometric authentication is available
 * In production, use react-native-biometrics
 */
export const isBiometricAvailable = async (): Promise<boolean> => {
  // Mock implementation
  // In production: const { available } = await ReactNativeBiometrics.isSensorAvailable();
  return Platform.OS === 'ios' || Platform.OS === 'android';
};

/**
 * Authenticate with biometrics
 * In production, use react-native-biometrics
 */
export const authenticateWithBiometrics = async (): Promise<boolean> => {
  const settings = await getSecuritySettings();
  if (!settings.biometricEnabled) {
    return false;
  }

  // Mock implementation
  // In production:
  // const { success } = await ReactNativeBiometrics.simplePrompt({
  //   promptMessage: 'Authenticate to unlock BillLens',
  // });
  // return success;

  // For now, return true (mock)
  return true;
};

/**
 * Lock the app
 */
export const lockApp = async (): Promise<void> => {
  await AsyncStorage.removeItem(SECURITY_KEYS.LAST_UNLOCK);
};

/**
 * Check if app is currently locked
 */
export const isAppLocked = async (): Promise<boolean> => {
  const lastUnlock = await AsyncStorage.getItem(SECURITY_KEYS.LAST_UNLOCK);
  return !lastUnlock;
};
