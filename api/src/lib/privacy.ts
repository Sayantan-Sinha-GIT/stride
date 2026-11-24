import { maskTrackForViewer, type FilteredTrackPoint, type PrivacyZone } from '@stride/track-engine';
import { queryRows } from './db.js';

export async function isBlockedBetween(
  databaseUrl: string,
  userA: string | null,
  userB: string
): Promise<boolean> {
  if (!userA || userA === userB) return false;
  const rows = await queryRows<{ exists: boolean }>(
    databaseUrl,
    `SELECT EXISTS (
       SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
     ) AS exists`,
    [userA, userB]
  );
  return Boolean(rows[0]?.exists);
}

export async function isFollowingAccepted(
  databaseUrl: string,
  followerId: string | null,
  followingId: string
): Promise<boolean> {
  if (!followerId) return false;
  if (followerId === followingId) return true;
  const rows = await queryRows<{ exists: boolean }>(
    databaseUrl,
    `SELECT EXISTS (
       SELECT 1 FROM follows
       WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'
     ) AS exists`,
    [followerId, followingId]
  );
  return Boolean(rows[0]?.exists);
}

export async function canViewActivity(
  databaseUrl: string,
  viewerId: string | null,
  viewerRole: 'user' | 'admin' | null,
  activity: { user_id: string; visibility: string; is_hidden_by_admin: boolean }
): Promise<boolean> {
  if (activity.is_hidden_by_admin && viewerRole !== 'admin' && viewerId !== activity.user_id) {
    return false;
  }
  if (viewerId === activity.user_id) return true;
  if (await isBlockedBetween(databaseUrl, viewerId, activity.user_id)) {
    return false;
  }
  if (activity.visibility === 'public') return true;
  if (activity.visibility === 'private') return false;
  if (activity.visibility === 'followers') {
    return await isFollowingAccepted(databaseUrl, viewerId, activity.user_id);
  }
  return false;
}

export async function getUserPrivacyMaskSettings(
  databaseUrl: string,
  ownerId: string
): Promise<{ zones: PrivacyZone[]; hideStartEndMeters: number }> {
  const [zones, settings] = await Promise.all([
    queryRows<{ id: string; name: string; lat: number; lng: number; radius_meters: number }>(
      databaseUrl,
      `SELECT id, name, lat, lng, radius_meters FROM privacy_zones WHERE user_id = $1`,
      [ownerId]
    ),
    queryRows<{ hide_start_end_meters: number }>(
      databaseUrl,
      `SELECT hide_start_end_meters FROM user_settings WHERE user_id = $1`,
      [ownerId]
    ),
  ]);

  return {
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      lat: Number(z.lat),
      lng: Number(z.lng),
      radiusMeters: Number(z.radius_meters),
    })),
    hideStartEndMeters: Number(settings[0]?.hide_start_end_meters ?? 0),
  };
}

/**
 * Redacts raw track points, polyline, and start location when viewer is NOT the owner.
 */
export function applyTrackMaskForViewer(
  points: FilteredTrackPoint[],
  originalPolyline: string,
  ownerId: string,
  viewerId: string | null,
  zones: PrivacyZone[],
  hideStartEndMeters: number
): {
  points: FilteredTrackPoint[];
  encodedPolyline: string;
  privacyClipped: boolean;
} {
  if (viewerId === ownerId) {
    return {
      points,
      encodedPolyline: originalPolyline,
      privacyClipped: false,
    };
  }
  if (points.length === 0) {
    return { points: [], encodedPolyline: '', privacyClipped: false };
  }
  const masked = maskTrackForViewer(points, zones, hideStartEndMeters);
  return {
    points: masked.points,
    encodedPolyline: masked.encodedPolyline,
    privacyClipped: masked.clipped,
  };
}
