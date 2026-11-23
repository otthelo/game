import { schema, t } from "@colyseus/schema";
/**
 * One occupied satchel slot. Slots are addressed by their numeric index
 * ("0".."15") in the player's inventory map, so removing an item never
 * reshuffles the rest of the bag.
 */
export const InventorySlot = schema({
    itemId: t.string().default(""),
    qty: t.uint16().default(0),
}, "InventorySlot");
