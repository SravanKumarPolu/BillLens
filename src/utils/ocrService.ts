/**
 * OCR Service for extracting bill information from images
 * 
 * This service extracts:
 * - Amount (total bill amount)
 * - Merchant (store/service name)
 * - Date (transaction date)
 * 
 * Currently uses a mock implementation. In production, this would integrate
 * with a real OCR service like Google Cloud Vision, AWS Textract, or Tesseract.
 * 
 * The parsing logic is designed to work with real OCR text output and includes
 * robust pattern matching for common Indian bill formats (Swiggy, Zomato, UPI, POS).
 */

export interface OcrResult {
  amount: string | null;
  merchant: string | null;
  date: string | null;
  confidence: number; // 0-1, indicates quality/confidence of extraction
  error?: string;
  rawText?: string; // Raw OCR text for debugging
  isUPI?: boolean; // India-first: UPI payment detection
  upiApp?: 'phonepe' | 'gpay' | 'paytm' | 'bhim' | 'other';
  suggestedGroup?: string; // India-first: Suggested group based on merchant
}

interface ParsedAmount {
  value: string;
  confidence: number;
  context: string; // e.g., "Grand Total", "Amount Paid"
}

interface ParsedMerchant {
  value: string;
  confidence: number;
  source: string; // e.g., "top_text", "label_pattern", "known_app"
}

/**
 * Validates image quality before OCR processing
 * Returns true if image is suitable for OCR, false otherwise
 */
export const validateImageQuality = async (imageUri: string): Promise<{
  isValid: boolean;
  error?: string;
}> => {
  // In a real implementation, this would:
  // 1. Check image dimensions (minimum resolution)
  // 2. Check image file size
  // 3. Analyze image sharpness/blur
  // 4. Check contrast and brightness
  
  // For now, we'll do basic validation
  // In production, you might use react-native-image-manipulator or similar
  
  return { isValid: true };
};

/**
 * Simulates OCR text extraction from an image
 * In production, this would call Google Vision API, AWS Textract, or Tesseract
 */
const performOCR = async (imageUri: string): Promise<string> => {
  // TODO: Replace with actual OCR API call
  // Example for Google Vision API:
  // const response = await visionClient.textDetection({ image: { source: { imageUri } } });
  // return response.textAnnotations?.[0]?.description || '';
  
  // Mock implementation: simulate OCR text extraction
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simulate realistic OCR text output for different bill types
  const mockTexts = [
    // Swiggy order
    `Swiggy
Order #SW123456789
Date: 15/12/2024
Grand Total: ₹450.00
Payment: Online
Thank you for ordering!`,
    
    // Zomato order
    `Zomato
Order ID: ZM987654321
Order Date: 15-Dec-2024
Total Amount: ₹650.50
Payment Method: UPI`,
    
    // UPI Payment (PhonePe)
    `PhonePe
Payment Successful
Amount: ₹1,200.00
Paid to: Blinkit
Date: 15/12/2024
Transaction ID: T123456789`,
    
    // UPI Payment (GPay)
    `Google Pay
Payment done
₹850.00
To: Swiggy
15/12/2024`,
    
    // Restaurant bill
    `Restaurant Name
Bill No: 12345
Date: 15/12/2024
Subtotal: ₹500.00
Tax: ₹90.00
Grand Total: ₹590.00`,
    
    // Simple receipt
    `Merchant Name
Amount Paid: ₹300.00
Date: 15-12-2024`,
  ];
  
  // Randomly select a mock text (in production, this would be real OCR output)
  const randomText = mockTexts[Math.floor(Math.random() * mockTexts.length)];
  
  // Simulate OCR errors (10% chance of poor quality)
  if (Math.random() < 0.1) {
    return 'blurry text unreadable image quality low';
  }
  
  return randomText;
};

/**
 * Extracts bill information from an image using OCR
 * 
 * @param imageUri - URI of the image to process
 * @returns Promise with extracted OCR results
 */
