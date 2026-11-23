import fs from "node:fs";
import { MonsterKind } from "../types/protocol.js";

/**
 * The starting map is intentionally data-driven and tiny: 40 x 30 tiles.
 * `#` tree, `~` water and `R` rock block movement. `=` is a dirt path and `,`
 * is a flower decoration; both are walkable.
 *
 * The exact same rows are sent to the client (full state sync only) and used
 * for client-side prediction collision, so client and server always agree.
 */
export const MAP_ROWS = [
    "########################################",
    "#......................................#",
    "#..###.....,....====.....,....###......#",
    "#..###..........====..........###......#",
    "#...............====...................#",
    "#....~~~........====........R..........#",
    "#...~~~~~.......====.......RRR.........#",
    "#...~~~~~.......====........R..........#",
    "#....~~~........====...................#",
    "#...............====...................#",
    "#....,,.........====.........,,,.......#",
    "#======================================#",
    "#...............====...................#",
    "#....######.....====.....######........#",
    "#....######.....====.....######........#",
    "#...............====...................#",
    "#....~~~........====........R..........#",
    "#...~~~~~.......====.......RRR.........#",
    "#...~~~~~.......====........R..........#",
    "#....~~~........====...................#",
    "#...............====.........,,........#",
    "#....,,.........====...................#",
    "#...............====...................#",
    "#..###..........====..........###......#",
    "#..###..........====..........###......#",
    "#...............====...................#",
    "#.......,,......====........,,.........#",
    "#...............====...................#",
    "#......................................#",
    "########################################",
];
export const MAP = {
    name: "Verdant Hollow",
    tileSize: 32,
    rows: MAP_ROWS,
};
export const PLAYER_SPAWNS = [
    { tx: 17, ty: 9 },
    { tx: 18, ty: 13 },
    { tx: 20, ty: 16 },
    { tx: 21, ty: 20 },
    { tx: 17, ty: 22 },
    { tx: 22, ty: 11 },
];
export const NPC_SPAWNS = [
    { id: "elder-mira", name: "Elder Mira", kind: 0, tx: 14, ty: 8 },
    { id: "merchant-tomo", name: "Merchant Tomo", kind: 1, tx: 20, ty: 9 },
    { id: "guard-rolf", name: "Guard Rolf", kind: 2, tx: 22, ty: 21 },
    { id: "job-master-kai", name: "Job Master Kai", kind: 1, tx: 18, ty: 7 },
];
export const MONSTER_SPAWNS = [
    ...Array.from({ length: 3 }, () => ({ kind: 0, tx: 5, ty: 4 })),
    ...Array.from({ length: 3 }, () => ({ kind: 1, tx: 25, ty: 4 })),
    ...Array.from({ length: 3 }, () => ({ kind: 3, tx: 9, ty: 7 })),
    ...Array.from({ length: 3 }, () => ({ kind: 4, tx: 31, ty: 7 })),
    ...Array.from({ length: 3 }, () => ({ kind: 5, tx: 15, ty: 25 })),
    ...Array.from({ length: 3 }, () => ({ kind: 10, tx: 35, ty: 42 })),
    ...Array.from({ length: 3 }, () => ({ kind: 11, tx: 38, ty: 45 })),
    ...Array.from({ length: 3 }, () => ({ kind: 12, tx: 28, ty: 38 })),
    ...Array.from({ length: 3 }, () => ({ kind: 13, tx: 12, ty: 18 })),
];

