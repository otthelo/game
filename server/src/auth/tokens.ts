import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
/**
 * Compact, signed session tokens.
 *
 * This is a JWT-shaped token (`v1.<payload>.<signature>`) built with HMAC-SHA256
 * so the project needs no extra dependency. It is only ever verified by this
 * server, which is all the game needs: the token proves "this browser logged in
 * as <account>" when joining a room or calling /auth/me.
 */
const VERSION = "v1";
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
function sign(value) {
    return createHmac("sha256", env.AUTH_SECRET).update(value).digest("base64url");
}
export function createAuthToken(account) {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + env.AUTH_TOKEN_TTL_MS;
    const claims = {
        sub: account.id,
        username: account.username,
        gmLevel: account.gmLevel ?? 0,
        iat: issuedAt,
        exp: expiresAt,
    };
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const body = `${VERSION}.${payload}`;
    return { token: `${body}.${sign(body)}`, expiresAt };
}
export function verifyAuthToken(raw) {
    if (typeof raw !== "string")
        return null;
    const parts = raw.split(".");
    if (parts.length !== 3 || parts[0] !== VERSION)
        return null;
    const body = `${parts[0]}.${parts[1]}`;
    const expected = Buffer.from(sign(body), "utf8");
    const actual = Buffer.from(parts[2], "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        return null;
    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    }
    catch {
        return null;
    }
    if (!isClaims(parsed))
        return null;
    const now = Date.now();
    if (parsed.exp <= now)
        return null;
    if (parsed.exp > now + MAX_FUTURE_SKEW_MS + env.AUTH_TOKEN_TTL_MS)
        return null;
    return parsed;
}
function isClaims(value) {
    if (!value || typeof value !== "object")
        return false;
    const claims = value;
    return (typeof claims.sub === "string" &&
        claims.sub.length > 0 &&
        typeof claims.username === "string" &&
        claims.username.length > 0 &&
        typeof claims.iat === "number" &&
        Number.isFinite(claims.iat) &&
        typeof claims.exp === "number" &&
        Number.isFinite(claims.exp));
}
