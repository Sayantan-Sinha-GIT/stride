import {
  estimateCalories,
  parseGpx,
  processTrack,
  recomputeTrack,
  serializeGpx,
  type ActivitySource,
  type ActivityType,
  type FilteredTrackPoint,
  type RawTrackPoint,
} from '@stride/track-engine';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  runSegmentMatchingForActivity,
  updateRecordsBadgesAndChallenges,
} from '../lib/activityPipeline.js';
import { checkRateLimit, optionalAuth, requireAuth } from '../lib/auth.js';
import { queryRows } from '../lib/db.js';
import { dispatchNotification, getUserNotificationCopy } from '../lib/fcm.js';
import { API_MESSAGES } from '../lib/i18n.js';
import {
  applyTrackMaskForViewer,
  canViewActivity,
  getUserPrivacyMaskSettings,
} from '../lib/privacy.js';
import type { AppVariables, Env } from '../types.js';

export const activitiesRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ele: z.number().nullable().optional(),
  time: z.number(),
  accuracyM: z.number().nullable().optional(),
  hr: z.number().nullable().optional(),
});

const createActivitySchema = z.object({
  clientId: z.string().max(120).optional(),
  title: z.string().min(1).max(140),
  description: z.string().max(1000).optional(),
  activityType: z.enum(['run', 'walk', 'ride', 'hike']),
  source: z.enum(['recorded', 'imported', 'manual']).default('recorded'),
  visibility: z.enum(['public', 'followers', 'private']).optional(),
  timezone: z.string().max(64).default('Asia/Kolkata'),
  startedAt: z.string().optional(),
  durationS: z.number().int().min(1).max(86400 * 7).optional(),
  distanceM: z.number().min(0).max(500_000).optional(),
  elevationGainM: z.number().min(0).max(30_000).optional(),
  gearId: z.string().uuid().nullable().optional(),
  points: z.array(pointSchema).max(100_000).optional(),
});

