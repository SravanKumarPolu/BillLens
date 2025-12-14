/**
 * Analytics Configuration
 * 
 * Note: Python backend support is deprecated. All analytics run client-side.
 * This config exists for backward compatibility only.
 */

export interface AnalyticsConfig {
  // Python backend URL (deprecated - not used)
  pythonBackendUrl?: string;
  
  // Enable Python backend (deprecated - always false, uses frontend)
  usePythonBackend: boolean;
}

// Default configuration - all analytics run client-side
export const defaultAnalyticsConfig: AnalyticsConfig = {
  usePythonBackend: false, // Always false - Python backend removed
};

// Get configuration from environment or defaults
export const getAnalyticsConfig = (): AnalyticsConfig => {
  // All analytics run client-side - no backend needed
  return {
    ...defaultAnalyticsConfig,
  };
};
