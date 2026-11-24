import type { FilteredTrackPoint } from '@stride/track-engine';
import { Hono } from 'hono';
import { checkRateLimit, optionalAuth, requireAuth } from '../lib/auth.js';
import { queryRows } from '../lib/db.js';
import { dispatchNotification, getUserNotificationCopy } from '../lib/fcm.js';
import { API_MESSAGES } from '../lib/i18n.js';
import {
  applyTrackMaskForViewer,
  getUserPrivacyMaskSettings,
  isBlockedBetween,
} from '../lib/privacy.js';
import type { AppVariables, Env } from '../types.js';

export const socialRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

socialRouter.get('/users/search', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const q = (c.req.query('q') || '').trim();
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT u.id, u.handle, u.display_name, u.home_city, u.avatar_url,
            (SELECT COUNT(*)::int FROM activities a WHERE a.user_id = u.id AND a.visibility = 'public' AND a.is_hidden_by_admin = false) AS public_activity_count
     FROM users u
     WHERE u.is_suspended = false
       AND ($1 = '' OR u.handle ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%' OR u.home_city ILIKE '%' || $1 || '%')
       AND ($2::uuid IS NULL OR NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $2 AND b.blocked_id = u.id)
            OR (b.blocker_id = u.id AND b.blocked_id = $2)
       ))
     ORDER BY u.created_at DESC
     LIMIT 30`,
    [q, viewer?.id ?? null]
  );
  return c.json({ users: rows });
});

socialRouter.get('/users/:handle', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const handle = (c.req.param('handle') ?? '').toLowerCase();

  const users = await queryRows<{
    id: string;
    handle: string;
    display_name: string;
    bio: string;
    avatar_url: string | null;
    home_city: string;
    created_at: string;
    is_suspended: boolean;
    is_private_account: boolean;
  }>(
    c.env.DATABASE_URL,
    `SELECT u.id, u.handle, u.display_name, u.bio, u.avatar_url, u.home_city, u.created_at, u.is_suspended,
            COALESCE(s.is_private_account, false) AS is_private_account
     FROM users u
     LEFT JOIN user_settings s ON s.user_id = u.id
     WHERE LOWER(u.handle) = $1`,
    [handle]
  );
  const profile = users[0];
  if (!profile || profile.is_suspended) {
    return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);
  }
  if (await isBlockedBetween(c.env.DATABASE_URL, viewer?.id ?? null, profile.id)) {
    return c.json({ error: { code: 'NOT_FOUND', message: API_MESSAGES.en.notFound } }, 404);
  }

  const [followCounts, followState, acts, badges] = await Promise.all([
    queryRows<{ followers: number; following: number }>(
      c.env.DATABASE_URL,
      `SELECT
         (SELECT COUNT(*)::int FROM follows WHERE following_id = $1 AND status = 'accepted') AS followers,
         (SELECT COUNT(*)::int FROM follows WHERE follower_id = $1 AND status = 'accepted') AS following`,
      [profile.id]
    ),
    viewer
      ? queryRows<{ status: string }>(
          c.env.DATABASE_URL,
          `SELECT status FROM follows WHERE follower_id = $1 AND following_id = $2`,
          [viewer.id, profile.id]
        )
      : Promise.resolve([]),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT a.id, a.title, a.activity_type, a.source, a.visibility, a.started_at,
              a.distance_m, a.moving_time_s, a.elevation_gain_m, a.encoded_polyline, a.raw_points_json,
              a.kudos_count, a.comment_count
       FROM activities a
       WHERE a.user_id = $1
         AND a.is_hidden_by_admin = false
         AND (
           a.visibility = 'public'
           OR $2::uuid = a.user_id
           OR (
             a.visibility = 'followers'
             AND $2::uuid IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM follows f
               WHERE f.follower_id = $2 AND f.following_id = a.user_id AND f.status = 'accepted'
             )
           )
         )
       ORDER BY a.started_at DESC
       LIMIT 20`,
      [profile.id, viewer?.id ?? null]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT b.code, b.title_en, b.title_hi, ub.awarded_at
       FROM user_badges ub JOIN badges b ON b.code = ub.badge_code
       WHERE ub.user_id = $1 ORDER BY ub.awarded_at DESC`,
      [profile.id]
    ),
  ]);

  const maskCfg = await getUserPrivacyMaskSettings(c.env.DATABASE_URL, profile.id);
  const maskedActivities = acts.map((a) => {
    const pts = Array.isArray(a.raw_points_json) ? (a.raw_points_json as FilteredTrackPoint[]) : [];
    const masked = applyTrackMaskForViewer(
      pts,
      String(a.encoded_polyline || ''),
      profile.id,
      viewer?.id ?? null,
      maskCfg.zones,
      maskCfg.hideStartEndMeters
    );
    return {
      id: a.id,
      title: a.title,
      activityType: a.activity_type,
      source: a.source,
      visibility: a.visibility,
      startedAt: a.started_at,
      distanceM: Number(a.distance_m),
      movingTimeS: Number(a.moving_time_s),
      elevationGainM: Number(a.elevation_gain_m),
      encodedPolyline: masked.encodedPolyline,
      privacyClipped: masked.privacyClipped,
      kudosCount: Number(a.kudos_count),
      commentCount: Number(a.comment_count),
    };
  });

  const totalDistM = maskedActivities.reduce((acc, a) => acc + a.distanceM, 0);

  return c.json({
    profile: {
      id: profile.id,
      handle: profile.handle,
      displayName: profile.display_name,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      homeCity: profile.home_city,
      createdAt: profile.created_at,
      isPrivateAccount: profile.is_private_account,
      followersCount: Number(followCounts[0]?.followers ?? 0),
      followingCount: Number(followCounts[0]?.following ?? 0),
      followStatus: followState[0]?.status ?? null,
      visibleDistanceM: Math.round(totalDistM),
      visibleActivityCount: maskedActivities.length,
    },
    activities: maskedActivities,
    badges,
  });
});

socialRouter.post('/users/:userId/follow', requireAuth, async (c) => {
  if (!(await checkRateLimit(c, 'social:follow', 40, 300))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const user = c.get('user')!;
  const targetId = c.req.param('userId') ?? '';
  if (user.id === targetId) {
    return c.json({ error: { code: 'INVALID_OPERATION', message: 'Cannot follow yourself.' } }, 400);
  }
  if (await isBlockedBetween(c.env.DATABASE_URL, user.id, targetId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Unable to follow this user.' } }, 403);
  }

  const targetSettings = await queryRows<{ is_private_account: boolean }>(
    c.env.DATABASE_URL,
    `SELECT COALESCE(is_private_account, false) AS is_private_account FROM user_settings WHERE user_id = $1`,
    [targetId]
  );
  const status = targetSettings[0]?.is_private_account ? 'pending' : 'accepted';

  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO follows (follower_id, following_id, status) VALUES ($1, $2, $3)
     ON CONFLICT (follower_id, following_id) DO UPDATE SET status = EXCLUDED.status`,
    [user.id, targetId, status]
  );

  const copy = await getUserNotificationCopy(c.env.DATABASE_URL, targetId);
  await dispatchNotification(c.env, {
    userId: targetId,
    actorId: user.id,
    kind: 'follows',
    targetType: 'user',
    targetId: user.id,
    title: status === 'pending' ? copy.followRequestTitle : copy.followTitle,
    body: status === 'pending' ? copy.followRequestBody(user.displayName) : copy.followBody(user.displayName),
  });

  return c.json({ status }, 201);
});

