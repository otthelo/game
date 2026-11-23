import { isBlocked } from "./map.js";
/**
 * Axis-separated movement that matches client/src/utils/movement.ts exactly.
 * The same input, dt, speed and radius must produce the same position on both
 * sides, otherwise prediction reconciliation would constantly fight itself.
 */
export function applyInputMovement(entity, input, dt, grid, speed, radius) {
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
    }
    entity.moving = dx !== 0 || dy !== 0;
    if (dx !== 0) {
        entity.dir = dx < 0 ? 1 : 2;
    }
    else if (dy !== 0) {
        entity.dir = dy < 0 ? 3 : 0;
    }
    if (dx !== 0) {
        const nextX = entity.x + dx * speed * dt;
        if (!isBlocked(grid, nextX, entity.y, radius))
            entity.x = nextX;
    }
    if (dy !== 0) {
        const nextY = entity.y + dy * speed * dt;
        if (!isBlocked(grid, entity.x, nextY, radius))
            entity.y = nextY;
    }
}
/**
 * Moves an AI entity toward a point with collision sliding. Returns true when
 * the entity actually changed position this step.
 */
export function moveToward(entity, targetX, targetY, dt, grid, speed, radius, stopDistance = 2) {
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= stopDistance || distance === 0) {
        entity.moving = false;
        return false;
    }
    const stepX = (dx / distance) * speed * dt;
    const stepY = (dy / distance) * speed * dt;
    // Four-direction sprites: face the dominant axis of travel.
    if (Math.abs(stepX) > Math.abs(stepY)) {
        entity.dir = stepX < 0 ? 1 : 2;
    }
    else if (stepY !== 0) {
        entity.dir = stepY < 0 ? 3 : 0;
    }
    const startX = entity.x;
    const startY = entity.y;
    if (stepX !== 0) {
        const nextX = entity.x + stepX;
        if (!isBlocked(grid, nextX, entity.y, radius))
            entity.x = nextX;
    }
    if (stepY !== 0) {
        const nextY = entity.y + stepY;
        if (!isBlocked(grid, entity.x, nextY, radius))
            entity.y = nextY;
    }
    entity.moving = entity.x !== startX || entity.y !== startY;
    return entity.moving;
}
