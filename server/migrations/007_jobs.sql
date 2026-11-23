-- Ragnarok Online style Job System: Base Level & Job Level separation.
-- Adds job_id, job_level, and job_xp to characters table.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS job_id VARCHAR(32) NOT NULL DEFAULT 'novice';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS job_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS job_xp INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS characters_job_id_idx ON characters (job_id);
