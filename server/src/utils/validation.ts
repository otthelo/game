export const NAME_MAX_LENGTH = 16;
export const CHAT_MAX_LENGTH = 120;
export const MAX_ID_LENGTH = 48;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = NAME_MAX_LENGTH;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 64;
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
/**
 * Validates the body of /auth/register and /auth/login. The username is kept as
 * typed (it doubles as the character name); passwords are never trimmed.
 */
export function parseCredentials(raw) {
    if (!raw || typeof raw !== "object") {
        return { ok: false, error: "Missing username or password." };
    }
    const body = raw;
    if (typeof body.username !== "string" || typeof body.password !== "string") {
        return { ok: false, error: "Missing username or password." };
    }
    const username = body.username.trim();
    const password = body.password;
    if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
        return { ok: false, error: "Username must be 3-16 characters long." };
    }
    if (!USERNAME_PATTERN.test(username)) {
        return { ok: false, error: "Username can only use letters, numbers and underscores." };
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        return { ok: false, error: "Password must be 6-64 characters long." };
    }
    return { ok: true, username, password };
}
/** Printable ASCII only: names are rendered by Phaser's bitmap/text pipeline. */
export function sanitizeName(raw) {
    if (typeof raw !== "string")
        return "";
    return raw
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, NAME_MAX_LENGTH);
}
export function sanitizeChat(raw) {
    if (typeof raw !== "string")
        return "";
    return raw
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, CHAT_MAX_LENGTH);
}
/** IDs travel inside messages and are used as map lookups; keep them narrow. */
export function sanitizeId(raw) {
    if (typeof raw !== "string")
        return "";
    const id = raw.trim();
    if (id.length === 0 || id.length > MAX_ID_LENGTH)
        return "";
    return /^[a-zA-Z0-9_-]+$/.test(id) ? id : "";
}
export function extractChatText(raw) {
    if (!raw || typeof raw !== "object")
        return "";
    return sanitizeChat(raw.text);
}
export function extractTargetId(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const id = sanitizeId(raw.targetId);
    return id || undefined;
}
/** Inventory slots are small integers addressed as "0".."15". */
export function extractSlotIndex(raw, slotCount) {
    if (!raw || typeof raw !== "object")
        return null;
    const value = raw.slot;
    if (typeof value !== "number" || !Number.isFinite(value))
        return null;
    const slot = Math.floor(value);
    return slot >= 0 && slot < slotCount ? slot : null;
}
export function extractEquipSlot(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const value = raw.slot;
    return value === "weapon" || value === "armor" || value === "wing" || value === "garment" ? value : null;
}
const VALID_STATS = new Set(["str", "agi", "vit", "int", "dex", "luk"]);
export function extractStatAllocation(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const stat = raw.stat;
    if (typeof stat !== "string" || !VALID_STATS.has(stat))
        return null;
    const rawAmount = raw.amount === undefined ? 1 : Number(raw.amount);
    if (!Number.isFinite(rawAmount))
        return null;
    const amount = Math.floor(rawAmount);
    if (amount < 1 || amount > 10)
        return null;
    return { stat, amount };
}
/**
 * Coerces an untrusted input payload. Sequence numbers are monotonic uint32
 * values; booleans are forced so a client cannot smuggle arbitrary values into
 * the authoritative movement code.
 */
export function parseInputMessage(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const message = raw;
    const seqValue = message.seq;
    if (typeof seqValue !== "number" || !Number.isFinite(seqValue))
        return null;
    const seq = Math.floor(seqValue);
    if (seq <= 0 || seq > 0xffffffff)
        return null;
    return {
        seq,
        up: message.up === true,
        down: message.down === true,
        left: message.left === true,
        right: message.right === true,
    };
}
