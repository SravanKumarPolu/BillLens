/**
 * Analytics Configuration
 * Controls whether to use Python backend for analytics (optional)
 */

export interface AnalyticsConfig {
  // Python backend URL (optional)
  pythonBackendUrl?: string;
  
  // Enable Python backend for analytics (if URL is provided)
  usePythonBackend: boolean;
}

// Default configuration
export const defaultAnalyticsConfig: AnalyticsConfig = {
  usePythonBackend: false, // Disabled by default - enable by setting pythonBackendUrl
};

// Get configuration from environment or defaults
export const getAnalyticsConfig = (): AnalyticsConfig => {
  // In production, you can load from environment variables or app config
  // For now, return defaults
  return {
    ...defaultAnalyticsConfig,
    // Uncomment and set to enable Python backend:
    // pythonBackendUrl: 'http://localhost:8000', // Development
    // pythonBackendUrl: 'https://api.billlens.com', // Production
    // usePythonBackend: true,
  };
};