async function persistProcessedActivity(
  env: Env,
  user: { id: string; weightKg: number },
  input: {
    clientId: string;
    idempotencyKey: string;
    title: string;
    description: string;
    activityType: ActivityType;
    source: ActivitySource;
    visibility: 'public' | 'followers' | 'private';
    timezone: string;
    gearId?: string | null;
    rawPoints?: RawTrackPoint[];
    manualStartedAt?: string;
    manualDurationS?: number;
    manualDistanceM?: number;
    manualElevationGainM?: number;
  },
  waitUntil?: (p: Promise<unknown>) => void
) {
  // Check idempotency
  const existing = await queryRows<Record<string, unknown>>(
    env.DATABASE_URL,
    `SELECT id, title, activity_type, source, visibility, distance_m, moving_time_s, elapsed_time_s,
            elevation_gain_m, calories_estimate, encoded_polyline, started_at
     FROM activities WHERE user_id = $1 AND client_id = $2`,
    [user.id, input.clientId]
  );
  if (existing[0]) {
    return { created: false, activity: existing[0] };
  }

  let startedAtIso = input.manualStartedAt || new Date().toISOString();
  let endedAtIso = startedAtIso;
  let distanceM = input.manualDistanceM ?? 0;
  let movingTimeS = input.manualDurationS ?? 0;
  let elapsedTimeS = input.manualDurationS ?? 0;
  let elevationGainM = input.manualElevationGainM ?? 0;
  let elevationLossM = 0;
  let avgSpeedMps = movingTimeS > 0 ? Math.round((distanceM / movingTimeS) * 100) / 100 : 0;
  let maxSpeedMps = avgSpeedMps;
  let caloriesEstimate = estimateCalories(input.activityType, avgSpeedMps, movingTimeS, user.weightKg);
  let encodedPolyline = '';
  let wktLineString = '';
  let bbox = null as { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
  let points: FilteredTrackPoint[] = [];
  let splitsKm: unknown[] = [];
  let stream: unknown[] = [];

  if (input.source !== 'manual') {
    if (!input.rawPoints || input.rawPoints.length < 2) {
      throw new Error('GPS activities require at least 2 track points.');
    }
    const processed = processTrack(input.rawPoints, {
      activityType: input.activityType,
      weightKg: user.weightKg,
    });
    if (processed.filteredPointCount < 2) {
      throw new Error('Not enough valid GPS points remained after accuracy filtering.');
    }
    startedAtIso = processed.startedAtIso;
    endedAtIso = processed.endedAtIso;
    distanceM = processed.distanceM;
    movingTimeS = processed.movingTimeS;
    elapsedTimeS = processed.elapsedTimeS;
    elevationGainM = processed.elevationGainM;
    elevationLossM = processed.elevationLossM;
    avgSpeedMps = processed.avgSpeedMps;
    maxSpeedMps = processed.maxSpeedMps;
    caloriesEstimate = processed.caloriesEstimate;
    encodedPolyline = processed.encodedPolyline;
    wktLineString = processed.wktLineString;
    bbox = processed.bbox;
    points = processed.points;
    splitsKm = processed.splitsKm;
    stream = processed.stream;
  } else {
    const startMs = Date.parse(startedAtIso) || Date.now();
    startedAtIso = new Date(startMs).toISOString();
    endedAtIso = new Date(startMs + elapsedTimeS * 1000).toISOString();
  }

  const startPt = points[0];
  const inserted = await queryRows<Record<string, unknown>>(
    env.DATABASE_URL,
    `INSERT INTO activities (
       user_id, client_id, idempotency_key, title, description, activity_type, source, visibility,
       started_at, ended_at, timezone, distance_m, moving_time_s, elapsed_time_s,
       elevation_gain_m, elevation_loss_m, avg_speed_mps, max_speed_mps, calories_estimate,
       encoded_polyline, raw_points_json, splits_json, stream_json,
       geom, start_point, bbox, gear_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9::timestamptz, $10::timestamptz, $11, $12, $13, $14,
       $15, $16, $17, $18, $19,
       $20, $21::jsonb, $22::jsonb, $23::jsonb,
       CASE WHEN $24 <> '' THEN ST_GeomFromText($24, 4326) ELSE NULL END,
       CASE WHEN $25::double precision IS NOT NULL THEN ST_SetSRID(ST_MakePoint($26, $25), 4326) ELSE NULL END,
       CASE WHEN $27::double precision IS NOT NULL THEN ST_MakeEnvelope($28 - 0.0001, $27 - 0.0001, $30 + 0.0001, $29 + 0.0001, 4326) ELSE NULL END,
       $31
     )
     RETURNING id, title, activity_type, source, visibility, distance_m, moving_time_s, elapsed_time_s,
               elevation_gain_m, calories_estimate, encoded_polyline, started_at`,
    [
      user.id,
      input.clientId,
      input.idempotencyKey,
      input.title.trim(),
      input.description.trim(),
      input.activityType,
      input.source,
      input.visibility,
      startedAtIso,
      endedAtIso,
      input.timezone,
      distanceM,
      movingTimeS,
      elapsedTimeS,
      elevationGainM,
      elevationLossM,
      avgSpeedMps,
      maxSpeedMps,
      caloriesEstimate,
      encodedPolyline,
      JSON.stringify(points),
      JSON.stringify(splitsKm),
      JSON.stringify(stream),
      wktLineString,
      startPt ? startPt.lat : null,
      startPt ? startPt.lng : null,
      bbox ? bbox.minLat : null,
      bbox ? bbox.minLng : null,
      bbox ? bbox.maxLat : null,
      bbox ? bbox.maxLng : null,
      input.gearId ?? null,
    ]
  );

  const createdActivity = inserted[0];
  const activityId = String(createdActivity.id);

  const bgWork = async () => {
    await updateRecordsBadgesAndChallenges(env, {
      userId: user.id,
      activityId,
      activityType: input.activityType,
      source: input.source,
      points,
      distanceM,
      movingTimeS,
      elapsedTimeS,
      elevationGainM,
      startedAtIso,
      gearId: input.gearId,
    });
    await runSegmentMatchingForActivity(env, {
      activityId,
      userId: user.id,
      activityType: input.activityType,
      source: input.source,
      points,
      wktLineString,
      startedAtIso,
    });
  };

  if (waitUntil) {
    waitUntil(bgWork());
  } else {
    await bgWork();
  }

  return { created: true, activity: createdActivity };
}

activitiesRouter.post('/', requireAuth, async (c) => {
  if (!(await checkRateLimit(c, 'act:create', 40, 300))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = createActivitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid activity payload' } }, 400);
  }

  const d = parsed.data;
  const idempKey = c.req.header('Idempotency-Key') || d.clientId || crypto.randomUUID();
  const clientId = d.clientId || idempKey;

  let visibility = d.visibility;
  if (!visibility) {
    const settings = await queryRows<{ default_visibility: 'public' | 'followers' | 'private' }>(
      c.env.DATABASE_URL,
      `SELECT default_visibility FROM user_settings WHERE user_id = $1`,
      [user.id]
    );
    visibility = settings[0]?.default_visibility || 'followers';
  }

  let waitUntilFn: ((p: Promise<unknown>) => void) | undefined;
  try {
    waitUntilFn = c.executionCtx?.waitUntil?.bind(c.executionCtx);
  } catch {
    waitUntilFn = undefined;
  }

  try {
    const res = await persistProcessedActivity(
      c.env,
      user,
      {
        clientId,
        idempotencyKey: idempKey,
        title: d.title,
        description: d.description || '',
        activityType: d.activityType,
        source: d.source,
        visibility,
        timezone: d.timezone,
        gearId: d.gearId,
        rawPoints: d.points,
        manualStartedAt: d.startedAt,
        manualDurationS: d.durationS,
        manualDistanceM: d.distanceM,
        manualElevationGainM: d.elevationGainM,
      },
      waitUntilFn
    );
    return c.json({ activity: res.activity, deduplicated: !res.created }, res.created ? 201 : 200);
  } catch (err) {
    return c.json(
      { error: { code: 'ACTIVITY_PROCESSING_ERROR', message: err instanceof Error ? err.message : 'Unable to process activity' } },
      400
    );
  }
});

activitiesRouter.post('/import-gpx', requireAuth, async (c) => {
  if (!(await checkRateLimit(c, 'act:gpx', 20, 300))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const user = c.get('user')!;
  const contentType = c.req.header('Content-Type') || '';
  let gpxXml = '';
  let titleOverride: string | undefined;
  let typeOverride: ActivityType | undefined;
  let visibilityOverride: 'public' | 'followers' | 'private' | undefined;

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const rawFile = form.get('file') as unknown;
    if (rawFile && typeof rawFile === 'object' && 'text' in rawFile && 'size' in rawFile) {
      const f = rawFile as { size: number; text: () => Promise<string> };
      if (f.size > 5 * 1024 * 1024) {
        return c.json({ error: { code: 'FILE_TOO_LARGE', message: 'GPX file exceeds 5 MB limit' } }, 413);
      }
      gpxXml = await f.text();
    } else if (typeof form.get('gpx') === 'string') {
      gpxXml = String(form.get('gpx'));
    }
    titleOverride = form.get('title') ? String(form.get('title')) : undefined;
    const t = form.get('activityType') ? String(form.get('activityType')) : undefined;
    if (t === 'run' || t === 'walk' || t === 'ride' || t === 'hike') typeOverride = t;
    const v = form.get('visibility') ? String(form.get('visibility')) : undefined;
    if (v === 'public' || v === 'followers' || v === 'private') visibilityOverride = v;
  } else {
    const json = (await c.req.json().catch(() => null)) as {
      gpx?: string;
      title?: string;
      activityType?: ActivityType;
      visibility?: 'public' | 'followers' | 'private';
    } | null;
    gpxXml = json?.gpx || '';
    titleOverride = json?.title;
    typeOverride = json?.activityType;
    visibilityOverride = json?.visibility;
  }

  try {
    const parsed = parseGpx(gpxXml);
    const activityType = typeOverride || parsed.activityType || 'run';
    const title = titleOverride?.trim() || parsed.name || 'Imported GPX Activity';
    let visibility = visibilityOverride;
    if (!visibility) {
      const settings = await queryRows<{ default_visibility: 'public' | 'followers' | 'private' }>(
        c.env.DATABASE_URL,
        `SELECT default_visibility FROM user_settings WHERE user_id = $1`,
        [user.id]
      );
      visibility = settings[0]?.default_visibility || 'followers';
    }

    const idemp = c.req.header('Idempotency-Key') || crypto.randomUUID();
    const res = await persistProcessedActivity(c.env, user, {
      clientId: idemp,
      idempotencyKey: idemp,
      title,
      description: 'Imported from GPX',
      activityType,
      source: 'imported',
      visibility,
      timezone: 'Asia/Kolkata',
      rawPoints: parsed.points,
    });
    return c.json({ activity: res.activity }, res.created ? 201 : 200);
  } catch (err) {
    return c.json(
      { error: { code: 'GPX_IMPORT_ERROR', message: err instanceof Error ? err.message : 'Invalid GPX file' } },
      400
    );
  }
});

activitiesRouter.get('/feed', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const scope = c.req.query('scope') || (viewer ? 'following' : 'public');
  const cursor = c.req.query('cursor');
  const limit = Math.min(30, Math.max(1, Number(c.req.query('limit') || 15)));

  if (scope === 'following' && !viewer) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: API_MESSAGES.en.unauthorized } }, 401);
  }

  let cursorTime: string | null = null;
  let cursorId: string | null = null;
  if (cursor && cursor.includes('|')) {
    const [t, id] = cursor.split('|');
    cursorTime = t;
    cursorId = id;
  }

  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT a.id, a.user_id, a.title, a.description, a.activity_type, a.source, a.visibility,
            a.started_at, a.timezone, a.distance_m, a.moving_time_s, a.elapsed_time_s,
            a.elevation_gain_m, a.avg_speed_mps, a.calories_estimate, a.encoded_polyline,
            a.raw_points_json, a.kudos_count, a.comment_count,
            u.handle AS author_handle, u.display_name AS author_name, u.avatar_url AS author_avatar, u.home_city AS author_city,
            EXISTS(SELECT 1 FROM kudos k WHERE k.activity_id = a.id AND k.user_id = $1) AS viewer_has_kudos
     FROM activities a
     JOIN users u ON u.id = a.user_id
     WHERE a.is_hidden_by_admin = false
       AND ($1::uuid IS NULL OR NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $1 AND b.blocked_id = a.user_id)
            OR (b.blocker_id = a.user_id AND b.blocked_id = $1)
       ))
       AND (
         CASE
           WHEN $2 = 'public' THEN a.visibility = 'public'
           WHEN $2 = 'mine' THEN a.user_id = $1
           ELSE (
             a.user_id = $1
             OR (
               a.visibility IN ('public', 'followers')
               AND EXISTS (
                 SELECT 1 FROM follows f
                 WHERE f.follower_id = $1 AND f.following_id = a.user_id AND f.status = 'accepted'
               )
             )
           )
         END
       )
       AND (
         $3::timestamptz IS NULL
         OR (a.started_at, a.id) < ($3::timestamptz, $4::uuid)
       )
     ORDER BY a.started_at DESC, a.id DESC
     LIMIT $5`,
    [viewer?.id ?? null, scope, cursorTime, cursorId, limit + 1]
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const privacyCache = new Map<string, Awaited<ReturnType<typeof getUserPrivacyMaskSettings>>>();

  const items = await Promise.all(
    pageRows.map(async (r) => {
      const ownerId = String(r.user_id);
      let maskCfg = privacyCache.get(ownerId);
      if (!maskCfg) {
        maskCfg = await getUserPrivacyMaskSettings(c.env.DATABASE_URL, ownerId);
        privacyCache.set(ownerId, maskCfg);
      }
      const pts = Array.isArray(r.raw_points_json) ? (r.raw_points_json as FilteredTrackPoint[]) : [];
      const masked = applyTrackMaskForViewer(
        pts,
        String(r.encoded_polyline || ''),
        ownerId,
        viewer?.id ?? null,
        maskCfg.zones,
        maskCfg.hideStartEndMeters
      );

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        activityType: r.activity_type,
        source: r.source,
        visibility: r.visibility,
        startedAt: r.started_at,
        timezone: r.timezone,
        distanceM: Number(r.distance_m),
        movingTimeS: Number(r.moving_time_s),
        elapsedTimeS: Number(r.elapsed_time_s),
        elevationGainM: Number(r.elevation_gain_m),
        avgSpeedMps: Number(r.avg_speed_mps),
        caloriesEstimate: Number(r.calories_estimate),
        encodedPolyline: masked.encodedPolyline,
        privacyClipped: masked.privacyClipped,
        kudosCount: Number(r.kudos_count),
        commentCount: Number(r.comment_count),
        viewerHasKudos: Boolean(r.viewer_has_kudos),
        author: {
          id: ownerId,
          handle: r.author_handle,
          displayName: r.author_name,
          avatarUrl: r.author_avatar,
          homeCity: r.author_city,
        },
      };
    })
  );

  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? `${String(last.started_at)}|${String(last.id)}` : null;

  return c.json({ items, nextCursor });
});

activitiesRouter.get('/:id', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const id = c.req.param('id');

  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT a.*, u.handle AS author_handle, u.display_name AS author_name, u.avatar_url AS author_avatar, u.home_city AS author_city,
            EXISTS(SELECT 1 FROM kudos k WHERE k.activity_id = a.id AND k.user_id = $2) AS viewer_has_kudos
     FROM activities a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = $1`,
    [id, viewer?.id ?? null]
  );

  const act = rows[0];
  if (!act) {
    return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);
  }

  const allowed = await canViewActivity(
    c.env.DATABASE_URL,
    viewer?.id ?? null,
    viewer?.role ?? null,
    {
      user_id: String(act.user_id),
      visibility: String(act.visibility),
      is_hidden_by_admin: Boolean(act.is_hidden_by_admin),
    }
  );
  if (!allowed) {
    return c.json({ error: { code: 'FORBIDDEN', message: API_MESSAGES.en.forbidden } }, 403);
  }

  const ownerId = String(act.user_id);
  const maskCfg = await getUserPrivacyMaskSettings(c.env.DATABASE_URL, ownerId);
  const rawPts = Array.isArray(act.raw_points_json) ? (act.raw_points_json as FilteredTrackPoint[]) : [];
  const masked = applyTrackMaskForViewer(
    rawPts,
    String(act.encoded_polyline || ''),
    ownerId,
    viewer?.id ?? null,
    maskCfg.zones,
    maskCfg.hideStartEndMeters
  );

  const [efforts, comments] = await Promise.all([
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT se.id, se.segment_id, se.elapsed_time_s, se.avg_speed_mps, se.is_pr, se.is_flagged, se.flag_reason,
              s.name AS segment_name, s.distance_m AS segment_distance_m
       FROM segment_efforts se
       JOIN segments s ON s.id = se.segment_id
       WHERE se.activity_id = $1 AND se.is_hidden_by_admin = false AND s.is_hidden_by_admin = false
       ORDER BY se.start_offset_s ASC`,
      [id]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT cm.id, cm.body, cm.created_at, cm.user_id, u.handle, u.display_name, u.avatar_url
       FROM comments cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.activity_id = $1 AND cm.is_hidden_by_admin = false
       ORDER BY cm.created_at ASC`,
      [id]
    ),
  ]);

  return c.json({
    activity: {
      id: act.id,
      title: act.title,
      description: act.description,
      activityType: act.activity_type,
      source: act.source,
      visibility: act.visibility,
      startedAt: act.started_at,
      endedAt: act.ended_at,
      timezone: act.timezone,
      distanceM: Number(act.distance_m),
      movingTimeS: Number(act.moving_time_s),
      elapsedTimeS: Number(act.elapsed_time_s),
      elevationGainM: Number(act.elevation_gain_m),
      elevationLossM: Number(act.elevation_loss_m),
      avgSpeedMps: Number(act.avg_speed_mps),
      maxSpeedMps: Number(act.max_speed_mps),
      caloriesEstimate: Number(act.calories_estimate),
      caloriesIsEstimate: true,
      encodedPolyline: masked.encodedPolyline,
      privacyClipped: masked.privacyClipped,
      points: masked.points,
      splitsKm: act.splits_json,
      stream: act.stream_json,
      gearId: act.gear_id,
      kudosCount: Number(act.kudos_count),
      commentCount: Number(act.comment_count),
      viewerHasKudos: Boolean(act.viewer_has_kudos),
      canEdit: viewer?.id === ownerId,
      author: {
        id: ownerId,
        handle: act.author_handle,
        displayName: act.author_name,
        avatarUrl: act.author_avatar,
        homeCity: act.author_city,
      },
    },
    segmentEfforts: efforts,
    comments,
  });
});