// Optional full-map overrides maintained by the database editor.
export const MONSTER_SPAWN_OVERRIDES: Record<string, Array<{ kind: number; tx: number; ty: number }>> = {
    "verdant_hollow": [
        { kind: 0, tx: 5, ty: 4 },
        { kind: 0, tx: 5, ty: 4 },
        { kind: 0, tx: 5, ty: 4 },
        { kind: 3, tx: 2, ty: 7 },
        { kind: 3, tx: 2, ty: 7 },
        { kind: 3, tx: 2, ty: 7 },
        { kind: 4, tx: 2, ty: 7 },
        { kind: 4, tx: 2, ty: 7 },
        { kind: 4, tx: 2, ty: 7 },
        { kind: 5, tx: 2, ty: 6 },
        { kind: 5, tx: 2, ty: 6 },
        { kind: 5, tx: 6, ty: 6 },
    ],
    "hollowed_forest": [
        { kind: 6, tx: 16, ty: 20 },
        { kind: 6, tx: 16, ty: 20 },
        { kind: 6, tx: 16, ty: 20 },
        { kind: 6, tx: 16, ty: 20 },
        { kind: 6, tx: 16, ty: 20 },
        { kind: 7, tx: 38, ty: 22 },
        { kind: 7, tx: 38, ty: 22 },
        { kind: 7, tx: 38, ty: 22 },
        { kind: 7, tx: 38, ty: 22 },
        { kind: 7, tx: 38, ty: 22 },
        { kind: 8, tx: 34, ty: 48 },
        { kind: 8, tx: 34, ty: 48 },
        { kind: 8, tx: 34, ty: 48 },
        { kind: 8, tx: 34, ty: 48 },
        { kind: 8, tx: 34, ty: 48 },
    ],
    "adventure_guild_forest": [
        { kind: 9, tx: 20, ty: 15 },
        { kind: 9, tx: 20, ty: 15 },
        { kind: 9, tx: 20, ty: 15 },
        { kind: 9, tx: 20, ty: 15 },
        { kind: 9, tx: 20, ty: 15 },
        { kind: 9, tx: 20, ty: 15 },
        { kind: 9, tx: 20, ty: 15 },
        { kind: 9, tx: 20, ty: 15 },
        { kind: 11, tx: 20, ty: 15 },
    ],
    "adventure_guild": [

    ],
};
export const NPC_DIALOGS = {
    "elder-mira": [
        "The Hollow remembers every traveller. Walk softly.",
        "Monsters grow bolder beyond the old path. Keep your blade close.",
        "They say the pond reflects a world where nobody ever logs off.",
    ],
    "merchant-tomo": [
        "Fresh potions! Well... once the shipment arrives.",
        "Bring me slime jelly and we might talk business.",
        "A satchel is only as heavy as its secrets. Press I to peek inside.",
    ],
    "guard-rolf": [
        "Stay on the path after dark. The bats have sharp ears.",
        "I have guarded this crossing for nine patch cycles.",
        "If you fall, the Hollow will spit you back out. Probably.",
    ],
    "job-master-kai": [
        "Salam, Petualang! Sudah siap menentukan jalan hidupmu? Tekan [J] untuk membuka Menu Job & Syarat Ganti Job!",
        "Novice dengan Job Lv. 10 dapat berganti menjadi Swordsman, Archer, atau Mage!",
        "Kalahkan monster untuk mengumpulkan Base EXP dan Job EXP!",
    ],
    "npc_guildreport": [
        "Selamat datang di Adventure Guild! Laporkan pencapaian berburumu dan cek papan misi di sebelah kanan.",
        "Hati-hati dengan Mad Bunny di luar gerbang Guild!",
    ],
};
export const WORLD_WIDTH = MAP.rows[0].length * MAP.tileSize;
export const WORLD_HEIGHT = MAP.rows.length * MAP.tileSize;

interface TiledMonsterSpawn {
    kind: number;
    tx: number;
    ty: number;
    role?: "monster" | "monster_key" | "midboss" | "midboss_key" | "boss";
    fixedSpawn?: boolean;
}

interface TiledDoorSpawn {
    id: string;
    name: string;
    tx: number;
    ty: number;
    keyItemId: string;
    keyName: string;
    blockedTiles: Array<{ tx: number; ty: number }>;
}

interface TiledMapParsed {
    rows: string[];
    playerSpawns: Array<{ tx: number; ty: number }>;
    npcSpawns: Array<{ id: string; name: string; kind: number; tx: number; ty: number }>;
    monsterSpawns: TiledMonsterSpawn[];
    warps: Record<string, { tx: number; ty: number }>;
    doors: TiledDoorSpawn[];
}

function resolveMonsterKindByName(name: string): number {
    const lower = name.trim().toLowerCase();
    if (lower === "orc") return MonsterKind.Orc;
    if (lower === "high orc") return MonsterKind.HighOrc;
    if (lower === "huskar") return MonsterKind.Huskar;
    if (lower === "mad bunny") return MonsterKind.MadBunny;
    return 0;
}

