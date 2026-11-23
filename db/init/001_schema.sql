CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- FR1: accounts (email, profile, role)
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Security: refresh token rotation and revocation
CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FR3–FR8: track upload, metadata, playback stats
CREATE TABLE tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  play_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FR9: likes
CREATE TABLE likes (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

-- FR10–FR11: follow graph
CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

-- FR14: content reports
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX tracks_owner_id_idx ON tracks (owner_id);
CREATE INDEX tracks_created_at_idx ON tracks (created_at DESC);
CREATE INDEX likes_track_id_idx ON likes (track_id);
CREATE INDEX follows_followee_id_idx ON follows (followee_id);
CREATE INDEX reports_reporter_id_idx ON reports (reporter_id);
CREATE INDEX reports_track_id_idx ON reports (track_id);