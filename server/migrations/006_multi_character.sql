-- Allow multiple characters per account (up to 3, enforced server-side).
-- Removes the old 1:1 unique constraint and adds a compound uniqueness index
-- so the same account cannot have two characters with the same name.

-- Drop the old one-character-per-account constraint.
DROP INDEX IF EXISTS characters_account_id_idx;

-- Prevent duplicate character names within the same account (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS characters_account_id_name_idx
  ON characters (account_id, lower(name));

-- Fast lookup for listing all characters belonging to an account.
CREATE INDEX IF NOT EXISTS characters_account_id_list_idx
  ON characters (account_id);
