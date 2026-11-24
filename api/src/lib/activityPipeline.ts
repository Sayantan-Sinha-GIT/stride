import {
  detectPersonalRecords,
  maskTrackForViewer,
  matchActivityToSegment,
  type ActivitySource,
  type ActivityType,
  type FilteredTrackPoint,
  type LatLng,
  type SegmentDefinition,
} from '@stride/track-engine';
import type { Env } from '../types.js';
import { kvDelete } from './cache.js';
import { queryRows } from './db.js';
import { dispatchNotification, getUserNotificationCopy } from './fcm.js';
import { getUserPrivacyMaskSettings } from './privacy.js';

export async function awardBadgeIfEligible(
  env: Env,
  userId: string,
  badgeCode: string
): Promise<boolean> {
  const inserted = await queryRows<{ badge_code: string }>(
    env.DATABASE_URL,
    `INSERT INTO user_badges (user_id, badge_code)
     VALUES ($1, $2)
     ON CONFLICT (user_id, badge_code) DO NOTHING
     RETURNING badge_code`,
    [userId, badgeCode]
  );
  if (!inserted[0]) return false;

  const badgeInfo = await queryRows<{ title_en: string; title_hi: string }>(
    env.DATABASE_URL,
    `SELECT title_en, title_hi FROM badges WHERE code = $1`,
    [badgeCode]
  );
  const copy = await getUserNotificationCopy(env.DATABASE_URL, userId);
  const title = badgeInfo[0]?.title_en || badgeCode;
  await dispatchNotification(env, {
    userId,
    kind: 'challenges',
    targetType: 'badge',
    title: copy.badgeTitle,
    body: copy.badgeBody(title),
  });
  return true;
}

export async function updateRecordsBadgesAndChallenges(
  env: Env,
  input: {
    userId: string;
    activityId: string;
    activityType: ActivityType;
    source: ActivitySource;
    points: FilteredTrackPoint[];
    distanceM: number;
    movingTimeS: number;
    elapsedTimeS: number;
    elevationGainM: number;
    startedAtIso: string;
    gearId?: string | null;
  }
): Promise<void> {
  // 1. Personal records
  const candidates = detectPersonalRecords(
    input.points,
    input.activityType,
    input.source,
    input.elevationGainM,
    input.distanceM,
    input.elapsedTimeS
  );

  for (const cand of candidates) {
    const isMaxMetric =
      cand.metricKey.endsWith('_longest_distance') || cand.metricKey.endsWith('_highest_climb');
    const existing = await queryRows<{ value_num: number }>(
      env.DATABASE_URL,
      `SELECT value_num FROM personal_records WHERE user_id = $1 AND metric_key = $2`,
      [input.userId, cand.metricKey]
    );
    const shouldReplace =
      !existing[0] ||
      (isMaxMetric ? cand.valueNum > existing[0].value_num : cand.valueNum < existing[0].value_num);

    if (shouldReplace) {
      await queryRows(
        env.DATABASE_URL,
        `INSERT INTO personal_records (user_id, metric_key, activity_type, activity_id, value_num, distance_m, duration_s, achieved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
         ON CONFLICT (user_id, metric_key)
         DO UPDATE SET activity_id = EXCLUDED.activity_id, value_num = EXCLUDED.value_num,
                       distance_m = EXCLUDED.distance_m, duration_s = EXCLUDED.duration_s,
                       achieved_at = EXCLUDED.achieved_at`,
        [
          input.userId,
          cand.metricKey,
          cand.activityType,
          input.activityId,
          cand.valueNum,
          cand.distanceM,
          cand.durationS,
          input.startedAtIso,
        ]
      );
    }
  }

  // 2. Update gear mileage
  if (input.gearId) {
    await queryRows(
      env.DATABASE_URL,
      `UPDATE gear
       SET logged_distance_m = COALESCE((
         SELECT SUM(distance_m) FROM activities WHERE gear_id = $1 AND is_hidden_by_admin = false
       ), 0)
       WHERE id = $1 AND user_id = $2`,
      [input.gearId, input.userId]
    );
  }

  // 3. Recompute active joined challenges for this user
  const activeChallenges = await queryRows<{
    id: string;
    activity_type: string;
    metric_type: string;
    target_value: number;
    starts_at: string;
    ends_at: string;
    badge_code: string;
  }>(
    env.DATABASE_URL,
    `SELECT c.id, c.activity_type, c.metric_type, c.target_value, c.starts_at, c.ends_at, c.badge_code
     FROM challenges c
     JOIN challenge_participants cp ON cp.challenge_id = c.id
     WHERE cp.user_id = $1 AND c.ends_at >= now() - interval '2 days'`,
    [input.userId]
  );

  for (const ch of activeChallenges) {
    const sumRow = await queryRows<{ val: number }>(
      env.DATABASE_URL,
      `SELECT CASE
         WHEN $4 = 'distance_m' THEN COALESCE(SUM(distance_m), 0)
         WHEN $4 = 'elevation_m' THEN COALESCE(SUM(elevation_gain_m), 0)
         WHEN $4 = 'moving_time_s' THEN COALESCE(SUM(moving_time_s), 0)
         ELSE COUNT(*)::float
       END AS val
       FROM activities
       WHERE user_id = $1
         AND is_hidden_by_admin = false
         AND started_at BETWEEN $2::timestamptz AND $3::timestamptz
         AND ($5 = 'all' OR activity_type = $5)`,
      [input.userId, ch.starts_at, ch.ends_at, ch.metric_type, ch.activity_type]
    );
    const progress = Number(sumRow[0]?.val ?? 0);
    const completed = progress >= Number(ch.target_value);
    await queryRows(
      env.DATABASE_URL,
      `UPDATE challenge_participants
       SET progress_value = $1,
           completed = $2,
           completed_at = CASE WHEN $2 AND completed_at IS NULL THEN now() ELSE completed_at END
       WHERE challenge_id = $3 AND user_id = $4`,
      [progress, completed, ch.id, input.userId]
    );
    if (completed && ch.badge_code) {
      await awardBadgeIfEligible(env, input.userId, ch.badge_code);
    }
  }

  // 4. Milestone badges
  const statsRow = await queryRows<{ cnt: number; total_m: number }>(
    env.DATABASE_URL,
    `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(distance_m), 0)::float AS total_m
     FROM activities WHERE user_id = $1 AND is_hidden_by_admin = false`,
    [input.userId]
  );
  const cnt = Number(statsRow[0]?.cnt ?? 0);
  const totalM = Number(statsRow[0]?.total_m ?? 0);
  if (cnt >= 1) await awardBadgeIfEligible(env, input.userId, 'first_activity');
  if (totalM >= 50_000) await awardBadgeIfEligible(env, input.userId, 'distance_50k');
  if (totalM >= 100_000) await awardBadgeIfEligible(env, input.userId, 'distance_100k');
  if (input.activityType === 'run' && input.distanceM >= 10_000) {
    await awardBadgeIfEligible(env, input.userId, 'ten_k_finisher');
  }
  if (input.elevationGainM >= 300) {
    await awardBadgeIfEligible(env, input.userId, 'hill_climber');
  }
}

