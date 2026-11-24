import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { queryRows } from '../lib/db.js';
import type { AppVariables, Env } from '../types.js';

export const analyticsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

analyticsRouter.use('*', requireAuth);

analyticsRouter.get('/dashboard', async (c) => {
  const user = c.get('user')!;

  const [totalsBySport, weeklyTrend, activeDays, goals, records, badges, gear] = await Promise.all([
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT activity_type,
              COALESCE(SUM(CASE WHEN started_at >= date_trunc('week', now()) THEN distance_m ELSE 0 END), 0)::float AS week_distance_m,
              COALESCE(SUM(CASE WHEN started_at >= date_trunc('week', now()) THEN moving_time_s ELSE 0 END), 0)::int AS week_moving_s,
              COALESCE(SUM(CASE WHEN started_at >= date_trunc('month', now()) THEN distance_m ELSE 0 END), 0)::float AS month_distance_m,
              COALESCE(SUM(CASE WHEN started_at >= date_trunc('year', now()) THEN distance_m ELSE 0 END), 0)::float AS year_distance_m,
              COALESCE(SUM(CASE WHEN started_at >= date_trunc('year', now()) THEN elevation_gain_m ELSE 0 END), 0)::float AS year_elevation_m,
              COUNT(*)::int AS total_count
       FROM activities
       WHERE user_id = $1 AND is_hidden_by_admin = false
       GROUP BY activity_type`,
      [user.id]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT to_char(date_trunc('week', started_at), 'YYYY-MM-DD') AS week_start,
              COALESCE(SUM(distance_m), 0)::float AS distance_m,
              COALESCE(SUM(moving_time_s), 0)::int AS moving_time_s,
              COALESCE(SUM(elevation_gain_m), 0)::float AS elevation_gain_m,
              COUNT(*)::int AS activity_count
       FROM activities
       WHERE user_id = $1 AND is_hidden_by_admin = false
         AND started_at >= now() - interval '12 weeks'
       GROUP BY date_trunc('week', started_at)
       ORDER BY week_start ASC`,
      [user.id]
    ),
    queryRows<{ day: string }>(
      c.env.DATABASE_URL,
      `SELECT DISTINCT to_char((started_at AT TIME ZONE COALESCE(timezone, 'Asia/Kolkata'))::date, 'YYYY-MM-DD') AS day
       FROM activities
       WHERE user_id = $1 AND is_hidden_by_admin = false
       ORDER BY day DESC LIMIT 90`,
      [user.id]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT g.*,
              COALESCE((
                SELECT CASE
                  WHEN g.metric_type = 'distance_m' THEN SUM(a.distance_m)
                  WHEN g.metric_type = 'moving_time_s' THEN SUM(a.moving_time_s)
                  ELSE COUNT(*)::float
                END
                FROM activities a
                WHERE a.user_id = g.user_id
                  AND a.is_hidden_by_admin = false
                  AND (g.activity_type = 'all' OR a.activity_type = g.activity_type)
                  AND a.started_at >= date_trunc(CASE WHEN g.period = 'weekly' THEN 'week' ELSE 'month' END, now())
              ), 0)::float AS current_value
       FROM goals g
       WHERE g.user_id = $1
       ORDER BY g.created_at DESC`,
      [user.id]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT pr.*, a.title AS activity_title
       FROM personal_records pr
       JOIN activities a ON a.id = pr.activity_id
       WHERE pr.user_id = $1
       ORDER BY pr.achieved_at DESC`,
      [user.id]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT b.code, b.title_en, b.title_hi, b.description_en, b.description_hi, b.category, ub.awarded_at
       FROM user_badges ub JOIN badges b ON b.code = ub.badge_code
       WHERE ub.user_id = $1
       ORDER BY ub.awarded_at DESC`,
      [user.id]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT * FROM gear WHERE user_id = $1 ORDER BY retired ASC, created_at DESC`,
      [user.id]
    ),
  ]);

  // Calculate consecutive day streak up to today/yesterday
  const daySet = new Set(activeDays.map((d) => d.day));
  let streakDays = 0;
  const cursor = new Date();
  const todayStr = cursor.toISOString().slice(0, 10);
  if (!daySet.has(todayStr)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    streakDays++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return c.json({
    totalsBySport,
    weeklyTrend,
    streakDays,
    goals,
    records,
    badges,
    gear,
  });
});

