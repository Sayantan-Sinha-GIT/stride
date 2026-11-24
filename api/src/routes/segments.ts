import {
  encodePolyline,
  matchActivityToSegment,
  toWktLineString,
  validateNewSegment,
  type ActivitySource,
  type ActivityType,
  type FilteredTrackPoint,
  type LatLng,
} from '@stride/track-engine';
import { Hono } from 'hono';
import { z } from 'zod';
import { optionalAuth, requireAuth } from '../lib/auth.js';
import { kvGetJson, kvSetJson } from '../lib/cache.js';
import { queryRows } from '../lib/db.js';
import { API_MESSAGES } from '../lib/i18n.js';
import type { AppVariables, Env } from '../types.js';

export const segmentsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

segmentsRouter.get('/', optionalAuth, async (c) => {
  const activityType = c.req.query('activityType');
  const city = c.req.query('city');
  const q = c.req.query('q');

  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT s.id, s.name, s.city, s.activity_type, s.distance_m, s.elevation_gain_m, s.elevation_loss_m,
            s.encoded_polyline, s.effort_count, s.created_at,
            u.handle AS creator_handle, u.display_name AS creator_name,
            (
              SELECT MIN(se.elapsed_time_s) FROM segment_efforts se
              WHERE se.segment_id = s.id AND se.is_flagged = false AND se.is_hidden_by_admin = false
            ) AS kom_time_s
     FROM segments s
     LEFT JOIN users u ON u.id = s.creator_id
     WHERE s.is_hidden_by_admin = false
       AND ($1::text IS NULL OR s.activity_type = $1)
       AND ($2::text IS NULL OR LOWER(s.city) = LOWER($2))
       AND ($3::text IS NULL OR s.name ILIKE '%' || $3 || '%' OR s.city ILIKE '%' || $3 || '%')
     ORDER BY s.effort_count DESC, s.created_at DESC
     LIMIT 60`,
    [activityType || null, city || null, q || null]
  );

  return c.json({ segments: rows });
});

const createSegmentSchema = z.object({
  activityId: z.string().uuid(),
  name: z.string().min(3).max(120),
  city: z.string().max(80).default(''),
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(1),
});

segmentsRouter.post('/', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = createSegmentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid segment request' } }, 400);
  }
  const d = parsed.data;
  if (d.endIndex <= d.startIndex + 2) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Select a larger stretch along the route.' } }, 400);
  }

  const acts = await queryRows<{
    id: string;
    user_id: string;
    activity_type: ActivityType;
    source: ActivitySource;
    raw_points_json: FilteredTrackPoint[];
    home_city: string;
  }>(
    c.env.DATABASE_URL,
    `SELECT a.id, a.user_id, a.activity_type, a.source, a.raw_points_json, u.home_city
     FROM activities a JOIN users u ON u.id = a.user_id
     WHERE a.id = $1`,
    [d.activityId]
  );

  const act = acts[0];
  if (!act || act.user_id !== user.id) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'You can only create segments from your own activities.' } }, 403);
  }
  if (act.source === 'manual') {
    return c.json({ error: { code: 'INVALID_SOURCE', message: 'Manual activities cannot create segments.' } }, 400);
  }

  const pts = Array.isArray(act.raw_points_json) ? act.raw_points_json : [];
  const slice = pts.slice(d.startIndex, Math.min(pts.length, d.endIndex + 1));
  if (slice.length < 2) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Selected point range is out of bounds.' } }, 400);
  }

  // Pre-fetch nearby existing segments of same sport for duplicate protection
  const nearby = await queryRows<{
    id: string;
    name: string;
    activity_type: ActivityType;
    distance_m: number;
    points_json: LatLng[];
  }>(
    c.env.DATABASE_URL,
    `SELECT id, name, activity_type, distance_m, points_json
     FROM segments
     WHERE activity_type = $1 AND is_hidden_by_admin = false
       AND ST_DWithin(start_point::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 150)`,
    [act.activity_type, slice[0].lng, slice[0].lat]
  );

  const validation = validateNewSegment(
    slice,
    act.activity_type,
    nearby.map((n) => ({
      id: n.id,
      name: n.name,
      activityType: n.activity_type,
      distanceM: Number(n.distance_m),
      points: n.points_json,
    }))
  );

  if (!validation.valid) {
    return c.json(
      {
        error: {
          code: `SEGMENT_${(validation.reason || 'INVALID').toUpperCase()}`,
          message:
            validation.reason === 'duplicate'
              ? `A near-identical segment ("${validation.duplicateSegmentName}") already exists here.`
              : validation.reason === 'closed_loop'
                ? 'Closed loop segments are not allowed in v1. End the segment at least 50m away from the start.'
                : 'Segment length must be between 150m and 50km.',
          duplicateSegmentId: validation.duplicateSegmentId,
          duplicateSegmentName: validation.duplicateSegmentName,
        },
      },
      400
    );
  }

  const cleanPts = slice.map((p) => ({ lat: p.lat, lng: p.lng }));
  const poly = encodePolyline(cleanPts);
  const wkt = toWktLineString(cleanPts);
  const start = cleanPts[0];
  const end = cleanPts[cleanPts.length - 1];
  const lats = cleanPts.map((p) => p.lat);
  const lngs = cleanPts.map((p) => p.lng);

  const inserted = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `INSERT INTO segments (
       creator_id, source_activity_id, name, city, activity_type, distance_m,
       elevation_gain_m, elevation_loss_m, encoded_polyline, points_json,
       geom, start_point, end_point, bbox
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10::jsonb,
       ST_GeomFromText($11, 4326),
       ST_SetSRID(ST_MakePoint($13, $12), 4326),
       ST_SetSRID(ST_MakePoint($15, $14), 4326),
       ST_MakeEnvelope($16 - 0.0001, $17 - 0.0001, $18 + 0.0001, $19 + 0.0001, 4326)
     )
     RETURNING id, name, city, activity_type, distance_m, elevation_gain_m, encoded_polyline`,
    [
      user.id,
      act.id,
      d.name.trim(),
      d.city.trim() || act.home_city || '',
      act.activity_type,
      validation.distanceM,
      validation.elevationGainM,
      validation.elevationLossM,
      poly,
      JSON.stringify(cleanPts),
      wkt,
      start.lat,
      start.lng,
      end.lat,
      end.lng,
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ]
  );

  const newSeg = inserted[0];

  // Immediately backfill matching against existing eligible activities within bbox
  const candidateActs = await queryRows<{
    id: string;
    user_id: string;
    activity_type: ActivityType;
    source: ActivitySource;
    started_at: string;
    raw_points_json: FilteredTrackPoint[];
  }>(
    c.env.DATABASE_URL,
    `SELECT id, user_id, activity_type, source, started_at, raw_points_json
     FROM activities
     WHERE activity_type = $1
       AND source <> 'manual'
       AND is_hidden_by_admin = false
       AND geom IS NOT NULL
       AND ST_Intersects(bbox, ST_Expand(ST_GeomFromText($2, 4326), 0.001))
     LIMIT 100`,
    [act.activity_type, wkt]
  );

  let matchedCount = 0;
  for (const cand of candidateActs) {
    const res = matchActivityToSegment(
      cand.raw_points_json || [],
      {
        id: String(newSeg.id),
        name: String(newSeg.name),
        activityType: act.activity_type,
        distanceM: validation.distanceM,
        points: cleanPts,
      },
      cand.activity_type,
      cand.source
    );
    if (!res.matched || res.elapsedTimeS == null) continue;
    await queryRows(
      c.env.DATABASE_URL,
      `INSERT INTO segment_efforts (
         segment_id, activity_id, user_id, elapsed_time_s, avg_speed_mps, max_speed_mps,
         start_offset_s, end_offset_s, is_pr, is_flagged, flag_reason, started_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11::timestamptz)
       ON CONFLICT DO NOTHING`,
      [
        newSeg.id,
        cand.id,
        cand.user_id,
        res.elapsedTimeS,
        res.avgSpeedMps ?? 0,
        res.maxSpeedMps ?? 0,
        res.startOffsetS ?? 0,
        res.endOffsetS ?? 0,
        Boolean(res.isFlagged),
        res.flagReason ?? null,
        cand.started_at,
      ]
    );
    matchedCount++;
  }

  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE segments SET effort_count = $2 WHERE id = $1`,
    [newSeg.id, matchedCount]
  );

  return c.json({ segment: { ...newSeg, effort_count: matchedCount } }, 201);
});

