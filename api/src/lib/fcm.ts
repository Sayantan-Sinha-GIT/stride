import type { Env } from '../types.js';
import { queryRows } from './db.js';
import { API_MESSAGES, pickLang } from './i18n.js';

function pemToPkcs8Bytes(pem: string): Uint8Array {
  const clean = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getFcmAccessToken(env: Env): Promise<string | null> {
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = toBase64Url(
    JSON.stringify({
      iss: env.FCM_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8Bytes(env.FCM_PRIVATE_KEY) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${toBase64Url(new Uint8Array(sig))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) return null;
  const data = (await tokenRes.json()) as { access_token?: string };
  return data.access_token ?? null;
}

function isInQuietHours(startHour: number, endHour: number): boolean {
  const istHour = (new Date().getUTCHours() + 5) % 24;
  if (startHour === endHour) return false;
  if (startHour < endHour) return istHour >= startHour && istHour < endHour;
  return istHour >= startHour || istHour < endHour;
}

export async function dispatchNotification(
  env: Env,
  input: {
    userId: string;
    actorId?: string | null;
    kind: 'kudos' | 'comments' | 'follows' | 'segments_pr' | 'challenges' | 'goals' | 'clubs';
    targetType?: string;
    targetId?: string;
    batchKey?: string;
    title: string;
    body: string;
  }
): Promise<void> {
  // Persist in-app notification with batching when batchKey is provided (e.g. kudos on same activity)
  if (input.batchKey) {
    const existing = await queryRows<{ id: string; batch_count: number }>(
      env.DATABASE_URL,
      `SELECT id, batch_count FROM notifications
       WHERE user_id = $1 AND batch_key = $2 AND read_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [input.userId, input.batchKey]
    );
    if (existing[0]) {
      const nextCount = Number(existing[0].batch_count) + 1;
      await queryRows(
        env.DATABASE_URL,
        `UPDATE notifications
         SET batch_count = $1, title = $2, body = $3, actor_id = $4, created_at = now()
         WHERE id = $5`,
        [nextCount, input.title, input.body, input.actorId ?? null, existing[0].id]
      );
    } else {
      await queryRows(
        env.DATABASE_URL,
        `INSERT INTO notifications (user_id, kind, actor_id, target_type, target_id, title, body, batch_key, batch_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
        [
          input.userId,
          input.kind,
          input.actorId ?? null,
          input.targetType ?? null,
          input.targetId ?? null,
          input.title,
          input.body,
          input.batchKey,
        ]
      );
    }
  } else {
    await queryRows(
      env.DATABASE_URL,
      `INSERT INTO notifications (user_id, kind, actor_id, target_type, target_id, title, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.userId,
        input.kind,
        input.actorId ?? null,
        input.targetType ?? null,
        input.targetId ?? null,
        input.title,
        input.body,
      ]
    );
  }

  // Check notification preferences & quiet hours before sending FCM push
  const prefs = await queryRows<Record<string, unknown>>(
    env.DATABASE_URL,
    `SELECT * FROM notification_preferences WHERE user_id = $1`,
    [input.userId]
  );
  const p = prefs[0];
  if (p) {
    if (p[input.kind] === false) return;
    if (p.quiet_hours_enabled && isInQuietHours(Number(p.quiet_start_hour), Number(p.quiet_end_hour))) {
      return;
    }
  }

  const tokens = await queryRows<{ id: string; fcm_token: string }>(
    env.DATABASE_URL,
    `SELECT id, fcm_token FROM devices WHERE user_id = $1`,
    [input.userId]
  );
  if (tokens.length === 0) return;

  const accessToken = await getFcmAccessToken(env);
  if (!accessToken) return;

  for (const device of tokens) {
    try {
      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: device.fcm_token,
              notification: {
                title: input.title,
                body: input.body,
              },
              data: {
                kind: input.kind,
                targetType: input.targetType ?? '',
                targetId: input.targetId ?? '',
              },
            },
          }),
        }
      );

      // Clean up invalid / unregistered tokens automatically
      if (fcmRes.status === 404 || fcmRes.status === 400) {
        const errBody = await fcmRes.text();
        if (errBody.includes('UNREGISTERED') || errBody.includes('INVALID_ARGUMENT')) {
          await queryRows(env.DATABASE_URL, `DELETE FROM devices WHERE id = $1`, [device.id]);
        }
      }
    } catch {
      // Non-fatal push error
    }
  }
}

export async function getUserNotificationCopy(
  databaseUrl: string,
  userId: string
): Promise<(typeof API_MESSAGES)['en'] | (typeof API_MESSAGES)['hi']> {
  const rows = await queryRows<{ language: string }>(
    databaseUrl,
    `SELECT language FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  return API_MESSAGES[pickLang(rows[0]?.language)];
}