activitiesRouter.patch('/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as {
    title?: string;
    description?: string;
    visibility?: 'public' | 'followers' | 'private';
    gearId?: string | null;
  } | null;

  const updated = await queryRows<{ id: string }>(
    c.env.DATABASE_URL,
    `UPDATE activities SET
       title = COALESCE($3, title),
       description = COALESCE($4, description),
       visibility = COALESCE($5, visibility),
       gear_id = CASE WHEN $6::uuid IS NOT NULL THEN $6::uuid ELSE gear_id END,
       updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, user.id, body?.title?.trim() ?? null, body?.description ?? null, body?.visibility ?? null, body?.gearId ?? null]
  );

  if (!updated[0]) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Activity not found or not owned by you.' } }, 404);
  }
  return c.json({ ok: true });
});

activitiesRouter.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const deleted = await queryRows<{ id: string }>(
    c.env.DATABASE_URL,
    `DELETE FROM activities WHERE id = $1 AND (user_id = $2 OR $3 = 'admin') RETURNING id`,
    [id, user.id, user.role]
  );
  if (!deleted[0]) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Activity not found or forbidden.' } }, 404);
  }
  return c.json({ ok: true });
});

activitiesRouter.get('/:id/gpx', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const id = c.req.param('id') ?? '';
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT id, user_id, title, activity_type, started_at, visibility, is_hidden_by_admin, encoded_polyline, raw_points_json
     FROM activities WHERE id = $1`,
    [id]
  );
  const act = rows[0];
  if (!act) return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);

  const allowed = await canViewActivity(
    c.env.DATABASE_URL,
    viewer?.id ?? null,
    viewer?.role ?? null,
    {
      user_id: String(act.user_id),
      visibility: String(act.visibility),
      is_hidden_by_admin: Boolean(act.is_hidden_by_admin),
    }
  );
  if (!allowed) return c.json({ error: { code: 'FORBIDDEN', message: API_MESSAGES.en.forbidden } }, 403);

  const ownerId = String(act.user_id);
  const maskCfg = await getUserPrivacyMaskSettings(c.env.DATABASE_URL, ownerId);
  const pts = Array.isArray(act.raw_points_json) ? (act.raw_points_json as FilteredTrackPoint[]) : [];
  const masked = applyTrackMaskForViewer(
    pts,
    String(act.encoded_polyline || ''),
    ownerId,
    viewer?.id ?? null,
    maskCfg.zones,
    maskCfg.hideStartEndMeters
  );

  const gpx = serializeGpx({
    title: String(act.title),
    activityType: act.activity_type as ActivityType,
    startedAtIso: String(act.started_at),
    points: masked.points,
  });

  return new Response(gpx, {
    status: 200,
    headers: {
      'Content-Type': 'application/gpx+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="stride-${id.slice(0, 8)}.gpx"`,
    },
  });
});

