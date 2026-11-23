import { createClient } from "redis";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
function createRedisClient(url) {
    return createClient({ url });
}
let client = null;
let enabled = false;
export function isRedisEnabled() {
    return enabled;
}
export async function initRedis() {
    if (!env.REDIS_URL) {
        logger.info("Redis disabled (REDIS_URL is not set)");
        return;
    }
    const candidate = createRedisClient(env.REDIS_URL);
    candidate.on("error", (error) => {
        logger.warn("Redis client error", error);
    });
    try {
        await candidate.connect();
        await candidate.ping();
        client = candidate;
        enabled = true;
        logger.info("Redis connected");
    }
    catch (error) {
        enabled = false;
        try {
            candidate.destroy();
        }
        catch {
            // Already closed.
        }
        logger.warn("Redis unavailable; continuing without position cache", error);
    }
}
function positionKey(name) {
    return `pixel-realms:position:${name.toLowerCase()}`;
}
/**
 * Session position cache. This is intentionally best-effort: a Redis outage
 * only means the next login starts from the last PostgreSQL save (or spawn).
 */
export async function cachePosition(name, position, ttlSeconds = 3600) {
    if (!client)
        return;
    try {
        await client.set(positionKey(name), JSON.stringify(position), { EX: ttlSeconds });
    }
    catch (error) {
        logger.warn("Failed to cache player position", error);
    }
}
export async function loadCachedPosition(name) {
    if (!client)
        return null;
    try {
        const raw = await client.get(positionKey(name));
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.x !== "number" ||
            typeof parsed.y !== "number" ||
            !Number.isFinite(parsed.x) ||
            !Number.isFinite(parsed.y)) {
            return null;
        }
        return {
            x: parsed.x,
            y: parsed.y,
            dir: typeof parsed.dir === "number" ? parsed.dir : 0,
        };
    }
    catch (error) {
        logger.warn("Failed to read cached player position", error);
        return null;
    }
}
export async function closeRedis() {
    const active = client;
    client = null;
    enabled = false;
    if (!active)
        return;
    try {
        await active.quit();
        logger.info("Redis connection closed");
    }
    catch (error) {
        logger.warn("Failed to close Redis cleanly", error);
        try {
            active.destroy();
        }
        catch {
            // Already closed.
        }
    }
}
