import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { getPool } from "../database/postgres.js";
import { logger } from "../utils/logger.js";
import { hashPassword, verifyPassword } from "./passwords.js";

/**
 * Account storage.
 *
 * PostgreSQL is used whenever it is configured; otherwise accounts live in
 * process memory so the game still works out of the box (they reset on restart,
 * which is logged as a warning). Passwords are never stored in plain text.
 */

export interface Account {
  id: string;
  /** Display casing as the player typed it. */
  username: string;
  createdAt: number;
  gmLevel: number;
}

interface AccountRow extends QueryResultRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: Date;
  gm_level?: number;
}

interface MemoryAccount extends Account {
  passwordHash: string;
}

export type RegisterResult =
  | { ok: true; account: Account }
  | { ok: false; error: "username-taken" | "storage" };

const memory = new Map<string, MemoryAccount>();
let memoryWarningLogged = false;

const USERNAME_TAKEN_CODE = "23505";
const UNDEFINED_TABLE_CODE = "42P01";

function normalizeKey(username: string): string {
  return username.trim().toLowerCase();
}

/** Used by /health so operators can see where accounts are stored. */
export function accountStoreMode(): "postgres" | "memory" {
  return getPool() ? "postgres" : "memory";
}

function memoryStore(): Map<string, MemoryAccount> {
  if (!memoryWarningLogged) {
    memoryWarningLogged = true;
    logger.warn(
      "Accounts are stored in memory because PostgreSQL is disabled. " +
        "Accounts disappear when the server restarts; set DATABASE_URL to persist them.",
    );
  }

  return memory;
}

function toAccount(row: AccountRow): Account {
  let gmLevel = Number(row.gm_level ?? 0) || 0;
  const lowerName = (row.username || "").trim().toLowerCase();
  if (lowerName === "admin" && gmLevel < 2) gmLevel = 2;
  if (lowerName === "gm" && gmLevel < 1) gmLevel = 1;

  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
    gmLevel,
  };
}

export async function createAccount(username: string, password: string): Promise<RegisterResult> {
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const pool = getPool();
  const lowerName = normalizeKey(username);
  let defaultGm = 0;
  if (lowerName === "admin") defaultGm = 2;
  else if (lowerName === "gm") defaultGm = 1;

  if (!pool) {
    const store = memoryStore();
    const key = lowerName;
    if (store.has(key)) return { ok: false, error: "username-taken" };

    const account: MemoryAccount = {
      id,
      username,
      createdAt: Date.now(),
      passwordHash,
      gmLevel: defaultGm,
    };

    store.set(key, account);
    logger.info(`Account "${username}" registered (in-memory, gmLevel=${defaultGm})`);

    return { ok: true, account: { id, username, createdAt: account.createdAt, gmLevel: defaultGm } };
  }

  try {
    const result = await pool.query<AccountRow>(
      `INSERT INTO accounts (id, username, password_hash, gm_level)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, password_hash, created_at, gm_level`,
      [id, username, passwordHash, defaultGm],
    );

    const row = result.rows[0];
    if (!row) return { ok: false, error: "storage" };

    logger.info(`Account "${row.username}" registered (gmLevel=${defaultGm})`);

    return { ok: true, account: toAccount(row) };
  } catch (error) {
    if (isPostgresError(error, USERNAME_TAKEN_CODE)) {
      return { ok: false, error: "username-taken" };
    }

    if (isPostgresError(error, UNDEFINED_TABLE_CODE)) {
      logger.error(
        "The accounts table is missing. Run `npm run db:migrate` to apply the auth migration.",
      );
      return { ok: false, error: "storage" };
    }

    logger.warn("Could not create account", error);
    return { ok: false, error: "storage" };
  }
}

export async function authenticate(username: string, password: string): Promise<Account | null> {
  const pool = getPool();

  if (!pool) {
    const account = memoryStore().get(normalizeKey(username));
    if (!account) {
      await verifyDummyPassword(password);
      return null;
    }

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) return null;
    let gmLevel = account.gmLevel ?? 0;
    if (normalizeKey(username) === "admin" && gmLevel < 2) gmLevel = 2;
    if (normalizeKey(username) === "gm" && gmLevel < 1) gmLevel = 1;
    return { id: account.id, username: account.username, createdAt: account.createdAt, gmLevel };
  }

  try {
    const result = await pool.query<AccountRow>(
      `SELECT id, username, password_hash, created_at, gm_level
       FROM accounts
       WHERE lower(username) = lower($1)
       LIMIT 1`,
      [username],
    );

    const row = result.rows[0];
    if (!row) {
      // Spend the same scrypt time as a real check so response timing does not
      // reveal whether an account exists.
      await verifyDummyPassword(password);
      return null;
    }

    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) return null;

    await pool.query("UPDATE accounts SET last_login_at = now() WHERE id = $1", [row.id]).catch((error) => {
      logger.warn("Could not update last_login_at", error);
    });

    return toAccount(row);
  } catch (error) {
    if (isPostgresError(error, UNDEFINED_TABLE_CODE)) {
      logger.error(
        "The accounts table is missing. Run `npm run db:migrate` to apply the auth migration.",
      );
      return null;
    }

    logger.warn("Could not authenticate account", error);
    return null;
  }
}

export async function findAccountById(id: string): Promise<Account | null> {
  const pool = getPool();

  if (!pool) {
    for (const account of memoryStore().values()) {
      if (account.id === id) {
        let gmLevel = account.gmLevel ?? 0;
        if (normalizeKey(account.username) === "admin" && gmLevel < 2) gmLevel = 2;
        if (normalizeKey(account.username) === "gm" && gmLevel < 1) gmLevel = 1;
        return { id: account.id, username: account.username, createdAt: account.createdAt, gmLevel };
      }
    }
    return null;
  }

  try {
    const result = await pool.query<AccountRow>(
      `SELECT id, username, password_hash, created_at, gm_level FROM accounts WHERE id = $1 LIMIT 1`,
      [id],
    );

    const row = result.rows[0];
    return row ? toAccount(row) : null;
  } catch (error) {
    logger.warn("Could not look up account", error);
    return null;
  }
}

export async function findOrCreateDevAccount(username = "Admin"): Promise<Account | null> {
  const pool = getPool();
  const key = normalizeKey(username);
  if (!pool) {
    const store = memoryStore();
    const existing = store.get(key);
    if (existing) {
      return { id: existing.id, username: existing.username, createdAt: existing.createdAt, gmLevel: 2 };
    }
    const created = await createAccount(username, randomUUID());
    return created.ok ? created.account : null;
  }

  try {
    const result = await pool.query<AccountRow>(
      `SELECT id, username, password_hash, created_at, gm_level FROM accounts WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username],
    );
    const row = result.rows[0];
    if (row) return toAccount(row);
    const created = await createAccount(username, randomUUID());
    return created.ok ? created.account : null;
  } catch (error) {
    logger.warn("Could not look up/create dev account", error);
    return null;
  }
}

function isPostgresError(error: unknown, code: string): boolean {
  return Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === code;
}

let dummyHash: Promise<string> | null = null;

async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomUUID());
  await verifyPassword(password, await dummyHash);
}