export const extractBillInfo = async (imageUri: string): Promise<OcrResult> => {
  try {
    // Validate image quality first
    const qualityCheck = await validateImageQuality(imageUri);
    if (!qualityCheck.isValid) {
      return {
        amount: null,
        merchant: null,
        date: null,
        confidence: 0,
        error: qualityCheck.error || 'Image quality is too low for OCR processing',
      };
    }

    // Perform OCR (in production, this would be a real OCR API call)
    const rawText = await performOCR(imageUri);
    
    if (!rawText || rawText.trim().length < 10) {
      return {
        amount: null,
        merchant: null,
        date: null,
        confidence: 0,
        error: 'Could not extract text from image. The image may be too blurry or contain no text.',
        rawText,
      };
    }

    // Extract information using improved parsing
    const parsedAmount = extractAmount(rawText);
    const parsedMerchant = extractMerchant(rawText);
    const parsedDate = extractDate(rawText);

    // Calculate overall confidence
    const confidence = calculateConfidence(
      parsedAmount,
      parsedMerchant,
      parsedDate,
      rawText.length
    );

    // India-first: Detect UPI payment
    const { detectUPIPayment } = await import('./indiaFirstService');
    const upiDetection = detectUPIPayment(rawText, parsedMerchant?.value);

    // India-first: Suggest group
    const { suggestGroup } = await import('./indiaFirstService');
    // Note: groups would need to be passed, but for now we'll do it in the screen

    // Format results
    const result: OcrResult = {
      amount: parsedAmount ? `₹${parsedAmount.value}` : null,
      merchant: parsedMerchant ? normalizeMerchant(parsedMerchant.value) : null,
      date: parsedDate || null,
      confidence,
      rawText: rawText.substring(0, 200), // Store first 200 chars for debugging
      isUPI: upiDetection.isUPI,
      upiApp: upiDetection.upiApp,
    };

    // Log low confidence cases for debugging
    if (confidence < 0.5) {
      console.warn('[OCR] Low confidence extraction:', {
        confidence,
        amount: result.amount,
        merchant: result.merchant,
        date: result.date,
        rawTextLength: rawText.length,
      });
    }

    // If confidence is very low, add warning but still return results
    if (confidence < 0.3) {
      result.error = 'Low confidence extraction. Please verify the extracted information.';
    }

    return result;
  } catch (error) {
    console.error('[OCR] Error processing image:', error);
    return {
      amount: null,
      merchant: null,
      date: null,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Failed to process image',
    };
  }
};

/**
 * Extracts amount from OCR text with context awareness
 * Prioritizes "Grand Total", "Total", "Amount Paid" over subtotals
 */
