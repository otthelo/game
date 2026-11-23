import { INVENTORY_SLOTS, ITEMS } from "../config/items.js";
import { ServerMessage } from "../types/protocol.js";
import { addItem, removeAt, slotAt } from "./inventory.js";

const TRADE_RANGE = 160;
const MAX_TRADE_SLOTS = 6;
const INVITE_TTL_MS = 30_000;

/**
 * Simulates removing `outgoing` stacks and adding `incoming` stacks to verify
 * a player's 16-slot inventory has enough space before mutating anything.
 */
function canFitAfterSwap(schema, outgoing, incoming) {
    const simulated = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
        const slot = slotAt(schema, i);
        simulated.push(slot && slot.itemId ? { itemId: slot.itemId, qty: slot.qty } : null);
    }

    for (const offer of outgoing) {
        const entry = simulated[offer.slot];
        if (!entry || entry.itemId !== offer.itemId || entry.qty < offer.qty) {
            return false;
        }
        entry.qty -= offer.qty;
        if (entry.qty <= 0)
            simulated[offer.slot] = null;
    }

    for (const gift of incoming) {
        const def = ITEMS[gift.itemId];
        if (!def)
            return false;
        let remaining = gift.qty;
        for (let i = 0; i < INVENTORY_SLOTS && remaining > 0; i++) {
            const entry = simulated[i];
            if (!entry || entry.itemId !== gift.itemId)
                continue;
            const room = Math.max(0, def.stackLimit - entry.qty);
            const moved = Math.min(room, remaining);
            entry.qty += moved;
            remaining -= moved;
        }
        for (let i = 0; i < INVENTORY_SLOTS && remaining > 0; i++) {
            if (simulated[i] !== null)
                continue;
            const moved = Math.min(def.stackLimit, remaining);
            simulated[i] = { itemId: gift.itemId, qty: moved };
            remaining -= moved;
        }
        if (remaining > 0)
            return false;
    }

    return true;
}

export class TradeManager {
    pendingInvites = new Map();
    activeTrades = new Map();
    playerToTrade = new Map();
    tradeSeq = 0;

    isTrading(sessionId) {
        return this.playerToTrade.has(sessionId);
    }

    findClient(clients, sessionId) {
        for (const c of clients) {
            if (c.sessionId === sessionId)
                return c;
        }
        return undefined;
    }

    inRange(a, b) {
        return Math.hypot(a.schema.x - b.schema.x, a.schema.y - b.schema.y) <= TRADE_RANGE;
    }

    requestTrade(client, requester, targetId, players, clients) {
        if (!targetId || targetId === requester.sessionId)
            return;
        if (requester.schema.hp <= 0) {
            client.send(ServerMessage.TradeClosed, { reason: "error", message: "Tidak bisa trade saat mati." });
            return;
        }
        if (this.isTrading(requester.sessionId)) {
            client.send(ServerMessage.TradeClosed, { reason: "busy", message: "Kamu sedang dalam trade." });
            return;
        }
        const target = players.get(targetId);
        const targetClient = this.findClient(clients, targetId);
        if (!target || !targetClient || target.schema.hp <= 0) {
            client.send(ServerMessage.TradeClosed, { reason: "error", message: "Player tidak ditemukan." });
            return;
        }
        if (this.isTrading(targetId)) {
            client.send(ServerMessage.TradeClosed, { reason: "busy", message: `${target.name} sedang sibuk trade.` });
            return;
        }
        if (!this.inRange(requester, target)) {
            client.send(ServerMessage.TradeClosed, { reason: "out-of-range", message: "Jarak terlalu jauh untuk trade." });
            return;
        }

        this.pendingInvites.set(targetId, {
            requesterId: requester.sessionId,
            expiresAt: Date.now() + INVITE_TTL_MS,
        });
        targetClient.send(ServerMessage.TradeInvite, {
            requesterId: requester.sessionId,
            requesterName: requester.name,
        });
    }

