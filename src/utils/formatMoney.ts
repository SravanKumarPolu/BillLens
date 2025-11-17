/**
 * Format money amounts for display
 * Handles Indian Rupee (₹) formatting
 */

export const formatMoney = (amount: number, showPositive = false): string => {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : showPositive ? '+' : '';
  
  // Format with Indian number system (lakhs, crores)
  // For now, simple formatting with commas
  const formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${sign}₹${formatted}`;
};

/**
 * Parse money string to number
 * Handles ₹, commas, and various formats
 */
export const parseMoney = (value: string): number => {
  // Remove ₹, commas, spaces
  const cleaned = value.replace(/[₹,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

