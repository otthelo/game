import { ITEMS } from "../config/items.js";
/**
 * Rolls a monster's drop table. Each entry is independent, so a lucky kill can
 * yield a material, a potion and a piece of gear at the same time.
 */
export function rollLoot(stats) {
    const minGold = Math.max(0, Math.floor(stats.goldMin));
    const maxGold = Math.max(minGold, Math.floor(stats.goldMax));
    const gold = minGold + Math.floor(Math.random() * (maxGold - minGold + 1));
    const items = [];
    for (const entry of stats.loot) {
        if (!ITEMS[entry.itemId])
            continue;
        if (Math.random() > entry.chance)
            continue;
        const min = Math.max(1, Math.floor(entry.min));
        const max = Math.max(min, Math.floor(entry.max));
        const qty = min + Math.floor(Math.random() * (max - min + 1));
        items.push({ itemId: entry.itemId, qty });
    }
    return { gold, items };
}
