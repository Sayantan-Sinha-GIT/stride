-- Stride Initial PostGIS Schema (Neon Postgres 17)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  home_city TEXT NOT NULL DEFAULT '',
  weight_kg REAL NOT NULL DEFAULT 70,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('email', 'google')),
  provider_user_id TEXT NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  refresh_token_hash TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Web Browser',
  user_agent TEXT NOT NULL DEFAULT '',
  ip_hint TEXT NOT NULL DEFAULT '',
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(refresh_token_hash);

CREATE TABLE IF NOT EXISTS email_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash TEXT NOT NULL,
  code_6 TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_lookup ON email_tokens(token_hash, purpose);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  device_label TEXT NOT NULL DEFAULT 'Mobile Device',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
  units TEXT NOT NULL DEFAULT 'metric' CHECK (units IN ('metric', 'imperial')),
  default_visibility TEXT NOT NULL DEFAULT 'followers' CHECK (default_visibility IN ('public', 'followers', 'private')),
  hide_start_end_meters INTEGER NOT NULL DEFAULT 0 CHECK (hide_start_end_meters BETWEEN 0 AND 2000),
  is_private_account BOOLEAN NOT NULL DEFAULT false,
  weekly_email_digest BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS privacy_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL CHECK (radius_meters BETWEEN 100 AND 5000),
  center_geog geography(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_privacy_zones_user_id ON privacy_zones(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_zones_geog ON privacy_zones USING GIST(center_geog);

CREATE TABLE IF NOT EXISTS gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gear_type TEXT NOT NULL CHECK (gear_type IN ('shoes', 'bike', 'other')),
  brand TEXT NOT NULL DEFAULT '',
  initial_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  logged_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_distance_m DOUBLE PRECISION,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  retired BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gear_user_id ON gear(user_id);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT,
  idempotency_key TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  activity_type TEXT NOT NULL CHECK (activity_type IN ('run', 'walk', 'ride', 'hike')),
  source TEXT NOT NULL DEFAULT 'recorded' CHECK (source IN ('recorded', 'imported', 'manual')),
  visibility TEXT NOT NULL DEFAULT 'followers' CHECK (visibility IN ('public', 'followers', 'private')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  moving_time_s INTEGER NOT NULL DEFAULT 0,
  elapsed_time_s INTEGER NOT NULL DEFAULT 0,
  elevation_gain_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  elevation_loss_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_speed_mps DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_speed_mps DOUBLE PRECISION NOT NULL DEFAULT 0,
  calories_estimate INTEGER NOT NULL DEFAULT 0,
  encoded_polyline TEXT NOT NULL DEFAULT '',
  raw_points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  splits_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  stream_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  geom geometry(LineString, 4326),
  start_point geometry(Point, 4326),
  bbox geometry(Polygon, 4326),
  gear_id UUID REFERENCES gear(id) ON DELETE SET NULL,
  is_hidden_by_admin BOOLEAN NOT NULL DEFAULT false,
  kudos_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_activities_user_started ON activities(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_visibility_started ON activities(visibility, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_geom ON activities USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_activities_bbox ON activities USING GIST(bbox);
CREATE INDEX IF NOT EXISTS idx_activities_start_pt ON activities USING GIST(start_point);

CREATE TABLE IF NOT EXISTS segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  activity_type TEXT NOT NULL CHECK (activity_type IN ('run', 'walk', 'ride', 'hike')),
  distance_m DOUBLE PRECISION NOT NULL,
  elevation_gain_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  elevation_loss_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  encoded_polyline TEXT NOT NULL,
  points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  geom geometry(LineString, 4326) NOT NULL,
  start_point geometry(Point, 4326) NOT NULL,
  end_point geometry(Point, 4326) NOT NULL,
  bbox geometry(Polygon, 4326) NOT NULL,
  is_hidden_by_admin BOOLEAN NOT NULL DEFAULT false,
  effort_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_segments_type_city ON segments(activity_type, city);
CREATE INDEX IF NOT EXISTS idx_segments_geom ON segments USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_segments_bbox ON segments USING GIST(bbox);
CREATE INDEX IF NOT EXISTS idx_segments_start ON segments USING GIST(start_point);

CREATE TABLE IF NOT EXISTS segment_efforts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  elapsed_time_s DOUBLE PRECISION NOT NULL,
  avg_speed_mps DOUBLE PRECISION NOT NULL,
  max_speed_mps DOUBLE PRECISION NOT NULL,
  start_offset_s DOUBLE PRECISION NOT NULL DEFAULT 0,
  end_offset_s DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_pr BOOLEAN NOT NULL DEFAULT false,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  review_requested BOOLEAN NOT NULL DEFAULT false,
  is_hidden_by_admin BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (segment_id, activity_id)
);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_leaderboard ON segment_efforts(segment_id, is_flagged, is_hidden_by_admin, elapsed_time_s ASC);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_user ON segment_efforts(user_id, segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_activity ON segment_efforts(activity_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id, status);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS kudos (
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_hidden_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_activity ON comments(activity_id, created_at ASC);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('activity', 'comment', 'segment', 'effort', 'user')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  sport_focus TEXT NOT NULL DEFAULT 'all' CHECK (sport_focus IN ('all', 'run', 'ride', 'walk', 'hike')),
  join_mode TEXT NOT NULL DEFAULT 'open' CHECK (join_mode IN ('open', 'approval')),
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  member_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS club_members (
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members(user_id, status);

CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  activity_type TEXT NOT NULL DEFAULT 'all' CHECK (activity_type IN ('all', 'run', 'ride', 'walk', 'hike')),
  metric_type TEXT NOT NULL DEFAULT 'distance_m' CHECK (metric_type IN ('distance_m', 'elevation_m', 'activity_count', 'moving_time_s')),
  target_value DOUBLE PRECISION NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  badge_code TEXT NOT NULL DEFAULT 'challenge_finisher',
  participant_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS challenge_participants (
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS badges (
  code TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_hi TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_hi TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'milestone'
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL REFERENCES badges(code) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_code)
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  location_name TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  activity_type TEXT NOT NULL DEFAULT 'run' CHECK (activity_type IN ('run', 'walk', 'ride', 'hike')),
  starts_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'interested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  source_segment_id UUID REFERENCES segments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('run', 'walk', 'ride', 'hike')),
  distance_m DOUBLE PRECISION NOT NULL,
  elevation_gain_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  encoded_polyline TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_routes_user ON saved_routes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id UUID,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  batch_key TEXT,
  batch_count INTEGER NOT NULL DEFAULT 1,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_batch ON notifications(user_id, batch_key, read_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kudos BOOLEAN NOT NULL DEFAULT true,
  comments BOOLEAN NOT NULL DEFAULT true,
  follows BOOLEAN NOT NULL DEFAULT true,
  segments_pr BOOLEAN NOT NULL DEFAULT true,
  challenges BOOLEAN NOT NULL DEFAULT true,
  goals BOOLEAN NOT NULL DEFAULT true,
  clubs BOOLEAN NOT NULL DEFAULT true,
  weekly_digest BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_start_hour SMALLINT NOT NULL DEFAULT 22,
  quiet_end_hour SMALLINT NOT NULL DEFAULT 7,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  value_num DOUBLE PRECISION NOT NULL,
  distance_m DOUBLE PRECISION NOT NULL,
  duration_s DOUBLE PRECISION NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, metric_key)
);

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly')),
  activity_type TEXT NOT NULL DEFAULT 'all' CHECK (activity_type IN ('all', 'run', 'ride', 'walk', 'hike')),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('distance_m', 'moving_time_s', 'activity_count')),
  target_value DOUBLE PRECISION NOT NULL CHECK (target_value > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

CREATE TABLE IF NOT EXISTS heatmap_cells (
  cell_id TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'global',
  activity_type TEXT NOT NULL CHECK (activity_type IN ('all', 'run', 'ride', 'walk', 'hike')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  weight DOUBLE PRECISION NOT NULL,
  contributor_count INTEGER NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cell_id, activity_type)
);
CREATE INDEX IF NOT EXISTS idx_heatmap_geom ON heatmap_cells USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_heatmap_city_type ON heatmap_cells(city, activity_type, contributor_count);