    respondTrade(client, target, requesterId, accept, players, clients) {
        const invite = this.pendingInvites.get(target.sessionId);
        if (!invite || invite.requesterId !== requesterId || Date.now() > invite.expiresAt) {
            this.pendingInvites.delete(target.sessionId);
            return;
        }
        this.pendingInvites.delete(target.sessionId);

        const requester = players.get(requesterId);
        const requesterClient = this.findClient(clients, requesterId);
        if (!requester || !requesterClient) {
            client.send(ServerMessage.TradeClosed, { reason: "disconnected", message: "Player sudah keluar." });
            return;
        }

        if (!accept) {
            requesterClient.send(ServerMessage.TradeClosed, {
                reason: "declined",
                message: `${target.name} menolak permintaan trade.`,
            });
            return;
        }

        if (target.schema.hp <= 0 || requester.schema.hp <= 0) {
            client.send(ServerMessage.TradeClosed, { reason: "error", message: "Trade dibatalkan." });
            requesterClient.send(ServerMessage.TradeClosed, { reason: "error", message: "Trade dibatalkan." });
            return;
        }

        if (this.isTrading(target.sessionId) || this.isTrading(requester.sessionId)) {
            client.send(ServerMessage.TradeClosed, { reason: "busy", message: "Salah satu player sedang trade." });
            return;
        }

        if (!this.inRange(requester, target)) {
            const msg = "Jarak terlalu jauh untuk memulai trade.";
            client.send(ServerMessage.TradeClosed, { reason: "out-of-range", message: msg });
            requesterClient.send(ServerMessage.TradeClosed, { reason: "out-of-range", message: msg });
            return;
        }

        const tradeId = `trade-${++this.tradeSeq}`;
        const trade = {
            id: tradeId,
            a: { sessionId: requester.sessionId, name: requester.name, items: [], gold: 0, confirmed: false },
            b: { sessionId: target.sessionId, name: target.name, items: [], gold: 0, confirmed: false },
        };
        this.activeTrades.set(tradeId, trade);
        this.playerToTrade.set(requester.sessionId, tradeId);
        this.playerToTrade.set(target.sessionId, tradeId);
        this.broadcastTradeState(trade, clients);
    }

    updateOffer(player, raw, clients) {
        const trade = this.getTradeFor(player.sessionId);
        if (!trade || !raw || typeof raw !== "object")
            return;

        const side = trade.a.sessionId === player.sessionId ? trade.a : trade.b;
        const rawGold = Math.floor(Number(raw.gold) || 0);
        const gold = Math.max(0, Math.min(player.schema.gold, rawGold));

        const items = [];
        const usedSlots = new Set();
        if (Array.isArray(raw.items)) {
            for (const entry of raw.items.slice(0, MAX_TRADE_SLOTS)) {
                if (!entry || typeof entry !== "object")
                    continue;
                const slotIdx = Math.floor(Number(entry.slot));
                const qty = Math.floor(Number(entry.qty) || 0);
                if (!Number.isInteger(slotIdx) || usedSlots.has(slotIdx) || qty <= 0)
                    continue;
                const invSlot = slotAt(player.schema, slotIdx);
                if (!invSlot || !invSlot.itemId || invSlot.qty <= 0)
                    continue;
                usedSlots.add(slotIdx);
                items.push({
                    slot: slotIdx,
                    itemId: invSlot.itemId,
                    qty: Math.min(invSlot.qty, qty),
                });
            }
        }

        side.items = items;
        side.gold = gold;
        // Security: reset both confirmation checkboxes whenever an offer changes
        trade.a.confirmed = false;
        trade.b.confirmed = false;
        this.broadcastTradeState(trade, clients);
    }