export async function runSegmentMatchingForActivity(
  env: Env,
  input: {
    activityId: string;
    userId: string;
    activityType: ActivityType;
    source: ActivitySource;
    points: FilteredTrackPoint[];
    wktLineString: string;
    startedAtIso: string;
  }
): Promise<number> {
  if (input.source === 'manual' || input.points.length < 4 || !input.wktLineString) {
    return 0;
  }

  // PostGIS spatial bounding box pre-filter via GiST index
  const candidates = await queryRows<{
    id: string;
    name: string;
    activity_type: ActivityType;
    distance_m: number;
    points_json: LatLng[];
  }>(
    env.DATABASE_URL,
    `SELECT id, name, activity_type, distance_m, points_json
     FROM segments
     WHERE activity_type = $1
       AND is_hidden_by_admin = false
       AND ST_Intersects(bbox, ST_Expand(ST_GeomFromText($2, 4326), 0.001))`,
    [input.activityType, input.wktLineString]
  );

  let matchedCount = 0;
  for (const row of candidates) {
    const segDef: SegmentDefinition = {
      id: row.id,
      name: row.name,
      activityType: row.activity_type,
      distanceM: Number(row.distance_m),
      points: Array.isArray(row.points_json) ? row.points_json : [],
    };
    const res = matchActivityToSegment(input.points, segDef, input.activityType, input.source);
    if (!res.matched || res.elapsedTimeS == null) continue;

    // Check prior personal best on this segment
    const prevBest = await queryRows<{ best_time: number }>(
      env.DATABASE_URL,
      `SELECT MIN(elapsed_time_s) AS best_time
       FROM segment_efforts
       WHERE segment_id = $1 AND user_id = $2 AND is_flagged = false AND is_hidden_by_admin = false`,
      [row.id, input.userId]
    );
    const isPr = !res.isFlagged && (!prevBest[0]?.best_time || res.elapsedTimeS < prevBest[0].best_time);

    await queryRows(
      env.DATABASE_URL,
      `INSERT INTO segment_efforts (
         segment_id, activity_id, user_id, elapsed_time_s, avg_speed_mps, max_speed_mps,
         start_offset_s, end_offset_s, is_pr, is_flagged, flag_reason, started_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)
       ON CONFLICT (segment_id, activity_id)
       DO UPDATE SET elapsed_time_s = EXCLUDED.elapsed_time_s,
                     avg_speed_mps = EXCLUDED.avg_speed_mps,
                     max_speed_mps = EXCLUDED.max_speed_mps,
                     start_offset_s = EXCLUDED.start_offset_s,
                     end_offset_s = EXCLUDED.end_offset_s,
                     is_pr = EXCLUDED.is_pr,
                     is_flagged = EXCLUDED.is_flagged,
                     flag_reason = EXCLUDED.flag_reason`,
      [
        row.id,
        input.activityId,
        input.userId,
        res.elapsedTimeS,
        res.avgSpeedMps ?? 0,
        res.maxSpeedMps ?? 0,
        res.startOffsetS ?? 0,
        res.endOffsetS ?? 0,
        isPr,
        Boolean(res.isFlagged),
        res.flagReason ?? null,
        input.startedAtIso,
      ]
    );

    await queryRows(
      env.DATABASE_URL,
      `UPDATE segments SET effort_count = (
         SELECT COUNT(*) FROM segment_efforts WHERE segment_id = $1 AND is_flagged = false AND is_hidden_by_admin = false
       ) WHERE id = $1`,
      [row.id]
    );

    // Bust leaderboard KV caches for this segment
    for (const range of ['all', 'year', 'month']) {
      await kvDelete(env.STRIDE_KV, `lb:${row.id}:${range}`);
    }

    if (isPr) {
      const copy = await getUserNotificationCopy(env.DATABASE_URL, input.userId);
      await dispatchNotification(env, {
        userId: input.userId,
        kind: 'segments_pr',
        targetType: 'segment',
        targetId: row.id,
        title: copy.prTitle,
        body: copy.prBody(row.name, Math.round(res.elapsedTimeS)),
      });
    }
    matchedCount++;
  }

  return matchedCount;
}

