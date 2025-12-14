/**
 * OCR Configuration
 * Controls which OCR service to use
 */

export interface OCRConfig {
  // Python backend URL (optional)
  pythonBackendUrl?: string;
  
  // Enable Python backend (if URL is provided)
  usePythonBackend: boolean;
  
  // Fallback to Google Vision API if Python backend fails
  fallbackToGoogleVision: boolean;
  
  // Use mock for development
  useMock: boolean;
}

// Default configuration
export const defaultOCRConfig: OCRConfig = {
  usePythonBackend: false, // Disabled by default - enable by setting pythonBackendUrl
  fallbackToGoogleVision: true,
  useMock: false, // Set to true for development/testing
};

// Get configuration from environment or defaults
export const getOCRConfig = (): OCRConfig => {
  // In production, you can load from environment variables or app config
  // For now, return defaults
  return {
    ...defaultOCRConfig,
    // Uncomment and set to enable Python backend:
    // pythonBackendUrl: 'http://localhost:8000', // Development
    // pythonBackendUrl: 'https://api.billlens.com', // Production
    // usePythonBackend: true,
  };
};
