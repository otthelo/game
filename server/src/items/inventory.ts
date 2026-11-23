import { CombatCalculator } from "../entities/CombatCalculator.js";
import { INVENTORY_SLOTS, ITEMS, ItemKind, } from "../config/items.js";
import { InventorySlot } from "../schemas/InventorySlot.js";
function slotKey(index) {
    return String(index);
}
/** Resolves an item definition while refusing malformed catalog ids. */
export function definitionOf(itemId) {
    return ITEMS[itemId];
}
export function slotAt(schema, index) {
    if (!Number.isInteger(index) || index < 0 || index >= INVENTORY_SLOTS)
        return undefined;
    return schema.inventory.get(slotKey(index));
}
/** Free room for `qty` more of an item, respecting stack limits. */
export function freeCapacity(schema, itemId) {
    const def = definitionOf(itemId);
    if (!def)
        return 0;
    let capacity = 0;
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
        const slot = schema.inventory.get(slotKey(i));
        if (!slot || slot.itemId.length === 0) {
            capacity += def.stackLimit;
        }
        else if (slot.itemId === itemId) {
            capacity += Math.max(0, def.stackLimit - slot.qty);
        }
    }
    return capacity;
}
/**
 * Adds items, stacking into existing slots first and then filling empty ones.
 * Returns the quantity that did not fit (0 when everything was stored).
 */
export function addItem(schema, itemId, qty) {
    const def = definitionOf(itemId);
    let remaining = Math.max(0, Math.floor(qty));
    if (!def || remaining === 0)
        return remaining;
    for (let i = 0; i < INVENTORY_SLOTS && remaining > 0; i++) {
        const slot = schema.inventory.get(slotKey(i));
        if (!slot || slot.itemId !== itemId)
            continue;
        const room = Math.max(0, def.stackLimit - slot.qty);
        if (room === 0)
            continue;
        const moved = Math.min(room, remaining);
        slot.qty += moved;
        remaining -= moved;
    }
    for (let i = 0; i < INVENTORY_SLOTS && remaining > 0; i++) {
        if (schema.inventory.has(slotKey(i)))
            continue;
        const moved = Math.min(def.stackLimit, remaining);
        const slot = new InventorySlot({ itemId, qty: moved });
        schema.inventory.set(slotKey(i), slot);
        remaining -= moved;
    }
    return remaining;
}
/** Removes a quantity from one slot; returns how much was actually removed. */
export function removeAt(schema, index, qty) {
    const slot = slotAt(schema, index);
    if (!slot || slot.itemId.length === 0)
        return 0;
    const removed = Math.min(slot.qty, Math.max(0, Math.floor(qty)));
    if (removed <= 0)
        return 0;
    slot.qty -= removed;
    if (slot.qty <= 0)
        schema.inventory.delete(slotKey(index));
    return removed;
}
export function countItem(schema, itemId) {
    let total = 0;
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
        const slot = schema.inventory.get(slotKey(i));
        if (slot?.itemId === itemId)
            total += slot.qty;
    }
    return total;
}
/** Removes up to `qty` units of `itemId` across inventory slots. Returns true if full `qty` was removed. */
export function consumeItemById(schema, itemId, qty = 1) {
    if (countItem(schema, itemId) < qty)
        return false;
    let remaining = qty;
    for (let i = 0; i < INVENTORY_SLOTS && remaining > 0; i++) {
        const slot = slotAt(schema, i);
        if (!slot || slot.itemId !== itemId)
            continue;
        remaining -= removeAt(schema, i, remaining);
    }
    return remaining === 0;
}
/** Removes an entire stack from `index`, returning `{ itemId, qty }` or null if empty. */
export function removeSlot(schema, index) {
    const slot = slotAt(schema, index);
    if (!slot || slot.itemId.length === 0 || slot.qty <= 0)
        return null;
    const itemId = slot.itemId;
    const qty = slot.qty;
    schema.inventory.delete(slotKey(index));
    return { itemId, qty };
}
/** Moves or swaps (or merges stacks of) inventory items between `fromIndex` and `toIndex`. */
export function moveInventorySlot(schema, fromIndex, toIndex) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex))
        return false;
    if (fromIndex < 0 || fromIndex >= INVENTORY_SLOTS || toIndex < 0 || toIndex >= INVENTORY_SLOTS)
        return false;
    if (fromIndex === toIndex)
        return false;
    const fromSlot = slotAt(schema, fromIndex);
    if (!fromSlot || fromSlot.itemId.length === 0 || fromSlot.qty <= 0)
        return false;
    const toSlot = slotAt(schema, toIndex);
    if (!toSlot || toSlot.itemId.length === 0 || toSlot.qty <= 0) {
        schema.inventory.set(slotKey(toIndex), new InventorySlot({ itemId: fromSlot.itemId, qty: fromSlot.qty }));
        schema.inventory.delete(slotKey(fromIndex));
        return true;
    }
    if (toSlot.itemId === fromSlot.itemId) {
        const def = definitionOf(fromSlot.itemId);
        const limit = Math.max(1, def?.stackLimit ?? 1);
        const space = Math.max(0, limit - toSlot.qty);
        if (space > 0) {
            const transfer = Math.min(space, fromSlot.qty);
            toSlot.qty += transfer;
            fromSlot.qty -= transfer;
            if (fromSlot.qty <= 0) {
                schema.inventory.delete(slotKey(fromIndex));
            }
            return true;
        }
    }
    const tmpId = toSlot.itemId;
    const tmpQty = toSlot.qty;
    toSlot.itemId = fromSlot.itemId;
    toSlot.qty = fromSlot.qty;
    fromSlot.itemId = tmpId;
    fromSlot.qty = tmpQty;
    return true;
}
/** Sorts inventory: Consumables first, then by database ITEMS key order (ID). */
export function sortInventory(schema) {
    const totals = new Map();
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
        const slot = schema.inventory.get(slotKey(i));
        if (!slot || slot.itemId.length === 0 || slot.qty <= 0)
            continue;
        totals.set(slot.itemId, (totals.get(slot.itemId) ?? 0) + slot.qty);
    }
    schema.inventory.clear();
    const dbKeys = Object.keys(ITEMS);
    const sortedIds = [...totals.keys()].sort((a, b) => {
        const defA = definitionOf(a);
        const defB = definitionOf(b);
        const aConsumable = defA?.kind === ItemKind.Consumable ? 0 : 1;
        const bConsumable = defB?.kind === ItemKind.Consumable ? 0 : 1;
        if (aConsumable !== bConsumable)
            return aConsumable - bConsumable;
        const idxA = dbKeys.indexOf(a);
        const idxB = dbKeys.indexOf(b);
        if (idxA !== -1 && idxB !== -1)
            return idxA - idxB;
        return a.localeCompare(b);
    });
    let nextSlot = 0;
    for (const itemId of sortedIds) {
        const def = definitionOf(itemId);
        const stackLimit = Math.max(1, def?.stackLimit ?? 1);
        let remaining = totals.get(itemId) ?? 0;
        while (remaining > 0 && nextSlot < INVENTORY_SLOTS) {
            const take = Math.min(stackLimit, remaining);
            schema.inventory.set(slotKey(nextSlot), new InventorySlot({ itemId, qty: take }));
            remaining -= take;
            nextSlot++;
        }
    }
}
export function gearBonuses(weaponId, armorId, wingId = "", garmentId = "") {
    const weapon = definitionOf(weaponId);
    const armor = definitionOf(armorId);
    const wing = definitionOf(wingId);
    const garment = definitionOf(garmentId);
    return {
        attack: (weapon?.kind === ItemKind.Weapon ? weapon.attack ?? 0 : 0) +
            (wing?.kind === ItemKind.Wing ? wing.attack ?? 0 : 0) +
            (garment?.kind === ItemKind.Garment ? garment.attack ?? 0 : 0),
        maxHp: (armor?.kind === ItemKind.Armor ? armor.maxHp ?? 0 : 0) +
            (wing?.kind === ItemKind.Wing ? wing.maxHp ?? 0 : 0) +
            (garment?.kind === ItemKind.Garment ? garment.maxHp ?? 0 : 0),
        maxSp: (garment?.kind === ItemKind.Garment ? garment.maxSp ?? 0 : 0) +
            (wing?.kind === ItemKind.Wing ? wing.maxSp ?? 0 : 0) +
            (armor?.kind === ItemKind.Armor ? armor.maxSp ?? 0 : 0),
    };
}
/**
 * Recomputes the derived attack and max HP from level + equipped gear.
 *
 * "ratio" keeps the current health percentage (used while swapping gear);
 * "clamp" only caps it (used on join and level-up).
 */
