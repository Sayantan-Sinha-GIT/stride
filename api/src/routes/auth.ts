import { Hono } from 'hono';
import { z } from 'zod';
import {
  checkRateLimit,
  getClientIpHint,
  requireAuth,
} from '../lib/auth.js';
import { kvGetJson, kvSetJson } from '../lib/cache.js';
import {
  hashPassword,
  randomSixDigitCode,
  randomTokenHex,
  sha256Hex,
  signAccessJwt,
  verifyPassword,
} from '../lib/crypto.js';
import { queryRows } from '../lib/db.js';
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  sendTransactionalEmail,
} from '../lib/email.js';
import { verifyGoogleIdToken } from '../lib/google.js';
import { API_MESSAGES, pickLang } from '../lib/i18n.js';
import type { AppVariables, Env } from '../types.js';

export const authRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(80),
  handle: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[\p{L}\p{N}_-]+$/u, 'Handle may contain letters, numbers, underscores, and hyphens'),
  language: z.enum(['en', 'hi']).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(128),
  deviceName: z.string().max(80).optional(),
});

function setAuthCookies(
  headers: Headers,
  accessToken: string,
  refreshToken: string,
  isHttps: boolean
) {
  const secureFlag = isHttps ? '; Secure' : '';
  headers.append(
    'Set-Cookie',
    `stride_access=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${secureFlag}`
  );
  headers.append(
    'Set-Cookie',
    `stride_refresh=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secureFlag}`
  );
}

