-- Player accounts. Passwords are stored as scrypt hashes (see server/src/auth).
-- Usernames are unique regardless of casing; the display casing is preserved.
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY,
  username      VARCHAR(16) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower_idx ON accounts (lower(username));

-- Characters now belong to an account instead of being keyed by name.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts (id) ON DELETE CASCADE;

-- Identity moved to account_id; the old name constraint would reject a fresh
-- account whose username matches a legacy (account-less) character row.
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_name_key;

CREATE INDEX IF NOT EXISTS characters_name_idx ON characters (name);
CREATE UNIQUE INDEX IF NOT EXISTS characters_account_id_idx ON characters (account_id);
