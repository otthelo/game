import { PLAYER_MAX_LEVEL, PLAYER_RADIUS } from "../config/gameplay.js";
import { ITEMS, ItemKind, STARTER_GOLD, STARTER_INVENTORY, } from "../config/items.js";
import { getPool } from "../database/postgres.js";
import { CombatCalculator } from "../entities/CombatCalculator.js";
import { findNearestWalkablePoint, isBlocked, spawnForName, WORLD_GRID } from "../utils/map.js";
import { logger } from "../utils/logger.js";
function outfitForName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (Math.imul(hash, 31) + name.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 3;
}
export function createDefaultCharacter(name) {
    const spawn = spawnForName(name);
    const stats = CombatCalculator.statsForLevel(1);
    return {
        name,
        level: 1,
        xp: 0,
        jobId: "novice",
        jobLevel: 1,
        jobXp: 0,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        sp: stats.maxSp,
        maxSp: stats.maxSp,
        attack: stats.attack,
        str: 1,
        agi: 1,
        vit: 1,
        int: 1,
        dex: 1,
        luk: 1,
        statPoints: 0,
        x: spawn.x,
        y: spawn.y,
        dir: 0,
        outfit: outfitForName(name),
        gold: STARTER_GOLD,
        weaponId: "",
        armorId: "",
        wingId: "",
        garmentId: "",
        inventory: STARTER_INVENTORY.map((stack) => ({ ...stack })),
    };
}
/** Accepts the JSONB column (array or string) and drops unknown item ids. */
function normalizeInventory(raw) {
    let value = raw;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        }
        catch {
            return [];
        }
    }
    if (!Array.isArray(value))
        return [];
    const stacks = [];
    for (const entry of value.slice(0, 32)) {
        if (!entry || typeof entry !== "object")
            continue;
        const record = entry;
        if (typeof record.itemId !== "string")
            continue;
        const def = ITEMS[record.itemId];
        if (!def)
            continue;
        const qty = Math.floor(Number(record.qty) || 0);
        if (qty <= 0)
            continue;
        stacks.push({
            itemId: def.id,
            qty: Math.max(1, Math.min(def.stackLimit, qty)),
        });
    }
    return stacks;
}
function normalizeEquipped(raw, kind) {
    if (typeof raw !== "string")
        return "";
    const def = ITEMS[raw];
    return def?.kind === kind ? def.id : "";
}
function normalizeCharacter(row, fallbackName) {
    const level = Math.max(1, Math.min(PLAYER_MAX_LEVEL, Math.floor(Number(row.level) || 1)));
    const stats = CombatCalculator.statsForLevel(level);
    let x = Number(row.x);
    let y = Number(row.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || isBlocked(WORLD_GRID, x, y, PLAYER_RADIUS)) {
        const spawn = spawnForName(fallbackName);
        const safe = findNearestWalkablePoint(WORLD_GRID, spawn.x, spawn.y, PLAYER_RADIUS, 6);
        x = safe?.x ?? spawn.x;
        y = safe?.y ?? spawn.y;
    }
    const storedHp = Number(row.hp);
    // The exact max depends on equipped armor and is applied by the room; only
    // keep the stored value inside the schema's uint16 range here.
    const hp = Number.isFinite(storedHp)
        ? Math.max(1, Math.min(65535, Math.floor(storedHp)))
        : stats.maxHp;
    const storedSp = Number(row.sp);
    const sp = Number.isFinite(storedSp)
        ? Math.max(0, Math.min(65535, Math.floor(storedSp)))
        : stats.maxSp;
    const normAttr = (v) => Math.max(1, Math.min(999, Math.floor(Number(v) || 1)));
    return {
        id: row.id != null ? Number(row.id) : undefined,
        name: typeof row.name === "string" && row.name.length > 0 ? row.name : fallbackName,
        level,
        xp: Math.max(0, Math.floor(Number(row.xp) || 0)),
        jobId: typeof row.job_id === "string" ? row.job_id : "novice",
        jobLevel: Math.max(1, Math.floor(Number(row.job_level) || 1)),
        jobXp: Math.max(0, Math.floor(Number(row.job_xp) || 0)),
        hp,
        maxHp: stats.maxHp,
        sp,
        maxSp: stats.maxSp,
        attack: stats.attack,
        str: normAttr(row.str),
        agi: normAttr(row.agi),
        vit: normAttr(row.vit),
        int: normAttr(row.int),
        dex: normAttr(row.dex),
        luk: normAttr(row.luk),
        statPoints: Math.max(0, Math.floor(Number(row.stat_points) || 0)),
        x,
        y,
        dir: Math.max(0, Math.min(3, Math.floor(Number(row.dir) || 0))),
        outfit: Math.max(0, Math.min(2, Math.floor(Number(row.outfit) || 0))),
        gold: Math.max(0, Math.floor(Number(row.gold) || 0)),
        weaponId: normalizeEquipped(row.weapon_id, ItemKind.Weapon),
        armorId: normalizeEquipped(row.armor_id, ItemKind.Armor),
        wingId: normalizeEquipped(row.wing_id, ItemKind.Wing),
        garmentId: normalizeEquipped(row.garment_id, ItemKind.Garment),
        inventory: normalizeInventory(row.inventory),
    };
}
let nextMemoryId = 1;
const memoryCharacters = new Map();