analyticsRouter.get('/year-in-review', async (c) => {
  const user = c.get('user')!;
  const year = Math.min(2100, Math.max(2020, Number(c.req.query('year') || new Date().getUTCFullYear())));

  const [summaryRows, bySport, topMonth, bestSegment] = await Promise.all([
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT COUNT(*)::int AS total_activities,
              COALESCE(SUM(distance_m), 0)::float AS total_distance_m,
              COALESCE(SUM(moving_time_s), 0)::int AS total_moving_s,
              COALESCE(SUM(elevation_gain_m), 0)::float AS total_elevation_m,
              COALESCE(SUM(calories_estimate), 0)::int AS total_calories,
              COALESCE(SUM(kudos_count), 0)::int AS total_kudos,
              COUNT(DISTINCT to_char(started_at, 'YYYY-MM-DD'))::int AS active_days
       FROM activities
       WHERE user_id = $1 AND is_hidden_by_admin = false
         AND EXTRACT(YEAR FROM started_at) = $2`,
      [user.id, year]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT activity_type, COUNT(*)::int AS count, COALESCE(SUM(distance_m), 0)::float AS distance_m
       FROM activities
       WHERE user_id = $1 AND is_hidden_by_admin = false AND EXTRACT(YEAR FROM started_at) = $2
       GROUP BY activity_type ORDER BY distance_m DESC`,
      [user.id, year]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT to_char(started_at, 'YYYY-MM') AS month, COALESCE(SUM(distance_m), 0)::float AS distance_m
       FROM activities
       WHERE user_id = $1 AND is_hidden_by_admin = false AND EXTRACT(YEAR FROM started_at) = $2
       GROUP BY month ORDER BY distance_m DESC LIMIT 1`,
      [user.id, year]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT s.id, s.name, se.elapsed_time_s, se.is_pr
       FROM segment_efforts se JOIN segments s ON s.id = se.segment_id
       WHERE se.user_id = $1 AND se.is_flagged = false AND EXTRACT(YEAR FROM se.started_at) = $2
       ORDER BY se.is_pr DESC, se.elapsed_time_s ASC LIMIT 3`,
      [user.id, year]
    ),
  ]);

  return c.json({
    year,
    summary: summaryRows[0] || {},
    bySport,
    topMonth: topMonth[0] || null,
    topSegments: bestSegment,
  });
});

const goalSchema = z.object({
  period: z.enum(['weekly', 'monthly']),
  activityType: z.enum(['all', 'run', 'ride', 'walk', 'hike']).default('all'),
  metricType: z.enum(['distance_m', 'moving_time_s', 'activity_count']),
  targetValue: z.number().positive(),
});

analyticsRouter.post('/goals', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = goalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid goal payload' } }, 400);
  }
  const d = parsed.data;
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `INSERT INTO goals (user_id, period, activity_type, metric_type, target_value)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [user.id, d.period, d.activityType, d.metricType, d.targetValue]
  );
  return c.json({ goal: rows[0] }, 201);
});

analyticsRouter.delete('/goals/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await queryRows(c.env.DATABASE_URL, `DELETE FROM goals WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return c.json({ ok: true });
});

const gearSchema = z.object({
  name: z.string().min(2).max(90),
  gearType: z.enum(['shoes', 'bike', 'other']),
  brand: z.string().max(60).default(''),
  initialDistanceM: z.number().min(0).max(500_000).default(0),
  maxDistanceM: z.number().min(1000).max(500_000).nullable().optional(),
});

analyticsRouter.post('/gear', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = gearSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid gear payload' } }, 400);
  }
  const d = parsed.data;
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `INSERT INTO gear (user_id, name, gear_type, brand, initial_distance_m, max_distance_m)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [user.id, d.name.trim(), d.gearType, d.brand.trim(), d.initialDistanceM, d.maxDistanceM ?? null]
  );
  return c.json({ gear: rows[0] }, 201);
});

analyticsRouter.patch('/gear/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { retired?: boolean; isPrimary?: boolean } | null;
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE gear SET
       retired = COALESCE($3, retired),
       is_primary = COALESCE($4, is_primary)
     WHERE id = $1 AND user_id = $2`,
    [id, user.id, body?.retired ?? null, body?.isPrimary ?? null]
  );
  return c.json({ ok: true });
});

analyticsRouter.delete('/gear/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await queryRows(c.env.DATABASE_URL, `DELETE FROM gear WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return c.json({ ok: true });
});