    async confirmTrade(player, confirmed, players, clients, onPersist) {
        const trade = this.getTradeFor(player.sessionId);
        if (!trade)
            return;

        const side = trade.a.sessionId === player.sessionId ? trade.a : trade.b;
        side.confirmed = Boolean(confirmed);

        if (!trade.a.confirmed || !trade.b.confirmed) {
            this.broadcastTradeState(trade, clients);
            return;
        }

        const playerA = players.get(trade.a.sessionId);
        const playerB = players.get(trade.b.sessionId);
        const clientA = this.findClient(clients, trade.a.sessionId);
        const clientB = this.findClient(clients, trade.b.sessionId);

        if (!playerA || !playerB || !clientA || !clientB) {
            this.closeTrade(trade, "disconnected", "Partner trade terputus.", clients);
            return;
        }
        if (playerA.schema.hp <= 0 || playerB.schema.hp <= 0) {
            this.closeTrade(trade, "error", "Trade gagal karena salah satu player mati.", clients);
            return;
        }
        if (!this.inRange(playerA, playerB)) {
            this.closeTrade(trade, "out-of-range", "Jarak terlalu jauh, trade dibatalkan.", clients);
            return;
        }

        // Re-verify gold & items ownership
        if (playerA.schema.gold < trade.a.gold || playerB.schema.gold < trade.b.gold) {
            trade.a.confirmed = false;
            trade.b.confirmed = false;
            this.broadcastTradeState(trade, clients);
            return;
        }

        const validItems = (schema, list) =>
            list.every((offer) => {
                const s = slotAt(schema, offer.slot);
                return s && s.itemId === offer.itemId && s.qty >= offer.qty;
            });

        if (!validItems(playerA.schema, trade.a.items) || !validItems(playerB.schema, trade.b.items)) {
            trade.a.confirmed = false;
            trade.b.confirmed = false;
            this.broadcastTradeState(trade, clients);
            return;
        }

        if (!canFitAfterSwap(playerA.schema, trade.a.items, trade.b.items)) {
            this.closeTrade(trade, "error", `Tas ${playerA.name} tidak cukup untuk item trade.`, clients);
            return;
        }
        if (!canFitAfterSwap(playerB.schema, trade.b.items, trade.a.items)) {
            this.closeTrade(trade, "error", `Tas ${playerB.name} tidak cukup untuk item trade.`, clients);
            return;
        }

        // Atomic swap
        for (const offer of trade.a.items)
            removeAt(playerA.schema, offer.slot, offer.qty);
        for (const offer of trade.b.items)
            removeAt(playerB.schema, offer.slot, offer.qty);

        for (const offer of trade.b.items)
            addItem(playerA.schema, offer.itemId, offer.qty);
        for (const offer of trade.a.items)
            addItem(playerB.schema, offer.itemId, offer.qty);

        playerA.schema.gold = Math.min(0xffffffff, playerA.schema.gold - trade.a.gold + trade.b.gold);
        playerB.schema.gold = Math.min(0xffffffff, playerB.schema.gold - trade.b.gold + trade.a.gold);

        this.closeTrade(trade, "completed", "Trade selesai!", clients);
        await onPersist(playerA, playerB);
    }

    cancelTrade(sessionId, clients, reason = "cancelled", message = "Trade dibatalkan.") {
        const trade = this.getTradeFor(sessionId);
        if (!trade)
            return;
        this.closeTrade(trade, reason, message, clients);
    }

    handleLeaveOrDeath(sessionId, clients, reason = "disconnected") {
        this.pendingInvites.delete(sessionId);
        for (const [targetId, inv] of this.pendingInvites.entries()) {
            if (inv.requesterId === sessionId)
                this.pendingInvites.delete(targetId);
        }
        const msg = reason === "disconnected" ? "Partner trade keluar dari game." : "Trade dibatalkan.";
        this.cancelTrade(sessionId, clients, reason, msg);
    }

    getTradeFor(sessionId) {
        const tradeId = this.playerToTrade.get(sessionId);
        return tradeId ? this.activeTrades.get(tradeId) : undefined;
    }

    broadcastTradeState(trade, clients) {
        const clientA = this.findClient(clients, trade.a.sessionId);
        const clientB = this.findClient(clients, trade.b.sessionId);
        clientA?.send(ServerMessage.TradeState, {
            tradeId: trade.id,
            me: trade.a,
            partner: trade.b,
        });
        clientB?.send(ServerMessage.TradeState, {
            tradeId: trade.id,
            me: trade.b,
            partner: trade.a,
        });
    }

    closeTrade(trade, reason, message, clients) {
        this.activeTrades.delete(trade.id);
        this.playerToTrade.delete(trade.a.sessionId);
        this.playerToTrade.delete(trade.b.sessionId);

        const clientA = this.findClient(clients, trade.a.sessionId);
        const clientB = this.findClient(clients, trade.b.sessionId);
        clientA?.send(ServerMessage.TradeClosed, { reason, message });
        clientB?.send(ServerMessage.TradeClosed, { reason, message });
    }
}
