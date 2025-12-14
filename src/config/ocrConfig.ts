/**
 * OCR Configuration
 * Controls which OCR service to use
 * 
 * Architecture: Client-side only, no backend required
 * - Primary: Google Vision API (client-side)
 * - Fallback: On-device OCR (ML Kit)
 * - Development: Mock OCR
 */

export interface OCRConfig {
  // Google Vision API Key (required for production)
  // Get from: https://console.cloud.google.com/apis/credentials
  googleVisionApiKey?: string;
  
  // Enable Google Vision API (client-side)
  useGoogleVision: boolean;
  
  // Enable on-device OCR as fallback (works offline)
  useOnDeviceOCR: boolean;
  
  // Use mock for development/testing (no API key needed)
  useMock: boolean;
}

// Default configuration - optimized for free tier
export const defaultOCRConfig: OCRConfig = {
  useGoogleVision: true, // Primary method - client-side API calls
  useOnDeviceOCR: true, // Fallback for offline use
  useMock: false, // Set to true for development/testing without API key
};

// Get configuration from environment or defaults
export const getOCRConfig = (): OCRConfig => {
  // In production, load API key from environment or secure storage
  // For now, return defaults
  return {
    ...defaultOCRConfig,
    // Set your Google Vision API key here or via environment variable:
    // googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY,
    // Or load from secure storage in production
  };
};