function loadTiledMapData(
    relativePath: string,
    fallbackCols: number,
    fallbackRows: number,
    options?: { keyMonsterObjectId?: number; lastKeyMonsterObjectId?: number; bossKindOverride?: number },
): TiledMapParsed {
    try {
        const raw = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
        const parsed = JSON.parse(raw);
        const w = parsed.width || fallbackCols;
        const h = parsed.height || fallbackRows;
        const tw = parsed.tilewidth || 16;
        const th = parsed.tileheight || 16;
        const colLayer = parsed.layers?.find((l: any) => l.name === "Collision");
        const groundLayer = parsed.layers?.find((l: any) => l.name === "Ground");
        const rows: string[] = [];
        for (let y = 0; y < h; y++) {
            let row = "";
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                const blocked = (colLayer?.data?.[idx] ?? 0) !== 0 || (groundLayer?.data?.[idx] ?? 1) === 0;
                row += blocked ? "#" : ".";
            }
            rows.push(row);
        }

        const playerSpawns: Array<{ tx: number; ty: number }> = [];
        const npcSpawns: Array<{ id: string; name: string; kind: number; tx: number; ty: number }> = [];
        const monsterSpawns: TiledMonsterSpawn[] = [];
        const seenMonsterKeys = new Set<string>();
        const warps: Record<string, { tx: number; ty: number }> = {};
        const doors: TiledDoorSpawn[] = [];

        const objectLayers = (parsed.layers ?? []).filter((l: any) => l.type === "objectgroup");
        for (const layer of objectLayers) {
            for (const obj of layer.objects ?? []) {
                const tx = Math.max(0, Math.min(w - 1, Math.floor((obj.x ?? 0) / tw)));
                const ty = Math.max(0, Math.min(h - 1, Math.floor((obj.y ?? 0) / th)));
                const objType = String(obj.type ?? obj.class ?? "").toLowerCase();
                const objName = String(obj.name ?? "");
                const props: Record<string, unknown> = {};
                for (const p of obj.properties ?? []) {
                    if (p?.name) props[p.name] = p.value;
                }

                if (objType === "player" || objType === "player_spawn" || objName.toLowerCase() === "player_spawn") {
                    playerSpawns.push({ tx, ty });
                }
                else if (objType === "npc") {
                    npcSpawns.push({
                        id: String(props.id ?? (objName.toLowerCase().replace(/\s+/g, "-") || `npc-${tx}-${ty}`)),
                        name: String(props.name ?? (objName || "Villager")),
                        kind: Number(props.kind ?? 0) || 0,
                        tx,
                        ty,
                    });
                }
                else if (
                    objType === "monster" ||
                    objType === "midboss" ||
                    objType === "midboss_key" ||
                    objType === "monster_key" ||
                    objType === "boss"
                ) {
                    let kind = props.kind !== undefined ? (Number(props.kind) || 0) : resolveMonsterKindByName(objName);
                    const objId = Number(obj.id ?? 0);
                    let role: TiledMonsterSpawn["role"] =
                        objType === "boss"
                            ? "boss"
                            : objType === "midboss"
                                ? "midboss"
                                : objType === "midboss_key"
                                    ? "midboss_key"
                                    : objType === "monster_key"
                                        ? "monster_key"
                                        : "monster";
                    if (role === "boss" && options?.bossKindOverride !== undefined) {
                        kind = options.bossKindOverride;
                    }
                    if (options?.keyMonsterObjectId && objId === options.keyMonsterObjectId) {
                        role = "monster_key";
                    }
                    else if (options?.lastKeyMonsterObjectId && objId === options.lastKeyMonsterObjectId) {
                        role = "midboss_key";
                    }
                    const dedupKey = `${kind}:${role}:${tx}:${ty}`;
                    if (!seenMonsterKeys.has(dedupKey)) {
                        seenMonsterKeys.add(dedupKey);
                        monsterSpawns.push({
                            kind,
                            tx,
                            ty,
                            role,
                            fixedSpawn: true,
                        });
                    }
                }
                else if (objType === "door1" || objType === "door2") {
                    const isDoor1 = objType === "door1";
                    doors.push({
                        id: objType,
                        name: isDoor1 ? "Door1" : "Door2",
                        tx,
                        ty,
                        keyItemId: isDoor1 ? "orc-castle-key" : "orc-castle-last-key",
                        keyName: isDoor1 ? "Key" : "Last Room Key",
                        blockedTiles: [
                            { tx: Math.max(0, tx - 1), ty },
                            { tx, ty },
                        ],
                    });
                }
                else if (objType === "warp" || objType === "portal" || objType === "warp_portal") {
                    if (objName) warps[objName.toLowerCase()] = { tx, ty };
                    warps[objType] = { tx, ty };
                }
            }
        }

        return { rows, playerSpawns, npcSpawns, monsterSpawns, warps, doors };
    }
    catch {
        return {
            rows: Array.from({ length: fallbackRows }, () => ".".repeat(fallbackCols)),
            playerSpawns: [],
            npcSpawns: [],
            monsterSpawns: [],
            warps: {},
            doors: [],
        };
    }
}

