-- ─────────────────────────────────────────────────────────────────
--  AcadCode — PostgreSQL Schema  (Vercel Postgres / Neon)
--
--  Run this ONCE after creating your Vercel Postgres database:
--    Option A — Vercel dashboard → Storage → your DB → Query tab
--    Option B — psql "$POSTGRES_URL" -f db/schema.sql
-- ─────────────────────────────────────────────────────────────────

-- ─── users ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL          PRIMARY KEY,
  username      VARCHAR(24)     NOT NULL,
  email         VARCHAR(160)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  streak        SMALLINT        NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_username UNIQUE (username),
  CONSTRAINT uq_email    UNIQUE (email)
);

-- ─── sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id         SERIAL       PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      CHAR(64)     NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_token UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS idx_sess_uid ON sessions(user_id);

-- ─── scores ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scores (
  id               SERIAL      PRIMARY KEY,
  user_id          INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score            SMALLINT    NOT NULL,
  total_questions  SMALLINT    NOT NULL DEFAULT 10,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_score_user_date ON scores(user_id, submitted_at);
