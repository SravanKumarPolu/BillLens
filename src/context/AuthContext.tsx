/**
 * Auth Context - Optional login/sync
 * App works fully without login, login is optional for sync
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { syncService, SyncStatus } from '../utils/syncService';
import { CloudConfig } from '../utils/cloudService';

export interface User {
  id: string;
  email: string;
  name: string;
  provider?: 'google' | 'email';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Auth operations
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  
  // Sync operations (only available when authenticated)
  syncData: () => Promise<void>;
  isSyncing: boolean;
  lastSyncDate: Date | null;
  syncStatus: SyncStatus;
  enableAutoSync: (enabled: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncService.getStatus());

  // Subscribe to sync status updates
  useEffect(() => {
    const unsubscribe = syncService.subscribe(status => {
      setSyncStatus(status);
      setIsSyncing(status.isSyncing);
      setLastSyncDate(status.lastSyncDate);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Implement Google Sign-In
      // For now, mock implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockUser: User = {
        id: 'user-123',
        email: 'user@example.com',
        name: 'User',
        provider: 'google',
      };
      
      setUser(mockUser);
      setLastSyncDate(new Date());

      // Initialize cloud sync (can be configured based on provider)
      // For now, using mock/REST - in production, configure with actual provider
      // Environment variables can be set via react-native-config or similar
      syncService.initializeCloud({
        provider: 'rest', // or 'firebase', 'aws', 'supabase'
        endpoint: undefined, // Set via environment config in production
        apiKey: undefined, // Set via environment config in production
        userId: mockUser.id,
      });
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // TODO: Implement email/password authentication
      // For now, mock implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockUser: User = {
        id: 'user-123',
        email,
        name: email.split('@')[0],
        provider: 'email',
      };
      
      setUser(mockUser);
      setLastSyncDate(new Date());

      // Initialize cloud sync
      syncService.initializeCloud({
        provider: 'rest',
        endpoint: undefined, // Set via environment config in production
        apiKey: undefined, // Set via environment config in production
        userId: mockUser.id,
      });
    } catch (error) {
      console.error('Email sign-in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Implement sign out
      setUser(null);
      setLastSyncDate(null);
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncData = useCallback(async () => {
    if (!user) {
      throw new Error('Must be signed in to sync');
    }

    try {
      // Get current app data for sync
      const { loadAppData } = await import('../utils/storageService');
      const localData = await loadAppData();
      
      if (!localData) {
        throw new Error('No local data to sync');
      }

      // Use sync service for comprehensive sync
      const result = await syncService.sync(localData, user.id);
      
      if (!result.success) {
        throw new Error(result.errors.join(', '));
      }

      // If there were conflicts, user might need to resolve them
      if (result.conflicts.length > 0) {
        console.warn(`Sync completed with ${result.conflicts.length} conflicts`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      throw error;
    }
  }, [user]);

  const enableAutoSync = useCallback((enabled: boolean) => {
    syncService.setAutoSync(enabled);
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    signInWithGoogle,
    signInWithEmail,
    signOut,
    syncData,
    isSyncing,
    lastSyncDate,
    syncStatus,
    enableAutoSync,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

