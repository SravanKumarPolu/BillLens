/**
 * Currency Service for BillLens
 * 
 * Handles multi-currency support, conversion, and formatting
 */

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  decimals?: number; // Number of decimal places (default 2)
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimals: 2 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', decimals: 2 },
];

export const DEFAULT_CURRENCY = 'INR';

/**
 * Get currency info by code
 */
export const getCurrency = (code: string): Currency => {
  return SUPPORTED_CURRENCIES.find(c => c.code === code) || SUPPORTED_CURRENCIES[0];
};

/**
 * Format amount with currency symbol
 */
export const formatCurrency = (amount: number, currencyCode: string = DEFAULT_CURRENCY): string => {
  const currency = getCurrency(currencyCode);
  const decimals = currency.decimals ?? 2;
  const formattedAmount = amount.toFixed(decimals);
  
  // Add thousand separators
  const parts = formattedAmount.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = parts.join('.');
  
  // Position symbol based on currency
  if (currencyCode === 'INR' || currencyCode === 'USD' || currencyCode === 'GBP' || currencyCode === 'AUD' || currencyCode === 'CAD' || currencyCode === 'SGD') {
    return `${currency.symbol}${formatted}`;
  } else {
    return `${formatted} ${currency.symbol}`;
  }
};

/**
 * Parse currency string to number
 */
export const parseCurrency = (value: string, currencyCode: string = DEFAULT_CURRENCY): number => {
  const currency = getCurrency(currencyCode);
  // Remove currency symbol and commas
  const cleaned = value
    .replace(currency.symbol, '')
    .replace(/,/g, '')
    .trim();
  return parseFloat(cleaned) || 0;
};

/**
 * Currency conversion using exchange rates
 * In production, this would fetch from an API like exchangerate-api.com or fixer.io
 */
export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  date: string;
}

// Cache for exchange rates (in production, fetch from API)
let exchangeRateCache: Map<string, ExchangeRate> = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get exchange rate between two currencies
 * For now, returns mock rates. In production, fetch from API.
 */
export const getExchangeRate = async (
  fromCurrency: string,
  toCurrency: string
): Promise<number> => {
  if (fromCurrency === toCurrency) return 1;

  const cacheKey = `${fromCurrency}_${toCurrency}`;
  const cached = exchangeRateCache.get(cacheKey);
  
  if (cached && Date.now() - new Date(cached.date).getTime() < CACHE_DURATION) {
    return cached.rate;
  }

  // Mock exchange rates (in production, fetch from API)
  // Using approximate rates as of 2024
  const mockRates: Record<string, Record<string, number>> = {
    INR: {
      USD: 0.012,
      EUR: 0.011,
      GBP: 0.0095,
      JPY: 1.8,
      AUD: 0.018,
      CAD: 0.016,
      SGD: 0.016,
      AED: 0.044,
      SAR: 0.045,
    },
    USD: {
      INR: 83.0,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 150,
      AUD: 1.52,
      CAD: 1.35,
      SGD: 1.34,
      AED: 3.67,
      SAR: 3.75,
    },
    EUR: {
      INR: 90.0,
      USD: 1.09,
      GBP: 0.86,
      JPY: 163,
      AUD: 1.65,
      CAD: 1.47,
      SGD: 1.46,
      AED: 4.0,
      SAR: 4.08,
    },
  };

  // Try direct rate
  if (mockRates[fromCurrency]?.[toCurrency]) {
    const rate = mockRates[fromCurrency][toCurrency];
    exchangeRateCache.set(cacheKey, {
      from: fromCurrency,
      to: toCurrency,
      rate,
      date: new Date().toISOString(),
    });
    return rate;
  }

  // Try inverse rate
  if (mockRates[toCurrency]?.[fromCurrency]) {
    const rate = 1 / mockRates[toCurrency][fromCurrency];
    exchangeRateCache.set(cacheKey, {
      from: fromCurrency,
      to: toCurrency,
      rate,
      date: new Date().toISOString(),
    });
    return rate;
  }

  // Default: return 1 (no conversion available)
  console.warn(`Exchange rate not available: ${fromCurrency} to ${toCurrency}`);
  return 1;
};

/**
 * Convert amount from one currency to another
 */
export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> => {
  if (fromCurrency === toCurrency) return amount;
  
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return amount * rate;
};

/**
 * Convert currency synchronously (uses cached rates)
 * Use this for display purposes when you don't need real-time rates
 */
export const convertCurrencySync = (
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number => {
  if (fromCurrency === toCurrency) return amount;
  
  // Use cached rate if available
  const cacheKey = `${fromCurrency}_${toCurrency}`;
  const cached = exchangeRateCache.get(cacheKey);
  if (cached) {
    return amount * cached.rate;
  }
  
  // Fallback: return amount (no conversion)
  return amount;
};