/**
 * Rebuilds anonymized city heatmap cells strictly from public activities outside owner privacy zones,
 * keeping contributor counts so public read endpoint only serves cells with >= 3 distinct contributors.
 */
export async function rebuildAnonymizedHeatmap(env: Env): Promise<{ cellsUpserted: number }> {
  const publicActivities = await queryRows<{
    id: string;
    user_id: string;
    activity_type: ActivityType;
    home_city: string;
    raw_points_json: FilteredTrackPoint[];
  }>(
    env.DATABASE_URL,
    `SELECT a.id, a.user_id, a.activity_type, COALESCE(u.home_city, 'global') AS home_city, a.raw_points_json
     FROM activities a
     JOIN users u ON u.id = a.user_id
     WHERE a.visibility = 'public'
       AND a.is_hidden_by_admin = false
       AND a.source <> 'manual'
       AND jsonb_array_length(a.raw_points_json) >= 4
     ORDER BY a.started_at DESC
     LIMIT 300`
  );

  const cellBuckets = new Map<
    string,
    {
      cellId: string;
      city: string;
      activityType: string;
      lat: number;
      lng: number;
      weight: number;
      users: Set<string>;
    }
  >();

  const privacyCache = new Map<string, Awaited<ReturnType<typeof getUserPrivacyMaskSettings>>>();

  for (const act of publicActivities) {
    let maskCfg = privacyCache.get(act.user_id);
    if (!maskCfg) {
      maskCfg = await getUserPrivacyMaskSettings(env.DATABASE_URL, act.user_id);
      privacyCache.set(act.user_id, maskCfg);
    }

    const pts = Array.isArray(act.raw_points_json) ? act.raw_points_json : [];
    const masked = maskTrackForViewer(pts, maskCfg.zones, maskCfg.hideStartEndMeters);
    const seenThisActivity = new Set<string>();

    for (const pt of masked.points) {
      // Snap to ~220m grid cell (0.002 deg)
      const qLat = Math.round(pt.lat * 500) / 500;
      const qLng = Math.round(pt.lng * 500) / 500;
      const cellId = `${qLat.toFixed(3)}:${qLng.toFixed(3)}`;

      for (const sport of ['all', act.activity_type]) {
        const key = `${cellId}|${sport}`;
        let bucket = cellBuckets.get(key);
        if (!bucket) {
          bucket = {
            cellId,
            city: (act.home_city || 'global').toLowerCase(),
            activityType: sport,
            lat: qLat,
            lng: qLng,
            weight: 0,
            users: new Set<string>(),
          };
          cellBuckets.set(key, bucket);
        }
        bucket.users.add(act.user_id);
        if (!seenThisActivity.has(key)) {
          bucket.weight += 1;
          seenThisActivity.add(key);
        }
      }
    }
  }

  let count = 0;
  for (const bucket of cellBuckets.values()) {
    await queryRows(
      env.DATABASE_URL,
      `INSERT INTO heatmap_cells (cell_id, city, activity_type, lat, lng, weight, contributor_count, geom, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($5, $4), 4326), now())
       ON CONFLICT (cell_id, activity_type)
       DO UPDATE SET city = EXCLUDED.city, weight = EXCLUDED.weight,
                     contributor_count = EXCLUDED.contributor_count, updated_at = now()`,
      [
        bucket.cellId,
        bucket.city,
        bucket.activityType,
        bucket.lat,
        bucket.lng,
        bucket.weight,
        bucket.users.size,
      ]
    );
    count++;
  }

  return { cellsUpserted: count };
}
