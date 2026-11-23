/** Authoritative simulation values. Keep movement values in sync with client/src/config/gameConfig.ts. */
export const ROOM_NAME = "game_room";
export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const PLAYER_SPEED = 140;
export const PLAYER_RADIUS = 9;
export const PLAYER_BASE_HP = 100;
export const PLAYER_BASE_SP = 20;
export const PLAYER_BASE_ATTACK = 10;
export const PLAYER_HP_PER_LEVEL = 12;
export const PLAYER_SP_PER_LEVEL = 3;
export const PLAYER_ATTACK_PER_LEVEL = 2;
export const PLAYER_MAX_LEVEL = 60;
export const STAT_POINTS_PER_LEVEL = 3;
export const PLAYER_BASE_STAT = 1;
export const ATTACK_RANGE = 60;
export const SWORD_ATTACK_RANGE = 1.3 * 32; // 41.6px (1.3 tiles)
export function getPlayerAttackRange(weaponId?: string): number {
    return weaponId && weaponId.length > 0 ? SWORD_ATTACK_RANGE : ATTACK_RANGE;
}
// Slightly shorter than the client's 450 ms swing so latency jitter never
// rejects an otherwise valid attack.
export const PLAYER_ATTACK_COOLDOWN_MS = 420;
export const PLAYER_RESPAWN_MS = 3000;
export const PLAYER_REGEN_AMOUNT = 2;
export const PLAYER_REGEN_INTERVAL_MS = 3000;
export const CHAT_COOLDOWN_MS = 450;
export const INTERACT_RANGE = 84;
export const INTERACT_COOLDOWN_MS = 650;
/** Shared throttle for potions and gear swaps. */
export const ITEM_ACTION_COOLDOWN_MS = 500;
export const MAX_INPUTS_PER_TICK = 3;
export const MAX_QUEUED_INPUTS = 12;
export const BOSS_TRIGGER_KILLS = 10;
export type MonsterElement = "neutral" | "water" | "fire" | "poison" | "earth" | "dark";

export interface MonsterLootEntry {
    itemId: string;
    chance: number;
    min: number;
    max: number;
}

export interface MonsterDefinition {
    name: string;
    level: number;
    element: MonsterElement;
    aggressive: boolean;
    maxHp: number;
    speed: number;
    damage: number;
    def: number;
    mdef: number;
    flee: number;
    hit: number;
    attackRange: number;
    aggroRange: number;
    attackCooldownMs: number;
    xp: number;
    jobXp: number;
    respawnMs: number;
    radius: number;
    goldMin: number;
    goldMax: number;
    loot: MonsterLootEntry[];
}

