import express, { type Express, type Request, type Response } from "express";
import { env } from "../config/env.js";
import { getPool } from "../database/postgres.js";
import { createDefaultCharacter } from "../models/characterRepository.js";
import { verifyAuthToken } from "./tokens.js";
import { logger } from "../utils/logger.js";

/**
 * Character management endpoints (multi-character support, up to 3 per account).
 *
 *   GET    /auth/characters      -> { characters: CharacterSummary[] }
 *   POST   /auth/characters      -> { character: CharacterSummary }
 *   DELETE /auth/characters/:id  -> 200 / 404
 */

const MAX_CHARACTERS = 3;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const DUPLICATE_KEY_CODE = "23505";

interface CharacterSummary {
  id: number;
  name: string;
  level: number;
  jobId: string;
  jobLevel: number;
  outfit: number;
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
}

// ---------------------------------------------------------------------------
// In-memory fallback (mirrors the accounts.ts pattern)
// ---------------------------------------------------------------------------

interface MemoryCharacter extends CharacterSummary {
  accountId: string;
}

let nextMemoryId = 1;
const memoryCharacters = new Map<string, MemoryCharacter[]>();

function memoryList(accountId: string): MemoryCharacter[] {
  return memoryCharacters.get(accountId) ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendError(res: Response, status: number, error: string, message: string): void {
  res.status(status).json({ error, message });
}

function extractClaims(req: Request): { sub: string; username: string } | null {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return verifyAuthToken(token) as { sub: string; username: string } | null;
}

function toSummary(row: Record<string, unknown>): CharacterSummary {
  return {
    id: Number(row.id),
    name: String(row.name),
    level: Number(row.level),
    jobId: typeof (row.job_id ?? row.jobId) === "string" ? String(row.job_id ?? row.jobId) : "novice",
    jobLevel: Math.max(1, Math.floor(Number(row.job_level ?? row.jobLevel) || 1)),
    outfit: Number(row.outfit),
    str: Number(row.str),
    agi: Number(row.agi),
    vit: Number(row.vit),
    int: Number(row.int),
    dex: Number(row.dex),
    luk: Number(row.luk),
  };
}

// ---------------------------------------------------------------------------
// Route handler factories
// ---------------------------------------------------------------------------

function listCharacters() {
  return async (req: Request, res: Response): Promise<void> => {
    const claims = extractClaims(req);
    if (!claims) {
      sendError(res, 401, "unauthorized", "Session expired. Please log in again.");
      return;
    }

    const pool = getPool();
    if (!pool) {
      const chars = memoryList(claims.sub).map((c) => toSummary(c as unknown as Record<string, unknown>));
      res.json({ characters: chars });
      return;
    }

    try {
      const result = await pool.query(
        `SELECT id, name, level, outfit, str, agi, vit, int, dex, luk
         FROM characters
         WHERE account_id = $1
         ORDER BY id`,
        [claims.sub],
      );
      res.json({ characters: result.rows.map((r: Record<string, unknown>) => toSummary(r)) });
    } catch (error) {
      logger.warn("Could not list characters", error);
      sendError(res, 503, "storage", "Characters are unavailable right now.");
    }
  };
}

function createCharacter() {
  return async (req: Request, res: Response): Promise<void> => {
    const claims = extractClaims(req);
    if (!claims) {
      sendError(res, 401, "unauthorized", "Session expired. Please log in again.");
      return;
    }

    const name: unknown = req.body?.name;
    if (typeof name !== "string" || !NAME_RE.test(name)) {
      sendError(res, 400, "invalid-input", "Name must be 3-16 alphanumeric characters or underscores.");
      return;
    }

    const pool = getPool();

    // --- Memory fallback ---
    if (!pool) {
      const list = memoryList(claims.sub);
      if (list.length >= MAX_CHARACTERS) {
        sendError(res, 403, "max-characters", `You can have at most ${MAX_CHARACTERS} characters.`);
        return;
      }
      const lowerName = name.toLowerCase();
      if (list.some((c) => c.name.toLowerCase() === lowerName)) {
        sendError(res, 409, "name-taken", "You already have a character with that name.");
        return;
      }

      const defaults = createDefaultCharacter(name);
      const id = nextMemoryId++;
      const memChar: MemoryCharacter = {
        id,
        accountId: claims.sub,
        name: defaults.name,
        level: defaults.level,
        jobId: defaults.jobId,
        jobLevel: defaults.jobLevel,
        outfit: defaults.outfit,
        str: defaults.str,
        agi: defaults.agi,
        vit: defaults.vit,
        int: defaults.int,
        dex: defaults.dex,
        luk: defaults.luk,
      };
      if (!memoryCharacters.has(claims.sub)) {
        memoryCharacters.set(claims.sub, []);
      }
      memoryCharacters.get(claims.sub)!.push(memChar);
      res.status(201).json({ character: toSummary(memChar as unknown as Record<string, unknown>) });
      return;
    }

    // --- PostgreSQL ---
    try {
      // Check character count
      const countResult = await pool.query(
        `SELECT count(*)::int AS cnt FROM characters WHERE account_id = $1`,
        [claims.sub],
      );
      const count = countResult.rows[0]?.cnt ?? 0;
      if (count >= MAX_CHARACTERS) {
        sendError(res, 403, "max-characters", `You can have at most ${MAX_CHARACTERS} characters.`);
        return;
      }

      const defaults = createDefaultCharacter(name);

      const result = await pool.query(
        `INSERT INTO characters (
           account_id, name, level, xp, hp, max_hp, sp, max_sp, attack,
           str, agi, vit, int, dex, luk, stat_points,
           x, y, dir, outfit, gold, weapon_id, armor_id, wing_id, garment_id, inventory, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, now())
         RETURNING id, name, level, outfit, str, agi, vit, int, dex, luk`,
        [
          claims.sub,
          defaults.name,
          defaults.level,
          defaults.xp,
          defaults.hp,
          defaults.maxHp,
          defaults.sp,
          defaults.maxSp,
          defaults.attack,
          defaults.str,
          defaults.agi,
          defaults.vit,
          defaults.int,
          defaults.dex,
          defaults.luk,
          defaults.statPoints,
          defaults.x,
          defaults.y,
          defaults.dir,
          defaults.outfit,
          defaults.gold,
          defaults.weaponId || null,
          defaults.armorId || null,
          defaults.wingId || null,
          defaults.garmentId || null,
          JSON.stringify(defaults.inventory),
        ],
      );

      const row = result.rows[0];
      if (!row) {
        sendError(res, 503, "storage", "Could not create character.");
        return;
      }

      res.status(201).json({ character: toSummary(row as Record<string, unknown>) });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        (error as { code?: string }).code === DUPLICATE_KEY_CODE
      ) {
        sendError(res, 409, "name-taken", "You already have a character with that name.");
        return;
      }
      logger.warn("Could not create character", error);
      sendError(res, 503, "storage", "Characters are unavailable right now.");
    }
  };
}

