import express from "express";
import { env, isProduction } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { parseCredentials } from "../utils/validation.js";
import { accountStoreMode, authenticate, createAccount, findAccountById, findOrCreateDevAccount } from "./accounts.js";
import { createAuthToken, verifyAuthToken } from "./tokens.js";
import { mountCharacterRoutes } from "./characters.js";
/**
 * HTTP auth endpoints used by the login screen.
 *
 *   POST /auth/register  { username, password } -> { token, expiresAt, account }
 *   POST /auth/login     { username, password } -> { token, expiresAt, account }
 *   GET  /auth/me        Authorization: Bearer <token> -> { account }
 *
 * The issued token is then passed to the Colyseus join, where GameRoom.onAuth
 * verifies it before the player enters the world.
 */
const ATTEMPT_WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 20;
const attempts = new Map();
function registerAttempt(key) {
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
        return true;
    }
    current.count += 1;
    // Opportunistic cleanup so the map cannot grow without bound.
    if (attempts.size > 5000) {
        for (const [entryKey, entry] of attempts) {
            if (entry.resetAt <= now)
                attempts.delete(entryKey);
        }
    }
    return current.count <= MAX_ATTEMPTS_PER_WINDOW;
}
function sendError(response, status, error, message) {
    response.status(status).json({ error, message });
}
function sessionPayload(account) {
    const issued = createAuthToken(account);
    return {
        token: issued.token,
        expiresAt: issued.expiresAt,
        account: { id: account.id, username: account.username },
    };
}
export function mountAuthRoutes(app) {
    const router = express.Router();
    router.use(express.json({ limit: "8kb" }));
    // Scoped CORS: the game client is served from Vite on a different port.
    router.use((request, response, next) => {
        response.setHeader("Access-Control-Allow-Origin", env.CLIENT_ORIGIN);
        response.setHeader("Vary", "Origin");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.setHeader("Cache-Control", "no-store");
        if (request.method === "OPTIONS") {
            response.status(204).end();
            return;
        }
        next();
    });
    router.post("/register", async (request, response) => {
        if (!registerAttempt(`register:${request.ip ?? "unknown"}`)) {
            sendError(response, 429, "rate-limited", "Too many attempts. Try again in a minute.");
            return;
        }
        const credentials = parseCredentials(request.body);
        if (!credentials.ok) {
            sendError(response, 400, "invalid-input", credentials.error);
            return;
        }
        const result = await createAccount(credentials.username, credentials.password);
        if (result.ok === false) {
            if (result.error === "username-taken") {
                sendError(response, 409, "username-taken", "That username is already taken.");
                return;
            }
            sendError(response, 503, "storage", "Accounts are unavailable right now.");
            return;
        }
        response.status(201).json(sessionPayload(result.account));
    });
    router.post("/login", async (request, response) => {
        if (!registerAttempt(`login:${request.ip ?? "unknown"}`)) {
            sendError(response, 429, "rate-limited", "Too many attempts. Try again in a minute.");
            return;
        }
        const credentials = parseCredentials(request.body);
        if (!credentials.ok) {
            sendError(response, 400, "invalid-input", credentials.error);
            return;
        }
        const account = await authenticate(credentials.username, credentials.password);
        if (!account) {
            sendError(response, 401, "invalid-credentials", "Wrong username or password.");
            return;
        }
        response.json(sessionPayload(account));
    });
    router.get("/me", async (request, response) => {
        const header = request.headers.authorization ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        const claims = verifyAuthToken(token);
        if (!claims) {
            sendError(response, 401, "unauthorized", "Session expired. Please log in again.");
            return;
        }
        const account = await findAccountById(claims.sub);
        if (!account) {
            sendError(response, 401, "unauthorized", "Session expired. Please log in again.");
            return;
        }
        response.json({ account: { id: account.id, username: account.username } });
    });
    if (env.DEV_MODE && !isProduction) {
        router.post("/dev-login", async (_request, response) => {
            const account = await findOrCreateDevAccount("Admin");
            if (!account) {
                sendError(response, 503, "storage", "Dev account unavailable.");
                return;
            }
            response.json(sessionPayload(account));
        });
        logger.warn("DEV_MODE active: /auth/dev-login enabled for Admin");
    }
    app.use("/auth", router);
    mountCharacterRoutes(app);
    logger.info(`Auth endpoints mounted at /auth (storage: ${accountStoreMode()}, ` +
        `token ttl: ${Math.round(env.AUTH_TOKEN_TTL_MS / 3_600_000)}h)`);
}
