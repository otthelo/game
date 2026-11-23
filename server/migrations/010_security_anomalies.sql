-- Migration 010: Security & Anti-Cheat Anomaly Logging
CREATE TABLE IF NOT EXISTS security_anomalies (
  id              BIGSERIAL PRIMARY KEY,
  account_id      TEXT,
  character_name  VARCHAR(32),
  anomaly_type    VARCHAR(64) NOT NULL,
  details         TEXT NOT NULL,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_anomalies_detected_at_idx ON security_anomalies (detected_at DESC);
