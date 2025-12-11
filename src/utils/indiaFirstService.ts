/**
 * India-First Service
 * 
 * Provides India-specific features:
 * - UPI payment detection
 * - Rent sharing tools
 * - Utilities bill splitting
 * - Itemized food delivery splitting
 * - SMS parsing for bills
 */

import { Group, Expense } from '../types/models';

export interface UPIDetection {
  isUPI: boolean;
  upiApp?: 'phonepe' | 'gpay' | 'paytm' | 'bhim' | 'cred' | 'other';
  amount?: number;
  merchant?: string;
  transactionId?: string;
  date?: string;
}

export interface GroupSuggestion {
  groupId?: string; // If group exists
  suggestedGroupName: string;
  suggestedEmoji: string;
  confidence: number;
  reason: string;
}

export interface RentSplit {
  totalRent: number;
  perPerson: number;
  utilities?: {
    electricity: number;
    water: number;
    internet: number;
    maintenance: number;
    other: number;
  };
  splitBy: string[]; // Member IDs
}

export interface ItemizedFoodSplit {
  items: Array<{
    name: string;
    price: number;
    quantity?: number;
    splitBetween: string[];
  }>;
  total: number;
  deliveryFee?: number;
  platformFee?: number; // Swiggy/Zomato platform fee
  tax?: number;
  discount?: number;
}

/**
 * Detect if OCR result is a UPI payment
 */
