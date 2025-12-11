/**
 * Format money amounts for display
 * Supports multi-currency formatting
 */

import { formatCurrency, parseCurrency, DEFAULT_CURRENCY } from './currencyService';

export const formatMoney = (
  amount: number,
  showPositive = false,
  currencyCode: string = DEFAULT_CURRENCY
): string => {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : showPositive ? '+' : '';
  
  const formatted = formatCurrency(absAmount, currencyCode);
  return sign ? `${sign}${formatted}` : formatted;
};

/**
 * Parse money string to number
 * Handles currency symbols, commas, and various formats
 */
export const parseMoney = (value: string, currencyCode: string = DEFAULT_CURRENCY): number => {
  return parseCurrency(value, currencyCode);
};

