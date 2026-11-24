import { serializeGpx, type ActivityType, type FilteredTrackPoint } from '@stride/track-engine';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { queryRows } from '../lib/db.js';
import type { AppVariables, Env } from '../types.js';

export const meRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

meRouter.use('*', requireAuth);

meRouter.get('/', async (c) => {
  const user = c.get('user')!;
  const [profileRows, settingsRows, providersRows, unreadRows] = await Promise.all([
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT id, email, email_verified, handle, display_name, bio, avatar_url, home_city, weight_kg, role, created_at
       FROM users WHERE id = $1`,
      [user.id]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT theme, language, units, default_visibility, hide_start_end_meters, is_private_account, weekly_email_digest
       FROM user_settings WHERE user_id = $1`,
      [user.id]
    ),
    queryRows<{ provider: string }>(
      c.env.DATABASE_URL,
      `SELECT provider FROM auth_identities WHERE user_id = $1`,
      [user.id]
    ),
    queryRows<{ cnt: number }>(
      c.env.DATABASE_URL,
      `SELECT COUNT(*)::int AS cnt FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [user.id]
    ),
  ]);

  const p = profileRows[0];
  const s = settingsRows[0] || {};
  return c.json({
    user: {
      id: p.id,
      email: p.email,
      emailVerified: p.email_verified,
      handle: p.handle,
      displayName: p.display_name,
      bio: p.bio,
      avatarUrl: p.avatar_url,
      homeCity: p.home_city,
      weightKg: Number(p.weight_kg || 70),
      role: p.role,
      createdAt: p.created_at,
    },
    settings: {
      theme: s.theme || 'system',
      language: s.language || 'en',
      units: s.units || 'metric',
      defaultVisibility: s.default_visibility || 'followers',
      hideStartEndMeters: Number(s.hide_start_end_meters || 0),
      isPrivateAccount: Boolean(s.is_private_account),
      weeklyEmailDigest: Boolean(s.weekly_email_digest),
    },
    providers: providersRows.map((r) => r.provider),
    unreadNotifications: Number(unreadRows[0]?.cnt ?? 0),
  });
});

const profilePatchSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  handle: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[\p{L}\p{N}_-]+$/u)
    .optional(),
  bio: z.string().max(400).optional(),
  homeCity: z.string().max(80).optional(),
  weightKg: z.number().min(25).max(250).optional(),
  avatarUrl: z.string().url().max(300).nullable().optional(),
});

meRouter.patch('/profile', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid profile fields' } }, 400);
  }
  const d = parsed.data;
  if (d.handle) {
    const taken = await queryRows<{ id: string }>(
      c.env.DATABASE_URL,
      `SELECT id FROM users WHERE handle = $1 AND id <> $2`,
      [d.handle.toLowerCase(), user.id]
    );
    if (taken.length > 0) {
      return c.json({ error: { code: 'HANDLE_TAKEN', message: 'Handle is already taken.' } }, 409);
    }
  }

  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE users SET
       display_name = COALESCE($2, display_name),
       handle = COALESCE($3, handle),
       bio = COALESCE($4, bio),
       home_city = COALESCE($5, home_city),
       weight_kg = COALESCE($6, weight_kg),
       avatar_url = CASE WHEN $7::text IS NOT NULL THEN $7 ELSE avatar_url END,
       updated_at = now()
     WHERE id = $1`,
    [
      user.id,
      d.displayName?.trim() ?? null,
      d.handle?.trim().toLowerCase() ?? null,
      d.bio ?? null,
      d.homeCity ?? null,
      d.weightKg ?? null,
      d.avatarUrl ?? null,
    ]
  );

  return c.json({ ok: true });
});

const settingsPatchSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.enum(['en', 'hi']).optional(),
  units: z.enum(['metric', 'imperial']).optional(),
  defaultVisibility: z.enum(['public', 'followers', 'private']).optional(),
  hideStartEndMeters: z.number().int().min(0).max(2000).optional(),
  isPrivateAccount: z.boolean().optional(),
  weeklyEmailDigest: z.boolean().optional(),
});

