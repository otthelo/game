import { BLOCKED_TILES } from "../config/gameConfig";
import type { InputMessage } from "../types";

export interface Movable {
  x: number;
  y: number;
  dir: number;
  moving: boolean;
}

export interface WorldGrid {
  rows: string[];
  tileSize: number;
}

/**
 * Collision check used by the client prediction. It intentionally matches the
 * server implementation in server/src/utils/map.ts.
 */
export function isBlocked(grid: WorldGrid, x: number, y: number, radius: number): boolean {
  const { rows, tileSize } = grid;
  const minX = Math.floor((x - radius) / tileSize);
  const maxX = Math.floor((x + radius) / tileSize);
  const minY = Math.floor((y - radius) / tileSize);
  const maxY = Math.floor((y + radius) / tileSize);

  for (let ty = minY; ty <= maxY; ty++) {
    const row = rows[ty];
    if (row === undefined) return true;

    for (let tx = minX; tx <= maxX; tx++) {
      if (BLOCKED_TILES.has(row[tx] ?? "#")) return true;
    }
  }

  return false;
}

/**
 * Moves an entity using the same rules as the authoritative server step.
 * Axis-separated collision allows sliding along walls.
 */
export function applyMovement(
  entity: Movable,
  input: Pick<InputMessage, "up" | "down" | "left" | "right">,
  dt: number,
  grid: WorldGrid,
  speed: number,
  radius: number,
): void {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  entity.moving = dx !== 0 || dy !== 0;

  if (dx !== 0) {
    entity.dir = dx < 0 ? 1 : 2;
  } else if (dy !== 0) {
    entity.dir = dy < 0 ? 3 : 0;
  }

  if (dx !== 0) {
    const nextX = entity.x + dx * speed * dt;
    if (!isBlocked(grid, nextX, entity.y, radius)) entity.x = nextX;
  }

  if (dy !== 0) {
    const nextY = entity.y + dy * speed * dt;
    if (!isBlocked(grid, entity.x, nextY, radius)) entity.y = nextY;
  }
}
