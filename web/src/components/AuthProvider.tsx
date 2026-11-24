'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, clearAuthTokens, getStoredAccessToken, saveAuthTokens } from '@/lib/api';
import { useTheme, type ThemeMode } from './ThemeProvider';

export interface SessionUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  bio: string;
  homeCity: string;
  role: 'user' | 'admin';
  weightKg: number;
}

export interface SessionSettings {
  theme: ThemeMode;
  language: 'en' | 'hi';
  units: 'metric' | 'imperial';
  defaultVisibility: 'public' | 'followers' | 'private';
  hideStartEndMeters: number;
  isPrivateAccount: boolean;
  weeklyEmailDigest: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  settings: SessionSettings;
  unreadNotifications: number;
  loading: boolean;
  refreshMe: () => Promise<void>;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DEFAULT_SETTINGS: SessionSettings = {
  theme: 'system',
  language: 'en',
  units: 'metric',
  defaultVisibility: 'followers',
  hideStartEndMeters: 0,
  isPrivateAccount: false,
  weeklyEmailDigest: false,
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  settings: DEFAULT_SETTINGS,
  unreadNotifications: 0,
  loading: true,
  refreshMe: async () => {},
  loginWithCredentials: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setMode } = useTheme();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch<{
        user: SessionUser;
        settings: SessionSettings;
        unreadNotifications: number;
      }>('/v1/me');
      setUser(res.user);
      setSettings(res.settings);
      setUnreadNotifications(res.unreadNotifications || 0);
      if (res.settings?.theme) {
        setMode(res.settings.theme, false);
      }
    } catch {
      clearAuthTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [setMode]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const loginWithCredentials = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<{
        accessToken: string;
        refreshToken: string;
      }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, deviceName: 'Stride Web' }),
        skipAuthRefresh: true,
      });
      saveAuthTokens(res.accessToken, res.refreshToken);
      await refreshMe();
    },
    [refreshMe]
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/v1/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } catch {
      // ignore
    }
    clearAuthTokens();
    setUser(null);
    setUnreadNotifications(0);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, settings, unreadNotifications, loading, refreshMe, loginWithCredentials, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