export function refreshStats(schema, mode = "ratio") {
    const gear = gearBonuses(schema.weaponId, schema.armorId, schema.wingId, schema.garmentId);
    const derived = CombatCalculator.computeDerivedStats(schema, gear);
    const previousMax = Math.max(1, schema.maxHp);
    const previousMaxSp = Math.max(1, schema.maxSp);
    const healthRatio = schema.hp / previousMax;
    const spRatio = schema.sp / previousMaxSp;
    schema.attack = derived.attack;
    schema.maxHp = derived.maxHp;
    schema.maxSp = derived.maxSp;
    if (mode === "ratio") {
        schema.hp = Math.max(1, Math.min(schema.maxHp, Math.round(healthRatio * schema.maxHp)));
        schema.sp = Math.max(0, Math.min(schema.maxSp, Math.round(spRatio * schema.maxSp)));
    }
    else {
        schema.hp = Math.max(0, Math.min(schema.maxHp, schema.hp));
        schema.sp = Math.max(0, Math.min(schema.maxSp, schema.sp));
    }
}
/** Consumes a potion in `index`. The caller reports the heal to the client. */
export function consumeAt(schema, index) {
    const slot = slotAt(schema, index);
    if (!slot || slot.itemId.length === 0)
        return { ok: false, reason: "empty" };
    const def = definitionOf(slot.itemId);
    if (!def || def.kind !== ItemKind.Consumable || !def.heal) {
        return { ok: false, reason: "not-usable" };
    }
    if (schema.hp >= schema.maxHp)
        return { ok: false, reason: "full-hp" };
    const before = schema.hp;
    schema.hp = Math.min(schema.maxHp, schema.hp + def.heal);
    removeAt(schema, index, 1);
    return { ok: true, itemId: def.id, healed: schema.hp - before };
}
/**
 * Equips the item in `index`. The previously equipped item is placed into the
 * same slot, so swapping is always possible even when the bag is full.
 */
