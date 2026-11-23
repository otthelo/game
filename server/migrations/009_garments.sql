-- Equipped garment slot column
ALTER TABLE characters ADD COLUMN IF NOT EXISTS garment_id TEXT;
