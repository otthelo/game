import { schema, t } from "@colyseus/schema";
import { InventorySlot } from "./InventorySlot.js";
/**
 * Networked player state. Positions are the feet of the sprite in world pixels.
 *
 * `lastProcessedInput` is the acknowledgement used by client-side prediction:
 * the client drops every input with `seq <= lastProcessedInput` and replays the
 * rest from the authoritative position.
 *
 * `inventory` is keyed by slot index as a string ("0".."15"). Equipped gear is
 * stored by item id; `attack` and `maxHp` are always recalculated from the
 * level plus those items, so the client can display a single derived value.
 */
export const PlayerSchema = schema({
    sessionId: t.string().default(""),
    name: t.string().default(""),
    x: t.number().default(0),
    y: t.number().default(0),
    dir: t.uint8().default(0),
    moving: t.boolean().default(false),
    hp: t.uint16().default(100),
    maxHp: t.uint16().default(100),
    sp: t.uint16().default(20),
    maxSp: t.uint16().default(20),
    level: t.uint8().default(1),
    xp: t.uint32().default(0),
    xpToNext: t.uint32().default(50),
    jobId: t.string().default("novice"),
    jobLevel: t.uint8().default(1),
    jobXp: t.uint32().default(0),
    jobXpToNext: t.uint32().default(20),
    attack: t.uint16().default(10),
    str: t.uint16().default(1),
    agi: t.uint16().default(1),
    vit: t.uint16().default(1),
    int: t.uint16().default(1),
    dex: t.uint16().default(1),
    luk: t.uint16().default(1),
    statPoints: t.uint16().default(0),
    outfit: t.uint8().default(0),
    lastProcessedInput: t.uint32().default(0),
    gold: t.uint32().default(0),
    weaponId: t.string().default(""),
    armorId: t.string().default(""),
    wingId: t.string().default(""),
    garmentId: t.string().default(""),
    gmLevel: t.uint8().default(0),
    frozen: t.boolean().default(false),
    resting: t.boolean().default(false),
    inventory: t.map(InventorySlot),
}, "Player");
