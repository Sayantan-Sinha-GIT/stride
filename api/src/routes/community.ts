import type { FilteredTrackPoint } from '@stride/track-engine';
import { Hono } from 'hono';
import { z } from 'zod';
import { optionalAuth, requireAuth } from '../lib/auth.js';
import { queryRows } from '../lib/db.js';
import { API_MESSAGES } from '../lib/i18n.js';
import { applyTrackMaskForViewer, getUserPrivacyMaskSettings } from '../lib/privacy.js';
import type { AppVariables, Env } from '../types.js';

export const communityRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// --- CLUBS ---
communityRouter.get('/clubs', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const city = c.req.query('city');
  const sport = c.req.query('sport');
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT c.*,
            (SELECT status FROM club_members cm WHERE cm.club_id = c.id AND cm.user_id = $1) AS membership_status,
            (SELECT role FROM club_members cm WHERE cm.club_id = c.id AND cm.user_id = $1) AS membership_role
     FROM clubs c
     WHERE ($2::text IS NULL OR LOWER(c.city) = LOWER($2))
       AND ($3::text IS NULL OR c.sport_focus = $3 OR c.sport_focus = 'all')
     ORDER BY c.member_count DESC, c.created_at DESC
     LIMIT 40`,
    [viewer?.id ?? null, city || null, sport || null]
  );
  return c.json({ clubs: rows });
});

const createClubSchema = z.object({
  name: z.string().min(3).max(90),
  description: z.string().max(600).default(''),
  city: z.string().max(80).default(''),
  sportFocus: z.enum(['all', 'run', 'ride', 'walk', 'hike']).default('all'),
  joinMode: z.enum(['open', 'approval']).default('open'),
});

communityRouter.post('/clubs', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = createClubSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid club' } }, 400);
  }
  const d = parsed.data;
  const baseSlug = d.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'club';
  const slug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;

  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `INSERT INTO clubs (slug, name, description, city, sport_focus, join_mode, owner_id, member_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING *`,
    [slug, d.name.trim(), d.description.trim(), d.city.trim(), d.sportFocus, d.joinMode, user.id]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO club_members (club_id, user_id, role, status) VALUES ($1, $2, 'admin', 'accepted')`,
    [rows[0].id, user.id]
  );
  return c.json({ club: rows[0] }, 201);
});

communityRouter.get('/clubs/:slug', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const slug = c.req.param('slug');

  const clubs = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT c.*,
            (SELECT status FROM club_members cm WHERE cm.club_id = c.id AND cm.user_id = $2) AS membership_status,
            (SELECT role FROM club_members cm WHERE cm.club_id = c.id AND cm.user_id = $2) AS membership_role
     FROM clubs c WHERE c.slug = $1 OR c.id::text = $1`,
    [slug, viewer?.id ?? null]
  );
  const club = clubs[0];
  if (!club) return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);

  const [members, feedRows, events] = await Promise.all([
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT cm.user_id, cm.role, cm.status, cm.joined_at, u.handle, u.display_name, u.avatar_url, u.home_city
       FROM club_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.club_id = $1 AND (cm.status = 'accepted' OR cm.user_id = $2 OR $3 = 'admin')
       ORDER BY cm.role ASC, cm.joined_at ASC`,
      [club.id, viewer?.id ?? null, club.membership_role === 'admin' ? 'admin' : 'user']
    ),
    // Club feed strictly includes members' PUBLIC activities (PRD 8.6 + privacy)
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT a.id, a.user_id, a.title, a.activity_type, a.started_at, a.distance_m, a.moving_time_s,
              a.elevation_gain_m, a.encoded_polyline, a.raw_points_json, a.kudos_count, a.comment_count,
              u.handle AS author_handle, u.display_name AS author_name
       FROM activities a
       JOIN club_members cm ON cm.user_id = a.user_id AND cm.club_id = $1 AND cm.status = 'accepted'
       JOIN users u ON u.id = a.user_id
       WHERE a.visibility = 'public' AND a.is_hidden_by_admin = false
       ORDER BY a.started_at DESC LIMIT 20`,
      [club.id]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT e.*,
              (SELECT COUNT(*)::int FROM event_attendees ea WHERE ea.event_id = e.id) AS attendee_count,
              EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $2) AS viewer_going
       FROM events e WHERE e.club_id = $1 ORDER BY e.starts_at ASC`,
      [club.id, viewer?.id ?? null]
    ),
  ]);

  const privacyCache = new Map<string, Awaited<ReturnType<typeof getUserPrivacyMaskSettings>>>();
  const feed = await Promise.all(
    feedRows.map(async (r) => {
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
        activityType: r.activity_type,
        startedAt: r.started_at,
        distanceM: Number(r.distance_m),
        movingTimeS: Number(r.moving_time_s),
        elevationGainM: Number(r.elevation_gain_m),
        encodedPolyline: masked.encodedPolyline,
        privacyClipped: masked.privacyClipped,
        kudosCount: Number(r.kudos_count),
        commentCount: Number(r.comment_count),
        authorHandle: r.author_handle,
        authorName: r.author_name,
      };
    })
  );

  return c.json({ club, members, feed, events });
});

