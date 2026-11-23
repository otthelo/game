import { isBlocked, isTileBlocked, tileCenter, worldToTile } from "./map.js";
/**
 * Small breadth-first pathfinder used when a monster cannot walk straight to
 * its target. The map is only 40 x 30 tiles, so BFS is more than fast enough
 * and avoids pulling in a full navigation-mesh dependency.
 */
export function findPath(grid, fromX, fromY, toX, toY, maxNodes = 900) {
    const width = grid.rows.reduce((max, row) => Math.max(max, row.length), 0);
    const height = grid.rows.length;
    if (width === 0 || height === 0)
        return null;
    const start = nearestOpenTile(grid, worldToTile(grid, fromX, fromY));
    const goal = nearestOpenTile(grid, worldToTile(grid, toX, toY));
    if (!start || !goal)
        return null;
    const startIndex = start.ty * width + start.tx;
    const goalIndex = goal.ty * width + goal.tx;
    if (startIndex === goalIndex)
        return [];
    const size = width * height;
    const previous = new Int32Array(size).fill(-1);
    const visited = new Uint8Array(size);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    let expanded = 0;
    queue[tail++] = startIndex;
    visited[startIndex] = 1;
    const neighbors = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    while (head < tail && expanded < maxNodes) {
        const current = queue[head++];
        expanded++;
        if (current === goalIndex) {
            return reconstruct(grid, width, previous, startIndex, goalIndex);
        }
        const cx = current % width;
        const cy = Math.floor(current / width);
        for (const [dx, dy] of neighbors) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height)
                continue;
            if (isTileBlocked(grid, nx, ny))
                continue;
            const next = ny * width + nx;
            if (visited[next])
                continue;
            visited[next] = 1;
            previous[next] = current;
            queue[tail++] = next;
        }
    }
    return null;
}
function reconstruct(grid, width, previous, startIndex, goalIndex) {
    const tiles = [];
    let current = goalIndex;
    while (current !== startIndex && current >= 0) {
        const tx = current % width;
        const ty = Math.floor(current / width);
        tiles.push(tileCenter(grid, tx, ty));
        current = previous[current];
    }
    tiles.reverse();
    return tiles;
}
function nearestOpenTile(grid, origin) {
    if (!isTileBlocked(grid, origin.tx, origin.ty))
        return origin;
    for (let distance = 1; distance <= 4; distance++) {
        for (let ty = origin.ty - distance; ty <= origin.ty + distance; ty++) {
            for (let tx = origin.tx - distance; tx <= origin.tx + distance; tx++) {
                const ring = Math.max(Math.abs(tx - origin.tx), Math.abs(ty - origin.ty));
                if (ring !== distance)
                    continue;
                if (!isTileBlocked(grid, tx, ty))
                    return { tx, ty };
            }
        }
    }
    return null;
}
/** Cheap sampled line test used for aggro, attacks and direct chase steering. */
export function hasLineOfSight(grid, fromX, fromY, toX, toY, radius) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    if (distance === 0)
        return true;
    const steps = Math.ceil(distance / 10);
    for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        if (isBlocked(grid, fromX + dx * t, fromY + dy * t, radius))
            return false;
    }
    return true;
}
