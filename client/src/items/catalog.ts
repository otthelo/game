import type { ItemDefinition } from "../types";

/**
 * Client-side view of the server's item catalog.
 *
 * Definitions arrive in the `welcome` message, so names, descriptions and
 * balance values have exactly one source of truth. Until then (or if an id is
 * unknown) the helpers fall back to the raw id and a generic icon.
 */
const definitions = new Map<string, ItemDefinition>();

export const itemCatalog = {
  hydrate(items: ItemDefinition[] | undefined): void {
    definitions.clear();
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (item && typeof item.id === "string" && item.id.length > 0) {
        definitions.set(item.id, item);
      }
    }
  },

  get(itemId: string): ItemDefinition | undefined {
    return definitions.get(itemId);
  },

  all(): ItemDefinition[] {
    return [...definitions.values()];
  },
};

export function itemName(itemId: string): string {
  return itemCatalog.get(itemId)?.name ?? itemId.replace(/-/g, " ");
}

export function itemTexture(itemId: string): string {
  const icon = itemCatalog.get(itemId)?.icon ?? "unknown";
  return `item-${icon}`;
}

export function itemColor(itemId: string, fallback = "#9fb8a0"): string {
  return itemCatalog.get(itemId)?.color ?? fallback;
}

/** Phaser tint values are numbers; the catalog stores CSS hex strings. */
export function colorValue(color: string, fallback = 0x9fb8a0): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return fallback;
  return Number.parseInt(match[1], 16);
}
