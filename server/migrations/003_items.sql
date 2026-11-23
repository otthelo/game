-- Satchel, currency and equipped gear. Inventory is a JSONB array of
-- { "itemId": string, "qty": number } stacks; item definitions live in
-- server/src/config/items.ts and are validated on load.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS gold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS weapon_id TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS armor_id TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS inventory JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS characters_gold_idx ON characters (gold DESC);