function deleteCharacter() {
  return async (req: Request, res: Response): Promise<void> => {
    const claims = extractClaims(req);
    if (!claims) {
      sendError(res, 401, "unauthorized", "Session expired. Please log in again.");
      return;
    }

    const characterId = Number(req.params.id);
    if (!Number.isFinite(characterId) || characterId <= 0) {
      sendError(res, 404, "not-found", "Character not found.");
      return;
    }

    const pool = getPool();

    if (!pool) {
      const list = memoryList(claims.sub);
      const idx = list.findIndex((c) => c.id === characterId);
      if (idx === -1) {
        sendError(res, 404, "not-found", "Character not found.");
        return;
      }
      list.splice(idx, 1);
      res.json({ deleted: true });
      return;
    }

    try {
      const result = await pool.query(
        `DELETE FROM characters WHERE id = $1 AND account_id = $2`,
        [characterId, claims.sub],
      );
      if (result.rowCount === 0) {
        sendError(res, 404, "not-found", "Character not found.");
        return;
      }
      res.json({ deleted: true });
    } catch (error) {
      logger.warn("Could not delete character", error);
      sendError(res, 503, "storage", "Characters are unavailable right now.");
    }
  };
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountCharacterRoutes(app: Express): void {
  const router = express.Router();
  router.use(express.json({ limit: "8kb" }));

  // Scoped CORS (matches routes.ts)
  router.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", env.CLIENT_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  router.get("/", listCharacters());
  router.post("/", createCharacter());
  router.delete("/:id", deleteCharacter());

  app.use("/auth/characters", router);
  logger.info("Character management endpoints mounted at /auth/characters");
}
