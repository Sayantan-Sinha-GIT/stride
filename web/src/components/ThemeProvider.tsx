'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, getStoredAccessToken } from '@/lib/api';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setMode: (next: ThemeMode, persistToAccount?: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolvedTheme: 'dark',
  setMode: () => {},
});

function computeResolved(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  const applyTheme = useCallback((nextMode: ThemeMode) => {
    const resolved = computeResolved(nextMode);
    setModeState(nextMode);
    setResolvedTheme(resolved);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', resolved);
    }
  }, []);

  useEffect(() => {
    const saved = (localStorage.getItem('stride-theme') as ThemeMode | null) || 'system';
    applyTheme(saved);

    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const current = (localStorage.getItem('stride-theme') as ThemeMode | null) || 'system';
      if (current === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [applyTheme]);

  const setMode = useCallback(
    (next: ThemeMode, persistToAccount = true) => {
      localStorage.setItem('stride-theme', next);
      applyTheme(next);
      if (persistToAccount && getStoredAccessToken()) {
        apiFetch('/v1/me/settings', {
          method: 'PATCH',
          body: JSON.stringify({ theme: next }),
        }).catch(() => {});
      }
    },
    [applyTheme]
  );

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
