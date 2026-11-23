import { MAP, PLAYER_SPAWNS } from "../config/map.js";
/** Must match client/src/config/gameConfig.ts. */
export const BLOCKED_TILES = new Set(["#", "~", "R"]);
export const WORLD_GRID = {
    rows: MAP.rows,
    tileSize: MAP.tileSize,
};
/**
 * Radius-aware collision check. It intentionally mirrors the client prediction
 * implementation in client/src/utils/movement.ts so both simulations agree.
 */
export function isBlocked(grid, x, y, radius) {
    const { rows, tileSize } = grid;
    const minX = Math.floor((x - radius) / tileSize);
    const maxX = Math.floor((x + radius) / tileSize);
    const minY = Math.floor((y - radius) / tileSize);
    const maxY = Math.floor((y + radius) / tileSize);
    for (let ty = minY; ty <= maxY; ty++) {
        const row = rows[ty];
        if (row === undefined)
            return true;
        for (let tx = minX; tx <= maxX; tx++) {
            if (BLOCKED_TILES.has(row[tx] ?? "#"))
                return true;
        }
    }
    return false;
}
export function isTileBlocked(grid, tx, ty) {
    const row = grid.rows[ty];
    if (row === undefined)
        return true;
    return BLOCKED_TILES.has(row[tx] ?? "#");
}
export function tileCenter(grid, tx, ty) {
    return {
        x: tx * grid.tileSize + grid.tileSize / 2,
        y: ty * grid.tileSize + grid.tileSize / 2,
    };
}
export function worldToTile(grid, x, y) {
    return {
        tx: Math.floor(x / grid.tileSize),
        ty: Math.floor(y / grid.tileSize),
    };
}
export function isWalkablePoint(grid, x, y, radius) {
    return !isBlocked(grid, x, y, radius);
}
/**
 * Searches outward from a point for the closest walkable tile center. Used when
 * restoring a cached position that was saved inside a newly added obstacle.
 */
export function findNearestWalkablePoint(grid, x, y, radius, maxTileDistance = 8) {
    const origin = worldToTile(grid, x, y);
    for (let distance = 0; distance <= maxTileDistance; distance++) {
        for (let ty = origin.ty - distance; ty <= origin.ty + distance; ty++) {
            for (let tx = origin.tx - distance; tx <= origin.tx + distance; tx++) {
                // Only inspect the ring at this distance.
                const ring = Math.max(Math.abs(tx - origin.tx), Math.abs(ty - origin.ty));
                if (ring !== distance)
                    continue;
                if (isTileBlocked(grid, tx, ty))
                    continue;
                const center = tileCenter(grid, tx, ty);
                if (isWalkablePoint(grid, center.x, center.y, radius))
                    return center;
            }
        }
    }
    return null;
}
/** Deterministic spawn selection so a returning character reappears in the same place. */
export function spawnForName(name) {
    let hash = 2166136261;
    for (let i = 0; i < name.length; i++) {
        hash ^= name.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const spawn = PLAYER_SPAWNS[(hash >>> 0) % PLAYER_SPAWNS.length];
    return tileCenter(WORLD_GRID, spawn.tx, spawn.ty);
}
