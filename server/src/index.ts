import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { accountStoreMode } from "./auth/accounts.js";
import { mountAuthRoutes } from "./auth/routes.js";
import { env, isProduction, usingDevAuthSecret } from "./config/env.js";
import { ROOM_NAME } from "./config/gameplay.js";
import { closePostgres, initPostgres, isPostgresEnabled } from "./database/postgres.js";
import { closeRedis, initRedis, isRedisEnabled } from "./database/redis.js";
import { GameRoom } from "./rooms/GameRoom.js";
import { logger } from "./utils/logger.js";
/**
 * Process entry point. Boots optional persistence, exposes a small health
 * endpoint, defines the game room and starts the Colyseus server.
 */
async function main() {
    if (usingDevAuthSecret) {
        if (isProduction) {
            throw new Error("AUTH_SECRET must be set when NODE_ENV=production.");
        }
        logger.warn("AUTH_SECRET is not set; using an insecure development secret. " +
            "Existing sessions become invalid whenever the server restarts.");
    }
    await initPostgres();
    await initRedis();
    const server = new Server({
        express: (app) => {
            app.get("/health", (_request, response) => {
                response.json({
                    ok: true,
                    name: "pixel-realms-server",
                    version: env.SERVER_VERSION,
                    uptimeSeconds: Math.round(process.uptime()),
                    persistence: {
                        postgres: isPostgresEnabled(),
                        redis: isRedisEnabled(),
                    },
                    accounts: accountStoreMode(),
                });
            });
            mountAuthRoutes(app);

            const currentDir = path.dirname(fileURLToPath(import.meta.url));
            const clientDist = path.resolve(currentDir, "../../client/dist");
            if (fs.existsSync(clientDist)) {
                app.use(express.static(clientDist));
                app.get("/", (_req, res) => {
                    res.sendFile(path.join(clientDist, "index.html"));
                });
                logger.info(`Serving static client from ${clientDist}`);
            }
        },
    });
    server.define(ROOM_NAME, GameRoom).filterBy(["mapId"]);
    server.onShutdown(async () => {
        logger.info("Closing database connections on shutdown...");
        await closeRedis();
        await closePostgres();
    });

    process.on("uncaughtException", (error) => {
        logger.error("[FATAL ERROR] Uncaught exception:", error);
    });

    process.on("unhandledRejection", (reason) => {
        logger.error("[UNHANDLED REJECTION] Promise rejection:", reason);
    });

    const handleSignal = async (signal: string) => {
        logger.info(`Received ${signal}. Shutting down gracefully...`);
        try {
            await closeRedis();
            await closePostgres();
            process.exit(0);
        } catch (err) {
            logger.error("Error during shutdown cleanup:", err);
            process.exit(1);
        }
    };

    process.once("SIGINT", () => handleSignal("SIGINT"));
    process.once("SIGTERM", () => handleSignal("SIGTERM"));

    await server.listen(env.PORT, env.HOST);
    logger.info(`Pixel Realms listening on http://${env.HOST}:${env.PORT} ` +
        `(room "${ROOM_NAME}", max ${env.MAX_PLAYERS} players)`);
}
main().catch((error) => {
    logger.error("Server failed to start", error);
    process.exitCode = 1;
});
