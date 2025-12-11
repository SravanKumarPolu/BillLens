/**
 * Network Monitor
 * 
 * Monitors network connectivity and triggers sync when connection is restored
 * Uses fetch-based detection (works without additional dependencies)
 */

type NetworkState = 'online' | 'offline' | 'unknown';
type NetworkListener = (state: NetworkState) => void;

class NetworkMonitor {
  private listeners: Set<NetworkListener> = new Set();
  private currentState: NetworkState = 'unknown';
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastOnlineCheck: number = 0;
  private checkIntervalMs = 5000; // Check every 5 seconds

  /**
   * Subscribe to network state changes
   */
  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.currentState);
    
    // Start monitoring if not already started
    if (!this.checkInterval) {
      this.startMonitoring();
    }
    
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopMonitoring();
      }
    };
  }

  /**
   * Start monitoring network state
   */
  private startMonitoring(): void {
    // Initial check
    this.checkNetworkState();
    
    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.checkNetworkState();
    }, this.checkIntervalMs);
  }

  /**
   * Stop monitoring network state
   */
  private stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check network state using fetch
   */
  private async checkNetworkState(): Promise<void> {
    const now = Date.now();
    
    // Throttle checks to avoid too frequent requests
    if (now - this.lastOnlineCheck < 2000) {
      return;
    }
    
    this.lastOnlineCheck = now;
    
    try {
      // Try to fetch a small resource to check connectivity
      // Using a cache-busting URL to ensure we're actually checking network
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      // Use a lightweight endpoint that's likely to be available
      // React Native fetch works with standard HTTP requests
      await fetch(
        `https://www.google.com/favicon.ico?t=${Date.now()}`,
        {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-store',
        }
      );
      
      clearTimeout(timeoutId);
      
      // If we get here, network is online
      if (this.currentState !== 'online') {
        this.currentState = 'online';
        this.notifyListeners();
      }
    } catch (error) {
      // Network is offline or request failed
      // Check if it's an abort (timeout) or actual network error
      if (error instanceof Error && error.name === 'AbortError') {
        // Timeout - assume offline
        if (this.currentState !== 'offline') {
          this.currentState = 'offline';
          this.notifyListeners();
        }
      } else {
        // Other error - likely network issue
        if (this.currentState !== 'offline') {
          this.currentState = 'offline';
          this.notifyListeners();
        }
      }
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentState));
  }

  /**
   * Get current network state
   */
  getState(): NetworkState {
    return this.currentState;
  }

  /**
   * Check if network is online
   */
  isOnline(): boolean {
    return this.currentState === 'online';
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.stopMonitoring();
    this.listeners.clear();
    this.currentState = 'unknown';
  }
}

// Singleton instance
export const networkMonitor = new NetworkMonitor();