export const detectUPIPayment = (ocrText: string, merchant?: string): UPIDetection => {
  if (!ocrText) {
    return { isUPI: false };
  }

  const normalized = ocrText.toLowerCase();
  
  // UPI app indicators
  const upiApps = {
    phonepe: ['phonepe', 'phone pe'],
    gpay: ['google pay', 'gpay', 'gp ay', 'tez'],
    paytm: ['paytm', 'pay tm'],
    bhim: ['bhim', 'bhim upi'],
    cred: ['cred'],
  };

  let detectedApp: 'phonepe' | 'gpay' | 'paytm' | 'bhim' | 'cred' | 'other' | undefined;
  
  for (const [app, patterns] of Object.entries(upiApps)) {
    if (patterns.some(pattern => normalized.includes(pattern))) {
      detectedApp = app as any;
      break;
    }
  }

  // UPI payment indicators
  const upiIndicators = [
    'payment successful',
    'payment done',
    'upi',
    'transaction id',
    'transaction successful',
    'paid to',
    'money sent',
  ];

  const hasUPIIndicators = upiIndicators.some(indicator => normalized.includes(indicator));

  // Extract transaction ID
  const transactionIdMatch = normalized.match(/transaction\s*(?:id|no)[\s:]*([a-z0-9]+)/i);
  const transactionId = transactionIdMatch ? transactionIdMatch[1] : undefined;

  // Extract amount (already done by OCR, but double-check)
  const amountMatch = normalized.match(/₹\s*([\d,]+\.?\d*)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined;

  // Extract merchant from "Paid to:" or "To:"
  const merchantMatch = normalized.match(/(?:paid\s+to|to)[\s:]+([a-z\s&]+)/i);
  const extractedMerchant = merchantMatch ? merchantMatch[1].trim() : merchant;

  // Extract date
  const dateMatch = normalized.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  const date = dateMatch ? dateMatch[1] : undefined;

  const isUPI = hasUPIIndicators || !!detectedApp || !!transactionId;

  return {
    isUPI,
    upiApp: detectedApp || (isUPI ? 'other' : undefined),
    amount,
    merchant: extractedMerchant,
    transactionId,
    date,
  };
};

/**
 * Suggest group based on merchant/category
 */
export const suggestGroup = (
  merchant: string,
  category: string,
  groups: Group[]
): GroupSuggestion | null => {
  if (!merchant && !category) return null;

  const merchantLower = (merchant || '').toLowerCase();
  const categoryLower = (category || '').toLowerCase();

  // Food delivery → FOOD group
  if (
    merchantLower.includes('swiggy') ||
    merchantLower.includes('zomato') ||
    merchantLower.includes('uber eats') ||
    categoryLower === 'food'
  ) {
    const existingGroup = groups.find(g => 
      g.name.toLowerCase().includes('food') || 
      g.name.toLowerCase().includes('dining')
    );
    
    if (existingGroup) {
      return {
        groupId: existingGroup.id,
        suggestedGroupName: existingGroup.name,
        suggestedEmoji: existingGroup.emoji,
        confidence: 0.95,
        reason: 'This looks like a food delivery order',
      };
    }

    return {
      suggestedGroupName: 'Food & Dining',
      suggestedEmoji: '🍔',
      confidence: 0.9,
      reason: 'This looks like Swiggy/Zomato → Add to FOOD',
    };
  }

  // Rent receipt → HOME group
  if (
    merchantLower.includes('rent') ||
    merchantLower.includes('apartment') ||
    merchantLower.includes('house') ||
    categoryLower === 'rent'
  ) {
    const existingGroup = groups.find(g => 
      g.name.toLowerCase().includes('home') || 
      g.name.toLowerCase().includes('house') ||
      g.name.toLowerCase().includes('rent')
    );
    
    if (existingGroup) {
      return {
        groupId: existingGroup.id,
        suggestedGroupName: existingGroup.name,
        suggestedEmoji: existingGroup.emoji,
        confidence: 0.95,
        reason: 'This is a Rent Receipt → Add to HOME',
      };
    }

    return {
      suggestedGroupName: 'Our Home',
      suggestedEmoji: '🏠',
      confidence: 0.9,
      reason: 'This is a Rent Receipt → Add to HOME',
    };
  }

  // Utilities → HOME group
  if (
    merchantLower.includes('electric') ||
    merchantLower.includes('power') ||
    merchantLower.includes('bses') ||
    merchantLower.includes('tata power') ||
    categoryLower === 'utilities'
  ) {
    const existingGroup = groups.find(g => 
      g.name.toLowerCase().includes('home') || 
      g.name.toLowerCase().includes('house')
    );
    
    if (existingGroup) {
      return {
        groupId: existingGroup.id,
        suggestedGroupName: existingGroup.name,
        suggestedEmoji: existingGroup.emoji,
        confidence: 0.9,
        reason: 'This looks like an electricity bill → Add to HOME',
      };
    }

    return {
      suggestedGroupName: 'Our Home',
      suggestedEmoji: '🏠',
      confidence: 0.85,
      reason: 'This looks like an electricity bill → Add to HOME',
    };
  }

  // Groceries → HOME or GROCERIES group
  if (
    merchantLower.includes('blinkit') ||
    merchantLower.includes('bigbasket') ||
    merchantLower.includes('zepto') ||
    categoryLower === 'groceries'
  ) {
    const existingGroup = groups.find(g => 
      g.name.toLowerCase().includes('home') || 
      g.name.toLowerCase().includes('grocery')
    );
    
    if (existingGroup) {
      return {
        groupId: existingGroup.id,
        suggestedGroupName: existingGroup.name,
        suggestedEmoji: existingGroup.emoji,
        confidence: 0.9,
        reason: 'This looks like a grocery order → Add to HOME',
      };
    }

    return {
      suggestedGroupName: 'Our Home',
      suggestedEmoji: '🏠',
      confidence: 0.85,
      reason: 'This looks like a grocery order → Add to HOME',
    };
  }

  // Trip expenses → TRIPS group
  if (
    merchantLower.includes('uber') ||
    merchantLower.includes('ola') ||
    merchantLower.includes('hotel') ||
    merchantLower.includes('flight')
  ) {
    const existingGroup = groups.find(g => 
      g.name.toLowerCase().includes('trip') || 
      g.name.toLowerCase().includes('travel')
    );
    
    if (existingGroup) {
      return {
        groupId: existingGroup.id,
        suggestedGroupName: existingGroup.name,
        suggestedEmoji: existingGroup.emoji,
        confidence: 0.9,
        reason: 'This looks like a travel expense → Add to TRIPS',
      };
    }

    return {
      suggestedGroupName: 'Trips',
      suggestedEmoji: '✈️',
      confidence: 0.85,
      reason: 'This looks like a travel expense → Add to TRIPS',
    };
  }

  return null;
};

/**
 * Calculate rent split with utilities
 */
export const calculateRentSplit = (
  totalRent: number,
  utilities: {
    electricity?: number;
    water?: number;
    internet?: number;
    maintenance?: number;
    other?: number;
  },
  memberIds: string[]
): RentSplit => {
  const memberCount = memberIds.length;
  const perPersonRent = totalRent / memberCount;
  
  const utilitiesTotal = 
    (utilities.electricity || 0) +
    (utilities.water || 0) +
    (utilities.internet || 0) +
    (utilities.maintenance || 0) +
    (utilities.other || 0);
  
  const perPersonUtilities = utilitiesTotal / memberCount;
  const perPersonTotal = perPersonRent + perPersonUtilities;

  return {
    totalRent,
    perPerson: perPersonTotal,
    utilities: {
      electricity: utilities.electricity || 0,
      water: utilities.water || 0,
      internet: utilities.internet || 0,
      maintenance: utilities.maintenance || 0,
      other: utilities.other || 0,
    },
    splitBy: memberIds,
  };
};

/**
 * Parse itemized food delivery bill
 * Extracts individual items from Swiggy/Zomato receipts
 */
export const parseItemizedFoodBill = (ocrText: string): ItemizedFoodSplit | null => {
  if (!ocrText) return null;

  const normalized = ocrText.toLowerCase();
  
  // Check if it's a food delivery bill
  const isFoodDelivery = 
    normalized.includes('swiggy') ||
    normalized.includes('zomato') ||
    normalized.includes('uber eats');

  if (!isFoodDelivery) return null;

  const items: Array<{ name: string; price: number; quantity?: number; splitBetween: string[] }> = [];
  
  // Enhanced item extraction patterns for Swiggy/Zomato/Blinkit
  const itemPatterns = [
    // Pattern 1: "2x Item Name ₹500" or "2 x Item Name ₹500"
    /(\d+)\s*x\s*([^₹\n]+?)\s*₹\s*([\d,]+\.?\d*)/gi,
    // Pattern 2: "Item Name ₹500" (single item)
    /([A-Z][^₹\n]+?)\s*₹\s*([\d,]+\.?\d*)/gi,
    // Pattern 3: "Item Name - ₹500" (with dash)
    /([A-Z][^₹\n]+?)\s*-\s*₹\s*([\d,]+\.?\d*)/gi,
    // Pattern 4: "Item Name (₹500)" (with parentheses)
    /([A-Z][^₹\n]+?)\s*\(\s*₹\s*([\d,]+\.?\d*)\s*\)/gi,
  ];

  const lines = ocrText.split('\n');
  let foundItems = false;

  for (const line of lines) {
    for (const pattern of itemPatterns) {
      const matches = Array.from(line.matchAll(pattern));
      for (const match of matches) {
        if (match.length >= 3) {
          const quantity = match[1] ? parseInt(match[1]) : 1;
          const itemName = (match[2] || match[1] || '').trim();
          const price = parseFloat((match[3] || match[2] || '0').replace(/,/g, ''));

          // Filter out common false positives
          if (
            itemName.length > 2 &&
            itemName.length < 50 &&
            !itemName.match(/^(total|subtotal|tax|delivery|discount|grand|amount|paid)$/i) &&
            price > 0 &&
            price < 10000
          ) {
            items.push({
              name: itemName,
              price: price / quantity, // Price per item
              quantity,
              splitBetween: [], // Will be set by user
            });
            foundItems = true;
          }
        }
      }
    }
  }

  if (!foundItems || items.length === 0) return null;

  // Enhanced extraction for delivery fee, platform fee, tax, discount
  const deliveryFeeMatch = normalized.match(/(?:delivery|delivery\s+fee|delivery\s+charges)[\s:]*₹\s*([\d,]+\.?\d*)/i);
  const deliveryFee = deliveryFeeMatch ? parseFloat(deliveryFeeMatch[1].replace(/,/g, '')) : undefined;

  // Platform fee (Swiggy/Zomato specific)
  const platformFeeMatch = normalized.match(/(?:platform\s+fee|convenience\s+fee|service\s+fee)[\s:]*₹\s*([\d,]+\.?\d*)/i);
  const platformFee = platformFeeMatch ? parseFloat(platformFeeMatch[1].replace(/,/g, '')) : undefined;

  // Tax (GST, VAT, etc.)
  const taxMatch = normalized.match(/(?:tax|gst|vat|cgst|sgst|igst)[\s:]*₹\s*([\d,]+\.?\d*)/i);
  const tax = taxMatch ? parseFloat(taxMatch[1].replace(/,/g, '')) : undefined;

  // Discount/Offer
  const discountMatch = normalized.match(/(?:discount|offer|promo|savings|you\s+saved)[\s:]*₹\s*([\d,]+\.?\d*)/i);
  const discount = discountMatch ? parseFloat(discountMatch[1].replace(/,/g, '')) : undefined;

  const itemsTotal = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  const total = itemsTotal +
    (deliveryFee || 0) +
    (platformFee || 0) +
    (tax || 0) -
    (discount || 0);

  return {
    items,
    total,
    deliveryFee,
    platformFee,
    tax,
    discount,
  };
};

/**
 * Parse SMS for bill information
 */
export const parseSMSBill = (smsText: string): {
  type: 'electricity' | 'water' | 'internet' | 'phone' | 'other' | null;
  amount?: number;
  dueDate?: string;
  accountNumber?: string;
  merchant?: string;
} => {
  if (!smsText) {
    return { type: null };
  }

  const normalized = smsText.toLowerCase();

  // Electricity bill patterns
  if (
    normalized.includes('electricity') ||
    normalized.includes('eb bill') ||
    normalized.includes('power bill') ||
    normalized.includes('bses') ||
    normalized.includes('tata power')
  ) {
    const amountMatch = normalized.match(/₹\s*([\d,]+\.?\d*)/);
    const dueDateMatch = normalized.match(/(?:due|pay\s+by)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    const accountMatch = normalized.match(/(?:account|consumer\s+no)[\s:]*([a-z0-9]+)/i);

    return {
      type: 'electricity',
      amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined,
      dueDate: dueDateMatch ? dueDateMatch[1] : undefined,
      accountNumber: accountMatch ? accountMatch[1] : undefined,
      merchant: normalized.includes('bses') ? 'BSES' : 
                normalized.includes('tata') ? 'Tata Power' : 'Electricity',
    };
  }

  // Water bill
  if (normalized.includes('water') || normalized.includes('water bill')) {
    const amountMatch = normalized.match(/₹\s*([\d,]+\.?\d*)/);
    return {
      type: 'water',
      amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined,
    };
  }

  // Internet/Phone bill
  if (
    normalized.includes('airtel') ||
    normalized.includes('jio') ||
    normalized.includes('vodafone') ||
    normalized.includes('vi') ||
    normalized.includes('internet') ||
    normalized.includes('broadband')
  ) {
    const amountMatch = normalized.match(/₹\s*([\d,]+\.?\d*)/);
    const merchant = normalized.includes('airtel') ? 'Airtel' :
                     normalized.includes('jio') ? 'Jio' :
                     normalized.includes('vodafone') || normalized.includes('vi') ? 'Vodafone Idea' :
                     'Internet';

    return {
      type: normalized.includes('internet') || normalized.includes('broadband') ? 'internet' : 'phone',
      amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined,
      merchant,
    };
  }

  return { type: null };
};
