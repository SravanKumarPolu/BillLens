/**
 * OCR Backend Service
 * Optional service to use Python backend for structured parsing
 * Falls back to client-side parsing if backend unavailable
 */

import { OcrResult } from './ocrService';

export interface BackendOCRResponse {
  merchant: string;
  currency: string;
  subtotal?: number;
  tax?: number;
  total: number;
  items: Array<{
    name: string;
    qty: number;
    price: number;
  }>;
  date?: string;
  time?: string;
  delivery_fee?: number;
  platform_fee?: number;
  discount?: number;
  confidence: number;
  raw_text?: string;
  suggested_split?: {
    type: 'equal' | 'item-based' | 'custom';
    amount_per_person?: number;
    splits?: Record<string, number>;
    explanation: string;
  };
}

/**
 * Parse receipt using Python backend (optional enhancement)
 * Falls back to client-side parsing if backend unavailable
 * 
 * Note: For React Native, we use FormData (multipart) instead of base64
 * for better performance and compatibility
 */
export const parseReceiptWithBackend = async (
  imageUri: string,
  backendUrl: string,
  currency: string = 'INR',
  hint?: string,
  memberIds?: string[]
): Promise<BackendOCRResponse | null> => {
  try {
    // Use FormData for React Native (more reliable than base64)
    const formData = new FormData();
    
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'bill.jpg',
    } as any);
    
    // For structured parsing, we'll use a different approach:
    // Option 1: Use /ocr/google to get raw text, then parse client-side (current flow)
    // Option 2: Use /ocr/parse with base64 (requires RNFS or similar)
    
    // For now, we'll use the existing flow which works perfectly:
    // 1. Get raw text from /ocr/google (already implemented)
    // 2. Parse client-side (already implemented in extractBillInfo)
    
    // This function is available for future use when we want to do
    // full parsing on backend. For now, the existing flow is optimal.
    
    return null; // Return null to use existing client-side parsing
  } catch (error) {
    console.warn('Backend parsing failed, will use client-side:', error);
    return null;
  }
};

/**
 * Convert backend response to OcrResult format (for compatibility)
 */
export const convertBackendToOcrResult = (backendResponse: BackendOCRResponse): OcrResult => {
  return {
    amount: `₹${backendResponse.total}`,
    merchant: backendResponse.merchant,
    date: backendResponse.date || null,
    time: backendResponse.time || null,
    confidence: backendResponse.confidence,
    rawText: backendResponse.raw_text,
    tax: backendResponse.tax,
    deliveryFee: backendResponse.delivery_fee,
    platformFee: backendResponse.platform_fee,
    discount: backendResponse.discount,
    items: backendResponse.items.map(item => ({
      name: item.name,
      price: item.price,
      quantity: item.qty,
    })),
  };
};
