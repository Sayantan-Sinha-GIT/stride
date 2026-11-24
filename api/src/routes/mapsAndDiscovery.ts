import type { FilteredTrackPoint } from '@stride/track-engine';
import { Hono } from 'hono';
import { optionalAuth, requireAuth } from '../lib/auth.js';
import { kvGetJson, kvSetJson } from '../lib/cache.js';
import { queryRows } from '../lib/db.js';
import { applyTrackMaskForViewer, getUserPrivacyMaskSettings } from '../lib/privacy.js';
import type { AppVariables, Env } from '../types.js';

export const mapsAndDiscoveryRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// --- ROUTE DISCOVERY (PostGIS proximity on public activities + segments; no external routing APIs) ---
mapsAndDiscoveryRouter.get('/routes/nearby', optionalAuth, async (c) => {
  const viewer = c.get('user');
  const lat = Number(c.req.query('lat') || 12.9762);
  const lng = Number(c.req.query('lng') || 77.5929);
  const radiusKm = Math.min(250, Math.max(1, Number(c.req.query('radiusKm') || 25)));
  const activityType = c.req.query('activityType');

  const [activityRoutes, segmentRoutes] = await Promise.all([
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT a.id, a.user_id, a.title, a.activity_type, a.distance_m, a.elevation_gain_m,
              a.encoded_polyline, a.raw_points_json, u.home_city AS city, u.handle AS author_handle,
              ST_Distance(a.start_point::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_from_search_m
       FROM activities a
       JOIN users u ON u.id = a.user_id
       WHERE a.visibility = 'public'
         AND a.is_hidden_by_admin = false
         AND a.source <> 'manual'
         AND a.start_point IS NOT NULL
         AND ($4::text IS NULL OR a.activity_type = $4)
         AND ST_DWithin(a.start_point::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
       ORDER BY a.kudos_count DESC, a.started_at DESC
       LIMIT 20`,
      [lat, lng, radiusKm * 1000, activityType || null]
    ),
    queryRows<Record<string, unknown>>(
      c.env.DATABASE_URL,
      `SELECT s.id, s.name, s.city, s.activity_type, s.distance_m, s.elevation_gain_m, s.encoded_polyline, s.effort_count,
              ST_Distance(s.start_point::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_from_search_m
       FROM segments s
       WHERE s.is_hidden_by_admin = false
         AND ($4::text IS NULL OR s.activity_type = $4)
         AND ST_DWithin(s.start_point::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
       ORDER BY s.effort_count DESC
       LIMIT 20`,
      [lat, lng, radiusKm * 1000, activityType || null]
    ),
  ]);

  const privacyCache = new Map<string, Awaited<ReturnType<typeof getUserPrivacyMaskSettings>>>();
  const maskedActivities = await Promise.all(
    activityRoutes.map(async (r) => {
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
        kind: 'activity',
        name: r.title,
        city: r.city,
        activityType: r.activity_type,
        distanceM: Number(r.distance_m),
        elevationGainM: Number(r.elevation_gain_m),
        encodedPolyline: masked.encodedPolyline,
        privacyClipped: masked.privacyClipped,
        authorHandle: r.author_handle,
        distanceFromSearchM: Math.round(Number(r.distance_from_search_m)),
      };
    })
  );

  return c.json({
    activities: maskedActivities.filter((a) => a.encodedPolyline.length > 0),
    segments: segmentRoutes.map((s) => ({
      id: s.id,
      kind: 'segment',
      name: s.name,
      city: s.city,
      activityType: s.activity_type,
      distanceM: Number(s.distance_m),
      elevationGainM: Number(s.elevation_gain_m),
      encodedPolyline: s.encoded_polyline,
      effortCount: Number(s.effort_count),
      distanceFromSearchM: Math.round(Number(s.distance_from_search_m)),
    })),
  });
});

mapsAndDiscoveryRouter.get('/routes/saved', requireAuth, async (c) => {
  const user = c.get('user')!;
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT * FROM saved_routes WHERE user_id = $1 ORDER BY created_at DESC`,
    [user.id]
  );
  return c.json({ savedRoutes: rows });
});

mapsAndDiscoveryRouter.post('/routes/saved', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as {
    sourceActivityId?: string;
    sourceSegmentId?: string;
    name?: string;
    activityType?: string;
    distanceM?: number;
    elevationGainM?: number;
    encodedPolyline?: string;
  } | null;

  if (!body?.name || !body?.encodedPolyline) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Route name and polyline are required.' } }, 400);
  }
  const rows = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `INSERT INTO saved_routes (user_id, source_activity_id, source_segment_id, name, activity_type, distance_m, elevation_gain_m, encoded_polyline)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      user.id,
      body.sourceActivityId ?? null,
      body.sourceSegmentId ?? null,
      body.name.trim(),
      body.activityType || 'run',
      body.distanceM ?? 0,
      body.elevationGainM ?? 0,
      body.encodedPolyline,
    ]
  );
  return c.json({ savedRoute: rows[0] }, 201);
});

mapsAndDiscoveryRouter.delete('/routes/saved/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await queryRows(c.env.DATABASE_URL, `DELETE FROM saved_routes WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return c.json({ ok: true });
});

// --- ANONYMIZED CITY HEATMAP (Minimum contributor threshold >= 3 strictly enforced) ---
mapsAndDiscoveryRouter.get('/heatmap', async (c) => {
  const city = (c.req.query('city') || '').trim().toLowerCase();
  const activityType = c.req.query('activityType') || 'all';
  const cacheKey = `heatmap:${city || 'all'}:${activityType}`;

  const cached = await kvGetJson<{ cells: unknown[] }>(c.env.STRIDE_KV, cacheKey);
  if (cached) return c.json({ ...cached, minContributorsThreshold: 3, cached: true });

  const cells = await queryRows<Record<string, unknown>>(
    c.env.DATABASE_URL,
    `SELECT cell_id, city, activity_type, lat, lng, weight, contributor_count
     FROM heatmap_cells
     WHERE contributor_count >= 3
       AND activity_type = $1
       AND ($2 = '' OR city = $2)
     ORDER BY weight DESC
     LIMIT 1500`,
    [activityType, city]
  );

  await kvSetJson(c.env.STRIDE_KV, cacheKey, { cells }, 300);
  return c.json({ cells, minContributorsThreshold: 3, cached: false });
});

// --- MAP PROVIDER ABSTRACTION (Ola Maps primary + OpenFreeMap vector fallback) ---
mapsAndDiscoveryRouter.get('/maps/config', (c) => {
  const hasOla = Boolean(c.env.OLA_MAPS_API_KEY && c.env.OLA_MAPS_API_KEY.trim().length > 0);
  if (hasOla) {
    const key = c.env.OLA_MAPS_API_KEY!.trim();
    return c.json({
      provider: 'ola',
      attribution: '© Ola Maps (Krutrim) | OpenStreetMap contributors',
      lightStyleUrl: `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?api_key=${encodeURIComponent(key)}`,
      darkStyleUrl: `https://api.olamaps.io/tiles/vector/v1/styles/default-dark-standard/style.json?api_key=${encodeURIComponent(key)}`,
      fallbackLightStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
      fallbackDarkStyleUrl: 'https://tiles.openfreemap.org/styles/dark',
    });
  }
  return c.json({
    provider: 'openfreemap',
    attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
    lightStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
    darkStyleUrl: 'https://tiles.openfreemap.org/styles/dark',
  });
});

mapsAndDiscoveryRouter.get('/maps/geocode', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (q.length < 2 || q.length > 100) {
    return c.json({ results: [] });
  }
  const cacheKey = `geo:${q.toLowerCase()}`;
  const cached = await kvGetJson<{ results: unknown[] }>(c.env.STRIDE_KV, cacheKey);
  if (cached) return c.json({ ...cached, cached: true });

  let results: Array<{ label: string; lat: number; lng: number }> = [];

  if (c.env.OLA_MAPS_API_KEY) {
    try {
      const olaRes = await fetch(
        `https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(q)}&api_key=${encodeURIComponent(c.env.OLA_MAPS_API_KEY)}`
      );
      if (olaRes.ok) {
        const json = (await olaRes.json()) as {
          predictions?: Array<{
            description?: string;
            geometry?: { location?: { lat?: number; lng?: number } };
          }>;
        };
        results = (json.predictions || [])
          .filter((p) => p.geometry?.location?.lat != null && p.geometry?.location?.lng != null)
          .slice(0, 6)
          .map((p) => ({
            label: p.description || q,
            lat: Number(p.geometry!.location!.lat),
            lng: Number(p.geometry!.location!.lng),
          }));
      }
    } catch {
      // Fall back below
    }
  }

  if (results.length === 0) {
    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
        { headers: { 'User-Agent': 'StrideFitnessApp/1.0' } }
      );
      if (nomRes.ok) {
        const items = (await nomRes.json()) as Array<{ display_name: string; lat: string; lon: string }>;
        results = items.map((item) => ({
          label: item.display_name,
          lat: Number(item.lat),
          lng: Number(item.lon),
        }));
      }
    } catch {
      results = [];
    }
  }

  await kvSetJson(c.env.STRIDE_KV, cacheKey, { results }, 86400);
  return c.json({ results, cached: false });
});