const extractAmount = (text: string): ParsedAmount | null => {
  if (!text) return null;

  // Normalize text: remove extra spaces, convert to lowercase for matching
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();

  // Priority patterns (higher priority = more likely to be the final total)
  // Enhanced for Indian bill patterns: restaurants, utilities, e-commerce, UPI
  const amountPatterns = [
    // Highest priority: Grand Total, Final Amount, Amount Paid (Indian format)
    {
      regex: /(?:grand\s+total|final\s+amount|amount\s+paid|total\s+payable|pay\s+amount|amount\s+to\s+pay|total\s+amount|net\s+amount)[\s:]*₹?\s*([\d,]+\.?\d*)/gi,
      priority: 10,
      context: 'Grand Total',
    },
    // Restaurant bills: Bill Total, Total Bill
    {
      regex: /(?:bill\s+total|total\s+bill|final\s+bill|amount\s+payable)[\s:]*₹?\s*([\d,]+\.?\d*)/gi,
      priority: 9,
      context: 'Restaurant Bill',
    },
    // Utility bills: Total Due, Amount Due, Bill Amount
    {
      regex: /(?:total\s+due|amount\s+due|bill\s+amount|outstanding|balance\s+due)[\s:]*₹?\s*([\d,]+\.?\d*)/gi,
      priority: 9,
      context: 'Utility Bill',
    },
    // UPI/Online payments: Amount, Paid, Transaction Amount
    {
      regex: /(?:amount|paid|transaction\s+amount|payment\s+amount)[\s:]*₹\s*([\d,]+\.?\d*)/gi,
      priority: 8,
      context: 'UPI Payment',
    },
    // Medium priority: Total (but check it's not a subtotal)
    {
      regex: /(?:^|\n)\s*total[\s:]*₹?\s*([\d,]+\.?\d*)/gi,
      priority: 7,
      context: 'Total',
    },
    // Lower priority: Any amount with ₹ symbol (fallback)
    {
      regex: /₹\s*([\d,]+\.?\d*)/g,
      priority: 3,
      context: 'Currency Symbol',
    },
    // Last resort: Large numbers that look like amounts
    {
      regex: /\b([\d]{3,}(?:[.,]\d{2})?)\b/g,
      priority: 1,
      context: 'Number Pattern',
    },
  ];

  const candidates: Array<{ value: string; priority: number; context: string }> = [];

  // Extract all candidate amounts
  for (const pattern of amountPatterns) {
    const matches = Array.from(normalized.matchAll(pattern.regex));
    for (const match of matches) {
      const amountStr = match[1].replace(/,/g, '');
      const amountNum = parseFloat(amountStr);
      
      // Validate: amount should be reasonable (between ₹10 and ₹1,00,000)
      if (amountNum >= 10 && amountNum <= 100000) {
        candidates.push({
          value: amountStr,
          priority: pattern.priority,
          context: pattern.context,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by priority (highest first), then by value (largest first for same priority)
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return parseFloat(b.value) - parseFloat(a.value);
  });

  const best = candidates[0];
  const confidence = best.priority >= 7 ? 0.9 : best.priority >= 3 ? 0.7 : 0.5;

  return {
    value: best.value,
    confidence,
    context: best.context,
  };
};

/**
 * Extracts merchant name from OCR text
 * Tries multiple strategies: known apps, label patterns, top text
 */
const extractMerchant = (text: string): ParsedMerchant | null => {
  if (!text) return null;

  const normalized = text.replace(/\s+/g, ' ').trim();
  const lines = normalized.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Strategy 1: Known Indian apps/services (high confidence)
  // Expanded list for better Indian bill pattern recognition
  const knownMerchants = [
    // Food delivery
    { patterns: ['swiggy'], name: 'Swiggy', confidence: 0.95 },
    { patterns: ['zomato'], name: 'Zomato', confidence: 0.95 },
    { patterns: ['uber eats', 'ubereats'], name: 'Uber Eats', confidence: 0.95 },
    // Grocery delivery
    { patterns: ['blinkit'], name: 'Blinkit', confidence: 0.95 },
    { patterns: ['bigbasket', 'big basket'], name: 'BigBasket', confidence: 0.95 },
    { patterns: ['zepto'], name: 'Zepto', confidence: 0.95 },
    { patterns: ['dunzo'], name: 'Dunzo', confidence: 0.95 },
    { patterns: ['grofers'], name: 'Grofers', confidence: 0.95 },
    // Payment apps
    { patterns: ['phonepe'], name: 'PhonePe', confidence: 0.9 },
    { patterns: ['google pay', 'gpay', 'gp ay', 'tez'], name: 'Google Pay', confidence: 0.9 },
    { patterns: ['paytm'], name: 'Paytm', confidence: 0.9 },
    { patterns: ['bhim'], name: 'BHIM', confidence: 0.9 },
    // E-commerce
    { patterns: ['amazon', 'amazon pay'], name: 'Amazon', confidence: 0.85 },
    { patterns: ['flipkart'], name: 'Flipkart', confidence: 0.85 },
    { patterns: ['myntra'], name: 'Myntra', confidence: 0.85 },
    // Utilities (common Indian providers)
    { patterns: ['bses', 'bses yamuna', 'bses rajdhani'], name: 'BSES', confidence: 0.9 },
    { patterns: ['tata power'], name: 'Tata Power', confidence: 0.9 },
    { patterns: ['reliance energy'], name: 'Reliance Energy', confidence: 0.9 },
    { patterns: ['airtel', 'airtel payments'], name: 'Airtel', confidence: 0.85 },
    { patterns: ['jio'], name: 'Jio', confidence: 0.85 },
    { patterns: ['vodafone', 'vi', 'vodafone idea'], name: 'Vodafone Idea', confidence: 0.85 },
    // Restaurants (common chains)
    { patterns: ['dominos', 'domino'], name: "Domino's", confidence: 0.9 },
    { patterns: ['pizza hut'], name: "Pizza Hut", confidence: 0.9 },
    { patterns: ['kfc'], name: 'KFC', confidence: 0.9 },
    { patterns: ['mcdonalds', 'mcd'], name: "McDonald's", confidence: 0.9 },
  ];

  for (const merchant of knownMerchants) {
    for (const pattern of merchant.patterns) {
      if (normalized.includes(pattern)) {
        return {
          value: merchant.name,
          confidence: merchant.confidence,
          source: 'known_app',
        };
      }
    }
  }

  // Strategy 2: Look for merchant labels (From:, To:, Pay to:, Merchant:)
  const merchantLabelPatterns = [
    /(?:from|to|pay\s+to|merchant|vendor|store)[\s:]+([a-z\s&]+)/gi,
    /(?:ordered\s+from|bought\s+from)[\s:]+([a-z\s&]+)/gi,
  ];

  for (const pattern of merchantLabelPatterns) {
    const matches = Array.from(normalized.matchAll(pattern));
    for (const match of matches) {
      const merchantName = match[1].trim();
      // Filter out common false positives
      if (merchantName.length > 2 && merchantName.length < 50 && 
          !merchantName.match(/^(amount|total|date|time|order|payment)$/i)) {
        return {
          value: merchantName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          confidence: 0.8,
          source: 'label_pattern',
        };
      }
    }
  }

  // Strategy 3: Top-most significant text (usually merchant name appears first)
  // Look for capitalized words or short phrases at the top
  if (lines.length > 0) {
    const topLine = lines[0];
    // Filter out common non-merchant text
    const skipPatterns = [
      /^(order|payment|receipt|bill|invoice|transaction|date|time|amount|total)/i,
      /^\d+$/, // Pure numbers
      /^₹/, // Currency symbols
    ];

    let isSkip = false;
    for (const skipPattern of skipPatterns) {
      if (skipPattern.test(topLine)) {
        isSkip = true;
        break;
      }
    }

    if (!isSkip && topLine.length > 2 && topLine.length < 40) {
      // Check if it looks like a merchant name (has letters, reasonable length)
      if (/[a-z]/i.test(topLine)) {
        return {
          value: topLine,
          confidence: 0.6,
          source: 'top_text',
        };
      }
    }

    // Try second line if first didn't work
    if (lines.length > 1) {
      const secondLine = lines[1];
      if (secondLine.length > 2 && secondLine.length < 40 && /[a-z]/i.test(secondLine)) {
        let isSkipSecond = false;
        for (const skipPattern of skipPatterns) {
          if (skipPattern.test(secondLine)) {
            isSkipSecond = true;
            break;
          }
        }
        if (!isSkipSecond) {
          return {
            value: secondLine,
            confidence: 0.5,
            source: 'top_text',
          };
        }
      }
    }
  }

  return null;
};

/**
 * Extracts date from OCR text
 * Supports multiple date formats common in Indian bills
 */
const extractDate = (text: string): string | null => {
  if (!text) return null;

  const normalized = text.replace(/\s+/g, ' ');

  // Date patterns (priority order)
  const datePatterns = [
    // DD/MM/YYYY or DD-MM-YYYY
    {
      regex: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g,
      format: (d: number, m: number, y: number) => {
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2030) {
          return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        }
        return null;
      },
    },
    // YYYY-MM-DD
    {
      regex: /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g,
      format: (y: number, m: number, d: number) => {
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2030) {
          return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        }
        return null;
      },
    },
    // DD Mon YYYY or DD Month YYYY
    {
      regex: /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/gi,
      format: (d: number, monthStr: string, y: number) => {
        const months: Record<string, number> = {
          jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
          jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
        };
        const m = months[monthStr.toLowerCase().substring(0, 3)];
        if (m && d >= 1 && d <= 31 && y >= 2020 && y <= 2030) {
          return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        }
        return null;
      },
    },
    // Look for date labels: "Date:", "Order Date:", etc.
    {
      regex: /(?:date|order\s+date|transaction\s+date|bill\s+date)[\s:]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/gi,
      format: (dateStr: string) => {
        const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) {
          const d = parseInt(match[1]);
          const m = parseInt(match[2]);
          const y = parseInt(match[3]);
          if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2030) {
            return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
          }
        }
        return null;
      },
    },
  ];

  for (const pattern of datePatterns) {
    const matches = Array.from(normalized.matchAll(pattern.regex));
    for (const match of matches) {
      const args = match.slice(1).map(v => {
        const num = Number(v);
        return isNaN(num) ? v : num;
      });
      // Type assertion needed because format functions have different signatures
      const dateStr = (pattern.format as (...args: any[]) => string | null)(...args);
      if (dateStr) {
        return dateStr;
      }
    }
  }

  return null;
};