export function memoryListCharacters(accountId) {
    return memoryCharacters.get(accountId) ?? [];
}

export function memoryGetCharacter(accountId, characterId) {
    const list = memoryListCharacters(accountId);
    return list.find((c) => c.id === characterId) ?? null;
}

export function memoryCreateCharacter(accountId, name) {
    const defaults: any = createDefaultCharacter(name);
    defaults.id = nextMemoryId++;
    if (!memoryCharacters.has(accountId)) {
        memoryCharacters.set(accountId, []);
    }
    memoryCharacters.get(accountId).push(defaults);
    return defaults;
}

export function memoryDeleteCharacter(accountId, characterId) {
    const list = memoryListCharacters(accountId);
    const idx = list.findIndex((c) => c.id === characterId);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
}

export function memorySaveCharacter(accountId, character) {
    const list = memoryListCharacters(accountId);
    const idx = list.findIndex((c) => c.id === character.id);
    if (idx !== -1) {
        list[idx] = { ...list[idx], ...character };
    }
}

/**
 * Loads the character owned by an account.
 */
export async function loadCharacter(accountId, name, characterId) {
    const pool = getPool();
    if (!pool) {
        if (characterId) {
            const found = memoryGetCharacter(accountId, characterId);
            if (found) return found;
        }
        const list = memoryListCharacters(accountId);
        if (list.length > 0) return list[0];
        const created = memoryCreateCharacter(accountId, name);
        return created;
    }
    try {
        const query = characterId
            ? `SELECT id, name, level, xp, job_id, job_level, job_xp, hp, max_hp, sp, max_sp, attack,
                      str, agi, vit, int, dex, luk, stat_points,
                      x, y, dir, outfit, gold, weapon_id, armor_id, wing_id, garment_id, inventory
               FROM characters
               WHERE account_id = $1 AND id = $2
               LIMIT 1`
            : `SELECT id, name, level, xp, job_id, job_level, job_xp, hp, max_hp, sp, max_sp, attack,
                      str, agi, vit, int, dex, luk, stat_points,
                      x, y, dir, outfit, gold, weapon_id, armor_id, wing_id, garment_id, inventory
               FROM characters
               WHERE account_id = $1
               ORDER BY id
               LIMIT 1`;
        const params = characterId ? [accountId, characterId] : [accountId];
        const result = await pool.query(query, params);
        const row = result.rows[0];
        if (!row) {
            const created = createDefaultCharacter(name);
            await saveCharacter(accountId, created);
            return created;
        }
        return normalizeCharacter(row, name);
    }
    catch (error) {
        logger.warn("Could not load character; using in-memory defaults", error);
        return null;
    }
}
export async function saveCharacter(accountId, character) {
    const pool = getPool();
    if (!pool) {
        memorySaveCharacter(accountId, character);
        return;
    }
    try {
        if (character.id) {
            await pool.query(`UPDATE characters SET
               name = $3, level = $4, xp = $5, job_id = $6, job_level = $7, job_xp = $8,
               hp = $9, max_hp = $10, sp = $11, max_sp = $12, attack = $13,
               str = $14, agi = $15, vit = $16, int = $17, dex = $18, luk = $19, stat_points = $20,
               x = $21, y = $22, dir = $23, outfit = $24, gold = $25, weapon_id = $26, armor_id = $27, wing_id = $28, garment_id = $29,
               inventory = $30, updated_at = now()
             WHERE id = $1 AND account_id = $2`, [
                character.id,
                accountId,
                character.name,
                character.level,
                character.xp,
                character.jobId ?? "novice",
                character.jobLevel ?? 1,
                character.jobXp ?? 0,
                character.hp,
                character.maxHp,
                character.sp,
                character.maxSp,
                character.attack,
                character.str,
                character.agi,
                character.vit,
                character.int,
                character.dex,
                character.luk,
                character.statPoints,
                character.x,
                character.y,
                character.dir,
                character.outfit,
                character.gold,
                character.weaponId || null,
                character.armorId || null,
                character.wingId || null,
                character.garmentId || null,
                JSON.stringify(character.inventory),
            ]);
        } else {
            const result = await pool.query(`INSERT INTO characters (
               account_id, name, level, xp, job_id, job_level, job_xp,
               hp, max_hp, sp, max_sp, attack,
               str, agi, vit, int, dex, luk, stat_points,
               x, y, dir, outfit, gold, weapon_id, armor_id, wing_id, garment_id, inventory, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, now())
             RETURNING id`, [
                accountId,
                character.name,
                character.level,
                character.xp,
                character.jobId ?? "novice",
                character.jobLevel ?? 1,
                character.jobXp ?? 0,
                character.hp,
                character.maxHp,
                character.sp,
                character.maxSp,
                character.attack,
                character.str,
                character.agi,
                character.vit,
                character.int,
                character.dex,
                character.luk,
                character.statPoints,
                character.x,
                character.y,
                character.dir,
                character.outfit,
                character.gold,
                character.weaponId || null,
                character.armorId || null,
                character.wingId || null,
                character.garmentId || null,
                JSON.stringify(character.inventory),
            ]);
            if (result.rows[0]) {
                character.id = Number(result.rows[0].id);
            }
        }
    } catch (err) {
        logger.warn("Could not save character", err);
    }
}
