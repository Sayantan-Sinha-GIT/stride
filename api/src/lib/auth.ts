import type { Context, Next } from 'hono';
import type { AppVariables, AuthUser, Env } from '../types.js';
import { kvIncrementWithTtl } from './cache.js';
import { verifyAccessJwt } from './crypto.js';
import { queryRows } from './db.js';
import { API_MESSAGES } from './i18n.js';

export type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

export function extractBearerOrCookieToken(c: AppContext): string | null {
  const auth = c.req.header('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)stride_access=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function resolveAuthUser(c: AppContext): Promise<AuthUser | null> {
  const token = extractBearerOrCookieToken(c);
  if (!token) return null;
  const payload = await verifyAccessJwt(token, c.env.JWT_SECRET);
  if (!payload) return null;

  const rows = await queryRows<{
    id: string;
    email: string;
    email_verified: boolean;
    handle: string;
    display_name: string;
    role: 'user' | 'admin';
    is_suspended: boolean;
    weight_kg: number;
    language: 'en' | 'hi';
    units: 'metric' | 'imperial';
    theme: 'light' | 'dark' | 'system';
    session_revoked: TIMESTAMPTZ_OR_NULL;
  }>(
    c.env.DATABASE_URL,
    `SELECT u.id, u.email, u.email_verified, u.handle, u.display_name, u.role, u.is_suspended, u.weight_kg,
            COALESCE(s.language, 'en') AS language,
            COALESCE(s.units, 'metric') AS units,
            COALESCE(s.theme, 'system') AS theme,
            sess.revoked_at AS session_revoked
     FROM users u
     LEFT JOIN user_settings s ON s.user_id = u.id
     LEFT JOIN sessions sess ON sess.id = $2 AND sess.user_id = u.id
     WHERE u.id = $1`,
    [payload.sub, payload.sid]
  );

  const row = rows[0];
  if (!row || row.is_suspended || row.session_revoked) return null;

  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified,
    handle: row.handle,
    displayName: row.display_name,
    role: row.role,
    language: row.language,
    units: row.units,
    theme: row.theme,
    weightKg: Number(row.weight_kg || 70),
    sessionId: payload.sid,
  };
}

type TIMESTAMPTZ_OR_NULL = string | null;

export async function optionalAuth(c: AppContext, next: Next) {
  c.set('user', await resolveAuthUser(c));
  await next();
}

export async function requireAuth(c: AppContext, next: Next) {
  const user = await resolveAuthUser(c);
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: API_MESSAGES.en.unauthorized } }, 401);
  }
  c.set('user', user);
  await next();
}

export async function requireAdmin(c: AppContext, next: Next) {
  const user = await resolveAuthUser(c);
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: API_MESSAGES.en.unauthorized } }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: { code: 'FORBIDDEN', message: API_MESSAGES.en.forbidden } }, 403);
  }
  c.set('user', user);
  await next();
}

export function getClientIpHint(c: AppContext): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

export async function checkRateLimit(
  c: AppContext,
  bucket: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean> {
  const ip = getClientIpHint(c);
  const key = `rl:${bucket}:${ip}`;
  const count = await kvIncrementWithTtl(c.env.STRIDE_KV, key, windowSeconds);
  return count <= maxRequests;
}