export function equipAt(schema, index) {
    const slot = slotAt(schema, index);
    if (!slot || slot.itemId.length === 0)
        return { ok: false, reason: "empty" };
    const def = definitionOf(slot.itemId);
    if (!def)
        return { ok: false, reason: "empty" };
    if (def.kind !== ItemKind.Weapon && def.kind !== ItemKind.Armor && def.kind !== ItemKind.Wing && def.kind !== ItemKind.Garment) {
        return { ok: false, reason: "not-equippable" };
    }
    const target = def.kind === ItemKind.Weapon
        ? "weapon"
        : def.kind === ItemKind.Armor
            ? "armor"
            : def.kind === ItemKind.Wing
                ? "wing"
                : "garment";
    const previousId = target === "weapon"
        ? schema.weaponId
        : target === "armor"
            ? schema.armorId
            : target === "wing"
                ? schema.wingId
                : schema.garmentId;
    if (target === "weapon")
        schema.weaponId = def.id;
    else if (target === "armor")
        schema.armorId = def.id;
    else if (target === "wing")
        schema.wingId = def.id;
    else
        schema.garmentId = def.id;
    if (previousId.length > 0) {
        const previous = definitionOf(previousId);
        if (previous && previous.stackLimit > 1) {
            // Gear is not stackable today, but keep this safe if that changes.
            schema.inventory.delete(slotKey(index));
            const leftover = addItem(schema, previousId, 1);
            if (leftover > 0) {
                // Roll the swap back rather than losing the old item.
                if (target === "weapon")
                    schema.weaponId = previousId;
                else if (target === "armor")
                    schema.armorId = previousId;
                else if (target === "wing")
                    schema.wingId = previousId;
                else
                    schema.garmentId = previousId;
                const restored = new InventorySlot({ itemId: def.id, qty: 1 });
                schema.inventory.set(slotKey(index), restored);
                return { ok: false, reason: "inventory-full" };
            }
        }
        else {
            slot.itemId = previousId;
            slot.qty = 1;
        }
    }
    else {
        schema.inventory.delete(slotKey(index));
    }
    refreshStats(schema, "ratio");
    return { ok: true, itemId: def.id, slot: target, action: "equip" };
}
/** Removes equipped gear and places it into the first free slot. */
export function unequip(schema, target) {
    const itemId = target === "weapon"
        ? schema.weaponId
        : target === "armor"
            ? schema.armorId
            : target === "wing"
                ? schema.wingId
                : target === "garment"
                    ? schema.garmentId
                    : "";
    if (itemId.length === 0)
        return { ok: false, reason: "empty" };
    if (freeCapacity(schema, itemId) < 1) {
        return { ok: false, reason: "inventory-full" };
    }
    if (target === "weapon")
        schema.weaponId = "";
    else if (target === "armor")
        schema.armorId = "";
    else if (target === "wing")
        schema.wingId = "";
    else if (target === "garment")
        schema.garmentId = "";
    addItem(schema, itemId, 1);
    refreshStats(schema, "ratio");
    return { ok: true, itemId, slot: target, action: "unequip" };
}
/**
 * Rebuilds a player's satchel from saved data. Unknown items and invalid
 * quantities are dropped so an old or hand-edited row cannot poison the room.
 */
export function hydrateInventory(schema, stacks, gold, weaponId, armorId, wingId = "", garmentId = "") {
    schema.inventory.clear();
    for (const stack of stacks.slice(0, INVENTORY_SLOTS * 2)) {
        const def = definitionOf(stack.itemId);
        if (!def)
            continue;
        const qty = Math.max(0, Math.min(def.stackLimit, Math.floor(stack.qty)));
        if (qty > 0)
            addItem(schema, stack.itemId, qty);
    }
    schema.gold = Math.max(0, Math.min(0xffffffff, Math.floor(gold) || 0));
    const weapon = definitionOf(weaponId);
    schema.weaponId = weapon?.kind === ItemKind.Weapon ? weapon.id : "";
    const armor = definitionOf(armorId);
    schema.armorId = armor?.kind === ItemKind.Armor ? armor.id : "";
    const wing = definitionOf(wingId);
    schema.wingId = wing?.kind === ItemKind.Wing ? wing.id : "";
    const garment = definitionOf(garmentId);
    schema.garmentId = garment?.kind === ItemKind.Garment ? garment.id : "";
}
/** Stable, persistence-friendly view of the satchel. */
export function snapshotInventory(schema) {
    const stacks = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
        const slot = schema.inventory.get(slotKey(i));
        if (slot && slot.itemId.length > 0 && slot.qty > 0) {
            stacks.push({ itemId: slot.itemId, qty: slot.qty });
        }
    }
    return stacks;
}
