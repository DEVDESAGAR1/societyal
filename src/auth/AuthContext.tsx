/**
 * SocietyFix AI — Authentication React Context & Hook
 * Provides verified identity, Super Admin authorization, session restore, and sign-in handlers.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithGoogle as firebaseGoogleSignIn,
  signOutFirebase,
  onAuthStatusChange,
  isFirebaseConfigured,
} from './firebaseClient.ts';
import { logger } from '../infrastructure/logger.ts';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  phoneNumber: string | null;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  preferredLanguage: string;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isSuperAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshProfile: () => Promise<void>;
  bootstrapAsAdmin: (secret?: string) => Promise<{ success: boolean; message: string }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean>(true);

  // Synchronizes session with backend using verified Firebase ID token
  const syncWithBackend = useCallback(async (idToken: string) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (response.status === 403) {
        const data = await response.json();
        setError(data.error || 'Your account is suspended or disabled.');
        setUser(null);
        setIsSuperAdmin(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Authentication verification failed (HTTP ${response.status})`);
      }

      const data = await response.json();
      setUser(data.user);
      setIsSuperAdmin(data.authorization?.isSuperAdmin || false);
      setToken(idToken);
      setError(null);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to sync session with backend', { error: errorMsg });
      setError(errorMsg);
      setUser(null);
      setIsSuperAdmin(false);
    }
  }, []);

  // Restore session or listen for auth changes on mount
  useEffect(() => {
    const isConfig = isFirebaseConfigured();
    setConfigured(isConfig);

    if (!isConfig) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStatusChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          await syncWithBackend(idToken);
        } catch (err: unknown) {
          logger.error('Error fetching Firebase token on auth state change', { error: String(err) });
        }
      } else {
        setUser(null);
        setToken(null);
        setIsSuperAdmin(false);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [syncWithBackend]);

  const signIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { idToken } = await firebaseGoogleSignIn();
      await syncWithBackend(idToken);
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      logger.error('Sign-in failed', { code: errObj.code, message: errObj.message });
      if (errObj.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. The Google popup was closed before completion.');
      } else {
        setError(errObj.message || 'Google Sign-In failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => {});
      }
      await signOutFirebase();
      setUser(null);
      setToken(null);
      setIsSuperAdmin(false);
      setError(null);
    } catch (err: unknown) {
      logger.error('Sign-out error', { error: String(err) });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (token) {
      await syncWithBackend(token);
    }
  };

  const bootstrapAsAdmin = async (secret?: string): Promise<{ success: boolean; message: string }> => {
    if (!token) {
      return { success: false, message: 'Unauthenticated' };
    }

    try {
      const response = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bootstrapSecret: secret }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, message: data.error || 'Bootstrap failed' };
      }

      await refreshProfile();
      return { success: true, message: data.message };
    } catch (err: unknown) {
      return { success: false, message: String(err) };
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isSuperAdmin,
        isLoading,
        error,
        isConfigured: configured,
        signIn,
        signOut,
        getIdToken: async () => token,
        refreshProfile,
        bootstrapAsAdmin,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
