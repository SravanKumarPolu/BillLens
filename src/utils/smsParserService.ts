/**
 * SMS Parser Service
 * 
 * Parses SMS messages to detect bills and expenses
 * India-first: Detects electricity, water, internet, phone bills from SMS
 */

import { parseSMSBill } from './indiaFirstService';

export interface ParsedSMSBill {
  type: 'electricity' | 'water' | 'internet' | 'phone' | 'other' | null;
  amount?: number;
  dueDate?: string;
  accountNumber?: string;
  merchant?: string;
  smsText: string;
  confidence: number;
}

/**
 * Parse SMS for bill information
 * 
 * @param smsText - The SMS message text
 * @returns Parsed bill information
 */
export const parseSMS = (smsText: string): ParsedSMSBill => {
  if (!smsText || smsText.trim().length < 10) {
    return {
      type: null,
      smsText,
      confidence: 0,
    };
  }

  const parsed = parseSMSBill(smsText);

  // Calculate confidence based on what was found
  let confidence = 0;
  if (parsed.type) confidence += 0.5;
  if (parsed.amount) confidence += 0.3;
  if (parsed.dueDate || parsed.accountNumber) confidence += 0.2;

  return {
    ...parsed,
    smsText,
    confidence: Math.min(confidence, 1.0),
  };
};

/**
 * Check if SMS is a bill notification
 */
export const isBillSMS = (smsText: string): boolean => {
  if (!smsText) return false;

  const normalized = smsText.toLowerCase();
  
  const billIndicators = [
    'bill',
    'due',
    'payment',
    'electricity',
    'water',
    'internet',
    'broadband',
    'phone',
    'airtel',
    'jio',
    'vodafone',
    'bses',
    'tata power',
    'reliance',
  ];

  return billIndicators.some(indicator => normalized.includes(indicator));
};
