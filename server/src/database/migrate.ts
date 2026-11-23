import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
async function migrate() {
    if (!env.DATABASE_URL) {
        logger.error("DATABASE_URL is not set. Add it to server/.env, then run `npm run db:migrate`.");
        process.exitCode = 1;
        return;
    }
    const pool = new Pool({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: 5_000,
    });
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
        const files = (await readdir(MIGRATIONS_DIR))
            .filter((file) => file.endsWith(".sql"))
            .sort((a, b) => a.localeCompare(b));
        if (files.length === 0) {
            logger.warn(`No migrations found in ${MIGRATIONS_DIR}`);
            return;
        }
        for (const file of files) {
            const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
            if ((applied.rowCount ?? 0) > 0) {
                logger.info(`Skipping ${file} (already applied)`);
                continue;
            }
            const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
            try {
                await client.query("BEGIN");
                await client.query(sql);
                await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
                await client.query("COMMIT");
                logger.info(`Applied ${file}`);
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        }
        logger.info("Database migrations are up to date");
    }
    finally {
        client.release();
        await pool.end();
    }
}
migrate().catch((error) => {
    logger.error("Migration failed", error);
    process.exitCode = 1;
});