socialRouter.delete('/users/:userId/follow', requireAuth, async (c) => {
  const user = c.get('user')!;
  const targetId = c.req.param('userId');
  await queryRows(
    c.env.DATABASE_URL,
    `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
    [user.id, targetId]
  );
  return c.json({ ok: true });
});

socialRouter.get('/me/follow-requests', requireAuth, async (c) => {
  const user = c.get('user')!;
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT f.follower_id, f.created_at, u.handle, u.display_name, u.avatar_url, u.home_city
     FROM follows f JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [user.id]
  );
  return c.json({ requests: rows });
});

socialRouter.post('/me/follow-requests/:followerId/accept', requireAuth, async (c) => {
  const user = c.get('user')!;
  const followerId = c.req.param('followerId');
  await queryRows(
    c.env.DATABASE_URL,
    `UPDATE follows SET status = 'accepted' WHERE follower_id = $1 AND following_id = $2`,
    [followerId, user.id]
  );
  return c.json({ ok: true });
});

socialRouter.post('/me/follow-requests/:followerId/decline', requireAuth, async (c) => {
  const user = c.get('user')!;
  const followerId = c.req.param('followerId');
  await queryRows(
    c.env.DATABASE_URL,
    `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'pending'`,
    [followerId, user.id]
  );
  return c.json({ ok: true });
});

socialRouter.post('/users/:userId/block', requireAuth, async (c) => {
  const user = c.get('user')!;
  const targetId = c.req.param('userId');
  if (user.id === targetId) return c.json({ error: { code: 'INVALID', message: 'Cannot block yourself.' } }, 400);

  await queryRows(
    c.env.DATABASE_URL,
    `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [user.id, targetId]
  );
  // Remove follows in both directions
  await queryRows(
    c.env.DATABASE_URL,
    `DELETE FROM follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`,
    [user.id, targetId]
  );
  return c.json({ blocked: true }, 201);
});

socialRouter.delete('/users/:userId/block', requireAuth, async (c) => {
  const user = c.get('user')!;
  const targetId = c.req.param('userId');
  await queryRows(
    c.env.DATABASE_URL,
    `DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [user.id, targetId]
  );
  return c.json({ blocked: false });
});

socialRouter.post('/reports', requireAuth, async (c) => {
  if (!(await checkRateLimit(c, 'social:report', 20, 600))) {
    return c.json({ error: { code: 'RATE_LIMITED', message: API_MESSAGES.en.rateLimited } }, 429);
  }
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as {
    targetType?: 'activity' | 'comment' | 'segment' | 'effort' | 'user';
    targetId?: string;
    reason?: string;
    details?: string;
  } | null;

  if (!body?.targetType || !body?.targetId || !body?.reason) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'targetType, targetId, and reason are required' } }, 400);
  }

  const rows = await queryRows<{ id: string }>(
    c.env.DATABASE_URL,
    `INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
     VALUES ($1, $2, $3::uuid, $4, $5) RETURNING id`,
    [user.id, body.targetType, body.targetId, body.reason.trim().slice(0, 120), (body.details || '').trim().slice(0, 800)]
  );
  return c.json({ id: rows[0].id }, 201);
});
