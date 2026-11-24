export function getClientApiBase(): string {
  if (typeof window === 'undefined') {
    return process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787';
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787';
}

const TOKEN_STORAGE_KEY = 'stride_access_token';
const REFRESH_STORAGE_KEY = 'stride_refresh_token';

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function saveAuthTokens(accessToken: string, refreshToken?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_STORAGE_KEY, refreshToken);
  document.cookie = `stride_access=${encodeURIComponent(accessToken)}; Path=/; SameSite=Lax; Max-Age=900`;
}

export function clearAuthTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_STORAGE_KEY);
  document.cookie = 'stride_access=; Path=/; SameSite=Lax; Max-Age=0';
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { accessToken?: string | null; skipAuthRefresh?: boolean } = {}
): Promise<T> {
  const base = getClientApiBase();
  const headers = new Headers(options.headers || {});
  const token = options.accessToken ?? getStoredAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res = await fetch(`${base}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !options.skipAuthRefresh && typeof window !== 'undefined') {
    const refresh = localStorage.getItem(REFRESH_STORAGE_KEY);
    if (refresh) {
      const refRes = await fetch(`${base}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (refRes.ok) {
        const refData = (await refRes.json()) as { accessToken: string; refreshToken: string };
        saveAuthTokens(refData.accessToken, refData.refreshToken);
        headers.set('Authorization', `Bearer ${refData.accessToken}`);
        res = await fetch(`${base}${path}`, { ...options, headers, credentials: 'include' });
      } else {
        clearAuthTokens();
      }
    }
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const errObj = data as { error?: { message?: string; code?: string }; message?: string };
    const msg = errObj?.error?.message || errObj?.message || `Request failed (${res.status})`;
    const err = new Error(msg) as Error & { code?: string; status?: number; payload?: unknown };
    err.code = errObj?.error?.code;
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data as T;
}
