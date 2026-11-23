import "dotenv/config";
const DEV_AUTH_SECRET = "pixel-realms-insecure-dev-secret";
function intFromEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
export const env = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PORT: intFromEnv("PORT", 2567),
    HOST: process.env.HOST ?? "0.0.0.0",
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    REDIS_URL: process.env.REDIS_URL ?? "",
    MAX_PLAYERS: intFromEnv("MAX_PLAYERS", 50),
    PERSIST_INTERVAL_MS: intFromEnv("PERSIST_INTERVAL_MS", 15000),
    AUTH_SECRET: process.env.AUTH_SECRET?.trim() || DEV_AUTH_SECRET,
    AUTH_TOKEN_TTL_MS: intFromEnv("AUTH_TOKEN_TTL_HOURS", 168) * 60 * 60 * 1000,
    DEV_MODE: process.env.DEV_MODE === "true",
    SERVER_VERSION: "0.1.0",
};
export const isProduction = env.NODE_ENV === "production";
/** True when AUTH_SECRET was not provided, so sessions break on every restart. */
export const usingDevAuthSecret = env.AUTH_SECRET === DEV_AUTH_SECRET;
