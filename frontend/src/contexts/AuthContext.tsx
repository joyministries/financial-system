import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '@/api/client';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (accessToken: string) => Promise<void>;
  register: (data: { email: string; password: string; full_name: string; role: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      authApi.me()
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    localStorage.setItem('token', res.data.access_token);
    setToken(res.data.access_token);
    setMustChangePassword(res.data.must_change_password || false);
    const meRes = await authApi.me();
    setUser(meRes.data);
  };

  const loginWithToken = async (accessToken: string) => {
    localStorage.setItem('token', accessToken);
    setToken(accessToken);
    try {
      const meRes = await authApi.me();
      setUser(meRes.data);
    } catch {
      // Token was accepted by the register endpoint but /me failed — clear it
      localStorage.removeItem('token');
      setToken(null);
    }
  };

  const register = async (data: { email: string; password: string; full_name: string; role: string }) => {
    await authApi.register(data);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
  };

  const refreshUser = async () => {
    try {
      const res = await authApi.me();
      setUser(res.data);
      if (!res.data.must_change_password) {
        setMustChangePassword(false);
      }
    } catch {
      // Keep the existing cached user if the refresh fails.
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, mustChangePassword, login, loginWithToken, register, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