communityRouter.post('/clubs/:id/join', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const clubs = await queryRows<{ id: string; join_mode: string }>(
    c.env.DATABASE_URL,
    `SELECT id, join_mode FROM clubs WHERE id = $1`,
    [id]
  );
  if (!clubs[0]) return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);
  const status = clubs[0].join_mode === 'approval' ? 'pending' : 'accepted';

  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO club_members (club_id, user_id, role, status) VALUES ($1, $2, 'member', $3)
     ON CONFLICT (club_id, user_id) DO NOTHING`,
    [id, user.id, status]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE clubs SET member_count = (SELECT COUNT(*) FROM club_members WHERE club_id = $1 AND status = 'accepted') WHERE id = $1`,
    [id]
  );
  return c.json({ status }, 201);
});

communityRouter.delete('/clubs/:id/leave', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await queryRows(c.env.DATABASE_URL, `DELETE FROM club_members WHERE club_id = $1 AND user_id = $2`, [id, user.id]);
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE clubs SET member_count = (SELECT COUNT(*) FROM club_members WHERE club_id = $1 AND status = 'accepted') WHERE id = $1`,
    [id]
  );
  return c.json({ ok: true });
});

communityRouter.post('/clubs/:id/members/:userId/approve', requireAuth, async (c) => {
  const user = c.get('user')!;
  const clubId = c.req.param('id');
  const targetUserId = c.req.param('userId');
  const adminCheck = await queryRows<{ role: string }>(
    c.env.DATABASE_URL,
    `SELECT role FROM club_members WHERE club_id = $1 AND user_id = $2 AND status = 'accepted'`,
    [clubId, user.id]
  );
  if (adminCheck[0]?.role !== 'admin') {
    return c.json({ error: { code: 'FORBIDDEN', message: API_MESSAGES.en.forbidden } }, 403);
  }
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE club_members SET status = 'accepted' WHERE club_id = $1 AND user_id = $2`,
    [clubId, targetUserId]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE clubs SET member_count = (SELECT COUNT(*) FROM club_members WHERE club_id = $1 AND status = 'accepted') WHERE id = $1`,
    [clubId]
  );
  return c.json({ ok: true });
});

// --- CHALLENGES ---
communityRouter.get('/challenges', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT ch.*,
            cp.progress_value AS viewer_progress,
            cp.completed AS viewer_completed,
            (cp.user_id IS NOT NULL) AS viewer_joined
     FROM challenges ch
     LEFT JOIN challenge_participants cp ON cp.challenge_id = ch.id AND cp.user_id = $1
     ORDER BY ch.ends_at DESC, ch.participant_count DESC
     LIMIT 40`,
    [viewer?.id ?? null]
  );
  return c.json({ challenges: rows });
});

const createChallengeSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(600).default(''),
  clubId: z.string().uuid().nullable().optional(),
  activityType: z.enum(['all', 'run', 'ride', 'walk', 'hike']).default('all'),
  metricType: z.enum(['distance_m', 'elevation_m', 'activity_count', 'moving_time_s']).default('distance_m'),
  targetValue: z.number().positive(),
  startsAt: z.string(),
  endsAt: z.string(),
});