activitiesRouter.post('/:id/recompute', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id') ?? '';
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT * FROM activities WHERE id = $1`,
    [id]
  );
  const act = rows[0];
  if (!act || (String(act.user_id) !== user.id && user.role !== 'admin')) {
    return c.json({ error: { code: 'FORBIDDEN', message: API_MESSAGES.en.forbidden } }, 403);
  }
  const rawPts = Array.isArray(act.raw_points_json) ? (act.raw_points_json as RawTrackPoint[]) : [];
  if (rawPts.length < 2) {
    return c.json({ error: { code: 'NO_POINTS', message: 'Cannot recompute activity without GPS points.' } }, 400);
  }
  const processed = recomputeTrack(rawPts, {
    activityType: act.activity_type as ActivityType,
    weightKg: user.weightKg,
  });

  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE activities SET
       distance_m = $2, moving_time_s = $3, elapsed_time_s = $4,
       elevation_gain_m = $5, elevation_loss_m = $6,
       avg_speed_mps = $7, max_speed_mps = $8, calories_estimate = $9,
       encoded_polyline = $10, raw_points_json = $11::jsonb, splits_json = $12::jsonb, stream_json = $13::jsonb,
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      processed.distanceM,
      processed.movingTimeS,
      processed.elapsedTimeS,
      processed.elevationGainM,
      processed.elevationLossM,
      processed.avgSpeedMps,
      processed.maxSpeedMps,
      processed.caloriesEstimate,
      processed.encodedPolyline,
      JSON.stringify(processed.points),
      JSON.stringify(processed.splitsKm),
      JSON.stringify(processed.stream),
    ]
  );

  const matched = await runSegmentMatchingForActivity(c.env, {
    activityId: id,
    userId: String(act.user_id),
    activityType: act.activity_type as ActivityType,
    source: act.source as ActivitySource,
    points: processed.points,
    wktLineString: processed.wktLineString,
    startedAtIso: processed.startedAtIso,
  });

  return c.json({ ok: true, distanceM: processed.distanceM, matchedSegments: matched });
});

activitiesRouter.post('/:id/kudos', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const rows = await queryRows<{ user_id: string; visibility: string; is_hidden_by_admin: boolean }>(
    c.env.DATABASE_URL,
    `SELECT user_id, visibility, is_hidden_by_admin FROM activities WHERE id = $1`,
    [id]
  );
  if (!rows[0] || !(await canViewActivity(c.env.DATABASE_URL, user.id, user.role, rows[0]))) {
    return c.json({ error: { code: 'FORBIDDEN', message: API_MESSAGES.en.forbidden } }, 403);
  }

  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO kudos (activity_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [id, user.id]
  );
  const countRows = await queryRows<{ cnt: number }>(
    c.env.DATABASE_URL,
    `UPDATE activities SET kudos_count = (SELECT COUNT(*) FROM kudos WHERE activity_id = $1)
     WHERE id = $1 RETURNING kudos_count AS cnt`,
    [id]
  );

  if (rows[0].user_id !== user.id) {
    const copy = await getUserNotificationCopy(c.env.DATABASE_URL, rows[0].user_id);
    const total = Number(countRows[0]?.cnt ?? 1);
    await dispatchNotification(c.env, {
      userId: rows[0].user_id,
      actorId: user.id,
      kind: 'kudos',
      targetType: 'activity',
      targetId: id,
      batchKey: `kudos:${id}`,
      title: copy.kudosTitle,
      body: copy.kudosBody(user.displayName, total),
    });
  }

  return c.json({ kudosCount: Number(countRows[0]?.cnt ?? 0), viewerHasKudos: true });
});

activitiesRouter.delete('/:id/kudos', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await queryRows(c.env.DATABASE_URL, `DELETE FROM kudos WHERE activity_id = $1 AND user_id = $2`, [id, user.id]);
  const countRows = await queryRows<{ cnt: number }>(
    c.env.DATABASE_URL,
    `UPDATE activities SET kudos_count = (SELECT COUNT(*) FROM kudos WHERE activity_id = $1)
     WHERE id = $1 RETURNING kudos_count AS cnt`,
    [id]
  );
  return c.json({ kudosCount: Number(countRows[0]?.cnt ?? 0), viewerHasKudos: false });
});

activitiesRouter.post('/:id/comments', requireAuth, async (c) => {
  if (!(await checkRateLimit(c, 'act:comment', 30, 300))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { body?: string } | null;
  const text = body?.body?.trim();
  if (!text || text.length > 600) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Comment must be 1 to 600 characters.' } }, 400);
  }

  const rows = await queryRows<{ user_id: string; visibility: string; is_hidden_by_admin: boolean }>(
    c.env.DATABASE_URL,
    `SELECT user_id, visibility, is_hidden_by_admin FROM activities WHERE id = $1`,
    [id]
  );
  if (!rows[0] || !(await canViewActivity(c.env.DATABASE_URL, user.id, user.role, rows[0]))) {
    return c.json({ error: { code: 'FORBIDDEN', message: API_MESSAGES.en.forbidden } }, 403);
  }

  const inserted = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `INSERT INTO comments (activity_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at`,
    [id, user.id, text]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE activities SET comment_count = (SELECT COUNT(*) FROM comments WHERE activity_id = $1 AND is_hidden_by_admin = false) WHERE id = $1`,
    [id]
  );

  if (rows[0].user_id !== user.id) {
    const copy = await getUserNotificationCopy(c.env.DATABASE_URL, rows[0].user_id);
    await dispatchNotification(c.env, {
      userId: rows[0].user_id,
      actorId: user.id,
      kind: 'comments',
      targetType: 'activity',
      targetId: id,
      title: copy.commentTitle,
      body: copy.commentBody(user.displayName, text.slice(0, 80)),
    });
  }

  return c.json(
    {
      comment: {
        ...inserted[0],
        user_id: user.id,
        handle: user.handle,
        display_name: user.displayName,
      },
    },
    201
  );
});

activitiesRouter.delete('/:id/comments/:commentId', requireAuth, async (c) => {
  const user = c.get('user')!;
  const activityId = c.req.param('id');
  const commentId = c.req.param('commentId');

  const rows = await queryRows<{ author_id: string; activity_owner_id: string }>(
    c.env.DATABASE_URL,
    `SELECT cm.user_id AS author_id, a.user_id AS activity_owner_id
     FROM comments cm
     JOIN activities a ON a.id = cm.activity_id
     WHERE cm.id = $1 AND cm.activity_id = $2`,
    [commentId, activityId]
  );
  const row = rows[0];
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);
  }
  if (user.id !== row.author_id && user.id !== row.activity_owner_id && user.role !== 'admin') {
    return c.json({ error: { code: 'FORBIDDEN', message: API_MESSAGES.en.forbidden } }, 403);
  }

  await queryRows(c.env.DATABASE_URL, `DELETE FROM comments WHERE id = $1`, [commentId]);
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE activities SET comment_count = (SELECT COUNT(*) FROM comments WHERE activity_id = $1 AND is_hidden_by_admin = false) WHERE id = $1`,
    [activityId]
  );
  return c.json({ ok: true });
});