meRouter.patch('/settings', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid settings payload' } }, 400);
  }
  const d = parsed.data;
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO user_settings (user_id, theme, language, units, default_visibility, hide_start_end_meters, is_private_account, weekly_email_digest)
     VALUES ($1, COALESCE($2, 'system'), COALESCE($3, 'en'), COALESCE($4, 'metric'), COALESCE($5, 'followers'), COALESCE($6, 0), COALESCE($7, false), COALESCE($8, false))
     ON CONFLICT (user_id) DO UPDATE SET
       theme = COALESCE($2, user_settings.theme),
       language = COALESCE($3, user_settings.language),
       units = COALESCE($4, user_settings.units),
       default_visibility = COALESCE($5, user_settings.default_visibility),
       hide_start_end_meters = COALESCE($6, user_settings.hide_start_end_meters),
       is_private_account = COALESCE($7, user_settings.is_private_account),
       weekly_email_digest = COALESCE($8, user_settings.weekly_email_digest),
       updated_at = now()`,
    [
      user.id,
      d.theme ?? null,
      d.language ?? null,
      d.units ?? null,
      d.defaultVisibility ?? null,
      d.hideStartEndMeters ?? null,
      d.isPrivateAccount ?? null,
      d.weeklyEmailDigest ?? null,
    ]
  );

  return c.json({ ok: true });
});

meRouter.get('/privacy-zones', async (c) => {
  const user = c.get('user')!;
  const rows = await queryRows<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    radius_meters: number;
    created_at: string;
  }>(
    c.env.DATABASE_URL,
    `SELECT id, name, lat, lng, radius_meters, created_at FROM privacy_zones WHERE user_id = $1 ORDER BY created_at DESC`,
    [user.id]
  );
  return c.json({
    privacyZones: rows.map((r) => ({
      id: r.id,
      name: r.name,
      lat: Number(r.lat),
      lng: Number(r.lng),
      radiusMeters: Number(r.radius_meters),
      createdAt: r.created_at,
    })),
  });
});

const zoneSchema = z.object({
  name: z.string().min(1).max(60),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(100).max(5000),
});

meRouter.post('/privacy-zones', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = zoneSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid privacy zone' } }, 400);
  }
  const d = parsed.data;
  const rows = await queryRows<{ id: string }>(
    c.env.DATABASE_URL,
    `INSERT INTO privacy_zones (user_id, name, lat, lng, radius_meters, center_geog)
     VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography)
     RETURNING id`,
    [user.id, d.name.trim(), d.lat, d.lng, d.radiusMeters]
  );
  return c.json({ id: rows[0].id, ...d }, 201);
});

meRouter.delete('/privacy-zones/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await queryRows(c.env.DATABASE_URL, `DELETE FROM privacy_zones WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return c.json({ ok: true });
});

meRouter.get('/notifications', async (c) => {
  const user = c.get('user')!;
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT n.id, n.kind, n.target_type, n.target_id, n.title, n.body, n.batch_count, n.read_at, n.created_at,
            u.handle AS actor_handle, u.display_name AS actor_name
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [user.id]
  );
  return c.json({ notifications: rows });
});

meRouter.post('/notifications/read-all', async (c) => {
  const user = c.get('user')!;
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [user.id]
  );
  return c.json({ ok: true });
});

meRouter.get('/notifications/preferences', async (c) => {
  const user = c.get('user')!;
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT kudos, comments, follows, segments_pr, challenges, goals, clubs, weekly_digest,
            quiet_hours_enabled, quiet_start_hour, quiet_end_hour
     FROM notification_preferences WHERE user_id = $1`,
    [user.id]
  );
  return c.json({ preferences: rows[0] || {} });
});

const notifPrefsSchema = z.object({
  kudos: z.boolean().optional(),
  comments: z.boolean().optional(),
  follows: z.boolean().optional(),
  segments_pr: z.boolean().optional(),
  challenges: z.boolean().optional(),
  goals: z.boolean().optional(),
  clubs: z.boolean().optional(),
  weekly_digest: z.boolean().optional(),
  quiet_hours_enabled: z.boolean().optional(),
  quiet_start_hour: z.number().int().min(0).max(23).optional(),
  quiet_end_hour: z.number().int().min(0).max(23).optional(),
});

meRouter.patch('/notifications/preferences', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = notifPrefsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid notification preferences' } }, 400);
  }
  const d = parsed.data;
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [user.id]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE notification_preferences SET
       kudos = COALESCE($2, kudos),
       comments = COALESCE($3, comments),
       follows = COALESCE($4, follows),
       segments_pr = COALESCE($5, segments_pr),
       challenges = COALESCE($6, challenges),
       goals = COALESCE($7, goals),
       clubs = COALESCE($8, clubs),
       weekly_digest = COALESCE($9, weekly_digest),
       quiet_hours_enabled = COALESCE($10, quiet_hours_enabled),
       quiet_start_hour = COALESCE($11, quiet_start_hour),
       quiet_end_hour = COALESCE($12, quiet_end_hour),
       updated_at = now()
     WHERE user_id = $1`,
    [
      user.id,
      d.kudos ?? null,
      d.comments ?? null,
      d.follows ?? null,
      d.segments_pr ?? null,
      d.challenges ?? null,
      d.goals ?? null,
      d.clubs ?? null,
      d.weekly_digest ?? null,
      d.quiet_hours_enabled ?? null,
      d.quiet_start_hour ?? null,
      d.quiet_end_hour ?? null,
    ]
  );
  return c.json({ ok: true });
});

