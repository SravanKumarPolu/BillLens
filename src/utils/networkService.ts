/**
 * Network Service
 * 
 * Detects network connectivity and provides network status updates
 * Works across Web, Android, iOS, and Desktop platforms
 */

import { Platform } from 'react-native';

export interface NetworkState {
  isConnected: boolean;
  type: 'wifi' | 'cellular' | 'ethernet' | 'unknown' | 'none';
  isInternetReachable: boolean;
}

type NetworkListener = (state: NetworkState) => void;

class NetworkService {
  private listeners: Set<NetworkListener> = new Set();
  private currentState: NetworkState = {
    isConnected: true, // Assume connected by default
    type: 'unknown',
    isInternetReachable: true,
  };

  /**
   * Check if device is online
   */
  async isOnline(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return navigator.onLine;
    }
    
    // For React Native, we'd use @react-native-community/netinfo
    // For now, assume online (can be enhanced with actual library)
    return true;
  }

  /**
   * Get current network state
   */
  async getNetworkState(): Promise<NetworkState> {
    if (Platform.OS === 'web') {
      return {
        isConnected: navigator.onLine,
        type: navigator.onLine ? 'wifi' : 'none',
        isInternetReachable: navigator.onLine,
      };
    }

    // For React Native, use @react-native-community/netinfo
    // For now, return default state
    return this.currentState;
  }

  /**
   * Subscribe to network state changes
   */
  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    
    // Immediately notify with current state
    this.getNetworkState().then(state => {
      this.currentState = state;
      listener(state);
    });

    // Set up listeners based on platform
    if (Platform.OS === 'web') {
      const handleOnline = () => {
        this.currentState = {
          isConnected: true,
          type: 'wifi',
          isInternetReachable: true,
        };
        this.notifyListeners();
      };

      const handleOffline = () => {
        this.currentState = {
          isConnected: false,
          type: 'none',
          isInternetReachable: false,
        };
        this.notifyListeners();
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Return cleanup function
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        this.listeners.delete(listener);
      };
    }

    // For React Native, would use NetInfo.addEventListener
    // For now, return basic cleanup
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of network state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentState));
  }

  /**
   * Update network state (called by platform-specific listeners)
   */
  updateState(state: NetworkState): void {
    this.currentState = state;
    this.notifyListeners();
  }
}

// Singleton instance
export const networkService = new NetworkService();