const HOLLOWED_FOREST_DATA = loadTiledMapData("../../maps/hollowed_forest.json", 60, 60);
const ADVENTURE_GUILD_FOREST_DATA = loadTiledMapData("../../maps/adventure_guild_forest.json", 45, 30);
const ADVENTURE_GUILD_DATA = loadTiledMapData("../../maps/adventure_guild.json", 20, 20);
const ORC_CASTLE_DATA = loadTiledMapData("../../maps/orc_castle.json", 45, 45, {
    keyMonsterObjectId: 35,
    lastKeyMonsterObjectId: 19,
    bossKindOverride: MonsterKind.WhiteSnakeLady,
});
const HOLLOWED_FOREST_ROWS = HOLLOWED_FOREST_DATA.rows;
const ADVENTURE_GUILD_FOREST_ROWS = ADVENTURE_GUILD_FOREST_DATA.rows;
const ADVENTURE_GUILD_ROWS = ADVENTURE_GUILD_DATA.rows;
const ORC_CASTLE_ROWS = ORC_CASTLE_DATA.rows;

export const MAPS = {
    verdant_hollow: {
        id: "verdant_hollow",
        name: MAP.name,
        tileSize: MAP.tileSize,
        rows: MAP_ROWS,
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        playerSpawns: PLAYER_SPAWNS,
        npcSpawns: NPC_SPAWNS,
        monsterSpawns: MONSTER_SPAWN_OVERRIDES.verdant_hollow ?? MONSTER_SPAWNS,
        portals: [
            {
                id: "to-hollowed-forest",
                label: "Hollowed Forest",
                tx: 38,
                ty: 11,
                targetMapId: "hollowed_forest",
                targetMapName: "Hollowed Forest",
                spawnTx: 4,
                spawnTy: 33,
            },
            {
                id: "to-adventure-guild-forest",
                label: "Adventure Guild Forest",
                tx: 18,
                ty: 1,
                targetMapId: "adventure_guild_forest",
                targetMapName: "Adventure Guild Forest",
                spawnTx: 39,
                spawnTy: 27,
            },
        ],
    },
    hollowed_forest: {
        id: "hollowed_forest",
        name: "Hollowed Forest",
        tileSize: 32,
        rows: HOLLOWED_FOREST_ROWS,
        width: (HOLLOWED_FOREST_ROWS[0]?.length ?? 60) * 32,
        height: HOLLOWED_FOREST_ROWS.length * 32,
        playerSpawns: [{ tx: 4, ty: 33 }, { tx: 6, ty: 33 }],
        npcSpawns: [],
        monsterSpawns: MONSTER_SPAWN_OVERRIDES.hollowed_forest ?? [
            ...Array.from({ length: 5 }, () => ({ kind: 6, tx: 16, ty: 20 })),
            ...Array.from({ length: 5 }, () => ({ kind: 7, tx: 38, ty: 22 })),
            ...Array.from({ length: 5 }, () => ({ kind: 8, tx: 34, ty: 48 })),
        ],
        portals: [
            {
                id: "to-verdant-hollow",
                label: "Verdant Hollow",
                tx: 1,
                ty: 33,
                targetMapId: "verdant_hollow",
                targetMapName: "Verdant Hollow",
                spawnTx: 36,
                spawnTy: 11,
            },
        ],
    },
    adventure_guild_forest: {
        id: "adventure_guild_forest",
        name: "Adventure Guild Forest",
        tileSize: 32,
        rows: ADVENTURE_GUILD_FOREST_ROWS,
        width: (ADVENTURE_GUILD_FOREST_ROWS[0]?.length ?? 45) * 32,
        height: ADVENTURE_GUILD_FOREST_ROWS.length * 32,
        playerSpawns: ADVENTURE_GUILD_FOREST_DATA.playerSpawns.length > 0
            ? ADVENTURE_GUILD_FOREST_DATA.playerSpawns
            : [{ tx: 39, ty: 28 }],
        npcSpawns: ADVENTURE_GUILD_FOREST_DATA.npcSpawns,
        monsterSpawns: MONSTER_SPAWN_OVERRIDES.adventure_guild_forest ?? [
            ...ADVENTURE_GUILD_FOREST_DATA.monsterSpawns,
            ...Array.from({ length: 8 }, () => ({ kind: 9, tx: 20, ty: 15 })),
        ],
        portals: [
            {
                id: "to-verdant-hollow-from-guild",
                label: "Verdant Hollow",
                tx: 39,
                ty: 29,
                targetMapId: "verdant_hollow",
                targetMapName: "Verdant Hollow",
                spawnTx: 18,
                spawnTy: 3,
            },
            {
                id: "to-adventure-guild",
                label: "Adventure Guild",
                tx: ADVENTURE_GUILD_FOREST_DATA.warps["warp_guild"]?.tx ?? 5,
                ty: ADVENTURE_GUILD_FOREST_DATA.warps["warp_guild"]?.ty ?? 8,
                targetMapId: "adventure_guild",
                targetMapName: "Adventure Guild",
                spawnTx: ADVENTURE_GUILD_DATA.playerSpawns[0]?.tx ?? 10,
                spawnTy: ADVENTURE_GUILD_DATA.playerSpawns[0]?.ty ?? 18,
            },
            {
                id: "to-orc-castle",
                label: "Orc Castle",
                tx: ADVENTURE_GUILD_FOREST_DATA.warps["poertal orc castle"]?.tx ?? 6,
                ty: ADVENTURE_GUILD_FOREST_DATA.warps["poertal orc castle"]?.ty ?? 26,
                targetMapId: "orc_castle",
                targetMapName: "Orc Castle",
                spawnTx: ORC_CASTLE_DATA.playerSpawns[0]?.tx ?? 39,
                spawnTy: ORC_CASTLE_DATA.playerSpawns[0]?.ty ?? 43,
            },
        ],
    },
    adventure_guild: {
        id: "adventure_guild",
        name: "Adventure Guild",
        tileSize: 32,
        rows: ADVENTURE_GUILD_ROWS,
        width: (ADVENTURE_GUILD_ROWS[0]?.length ?? 20) * 32,
        height: ADVENTURE_GUILD_ROWS.length * 32,
        playerSpawns: ADVENTURE_GUILD_DATA.playerSpawns.length > 0
            ? ADVENTURE_GUILD_DATA.playerSpawns
            : [{ tx: 10, ty: 18 }],
        npcSpawns: ADVENTURE_GUILD_DATA.npcSpawns,
        monsterSpawns: MONSTER_SPAWN_OVERRIDES.adventure_guild ?? [],
        portals: [
            {
                id: "to-adventure-guild-forest-exit",
                label: "Adventure Guild Forest",
                tx: ADVENTURE_GUILD_DATA.warps["portal"]?.tx ?? 10,
                ty: ADVENTURE_GUILD_DATA.warps["portal"]?.ty ?? 19,
                targetMapId: "adventure_guild_forest",
                targetMapName: "Adventure Guild Forest",
                spawnTx: ADVENTURE_GUILD_FOREST_DATA.warps["warp_guild"]?.tx ?? 5,
                spawnTy: (ADVENTURE_GUILD_FOREST_DATA.warps["warp_guild"]?.ty ?? 8) + 2,
            },
        ],
    },
    orc_castle: {
        id: "orc_castle",
        name: "Orc Castle",
        isDungeon: true,
        tileSize: 32,
        rows: ORC_CASTLE_ROWS,
        width: (ORC_CASTLE_ROWS[0]?.length ?? 45) * 32,
        height: ORC_CASTLE_ROWS.length * 32,
        playerSpawns: ORC_CASTLE_DATA.playerSpawns.length > 0
            ? ORC_CASTLE_DATA.playerSpawns
            : [{ tx: 39, ty: 43 }],
        npcSpawns: ORC_CASTLE_DATA.npcSpawns,
        monsterSpawns: ORC_CASTLE_DATA.monsterSpawns,
        doors: ORC_CASTLE_DATA.doors,
        portals: [
            {
                id: "orc-castle-exit-portal",
                label: "Adventure Guild",
                tx: ORC_CASTLE_DATA.warps["warp_portal"]?.tx ?? ORC_CASTLE_DATA.warps["warp"]?.tx ?? 11,
                ty: ORC_CASTLE_DATA.warps["warp_portal"]?.ty ?? ORC_CASTLE_DATA.warps["warp"]?.ty ?? 3,
                targetMapId: "adventure_guild",
                targetMapName: "Adventure Guild",
                spawnTx: ADVENTURE_GUILD_DATA.playerSpawns[0]?.tx ?? 10,
                spawnTy: ADVENTURE_GUILD_DATA.playerSpawns[0]?.ty ?? 18,
                active: false,
            },
        ],
    },
};

export function getMapConfig(mapId) {
    return MAPS[mapId] ?? MAPS.verdant_hollow;
}