meRouter.post('/devices', async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as {
    fcmToken?: string;
    platform?: 'android' | 'ios' | 'web';
    deviceLabel?: string;
  } | null;
  if (!body?.fcmToken) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'fcmToken is required' } }, 400);
  }
  const platform = body.platform === 'ios' || body.platform === 'web' ? body.platform : 'android';
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO devices (user_id, fcm_token, platform, device_label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (fcm_token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
       device_label = EXCLUDED.device_label, updated_at = now()`,
    [user.id, body.fcmToken, platform, body.deviceLabel || 'Device']
  );
  return c.json({ ok: true }, 201);
});

meRouter.delete('/devices', async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as { fcmToken?: string } | null;
  if (body?.fcmToken) {
    await queryRows(c.env.DATABASE_URL, `DELETE FROM devices WHERE user_id = $1 AND fcm_token = $2`, [
      user.id,
      body.fcmToken,
    ]);
  }
  return c.json({ ok: true });
});

meRouter.get('/export', async (c) => {
  const user = c.get('user')!;
  const [userRow, settingsRow, zones, activities, goals, gear] = await Promise.all([
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT id, email, handle, display_name, bio, home_city, weight_kg, created_at FROM users WHERE id = $1`,
      [user.id]
    ),
    queryRows<Record<string, unknown>>(c.env.DATABASE_URL, `SELECT * FROM user_settings WHERE user_id = $1`, [user.id]),
    queryRows<Record<string, unknown>>(c.env.DATABASE_URL, `SELECT id, name, lat, lng, radius_meters FROM privacy_zones WHERE user_id = $1`, [user.id]),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT id, title, description, activity_type, source, visibility, started_at, ended_at, timezone,
              distance_m, moving_time_s, elapsed_time_s, elevation_gain_m, elevation_loss_m,
              calories_estimate, encoded_polyline, raw_points_json
       FROM activities WHERE user_id = $1 ORDER BY started_at DESC`,
      [user.id]
    ),
    queryRows<Record<string, unknown>>(c.env.DATABASE_URL, `SELECT * FROM goals WHERE user_id = $1`, [user.id]),
    queryRows<Record<string, unknown>>(c.env.DATABASE_URL, `SELECT * FROM gear WHERE user_id = $1`, [user.id]),
  ]);

  const gpxFiles = activities
    .filter((a) => Array.isArray(a.raw_points_json) && (a.raw_points_json as unknown[]).length >= 2)
    .map((a) => ({
      activityId: a.id,
      filename: `stride-${String(a.id).slice(0, 8)}.gpx`,
      gpx: serializeGpx({
        title: String(a.title),
        activityType: a.activity_type as ActivityType,
        startedAtIso: String(a.started_at),
        points: a.raw_points_json as FilteredTrackPoint[],
      }),
    }));

  return c.json({
    exportedAt: new Date().toISOString(),
    account: userRow[0],
    settings: settingsRow[0] || null,
    privacyZones: zones,
    goals,
    gear,
    activities: activities.map((a) => ({ ...a, raw_points_json: undefined })),
    gpxFiles,
  });
});

meRouter.delete('/', async (c) => {
  const user = c.get('user')!;
  // Cascade foreign keys delete sessions, auth_identities, activities, efforts, comments, kudos, zones, devices, etc.
  await queryRows(c.env.DATABASE_URL, `DELETE FROM users WHERE id = $1`, [user.id]);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', 'stride_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('Set-Cookie', 'stride_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200, headers });
});
