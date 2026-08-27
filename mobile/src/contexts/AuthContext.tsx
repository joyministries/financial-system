import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authApi, setOnAuthExpired } from '../api/client';
import { registerForPushNotifications, unregisterPushToken } from '../services/notifications';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  clearMustChangePassword: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Register the 401-expired handler so the API interceptor can force-logout.
  useEffect(() => {
    setOnAuthExpired(() => {
      setToken(null);
      setUser(null);
    });
    return () => setOnAuthExpired(null);
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync('token');
      if (stored) {
        setToken(stored);
        try {
          const res = await authApi.me();
          setUser(res.data);
        } catch {
          await SecureStore.deleteItemAsync('token');
          setToken(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email.trim().toLowerCase(), password);
    const tok = res.data.access_token;
    await SecureStore.setItemAsync('token', tok);
    setToken(tok);
    setMustChangePassword(res.data.must_change_password || false);
    const meRes = await authApi.me();
    setUser(meRes.data);
    // Register push token after login (fire-and-forget)
    registerForPushNotifications().catch(() => {});
  };

  const logout = async () => {
    // Remove push token from backend before clearing local state
    await unregisterPushToken().catch(() => {});
    await SecureStore.deleteItemAsync('token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await authApi.me();
      setUser(res.data);
      if (!res.data.must_change_password) {
        setMustChangePassword(false);
      }
    } catch { /* keep cached */ }
  };

  const clearMustChangePassword = () => {
    setMustChangePassword(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, mustChangePassword, login, logout, refreshUser, clearMustChangePassword, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