/**
 * Calculates overall confidence score based on extraction quality
 */
const calculateConfidence = (
  amount: ParsedAmount | null,
  merchant: ParsedMerchant | null,
  date: string | null,
  rawTextLength: number
): number => {
  let confidence = 0;

  // Amount confidence (40% weight)
  if (amount) {
    confidence += amount.confidence * 0.4;
  }

  // Merchant confidence (35% weight)
  if (merchant) {
    confidence += merchant.confidence * 0.35;
  }

  // Date confidence (15% weight) - date is less critical
  if (date) {
    confidence += 0.15;
  }

  // Text quality (10% weight) - longer text usually means better OCR
  if (rawTextLength > 50) {
    confidence += 0.1;
  } else if (rawTextLength > 20) {
    confidence += 0.05;
  }

  return Math.min(confidence, 1.0);
};

/**
 * Formats amount string to remove currency symbols and extract numeric value
 */
export const parseAmount = (amountString: string | null): string => {
  if (!amountString) return '';
  
  // Remove currency symbols, commas, and whitespace
  const numericValue = amountString.replace(/[₹,\s]/g, '').trim();
  return numericValue;
};

/**
 * Normalizes merchant name (removes extra whitespace, standardizes case)
 */
export const normalizeMerchant = (merchantString: string | null): string => {
  if (!merchantString) return '';
  
  // Capitalize first letter of each word, remove extra spaces
  return merchantString
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

