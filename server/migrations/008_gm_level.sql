-- Migration 008: Game Master (GM) Level and Audit Logs
-- gm_level: 0 = Player, 1 = GM / Moderator, 2 = Admin / Developer
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS gm_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS gm_level INTEGER;

CREATE TABLE IF NOT EXISTS gm_audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  account_id      TEXT,
  character_name  VARCHAR(32),
  gm_level        INTEGER NOT NULL,
  command         VARCHAR(64) NOT NULL,
  args            TEXT,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gm_audit_logs_executed_at_idx ON gm_audit_logs (executed_at DESC);