segmentsRouter.get('/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT s.id, s.name, s.city, s.activity_type, s.distance_m, s.elevation_gain_m, s.elevation_loss_m,
            s.encoded_polyline, s.points_json, s.effort_count, s.created_at,
            u.handle AS creator_handle, u.display_name AS creator_name
     FROM segments s
     LEFT JOIN users u ON u.id = s.creator_id
     WHERE s.id = $1 AND s.is_hidden_by_admin = false`,
    [id]
  );
  if (!rows[0]) {
    return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);
  }
  return c.json({ segment: rows[0] });
});

segmentsRouter.get('/:id/leaderboard', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const id = c.req.param('id');
  const range = (c.req.query('range') || 'all') as 'all' | 'year' | 'month' | 'following';

  if (range === 'following' && !viewer) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: API_MESSAGES.en.unauthorized } }, 401);
  }

  // Only cache public/non-personalized leaderboard slices
  const canUsePublicCache = !viewer && range !== 'following';
  const cacheKey = `lb:${id}:${range}`;
  if (canUsePublicCache) {
    const cached = await kvGetJson<{ entries: unknown[] }>(c.env.STRIDE_KV, cacheKey);
    if (cached) return c.json({ ...cached, cached: true });
  }

  const timeFilter =
    range === 'year'
      ? `AND se.started_at >= date_trunc('year', now())`
      : range === 'month'
        ? `AND se.started_at >= date_trunc('month', now())`
        : '';

  // Strictly enforce activity visibility & blocks on leaderboard!
  const entries = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `WITH ranked AS (
       SELECT se.id AS effort_id, se.user_id, se.activity_id, se.elapsed_time_s, se.avg_speed_mps,
              se.started_at, a.visibility,
              u.handle, u.display_name, u.avatar_url,
              ROW_NUMBER() OVER (PARTITION BY se.user_id ORDER BY se.elapsed_time_s ASC, se.started_at ASC) AS user_best_rn
       FROM segment_efforts se
       JOIN activities a ON a.id = se.activity_id
       JOIN users u ON u.id = se.user_id
       WHERE se.segment_id = $1
         AND se.is_flagged = false
         AND se.is_hidden_by_admin = false
         AND a.is_hidden_by_admin = false
         AND u.is_suspended = false
         ${timeFilter}
         AND ($2::uuid IS NULL OR NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $2 AND b.blocked_id = se.user_id)
              OR (b.blocker_id = se.user_id AND b.blocked_id = $2)
         ))
         AND (
           a.visibility = 'public'
           OR ($2::uuid IS NOT NULL AND a.user_id = $2)
           OR (
             a.visibility = 'followers'
             AND $2::uuid IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM follows f
               WHERE f.follower_id = $2 AND f.following_id = a.user_id AND f.status = 'accepted'
             )
           )
         )
         AND (
           $3::text <> 'following'
           OR se.user_id = $2
           OR EXISTS (
             SELECT 1 FROM follows f2
             WHERE f2.follower_id = $2 AND f2.following_id = se.user_id AND f2.status = 'accepted'
           )
         )
     )
     SELECT ROW_NUMBER() OVER (ORDER BY elapsed_time_s ASC)::int AS rank,
            effort_id, user_id, activity_id, elapsed_time_s, avg_speed_mps, started_at,
            handle, display_name, avatar_url
     FROM ranked
     WHERE user_best_rn = 1
     ORDER BY elapsed_time_s ASC
     LIMIT 100`,
    [id, viewer?.id ?? null, range]
  );

  if (canUsePublicCache) {
    await kvSetJson(c.env.STRIDE_KV, cacheKey, { entries }, 60);
  }

  return c.json({ entries, cached: false });
});

segmentsRouter.post('/efforts/:effortId/flag', requireAuth, async (c) => {
  const user = c.get('user')!;
  const effortId = c.req.param('effortId');
  const body = (await c.req.json().catch(() => null)) as { reason?: string; requestReview?: boolean } | null;
  const reason = body?.reason?.trim() || 'Suspicious effort flagged by user';

  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE segment_efforts SET review_requested = true, flag_reason = COALESCE(flag_reason, $2) WHERE id = $1`,
    [effortId, reason]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
     VALUES ($1, 'effort', $2, 'Segment Effort Fairness', $3)`,
    [user.id, effortId, reason]
  );

  return c.json({ ok: true }, 201);
});
