-- Permanent character data. Optional at runtime: the game runs in memory when
-- DATABASE_URL is not configured.
CREATE TABLE IF NOT EXISTS characters (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(16) NOT NULL UNIQUE,
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  hp          INTEGER NOT NULL DEFAULT 100,
  max_hp      INTEGER NOT NULL DEFAULT 100,
  attack      INTEGER NOT NULL DEFAULT 10,
  x           DOUBLE PRECISION NOT NULL DEFAULT 0,
  y           DOUBLE PRECISION NOT NULL DEFAULT 0,
  dir         SMALLINT NOT NULL DEFAULT 0,
  outfit      SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS characters_updated_at_idx ON characters (updated_at DESC);
