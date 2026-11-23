import { Pool } from "pg";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
let pool: Pool | null = null;
let enabled = false;
export function isPostgresEnabled() {
    return enabled;
}
/**
 * Connects eagerly (once) when DATABASE_URL is present. A missing or unreachable
 * database is not fatal: the server falls back to purely in-memory characters.
 */
export async function initPostgres() {
    if (!env.DATABASE_URL) {
        logger.info("PostgreSQL disabled (DATABASE_URL is not set)");
        return;
    }
    const candidate = new Pool({
        connectionString: env.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 2_500,
        query_timeout: 4_000,
        application_name: "pixel-realms",
    });
    candidate.on("error", (error) => {
        logger.warn("PostgreSQL idle client error", error);
    });
    try {
        const client = await candidate.connect();
        try {
            await client.query("SELECT 1");
        }
        finally {
            client.release();
        }
        pool = candidate;
        enabled = true;
        logger.info("PostgreSQL connected");
    }
    catch (error) {
        enabled = false;
        await candidate.end().catch(() => undefined);
        logger.warn("PostgreSQL unavailable; continuing without persistence", error);
    }
}
export function getPool(): Pool | null {
    return enabled ? pool : null;
}
export async function query(text, values = []) {
    const active = getPool();
    if (!active)
        return [];
    const result = await active.query(text, values);
    return result.rows;
}
export async function closePostgres() {
    const active = pool;
    pool = null;
    enabled = false;
    if (!active)
        return;
    try {
        await active.end();
        logger.info("PostgreSQL connection closed");
    }
    catch (error) {
        logger.warn("Failed to close PostgreSQL cleanly", error);
    }
}