communityRouter.post('/challenges', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = createChallengeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid challenge' } }, 400);
  }
  const d = parsed.data;
  const slug =
    (d.title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'challenge') +
    '-' +
    Math.floor(100 + Math.random() * 900);

  const created = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `INSERT INTO challenges (slug, club_id, creator_id, title, description, activity_type, metric_type, target_value, starts_at, ends_at, participant_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, 1)
     RETURNING *`,
    [slug, d.clubId ?? null, user.id, d.title.trim(), d.description.trim(), d.activityType, d.metricType, d.targetValue, d.startsAt, d.endsAt]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO challenge_participants (challenge_id, user_id, progress_value, completed) VALUES ($1, $2, 0, false)`,
    [created[0].id, user.id]
  );
  return c.json({ challenge: created[0] }, 201);
});

communityRouter.get('/challenges/:slug', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const slug = c.req.param('slug');
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT ch.*,
            cp.progress_value AS viewer_progress,
            cp.completed AS viewer_completed,
            (cp.user_id IS NOT NULL) AS viewer_joined
     FROM challenges ch
     LEFT JOIN challenge_participants cp ON cp.challenge_id = ch.id AND cp.user_id = $2
     WHERE ch.slug = $1 OR ch.id::text = $1`,
    [slug, viewer?.id ?? null]
  );
  const ch = rows[0];
  if (!ch) return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);

  const leaderboard = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT ROW_NUMBER() OVER (ORDER BY cp.progress_value DESC, cp.joined_at ASC)::int AS rank,
            cp.user_id, cp.progress_value, cp.completed, cp.completed_at,
            u.handle, u.display_name, u.avatar_url, u.home_city
     FROM challenge_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.challenge_id = $1 AND u.is_suspended = false
     ORDER BY cp.progress_value DESC
     LIMIT 100`,
    [ch.id]
  );
  return c.json({ challenge: ch, leaderboard });
});

communityRouter.post('/challenges/:id/join', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const chRows = await queryRows<{
    id: string;
    activity_type: string;
    metric_type: string;
    target_value: number;
    starts_at: string;
    ends_at: string;
  }>(c.env.DATABASE_URL, `SELECT * FROM challenges WHERE id = $1`, [id]);
  const ch = chRows[0];
  if (!ch) return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);

  const sumRow = await queryRows<{ val: number }>(
    c.env.DATABASE_URL,
    `SELECT CASE
       WHEN $4 = 'distance_m' THEN COALESCE(SUM(distance_m), 0)
       WHEN $4 = 'elevation_m' THEN COALESCE(SUM(elevation_gain_m), 0)
       WHEN $4 = 'moving_time_s' THEN COALESCE(SUM(moving_time_s), 0)
       ELSE COUNT(*)::float
     END AS val
     FROM activities
     WHERE user_id = $1 AND is_hidden_by_admin = false
       AND started_at BETWEEN $2::timestamptz AND $3::timestamptz
       AND ($5 = 'all' OR activity_type = $5)`,
    [user.id, ch.starts_at, ch.ends_at, ch.metric_type, ch.activity_type]
  );
  const progress = Number(sumRow[0]?.val ?? 0);
  const completed = progress >= Number(ch.target_value);

  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO challenge_participants (challenge_id, user_id, progress_value, completed, completed_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END)
     ON CONFLICT (challenge_id, user_id) DO UPDATE SET progress_value = EXCLUDED.progress_value, completed = EXCLUDED.completed`,
    [id, user.id, progress, completed]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE challenges SET participant_count = (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = $1) WHERE id = $1`,
    [id]
  );
  return c.json({ joined: true, progress, completed }, 201);
});

communityRouter.delete('/challenges/:id/leave', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await queryRows(c.env.DATABASE_URL, `DELETE FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2`, [id, user.id]);
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE challenges SET participant_count = (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = $1) WHERE id = $1`,
    [id]
  );
  return c.json({ ok: true });
});

// --- EVENTS ---
communityRouter.get('/events', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT e.*, c.name AS club_name, c.slug AS club_slug,
            (SELECT COUNT(*)::int FROM event_attendees ea WHERE ea.event_id = e.id) AS attendee_count,
            EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = $1) AS viewer_going
     FROM events e
     LEFT JOIN clubs c ON c.id = e.club_id
     ORDER BY e.starts_at ASC
     LIMIT 30`,
    [viewer?.id ?? null]
  );
  return c.json({ events: rows });
});

communityRouter.post('/events', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as {
    clubId?: string | null;
    title?: string;
    description?: string;
    city?: string;
    locationName?: string;
    activityType?: string;
    startsAt?: string;
  } | null;
  if (!body?.title || !body.startsAt) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Title and startsAt are required.' } }, 400);
  }
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `INSERT INTO events (club_id, creator_id, title, description, city, location_name, activity_type, starts_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz) RETURNING *`,
    [
      body.clubId ?? null,
      user.id,
      body.title.trim(),
      body.description?.trim() || '',
      body.city?.trim() || '',
      body.locationName?.trim() || '',
      body.activityType || 'run',
      body.startsAt,
    ]
  );
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO event_attendees (event_id, user_id, status) VALUES ($1, $2, 'going')`,
    [rows[0].id, user.id]
  );
  return c.json({ event: rows[0] }, 201);
});

communityRouter.post('/events/:id/rsvp', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { going?: boolean };
  if (body.going === false) {
    await queryRows(c.env.DATABASE_URL, `DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2`, [id, user.id]);
    return c.json({ going: false });
  }
  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO event_attendees (event_id, user_id, status) VALUES ($1, $2, 'going') ON CONFLICT DO NOTHING`,
    [id, user.id]
  );
  return c.json({ going: true });
});