function clearAuthCookies(headers: Headers) {
  headers.append('Set-Cookie', 'stride_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('Set-Cookie', 'stride_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

async function issueSessionTokens(
  env: Env,
  user: { id: string; role: 'user' | 'admin' },
  deviceName: string,
  userAgent: string,
  ipHint: string,
  familyId?: string
) {
  const refreshToken = randomTokenHex(32);
  const refreshHash = await sha256Hex(refreshToken);
  const fam = familyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

  const rows = await queryRows<{ id: string }>(
    env.DATABASE_URL,
    `INSERT INTO sessions (user_id, family_id, refresh_token_hash, device_name, user_agent, ip_hint, expires_at)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::timestamptz)
     RETURNING id`,
    [user.id, fam, refreshHash, deviceName.slice(0, 80), userAgent.slice(0, 200), ipHint, expiresAt]
  );

  const sessionId = rows[0].id;
  const accessToken = await signAccessJwt(
    { sub: user.id, sid: sessionId, role: user.role },
    env.JWT_SECRET,
    900
  );

  return { sessionId, accessToken, refreshToken, expiresIn: 900 };
}

authRouter.post('/signup', async (c) => {
  if (!(await checkRateLimit(c, 'auth:signup', 10, 600))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid input' } }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const handle = parsed.data.handle.trim().toLowerCase();
  const lang = pickLang(parsed.data.language);
  const displayName = parsed.data.displayName.trim();

  const handleConflict = await queryRows<{ id: string }>(
    c.env.DATABASE_URL,
    `SELECT id FROM users WHERE handle = $1 AND email <> $2`,
    [handle, email]
  );
  if (handleConflict.length > 0) {
    return c.json({ error: { code: 'HANDLE_TAKEN', message: 'Handle is already in use.' } }, 409);
  }

  const existingByEmail = await queryRows<{ id: string; email_verified: boolean; display_name: string }>(
    c.env.DATABASE_URL,
    `SELECT id, email_verified, display_name FROM users WHERE email = $1`,
    [email]
  );

  if (existingByEmail[0]) {
    const existingUser = existingByEmail[0];
    if (existingUser.email_verified) {
      return c.json({ ok: true, message: API_MESSAGES[lang].signupAccepted }, 202);
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await queryRows(
      c.env.DATABASE_URL,
      `UPDATE users SET display_name = $2, handle = $3, updated_at = now() WHERE id = $1`,
      [existingUser.id, displayName, handle]
    );
    await queryRows(
      c.env.DATABASE_URL,
      `INSERT INTO auth_identities (user_id, provider, provider_user_id, password_hash)
       VALUES ($1, 'email', $2, $3)
       ON CONFLICT (user_id, provider) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [existingUser.id, email, passwordHash]
    );

    const rawToken = randomTokenHex(24);
    const tokenHash = await sha256Hex(rawToken);
    const code6 = randomSixDigitCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await queryRows(
      c.env.DATABASE_URL,
      `INSERT INTO email_tokens (user_id, email, purpose, token_hash, code_6, expires_at)
       VALUES ($1, $2, 'verify_email', $3, $4, $5::timestamptz)`,
      [existingUser.id, email, tokenHash, code6, expiresAt]
    );

    const origin = c.env.APP_ORIGIN || 'http://localhost:3000';
    const verifyUrl = `${origin}/${lang}/login?verifyToken=${rawToken}`;
    const msg = buildVerificationEmail(lang, displayName, code6, verifyUrl);
    const emailRes = await sendTransactionalEmail(c.env, {
      toEmail: email,
      toName: displayName,
      ...msg,
    });
    if (emailRes.mode === 'cap_exceeded') {
      return c.json({ error: { code: 'EMAIL_CAP_EXCEEDED', message: API_MESSAGES[lang].emailDailyCapHit } }, 503);
    }
    if (emailRes.mode === 'error') {
      console.error('[Stride Brevo Signup Error]', emailRes.detail);
      return c.json(
        {
          error: {
            code: 'EMAIL_DELIVERY_FAILED',
            message: 'Unable to send verification email. Please verify your email address or try again.',
          },
        },
        502
      );
    }
    return c.json({ ok: true, message: API_MESSAGES[lang].signupAccepted }, 200);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await queryRows<{ id: string }>(
    c.env.DATABASE_URL,
    `INSERT INTO users (email, email_verified, handle, display_name)
     VALUES ($1, false, $2, $3)
     RETURNING id`,
    [email, handle, displayName]
  );
  const userId = created[0].id;

  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO auth_identities (user_id, provider, provider_user_id, password_hash)
     VALUES ($1, 'email', $2, $3)`,
    [userId, email, passwordHash]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO user_settings (user_id, language, default_visibility) VALUES ($1, $2, 'followers') ON CONFLICT DO NOTHING`,
    [userId, lang]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [userId]
  );

  const rawToken = randomTokenHex(24);
  const tokenHash = await sha256Hex(rawToken);
  const code6 = randomSixDigitCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO email_tokens (user_id, email, purpose, token_hash, code_6, expires_at)
     VALUES ($1, $2, 'verify_email', $3, $4, $5::timestamptz)`,
    [userId, email, tokenHash, code6, expiresAt]
  );

  const origin = c.env.APP_ORIGIN || 'http://localhost:3000';
  const verifyUrl = `${origin}/${lang}/login?verifyToken=${rawToken}`;
  const msg = buildVerificationEmail(lang, displayName, code6, verifyUrl);
  const emailRes = await sendTransactionalEmail(c.env, {
    toEmail: email,
    toName: displayName,
    ...msg,
  });

  if (emailRes.mode === 'cap_exceeded') {
    return c.json({ error: { code: 'EMAIL_CAP_EXCEEDED', message: API_MESSAGES[lang].emailDailyCapHit } }, 503);
  }
  if (emailRes.mode === 'error') {
    console.error('[Stride Brevo Signup Error]', emailRes.detail);
    return c.json(
      {
        error: {
          code: 'EMAIL_DELIVERY_FAILED',
          message: 'Unable to send verification email. Please verify your email address or try again.',
        },
      },
      502
    );
  }

  return c.json({ ok: true, message: API_MESSAGES[lang].signupAccepted }, 201);
});

authRouter.post('/verify-email', async (c) => {
  if (!(await checkRateLimit(c, 'auth:verify', 15, 600))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const body = (await c.req.json().catch(() => null)) as { email?: string; code?: string; token?: string } | null;
  if (!body || (!body.token && (!body.email || !body.code))) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Provide token or email and 6-digit code.' } }, 400);
  }

  let row: { id: string; user_id: string } | undefined;
  if (body.token) {
    const tokenHash = await sha256Hex(body.token);
    const rows = await queryRows<{ id: string; user_id: string }>(
      c.env.DATABASE_URL,
      `SELECT id, user_id FROM email_tokens
       WHERE purpose = 'verify_email' AND token_hash = $1 AND consumed_at IS NULL AND expires_at > now()`,
      [tokenHash]
    );
    row = rows[0];
  } else {
    const rows = await queryRows<{ id: string; user_id: string }>(
      c.env.DATABASE_URL,
      `SELECT id, user_id FROM email_tokens
       WHERE purpose = 'verify_email' AND email = $1 AND code_6 = $2 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [body.email!.trim().toLowerCase(), body.code!.trim()]
    );
    row = rows[0];
  }

  if (!row) {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Verification code is invalid or expired.' } }, 400);
  }

  await queryRows(c.env.DATABASE_URL, `UPDATE email_tokens SET consumed_at = now() WHERE id = $1`, [row.id]);
  await queryRows(c.env.DATABASE_URL, `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`, [row.user_id]);

  return c.json({ ok: true, verified: true });
});

authRouter.post('/resend-verification', async (c) => {
  if (!(await checkRateLimit(c, 'auth:resend', 5, 600))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const body = (await c.req.json().catch(() => null)) as { email?: string; language?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const lang = pickLang(body?.language);
  if (!email) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Email is required.' } }, 400);
  }

  const users = await queryRows<{ id: string; display_name: string; email_verified: boolean }>(
    c.env.DATABASE_URL,
    `SELECT id, display_name, email_verified FROM users WHERE email = $1`,
    [email]
  );
  if (users[0] && !users[0].email_verified) {
    const rawToken = randomTokenHex(24);
    const tokenHash = await sha256Hex(rawToken);
    const code6 = randomSixDigitCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await queryRows(
      c.env.DATABASE_URL,
      `INSERT INTO email_tokens (user_id, email, purpose, token_hash, code_6, expires_at)
       VALUES ($1, $2, 'verify_email', $3, $4, $5::timestamptz)`,
      [users[0].id, email, tokenHash, code6, expiresAt]
    );
    const origin = c.env.APP_ORIGIN || 'http://localhost:3000';
    const msg = buildVerificationEmail(lang, users[0].display_name, code6, `${origin}/${lang}/login?verifyToken=${rawToken}`);
    const emailRes = await sendTransactionalEmail(c.env, { toEmail: email, toName: users[0].display_name, ...msg });
    if (emailRes.mode === 'cap_exceeded') {
      return c.json({ error: { code: 'EMAIL_CAP_EXCEEDED', message: API_MESSAGES[lang].emailDailyCapHit } }, 503);
    }
    if (emailRes.mode === 'error') {
      console.error('[Stride Brevo Resend Error]', emailRes.detail);
      return c.json(
        { error: { code: 'EMAIL_DELIVERY_FAILED', message: 'Unable to send verification email right now.' } },
        502
      );
    }
  }
  return c.json({ ok: true, message: API_MESSAGES[lang].signupAccepted });
});

authRouter.post('/login', async (c) => {
  if (!(await checkRateLimit(c, 'auth:login', 15, 300))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Valid email and password are required.' } }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const rows = await queryRows<{
    id: string;
    email: string;
    email_verified: boolean;
    handle: string;
    display_name: string;
    role: 'user' | 'admin';
    is_suspended: boolean;
    password_hash: string | null;
    language: 'en' | 'hi';
    units: 'metric' | 'imperial';
    theme: 'light' | 'dark' | 'system';
  }>(
    c.env.DATABASE_URL,
    `SELECT u.id, u.email, u.email_verified, u.handle, u.display_name, u.role, u.is_suspended,
            ai.password_hash,
            COALESCE(s.language, 'en') AS language,
            COALESCE(s.units, 'metric') AS units,
            COALESCE(s.theme, 'system') AS theme
     FROM users u
     JOIN auth_identities ai ON ai.user_id = u.id AND ai.provider = 'email'
     LEFT JOIN user_settings s ON s.user_id = u.id
     WHERE u.email = $1`,
    [email]
  );

  const user = rows[0];
  if (!user || !user.password_hash) {
    return c.json({ error: { code: 'INVALID_CREDENTIALS', message: API_MESSAGES.en.invalidCredentials } }, 401);
  }

  const ok = await verifyPassword(parsed.data.password, user.password_hash);
  if (!ok) {
    return c.json({ error: { code: 'INVALID_CREDENTIALS', message: API_MESSAGES[user.language].invalidCredentials } }, 401);
  }

  if (user.is_suspended) {
    return c.json({ error: { code: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended.' } }, 403);
  }

  if (!user.email_verified) {
    return c.json({ error: { code: 'EMAIL_NOT_VERIFIED', message: API_MESSAGES[user.language].emailUnverified } }, 403);
  }

  const ua = c.req.header('User-Agent') || '';
  const tokens = await issueSessionTokens(
    c.env,
    { id: user.id, role: user.role },
    parsed.data.deviceName || 'Web Browser',
    ua,
    getClientIpHint(c)
  );

  const isHttps = c.req.url.startsWith('https://');
  const headers = new Headers({ 'Content-Type': 'application/json' });
  setAuthCookies(headers, tokens.accessToken, tokens.refreshToken, isHttps);

  return new Response(
    JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        handle: user.handle,
        displayName: user.display_name,
        role: user.role,
        language: user.language,
        units: user.units,
        theme: user.theme,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      sessionId: tokens.sessionId,
    }),
    {
      status: 200,
      headers,
    }
  );
});

authRouter.post('/refresh', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { refreshToken?: string };
  const cookie = c.req.header('Cookie') || '';
  const cookieMatch = cookie.match(/(?:^|;\s*)stride_refresh=([^;]+)/);
  const rawRefresh = body.refreshToken || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : null);

  if (!rawRefresh) {
    return c.json({ error: { code: 'MISSING_REFRESH', message: 'Refresh token required.' } }, 401);
  }

  const hash = await sha256Hex(rawRefresh);
  const sessions = await queryRows<{
    id: string;
    user_id: string;
    family_id: string;
    device_name: string;
    revoked_at: string | null;
    expires_at: string;
    role: 'user' | 'admin';
  }>(
    c.env.DATABASE_URL,
    `SELECT s.id, s.user_id, s.family_id, s.device_name, s.revoked_at, s.expires_at, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.refresh_token_hash = $1`,
    [hash]
  );

  const sess = sessions[0];
  if (!sess) {
    return c.json({ error: { code: 'INVALID_REFRESH', message: 'Invalid refresh token.' } }, 401);
  }

  // Refresh token reuse detection: revoke the entire session family!
  if (sess.revoked_at) {
    await queryRows(
      c.env.DATABASE_URL,
      `UPDATE sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`,
      [sess.family_id]
    );
    const respHeaders = new Headers({ 'Content-Type': 'application/json' });
    clearAuthCookies(respHeaders);
    return new Response(
      JSON.stringify({ error: { code: 'TOKEN_REUSE_DETECTED', message: 'Session revoked for security.' } }),
      { status: 401, headers: respHeaders }
    );
  }

  if (Date.parse(sess.expires_at) <= Date.now()) {
    return c.json({ error: { code: 'EXPIRED_REFRESH', message: 'Session expired. Please log in again.' } }, 401);
  }

  await queryRows(c.env.DATABASE_URL, `UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sess.id]);

  const next = await issueSessionTokens(
    c.env,
    { id: sess.user_id, role: sess.role },
    sess.device_name,
    c.req.header('User-Agent') || '',
    getClientIpHint(c),
    sess.family_id
  );

  const resHeaders = new Headers({ 'Content-Type': 'application/json' });
  setAuthCookies(resHeaders, next.accessToken, next.refreshToken, c.req.url.startsWith('https://'));

  return new Response(
    JSON.stringify({
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresIn: next.expiresIn,
      sessionId: next.sessionId,
    }),
    { status: 200, headers: resHeaders }
  );
});

authRouter.post('/logout', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { refreshToken?: string };
  const cookie = c.req.header('Cookie') || '';
  const cookieMatch = cookie.match(/(?:^|;\s*)stride_refresh=([^;]+)/);
  const rawRefresh = body.refreshToken || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : null);

  if (rawRefresh) {
    const hash = await sha256Hex(rawRefresh);
    await queryRows(c.env.DATABASE_URL, `UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1`, [hash]);
  }
  const headers = new Headers({ 'Content-Type': 'application/json' });
  clearAuthCookies(headers);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
});

authRouter.post('/forgot-password', async (c) => {
  if (!(await checkRateLimit(c, 'auth:forgot', 8, 600))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const body = (await c.req.json().catch(() => null)) as { email?: string; language?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const lang = pickLang(body?.language);
  if (!email) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Email is required.' } }, 400);
  }

  const users = await queryRows<{ id: string; display_name: string }>(
    c.env.DATABASE_URL,
    `SELECT id, display_name FROM users WHERE email = $1`,
    [email]
  );

  if (users[0]) {
    const rawToken = randomTokenHex(24);
    const tokenHash = await sha256Hex(rawToken);
    const code6 = randomSixDigitCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await queryRows(
      c.env.DATABASE_URL,
      `INSERT INTO email_tokens (user_id, email, purpose, token_hash, code_6, expires_at)
       VALUES ($1, $2, 'reset_password', $3, $4, $5::timestamptz)`,
      [users[0].id, email, tokenHash, code6, expiresAt]
    );

    const origin = c.env.APP_ORIGIN || 'http://localhost:3000';
    const msg = buildPasswordResetEmail(
      lang,
      users[0].display_name,
      code6,
      `${origin}/${lang}/reset-password?token=${rawToken}`
    );
    const emailRes = await sendTransactionalEmail(c.env, { toEmail: email, toName: users[0].display_name, ...msg });
    if (emailRes.mode === 'cap_exceeded') {
      return c.json({ error: { code: 'EMAIL_CAP_EXCEEDED', message: API_MESSAGES[lang].emailDailyCapHit } }, 503);
    }
    if (emailRes.mode === 'error') {
      console.error('[Stride Brevo Reset Error]', emailRes.detail);
    }
  }

  return c.json({ ok: true, message: API_MESSAGES[lang].resetAccepted });
});

authRouter.post('/reset-password', async (c) => {
  if (!(await checkRateLimit(c, 'auth:reset', 10, 600))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const body = (await c.req.json().catch(() => null)) as {
    email?: string;
    code?: string;
    token?: string;
    newPassword?: string;
  } | null;

  if (!body || !body.newPassword || body.newPassword.length < 8) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters.' } }, 400);
  }

  let row: { id: string; user_id: string; email: string } | undefined;
  if (body.token) {
    const hash = await sha256Hex(body.token);
    const rows = await queryRows<{ id: string; user_id: string; email: string }>(
      c.env.DATABASE_URL,
      `SELECT id, user_id, email FROM email_tokens
       WHERE purpose = 'reset_password' AND token_hash = $1 AND consumed_at IS NULL AND expires_at > now()`,
      [hash]
    );
    row = rows[0];
  } else if (body.email && body.code) {
    const rows = await queryRows<{ id: string; user_id: string; email: string }>(
      c.env.DATABASE_URL,
      `SELECT id, user_id, email FROM email_tokens
       WHERE purpose = 'reset_password' AND email = $1 AND code_6 = $2 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [body.email.trim().toLowerCase(), body.code.trim()]
    );
    row = rows[0];
  }

  if (!row) {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Reset token or code is invalid or expired.' } }, 400);
  }

  const newHash = await hashPassword(body.newPassword);
  await queryRows(c.env.DATABASE_URL, `UPDATE email_tokens SET consumed_at = now() WHERE id = $1`, [row.id]);
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO auth_identities (user_id, provider, provider_user_id, password_hash)
     VALUES ($1, 'email', $2, $3)
     ON CONFLICT (user_id, provider) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [row.user_id, row.email, newHash]
  );
  await queryRows(c.env.DATABASE_URL, `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`, [row.user_id]);
  await queryRows(c.env.DATABASE_URL, `UPDATE sessions SET revoked_at = now() WHERE user_id = $1`, [row.user_id]);

  return c.json({ ok: true });
});

authRouter.post('/change-password', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as { currentPassword?: string; newPassword?: string } | null;
  if (!body?.newPassword || body.newPassword.length < 8) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters.' } }, 400);
  }
  const existing = await queryRows<{ password_hash: string | null }>(
    c.env.DATABASE_URL,
    `SELECT password_hash FROM auth_identities WHERE user_id = $1 AND provider = 'email'`,
    [user.id]
  );
  if (existing[0]?.password_hash) {
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, existing[0].password_hash))) {
      return c.json({ error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect.' } }, 401);
    }
  }
  const newHash = await hashPassword(body.newPassword);
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO auth_identities (user_id, provider, provider_user_id, password_hash)
     VALUES ($1, 'email', $2, $3)
     ON CONFLICT (user_id, provider) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [user.id, user.email, newHash]
  );
  return c.json({ ok: true });
});

async function linkOrCreateGoogleUser(
  env: Env,
  claims: { sub: string; email: string; emailVerified: boolean; name: string; picture?: string }
) {
  if (!claims.emailVerified) {
    throw new Error('Google account email must be verified');
  }

  // 1. Existing Google identity?
  const byGoogle = await queryRows<{ user_id: string; role: 'user' | 'admin' }>(
    env.DATABASE_URL,
    `SELECT u.id AS user_id, u.role
     FROM auth_identities ai
     JOIN users u ON u.id = ai.user_id
     WHERE ai.provider = 'google' AND ai.provider_user_id = $1`,
    [claims.sub]
  );
  if (byGoogle[0]) return byGoogle[0];

  // 2. Existing user with verified email? Link cleanly per PRD §7!
  const byEmail = await queryRows<{ id: string; email_verified: boolean; role: 'user' | 'admin' }>(
    env.DATABASE_URL,
    `SELECT id, email_verified, role FROM users WHERE email = $1`,
    [claims.email]
  );
  if (byEmail[0]) {
    if (!byEmail[0].email_verified) {
      throw new Error('Existing account email is unverified; verify email first before linking Google login.');
    }
    await queryRows(
      env.DATABASE_URL,
      `INSERT INTO auth_identities (user_id, provider, provider_user_id)
       VALUES ($1, 'google', $2) ON CONFLICT DO NOTHING`,
      [byEmail[0].id, claims.sub]
    );
    return { user_id: byEmail[0].id, role: byEmail[0].role };
  }

  // 3. Create new Google user
  const baseHandle = claims.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18) || 'athlete';
  const suffix = Math.floor(100 + Math.random() * 900);
  const handle = `${baseHandle}_${suffix}`.toLowerCase();

  const created = await queryRows<{ id: string; role: 'user' | 'admin' }>(
    env.DATABASE_URL,
    `INSERT INTO users (email, email_verified, handle, display_name, avatar_url)
     VALUES ($1, true, $2, $3, $4)
     RETURNING id, role`,
    [claims.email, handle, claims.name, claims.picture ?? null]
  );
  await queryRows(
    env.DATABASE_URL,
    `INSERT INTO auth_identities (user_id, provider, provider_user_id) VALUES ($1, 'google', $2)`,
    [created[0].id, claims.sub]
  );
  await queryRows(
    env.DATABASE_URL,
    `INSERT INTO user_settings (user_id, default_visibility) VALUES ($1, 'followers') ON CONFLICT DO NOTHING`,
    [created[0].id]
  );
  await queryRows(
    env.DATABASE_URL,
    `INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [created[0].id]
  );
  return { user_id: created[0].id, role: created[0].role };
}

authRouter.get('/google/config', (c) => {
  return c.json({
    enabled: Boolean(c.env.GOOGLE_CLIENT_ID),
    webClientId: c.env.GOOGLE_CLIENT_ID || null,
  });
});

authRouter.get('/google/start', (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json(
      {
        error: {
          code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
          message: 'Google OAuth credentials are not configured yet.',
        },
      },
      501
    );
  }
  const locale = pickLang(c.req.query('lang'));
  const apiOrigin = c.env.API_ORIGIN || 'http://127.0.0.1:8787';
  const redirectUri = `${apiOrigin}/v1/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: locale,
    prompt: 'select_account',
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

authRouter.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const locale = pickLang(c.req.query('state'));
  const appOrigin = c.env.APP_ORIGIN || 'http://localhost:3000';
  if (!code || !c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.redirect(`${appOrigin}/${locale}/login?error=google_oauth_unavailable`);
  }

  const apiOrigin = c.env.API_ORIGIN || 'http://127.0.0.1:8787';
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${apiOrigin}/v1/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    return c.redirect(`${appOrigin}/${locale}/login?error=google_exchange_failed`);
  }
  const tokenData = (await tokenRes.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    return c.redirect(`${appOrigin}/${locale}/login?error=missing_id_token`);
  }

  try {
    const claims = await verifyGoogleIdToken(tokenData.id_token, c.env);
    const linked = await linkOrCreateGoogleUser(c.env, claims);
    const tokens = await issueSessionTokens(
      c.env,
      { id: linked.user_id, role: linked.role },
      'Web Google Sign-In',
      c.req.header('User-Agent') || '',
      getClientIpHint(c)
    );
    const oauthCode = randomTokenHex(24);
    await kvSetJson(
      c.env.STRIDE_KV,
      `oauth:handoff:${oauthCode}`,
      { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      120
    );
    const headers = new Headers({ Location: `${appOrigin}/${locale}/login?oauthCode=${oauthCode}` });
    setAuthCookies(headers, tokens.accessToken, tokens.refreshToken, c.req.url.startsWith('https://'));
    return new Response(null, { status: 302, headers });
  } catch {
    return c.redirect(`${appOrigin}/${locale}/login?error=google_verification_failed`);
  }
});

authRouter.post('/oauth-exchange', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim();
  if (!code || code.length < 16) {
    return c.json({ error: { code: 'INVALID_OAUTH_CODE', message: 'Invalid or expired sign-in handoff code.' } }, 400);
  }
  const key = `oauth:handoff:${code}`;
  const tokens = await kvGetJson<{ accessToken: string; refreshToken: string }>(c.env.STRIDE_KV, key);
  if (!tokens?.accessToken || !tokens?.refreshToken) {
    return c.json({ error: { code: 'INVALID_OAUTH_CODE', message: 'Sign-in handoff expired or already used.' } }, 400);
  }
  await c.env.STRIDE_KV?.delete(key);
  return c.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }, 200);
});

authRouter.post('/google/token', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { idToken?: string; deviceName?: string } | null;
  if (!body?.idToken) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Google idToken is required.' } }, 400);
  }
  try {
    const claims = await verifyGoogleIdToken(body.idToken, c.env);
    const linked = await linkOrCreateGoogleUser(c.env, claims);
    const tokens = await issueSessionTokens(
      c.env,
      { id: linked.user_id, role: linked.role },
      body.deviceName || 'Flutter Mobile App',
      c.req.header('User-Agent') || '',
      getClientIpHint(c)
    );
    return c.json(tokens, 200);
  } catch (err) {
    return c.json(
      {
        error: {
          code: 'GOOGLE_TOKEN_INVALID',
          message: err instanceof Error ? err.message : 'Google token verification failed',
        },
      },
      401
    );
  }
});

authRouter.get('/sessions', requireAuth, async (c) => {
  const user = c.get('user')!;
  const rows = await queryRows<{
    id: string;
    device_name: string;
    ip_hint: string;
    last_seen_at: string;
    created_at: string;
    expires_at: string;
    revoked_at: string | null;
  }>(
    c.env.DATABASE_URL,
    `SELECT id, device_name, ip_hint, last_seen_at, created_at, expires_at, revoked_at
     FROM sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY last_seen_at DESC`,
    [user.id]
  );

  return c.json({
    sessions: rows.map((r) => ({
      id: r.id,
      deviceName: r.device_name,
      ipHint: r.ip_hint,
      lastSeenAt: r.last_seen_at,
      createdAt: r.created_at,
      isCurrent: r.id === user.sessionId,
    })),
  });
});

authRouter.delete('/sessions/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  );
  return c.json({ ok: true });
});
