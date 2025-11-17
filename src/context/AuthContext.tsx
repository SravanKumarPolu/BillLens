/**
 * Auth Context - Optional login/sync
 * App works fully without login, login is optional for sync
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);

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

    setIsSyncing(true);
    try {
      // TODO: Implement cloud sync
      // This would:
      // 1. Upload local data to cloud
      // 2. Download remote changes
      // 3. Merge conflicts
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setLastSyncDate(new Date());
    } catch (error) {
      console.error('Sync error:', error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

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