export const MONSTER_TYPES: Record<number, MonsterDefinition> = {
    0: {
        name: "Moss Slime",
        level: 1,
        element: "neutral",
        aggressive: false,
        maxHp: 63,
        speed: 42,
        damage: 8,
        def: 2,
        mdef: 2,
        flee: 5,
        hit: 90,
        attackRange: 30,
        aggroRange: 120,
        attackCooldownMs: 1450,
        xp: 10000,
        jobXp: 10000,
        respawnMs: 9000,
        radius: 8,
        goldMin: 1,
        goldMax: 4,
        loot: [
            { itemId: "moss-jelly", chance: 0.9, min: 1, max: 2 },
            { itemId: "health-potion", chance: 0.08, min: 1, max: 1 },
            { itemId: "cloth-vest", chance: 0.03, min: 1, max: 1 },
            { itemId: "bronze-sword", chance: 0.01, min: 1, max: 1 },
        ],
    },
    1: {
        name: "Dusk Bat",
        level: 3,
        element: "dark",
        aggressive: true,
        maxHp: 48,
        speed: 66,
        damage: 11,
        def: 3,
        mdef: 5,
        flee: 14,
        hit: 98,
        attackRange: 28,
        aggroRange: 156,
        attackCooldownMs: 1150,
        xp: 24,
        jobXp: 18,
        respawnMs: 11000,
        radius: 7,
        goldMin: 2,
        goldMax: 6,
        loot: [
            { itemId: "dusk-wing", chance: 0.85, min: 1, max: 2 },
            { itemId: "health-potion", chance: 0.1, min: 1, max: 1 },
            { itemId: "greater-potion", chance: 0.04, min: 1, max: 1 },
            { itemId: "leather-vest", chance: 0.025, min: 1, max: 1 },
            { itemId: "bronze-sword", chance: 0.015, min: 1, max: 1 },
            { itemId: "hunter-blade", chance: 0.006, min: 1, max: 1 },
            { itemId: "iron-vest", chance: 0.006, min: 1, max: 1 },
        ],
    },
    2: {
        name: "Black Ashura",
        level: 15,
        element: "dark",
        aggressive: true,
        maxHp: 630,
        speed: 72,
        damage: 27,
        def: 15,
        mdef: 18,
        flee: 28,
        hit: 125,
        attackRange: 38,
        aggroRange: 208,
        attackCooldownMs: 1100,
        xp: 1000,
        jobXp: 650,
        respawnMs: 0,
        radius: 14,
        goldMin: 45,
        goldMax: 90,
        loot: [
            { itemId: "greater-potion", chance: 0.9, min: 1, max: 2 },
            { itemId: "bronze-sword", chance: 0.25, min: 1, max: 1 },
            { itemId: "leather-vest", chance: 0.25, min: 1, max: 1 },
            { itemId: "hunter-blade", chance: 0.12, min: 1, max: 1 },
            { itemId: "iron-vest", chance: 0.12, min: 1, max: 1 },
            { itemId: "wing-of-butterfly", chance: 0.2, min: 1, max: 1 },
            { itemId: "cloak", chance: 0.25, min: 1, max: 1 },
        ],
    },
    3: {
        name: "Marin",
        level: 5,
        element: "water",
        aggressive: false,
        maxHp: 102,
        speed: 46,
        damage: 14,
        def: 5,
        mdef: 8,
        flee: 10,
        hit: 100,
        attackRange: 28,
        aggroRange: 128,
        attackCooldownMs: 1350,
        xp: 45,
        jobXp: 32,
        respawnMs: 10000,
        radius: 8,
        goldMin: 4,
        goldMax: 10,
        loot: [
            { itemId: "moss-jelly", chance: 0.9, min: 1, max: 2 },
            { itemId: "health-potion", chance: 0.15, min: 1, max: 1 },
            { itemId: "cloth-vest", chance: 0.05, min: 1, max: 1 },
            { itemId: "bronze-sword", chance: 0.03, min: 1, max: 1 },
        ],
    },
    4: {
        name: "Magmaring",
        level: 10,
        element: "fire",
        aggressive: true,
        maxHp: 248,
        speed: 52,
        damage: 23,
        def: 9,
        mdef: 9,
        flee: 18,
        hit: 110,
        attackRange: 30,
        aggroRange: 144,
        attackCooldownMs: 1250,
        xp: 95,
        jobXp: 70,
        respawnMs: 12000,
        radius: 9,
        goldMin: 12,
        goldMax: 24,
        loot: [
            { itemId: "greater-potion", chance: 0.25, min: 1, max: 2 },
            { itemId: "leather-vest", chance: 0.1, min: 1, max: 1 },
            { itemId: "hunter-blade", chance: 0.05, min: 1, max: 1 },
            { itemId: "iron-vest", chance: 0.05, min: 1, max: 1 },
            { itemId: "wing-of-butterfly", chance: 0.1, min: 1, max: 1 },
        ],
    },
    5: {
        name: "Poporing",
        level: 8,
        element: "poison",
        aggressive: true,
        maxHp: 173,
        speed: 48,
        damage: 18,
        def: 6,
        mdef: 9,
        flee: 14,
        hit: 105,
        attackRange: 28,
        aggroRange: 136,
        attackCooldownMs: 1300,
        xp: 70,
        jobXp: 52,
        respawnMs: 11000,
        radius: 8,
        goldMin: 8,
        goldMax: 18,
        loot: [
            { itemId: "moss-jelly", chance: 0.9, min: 1, max: 2 },
            { itemId: "health-potion", chance: 0.25, min: 1, max: 1 },
            { itemId: "greater-potion", chance: 0.08, min: 1, max: 1 },
            { itemId: "leather-vest", chance: 0.05, min: 1, max: 1 },
            { itemId: "bronze-sword", chance: 0.03, min: 1, max: 1 },
        ],
    },
    6: {
        name: "Forest Stalker",
        level: 13,
        element: "earth",
        aggressive: true,
        maxHp: 315,
        speed: 68,
        damage: 29,
        def: 12,
        mdef: 8,
        flee: 25,
        hit: 115,
        attackRange: 30,
        aggroRange: 160,
        attackCooldownMs: 1100,
        xp: 145,
        jobXp: 110,
        respawnMs: 12000,
        radius: 8,
        goldMin: 18,
        goldMax: 35,
        loot: [
            { itemId: "dusk-wing", chance: 0.75, min: 1, max: 2 },
            { itemId: "greater-potion", chance: 0.25, min: 1, max: 1 },
            { itemId: "hunter-blade", chance: 0.06, min: 1, max: 1 },
            { itemId: "iron-vest", chance: 0.06, min: 1, max: 1 },
            { itemId: "cloak", chance: 0.04, min: 1, max: 1 },
        ],
    },
    7: {
        name: "Venom Poring",
        level: 16,
        element: "poison",
        aggressive: true,
        maxHp: 420,
        speed: 56,
        damage: 35,
        def: 15,
        mdef: 18,
        flee: 30,
        hit: 120,
        attackRange: 30,
        aggroRange: 152,
        attackCooldownMs: 1200,
        xp: 210,
        jobXp: 165,
        respawnMs: 13000,
        radius: 9,
        goldMin: 25,
        goldMax: 48,
        loot: [
            { itemId: "moss-jelly", chance: 0.85, min: 1, max: 3 },
            { itemId: "greater-potion", chance: 0.35, min: 1, max: 2 },
            { itemId: "cloak", chance: 0.07, min: 1, max: 1 },
            { itemId: "wing-of-butterfly", chance: 0.08, min: 1, max: 1 },
            { itemId: "monarch-wings", chance: 0.03, min: 1, max: 1 },
        ],
    },
    8: {
        name: "Shadow Ashura",
        level: 20,
        element: "dark",
        aggressive: true,
        maxHp: 585,
        speed: 74,
        damage: 44,
        def: 21,
        mdef: 23,
        flee: 38,
        hit: 130,
        attackRange: 34,
        aggroRange: 176,
        attackCooldownMs: 1050,
        xp: 340,
        jobXp: 260,
        respawnMs: 16000,
        radius: 11,
        goldMin: 40,
        goldMax: 75,
        loot: [
            { itemId: "greater-potion", chance: 0.55, min: 1, max: 2 },
            { itemId: "hunter-blade", chance: 0.1, min: 1, max: 1 },
            { itemId: "iron-vest", chance: 0.1, min: 1, max: 1 },
            { itemId: "cloak", chance: 0.12, min: 1, max: 1 },
            { itemId: "monarch-wings", chance: 0.06, min: 1, max: 1 },
        ],
    },
    9: {
        name: "Mad Bunny",
        level: 17,
        element: "dark",
        aggressive: true,
        maxHp: 750,
        speed: 80,
        damage: 30,
        def: 27,
        mdef: 23,
        flee: 10,
        hit: 100,
        attackRange: 30,
        aggroRange: 140,
        attackCooldownMs: 1200,
        xp: 40,
        jobXp: 40,
        respawnMs: 10000,
        radius: 8,
        goldMin: 2,
        goldMax: 8,
        loot: [
            { itemId: "bronze-sword", chance: 0.5, min: 1, max: 1 },
        ],
    },
    10: {
        name: "Huskar",
        level: 18,
        element: "fire",
        aggressive: true,
        maxHp: 450,
        speed: 58,
        damage: 36,
        def: 18,
        mdef: 15,
        flee: 24,
        hit: 118,
        attackRange: 34,
        aggroRange: 168,
        attackCooldownMs: 1250,
        xp: 220,
        jobXp: 170,
        respawnMs: 14000,
        radius: 10,
        goldMin: 28,
        goldMax: 52,
        loot: [
            { itemId: "greater-potion", chance: 0.4, min: 1, max: 2 },
            { itemId: "iron-vest", chance: 0.08, min: 1, max: 1 },
            { itemId: "hunter-blade", chance: 0.07, min: 1, max: 1 },
        ],
    },
    11: {
        name: "High Orc",
        level: 20,
        element: "earth",
        aggressive: true,
        maxHp: 540,
        speed: 52,
        damage: 42,
        def: 24,
        mdef: 18,
        flee: 20,
        hit: 122,
        attackRange: 36,
        aggroRange: 172,
        attackCooldownMs: 1300,
        xp: 260,
        jobXp: 200,
        respawnMs: 15000,
        radius: 11,
        goldMin: 35,
        goldMax: 62,
        loot: [
            { itemId: "greater-potion", chance: 0.45, min: 1, max: 2 },
            { itemId: "iron-vest", chance: 0.1, min: 1, max: 1 },
            { itemId: "cloak", chance: 0.06, min: 1, max: 1 },
        ],
    },
    12: {
        name: "Orc",
        level: 12,
        element: "earth",
        aggressive: true,
        maxHp: 270,
        speed: 50,
        damage: 24,
        def: 12,
        mdef: 9,
        flee: 16,
        hit: 112,
        attackRange: 32,
        aggroRange: 150,
        attackCooldownMs: 1350,
        xp: 130,
        jobXp: 96,
        respawnMs: 12000,
        radius: 9,
        goldMin: 14,
        goldMax: 28,
        loot: [
            { itemId: "health-potion", chance: 0.35, min: 1, max: 2 },
            { itemId: "leather-vest", chance: 0.08, min: 1, max: 1 },
            { itemId: "bronze-sword", chance: 0.05, min: 1, max: 1 },
        ],
    },
    13: {
        name: "Pochi",
        level: 6,
        element: "neutral",
        aggressive: false,
        maxHp: 135,
        speed: 60,
        damage: 15,
        def: 6,
        mdef: 6,
        flee: 22,
        hit: 104,
        attackRange: 28,
        aggroRange: 132,
        attackCooldownMs: 1400,
        xp: 58,
        jobXp: 44,
        respawnMs: 10000,
        radius: 8,
        goldMin: 5,
        goldMax: 12,
        loot: [
            { itemId: "moss-jelly", chance: 0.7, min: 1, max: 2 },
            { itemId: "health-potion", chance: 0.18, min: 1, max: 1 },
        ],
    },
    14: {
        name: "White Snake Lady",
        level: 35,
        element: "water",
        aggressive: true,
        maxHp: 7500,
        speed: 77,
        damage: 120,
        def: 38,
        mdef: 68,
        flee: 25,
        hit: 180,
        attackRange: 75,
        aggroRange: 180,
        attackCooldownMs: 1200,
        xp: 2500,
        jobXp: 1800,
        respawnMs: 10000,
        radius: 8,
        goldMin: 2,
        goldMax: 8,
        loot: [
            { itemId: "moss-jelly", chance: 0.5, min: 1, max: 1 },
        ],
    },
};
