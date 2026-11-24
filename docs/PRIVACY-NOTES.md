# Stride — Privacy, Safety & DPDP Compliance Notes

1. **Privacy by Default**: Every newly registered account defaults to `default_visibility = 'followers'` (`user_settings`). Public city heatmaps and public pages only read activities explicitly set to `visibility = 'public'`.
2. **Server-Side Privacy Zone Enforcement**:
   - Users define circular Privacy Zones (`100m – 5000m` radius) and optional `hide_start_end_meters`.
   - `applyTrackMaskForViewer` inside `api/src/lib/privacy.ts` trims all track points inside zones and boundaries **before** returning JSON tracks, encoded polylines, or `.gpx` downloads to anyone other than the authenticated owner.
   - Public endpoints (`/v1/activities/feed`, `/v1/activities/:id`, `/v1/activities/:id/gpx`, `/v1/clubs/:slug`, `/v1/routes/nearby`, `/v1/users/:handle`) all route through this masking boundary.
3. **Anonymized City Heatmap**:
   - Computed asynchronously via Cloudflare Cron Triggers (`rebuildAnonymizedHeatmap`).
   - Strictly excludes `private`, `followers`, `manual`, and admin-hidden activities.
   - Applies the owner's privacy zones to every public track before bucketing into `~220m` (`0.002 deg`) cells.
   - `/v1/heatmap` executes `WHERE contributor_count >= 3` so individual athletes can never be re-identified from sparse streets.
4. **Blocking & Two-Way Isolation**:
   - Creating a block removes follows in both directions and filters out blocked users from feeds, segment leaderboards, profiles, and user search.
5. **Account Rights (India DPDP Spirit)**:
   - Full export (`GET /v1/me/export`) returns account JSON + GPX 1.1 files.
   - Full deletion (`DELETE /v1/me`) cascades foreign keys to erase personal user profile, credentials, sessions, devices, activities, privacy zones, comments, kudos, goals, and gear.
   - *Note*: Have a qualified lawyer review `/en/privacy` and `/hi/privacy` before commercial public launch.
