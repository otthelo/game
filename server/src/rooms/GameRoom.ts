import { Room, ServerError } from "colyseus";
import { handleGmCommand } from "../commands/gmCommands.js";
import { verifyAuthToken } from "../auth/tokens.js";
import { env } from "../config/env.js";
import { ATTACK_RANGE, CHAT_COOLDOWN_MS, INTERACT_COOLDOWN_MS, INTERACT_RANGE, ITEM_ACTION_COOLDOWN_MS, MAX_INPUTS_PER_TICK, MAX_QUEUED_INPUTS, PLAYER_MAX_LEVEL, PLAYER_REGEN_INTERVAL_MS, PLAYER_RADIUS, PLAYER_RESPAWN_MS, PLAYER_SPEED, STAT_POINTS_PER_LEVEL, TICK_MS, TICK_RATE, getPlayerAttackRange, } from "../config/gameplay.js";
import { INVENTORY_SLOTS, getItem, itemList } from "../config/items.js";
import { getMapConfig, MAP, NPC_DIALOGS, NPC_SPAWNS, WORLD_HEIGHT, WORLD_WIDTH, } from "../config/map.js";
import { JOBS, jobXpToNextLevel, canChangeJob, availableJobAdvancements } from "../config/jobs.js";
import { cachePosition, loadCachedPosition } from "../database/redis.js";
import { CombatCalculator } from "../entities/CombatCalculator.js";
import { MonsterManager } from "../entities/MonsterManager.js";
import { addItem, consumeAt, consumeItemById, countItem, equipAt, gearBonuses, hydrateInventory, moveInventorySlot, refreshStats, removeAt, removeSlot, slotAt, snapshotInventory, sortInventory, unequip, } from "../items/inventory.js";
import { rollLoot } from "../items/loot.js";
import { TradeManager } from "../items/trade.js";
import { createDefaultCharacter, loadCharacter, saveCharacter, } from "../models/characterRepository.js";
import { NpcSchema } from "../schemas/NpcSchema.js";
import { PlayerSchema } from "../schemas/PlayerSchema.js";
import { WorldSchema } from "../schemas/WorldSchema.js";
import { WorldState } from "../schemas/WorldState.js";
import { ClientMessage, MonsterKind, ServerMessage, } from "../types/protocol.js";
import { logger } from "../utils/logger.js";
import { isWalkablePoint, spawnForName, tileCenter, WORLD_GRID } from "../utils/map.js";
import { applyInputMovement } from "../utils/movement.js";
import { hasLineOfSight } from "../utils/pathfinding.js";
import { recordAnomaly } from "../utils/security.js";
import { extractChatText, extractEquipSlot, extractSlotIndex, extractStatAllocation, extractTargetId, parseInputMessage, sanitizeName, } from "../utils/validation.js";
import { PartyManager } from "../systems/partyManager.js";
import { calculatePartyExp } from "../systems/partyExp.js";
/**
 * Authoritative game room.
 *
 * Responsibilities:
 *  - own the synchronized `WorldState`,
 *  - consume queued movement inputs at a fixed 30 Hz,
 *  - resolve combat, XP, deaths and respawns,
 *  - run monster AI,
 *  - persist characters to PostgreSQL/Redis when configured.
 *
 * Clients predict their own movement and reconcile against the `x`, `y` and
 * `lastProcessedInput` fields that this room writes.
 */
export const ACTIVE_ROOMS = new Set<GameRoom>();
const FRIEND_LISTS = new Map<string, Set<string>>();

export class GameRoom extends Room<{ state: any }> {
    maxClients = env.MAX_PLAYERS;
    patchRate = 50; // 20 state patches per second
    maxMessagesPerSecond = 120;
    players = new Map();
    monsters;
    mapConfig;
    grid;
    portals = [];
    doors = [];
    trades = new TradeManager();
    lastPartySyncAt = 0;
    lastPersistAt = 0;
    eventSeq = 0;
    messages = {
        [ClientMessage.Input]: (client, raw) => this.handleInput(client, raw),
        [ClientMessage.Chat]: (client, raw) => this.handleChat(client, raw),
        [ClientMessage.Attack]: (client, raw) => this.handleAttack(client, raw),
        [ClientMessage.Interact]: (client, raw) => this.handleInteract(client, raw),
        [ClientMessage.UseItem]: (client, raw) => this.handleUseItem(client, raw),
        [ClientMessage.EquipItem]: (client, raw) => this.handleEquipItem(client, raw),
        [ClientMessage.UnequipItem]: (client, raw) => this.handleUnequipItem(client, raw),
        [ClientMessage.ThrowItem]: (client, raw) => this.handleThrowItem(client, raw),
        [ClientMessage.MoveItem]: (client, raw) => this.handleMoveItem(client, raw),
        [ClientMessage.SortInventory]: (client) => this.handleSortInventory(client),
        [ClientMessage.AllocateStat]: (client, raw) => this.handleAllocateStat(client, raw),
        [ClientMessage.TradeRequest]: (client, raw) => this.handleTradeRequest(client, raw),
        [ClientMessage.TradeRespond]: (client, raw) => this.handleTradeRespond(client, raw),
        [ClientMessage.TradeUpdate]: (client, raw) => this.handleTradeUpdate(client, raw),
        [ClientMessage.TradeConfirm]: (client, raw) => this.handleTradeConfirm(client, raw),
        [ClientMessage.TradeCancel]: (client) => this.handleTradeCancel(client),
        [ClientMessage.JobChange]: (client, raw) => this.handleJobChange(client, raw),
        [ClientMessage.UseSkill]: (client, raw) => this.handleUseSkill(client, raw),
        [ClientMessage.PartyCreate]: (client, raw) => this.handlePartyCreate(client, raw),
        [ClientMessage.PartyInvite]: (client, raw) => this.handlePartyInvite(client, raw),
        [ClientMessage.PartyRespond]: (client, raw) => this.handlePartyRespond(client, raw),
        [ClientMessage.PartyLeave]: (client) => this.handlePartyLeave(client),
        [ClientMessage.PartyKick]: (client, raw) => this.handlePartyKick(client, raw),
        [ClientMessage.PartySettings]: (client, raw) => this.handlePartySettings(client, raw),
        [ClientMessage.FriendAdd]: (client, raw) => this.handleFriendAdd(client, raw),
        [ClientMessage.FriendRemove]: (client, raw) => this.handleFriendRemove(client, raw),
        [ClientMessage.FriendList]: (client) => this.sendFriendList(client),
    };
    onCreate(options) {
        ACTIVE_ROOMS.add(this);
        this.mapConfig = getMapConfig(options?.mapId);
        this.grid = { rows: [...this.mapConfig.rows], tileSize: this.mapConfig.tileSize };
        this.portals = (this.mapConfig.portals ?? []).map((p) => ({
            ...p,
            active: p.active ?? true,
            ...tileCenter(this.grid, p.tx, p.ty),
        }));
        this.doors = (this.mapConfig.doors ?? []).map((d) => ({
            ...d,
            open: false,
            ...tileCenter(this.grid, d.tx, d.ty),
        }));
        for (const door of this.doors) {
            for (const tile of door.blockedTiles ?? []) {
                this.setGridTileBlocked(tile.tx, tile.ty, true);
            }
        }
        const world = new WorldSchema({
            name: this.mapConfig.name,
            width: this.mapConfig.width,
            height: this.mapConfig.height,
            tileSize: this.mapConfig.tileSize,
            rows: [...this.grid.rows],
        });
        this.state = new WorldState({ world });
        this.monsters = new MonsterManager(
            this.state,
            this.grid,
            this.mapConfig.monsterSpawns,
            Boolean(this.mapConfig.isDungeon),
        );
        for (const spawn of this.mapConfig.npcSpawns) {
            const position = tileCenter(this.grid, spawn.tx, spawn.ty);
            this.state.npcs.set(spawn.id, new NpcSchema({
                id: spawn.id,
                name: spawn.name,
                x: position.x,
                y: position.y,
                dir: 0,
                kind: spawn.kind,
            }));
        }
        this.lastPersistAt = Date.now();
        this.setTimestep(() => this.tick(), TICK_MS);
        logger.info(`Room ${this.roomId} [${this.mapConfig.id}] created (${this.monsters.all.size} monsters, ${this.mapConfig.npcSpawns.length} NPCs, ${this.portals.length} portals)`);
    }
    /**
     * Rejects unauthenticated joins. The client sends the token it got from
     * /auth/register or /auth/login as the join option; the returned object is
     * handed to onJoin as `auth`.
     */
    onAuth(client, options) {
        const token = options?.token ?? options?.accessToken;
        const claims = verifyAuthToken(token);
        if (!claims) {
            throw new ServerError(4001, "Session expired. Please log in again.");
        }
        const characterId = options?.characterId ? Number(options.characterId) : undefined;
        let gmLevel = Number(claims.gmLevel ?? 0) || 0;
        const lowerName = (claims.username || "").trim().toLowerCase();
        if (lowerName === "admin" && gmLevel < 2) gmLevel = 2;
        if (lowerName === "gm" && gmLevel < 1) gmLevel = 1;
        const spawnX = typeof options?.spawnX === "number" && Number.isFinite(options.spawnX) ? options.spawnX : undefined;
        const spawnY = typeof options?.spawnY === "number" && Number.isFinite(options.spawnY) ? options.spawnY : undefined;
        return { accountId: claims.sub, username: claims.username, gmLevel, characterId, spawnX, spawnY };
    }
    async onJoin(client, _options, auth) {
        const fallbackName = sanitizeName(auth?.username) || "Wanderer";
        const accountId = auth?.accountId ?? `anonymous-${client.sessionId}`;
        // Persistence is optional and every call is failure-tolerant.
        const character = (await loadCharacter(accountId, fallbackName, auth?.characterId)) ?? createDefaultCharacter(fallbackName);
        const name = sanitizeName(character.name) || fallbackName;
        const defaultTile = this.mapConfig.playerSpawns[0] ?? { tx: 17, ty: 9 };
        const spawn = this.mapConfig.id === "verdant_hollow"
            ? spawnForName(name)
            : tileCenter(this.grid, defaultTile.tx, defaultTile.ty);
        if (auth?.spawnX !== undefined && auth?.spawnY !== undefined && isWalkablePoint(this.grid, auth.spawnX, auth.spawnY, PLAYER_RADIUS)) {
            character.x = auth.spawnX;
            character.y = auth.spawnY;
        }
        else {
            if (this.mapConfig.id === "verdant_hollow") {
                const cached = await loadCachedPosition(name);
                if (cached && isWalkablePoint(this.grid, cached.x, cached.y, PLAYER_RADIUS)) {
                    character.x = cached.x;
                    character.y = cached.y;
                    character.dir = cached.dir;
                }
            }
            if (!isWalkablePoint(this.grid, character.x, character.y, PLAYER_RADIUS)) {
                character.x = spawn.x;
                character.y = spawn.y;
            }
        }
        const stats = CombatCalculator.statsForLevel(character.level);
        const schema = new PlayerSchema({
            sessionId: client.sessionId,
            name,
            x: character.x,
            y: character.y,
            dir: character.dir,
            moving: false,
            hp: 1,
            maxHp: stats.maxHp,
            sp: character.sp ?? stats.maxSp,
            maxSp: stats.maxSp,
            level: character.level,
            xp: character.xp,
            xpToNext: CombatCalculator.xpToNextLevel(character.level),
            jobId: character.jobId ?? "novice",
            jobLevel: character.jobLevel ?? 1,
            jobXp: character.jobXp ?? 0,
            jobXpToNext: jobXpToNextLevel(character.jobId ?? "novice", character.jobLevel ?? 1),
            attack: stats.attack,
            str: character.str ?? 1,
            agi: character.agi ?? 1,
            vit: character.vit ?? 1,
            int: character.int ?? 1,
            dex: character.dex ?? 1,
            luk: character.luk ?? 1,
            statPoints: character.statPoints ?? 0,
            outfit: character.outfit,
            lastProcessedInput: 0,
            gold: character.gold,
            weaponId: character.weaponId,
            armorId: character.armorId,
            wingId: character.wingId ?? "",
            garmentId: character.garmentId ?? "",
            gmLevel: auth?.gmLevel ?? 0,
        });
        hydrateInventory(schema, character.inventory, character.gold, character.weaponId, character.armorId, character.wingId ?? "", character.garmentId ?? "");
        if (!schema.wingId && countItem(schema, "wing-of-butterfly") === 0) {
            addItem(schema, "wing-of-butterfly", 1);
        }
        if (!schema.garmentId && countItem(schema, "cloak") === 0) {
            addItem(schema, "cloak", 1);
        }
        const gear = gearBonuses(schema.weaponId, schema.armorId, schema.wingId, schema.garmentId);
        const derived = CombatCalculator.computeDerivedStats(schema, gear);
        schema.maxHp = derived.maxHp;
        schema.maxSp = derived.maxSp;
        schema.attack = derived.attack;
        schema.hp = character.hp > 0 ? Math.min(character.hp, schema.maxHp) : schema.maxHp;
        schema.sp = Math.min(character.sp ?? schema.maxSp, schema.maxSp);
        this.state.players.set(client.sessionId, schema);
        const now = Date.now();
        const charId = character.id || name;
        this.players.set(client.sessionId, {
            sessionId: client.sessionId,
            accountId,
            characterId: charId,
            name,
            schema,
            gmLevel: auth?.gmLevel ?? 0,
            isGodMode: false,
            mutedUntil: 0,
            inputs: [],
            lastAttackAt: 0,
            lastSkillAt: 0,
            lastChatAt: 0,
            lastInteractAt: 0,
            lastItemActionAt: 0,
            lastDamagedAt: now,
            lastRegenAt: now,
            respawnAt: 0,
            spawn,
            npcDialogIndex: {},
        });
        PartyManager.instance.updateMemberPresence(charId, {
            characterId: charId,
            name,
            sessionId: client.sessionId,
            room: this,
            mapId: this.mapConfig.id,
            x: schema.x,
            y: schema.y,
            hp: schema.hp,
            maxHp: schema.maxHp,
            sp: schema.sp,
            maxSp: schema.maxSp,
            level: schema.level,
            jobLevel: schema.jobLevel,
            jobId: schema.jobId,
            online: true,
        });
        const existingParty = PartyManager.instance.getPartyByPlayer(charId);
        if (existingParty) {
            PartyManager.instance.broadcastPartyUpdate(existingParty);
        }
        const welcome = {
            sessionId: client.sessionId,
            roomId: this.roomId,
            mapId: this.mapConfig.id,
            tickRate: TICK_RATE,
            serverVersion: env.SERVER_VERSION,
            at: now,
            items: itemList(),
            portals: this.portals.map((p) => ({
                id: p.id,
                label: p.label,
                x: p.x,
                y: p.y,
                targetMapId: p.targetMapId,
                targetMapName: p.targetMapName,
                active: p.active !== false,
            })),
            doors: this.doors.map((d) => ({
                id: d.id,
                name: d.name,
                tx: d.tx,
                ty: d.ty,
                x: d.x,
                y: d.y,
                open: d.open,
                keyItemId: d.keyItemId,
                keyName: d.keyName,
            })),
        };
        client.send(ServerMessage.Welcome, welcome);
        this.sendFriendList(client);
        this.notifyFriendsPresence(name);
        const gmLevel = auth?.gmLevel ?? 0;
        if (gmLevel >= 2) {
            this.broadcastSystem(`[Admin] ${name} telah masuk ke realm.`);
        } else if (gmLevel >= 1) {
            this.broadcastSystem(`[GM] ${name} telah masuk ke realm.`);
        } else {
            this.broadcastSystem(`${name} entered the realm.`);
        }
        logger.info(`${name} joined room ${this.roomId} (${this.state.players.size} online, gmLevel=${gmLevel})`);
    }
    onLeave(client) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        PartyManager.instance.onPlayerDisconnect(player.characterId);
        this.trades.handleLeaveOrDeath(client.sessionId, this.clients, "disconnected");
        this.state.players.delete(client.sessionId);
        this.players.delete(client.sessionId);
        this.notifyFriendsPresence(player.name);
        void this.persistPlayer(player);
        this.broadcastSystem(`${player.name} left the realm.`);
        logger.info(`${player.name} left room ${this.roomId} (${this.state.players.size} online)`);
    }
    async onDispose() {
        ACTIVE_ROOMS.delete(this);
        await Promise.allSettled([...this.players.values()].map((player) => this.persistPlayer(player)));
        this.players.clear();
        logger.info(`Room ${this.roomId} disposed`);
    }
    onUncaughtException(error, methodName) {
        logger.error(`Unhandled room exception in ${methodName}`, error);
    }
    // -------------------------------------------------------------------------
    // Simulation
    // -------------------------------------------------------------------------
    tick() {
        const now = Date.now();
        this.state.tick++;
        this.updatePlayers(now);
        this.monsters.tick(
            now,
            TICK_MS / 1000,
            this.players,
            (monster, player, damage) => {
                this.damagePlayer(now, player, damage, monster.schema.name, monster.id);
            },
            (boss, targetPlayer) => {
                if (boss.schema.kind === MonsterKind.WhiteSnakeLady) {
                    const isFreeze = boss.castingSkill === "freeze_domination";
                    const skillName = isFreeze ? "Freeze Domination" : "Thunder Shot";
                    const resolvedTarget =
                        targetPlayer ??
                        (boss.pendingSkillTargetId ? this.players.get(boss.pendingSkillTargetId) : undefined) ??
                        (boss.targetId ? this.players.get(boss.targetId) : undefined);
                    const castEvent = {
                        bossId: boss.id,
                        skillName,
                        x: boss.schema.x,
                        y: boss.schema.y,
                        radius: boss.skillRadius || (isFreeze ? 480 : 48),
                        castDurationMs: boss.castDurationMs || (isFreeze ? 4000 : 2000),
                        targetX: resolvedTarget?.schema.x,
                        targetY: resolvedTarget?.schema.y,
                    };
                    this.broadcast(ServerMessage.BossSkillCast, castEvent);
                    const yell = isFreeze ? "Membekulah!! FREEZE DOMINATION!!" : "THUNDER SHOT!!";
                    this.broadcast(ServerMessage.MonsterSpeak, { monsterId: boss.id, text: yell });
                    return;
                }
                const hpRatio = boss.schema.hp / boss.schema.maxHp;
                const isEnraged = hpRatio <= 0.20;
                const skillName = isEnraged ? "Asura Strike [ENRAGED +100%]" : "Asura Strike";
                const castEvent = {
                    bossId: boss.id,
                    skillName,
                    x: boss.schema.x,
                    y: boss.schema.y,
                    radius: boss.skillRadius || 140,
                    castDurationMs: boss.castDurationMs || 3000,
                };
                this.broadcast(ServerMessage.BossSkillCast, castEvent);
                const yell = isEnraged ? "MAMPUS LU!! ASURA STRIKE!!" : "Rasakan ini!! ASURA STRIKE!!";
                this.broadcast(ServerMessage.MonsterSpeak, { monsterId: boss.id, text: yell });
            },
            (boss) => {
                if (boss.schema.kind === MonsterKind.WhiteSnakeLady) {
                    if (boss.castingSkill === "freeze_domination") {
                        const radius = boss.skillRadius || 480;
                        const hitPlayerIds = [];
                        const frozenPlayerIds = [];
                        for (const player of this.players.values()) {
                            if (player.schema.hp <= 0) continue;
                            const dist = Math.hypot(player.schema.x - boss.schema.x, player.schema.y - boss.schema.y);
                            if (dist > radius) continue;
                            hitPlayerIds.push(player.sessionId);
                            const freezeChance = Math.max(0.05, 0.65 - (player.schema.int ?? 1) * 0.01);
                            if (Math.random() < freezeChance) {
                                player.schema.frozen = true;
                                player.schema.moving = false;
                                frozenPlayerIds.push(player.sessionId);
                            }
                        }
                        this.broadcast(ServerMessage.BossSkillExecute, {
                            bossId: boss.id,
                            skillName: "Freeze Domination",
                            x: boss.schema.x,
                            y: boss.schema.y,
                            radius,
                            hitPlayerIds,
                            frozenPlayerIds,
                        });
                        if (frozenPlayerIds.length > 0) {
                            boss.pendingSkill = "thunder_shot";
                            boss.pendingSkillTargetId = frozenPlayerIds[0];
                            this.broadcastSystem("Freeze Domination membekukan target! White Snake Lady bersiap menembakkan Thunder Shot!");
                        }
                        return;
                    }

                    // Thunder Shot
                    const target =
                        (boss.pendingSkillTargetId ? this.players.get(boss.pendingSkillTargetId) : undefined) ??
                        (boss.targetId ? this.players.get(boss.targetId) : undefined);
                    const hitPlayerIds = [];
                    let targetX = boss.schema.x;
                    let targetY = boss.schema.y;
                    if (target && target.schema.hp > 0) {
                        targetX = target.schema.x;
                        targetY = target.schema.y;
                        const wasFrozen = Boolean(target.schema.frozen);
                        const mult = wasFrozen ? 3.0 : 1.5;
                        const thunderDmg = Math.round(boss.stats.damage * mult);
                        hitPlayerIds.push(target.sessionId);
                        this.damagePlayer(now, target, thunderDmg, "Thunder Shot", boss.id);
                        if (target.schema.hp > 0) {
                            this.knockbackPlayer(target, boss.schema.x, boss.schema.y, 8 * this.grid.tileSize);
                        }
                        targetX = target.schema.x;
                        targetY = target.schema.y;
                    }
                    this.broadcast(ServerMessage.BossSkillExecute, {
                        bossId: boss.id,
                        skillName: "Thunder Shot",
                        x: boss.schema.x,
                        y: boss.schema.y,
                        radius: 48,
                        hitPlayerIds,
                        targetX,
                        targetY,
                    });
                    return;
                }

                const radius = boss.skillRadius || 140;
                const hitPlayerIds = [];
                const hpRatio = boss.schema.hp / boss.schema.maxHp;
                const isEnraged = hpRatio <= 0.20;
                const bonusMultiplier = isEnraged ? 2.0 : 1.0;
                const aoeDamage = Math.round(boss.stats.damage * 2.2 * bonusMultiplier);
                const skillName = isEnraged ? "Asura Strike [ENRAGED]" : "Asura Strike";

                for (const player of this.players.values()) {
                    if (player.schema.hp <= 0) continue;
                    const dist = Math.hypot(player.schema.x - boss.schema.x, player.schema.y - boss.schema.y);
                    if (dist <= radius) {
                        hitPlayerIds.push(player.sessionId);
                        this.damagePlayer(now, player, aoeDamage, skillName, boss.id);
                    }
                }

                const execEvent = {
                    bossId: boss.id,
                    skillName,
                    x: boss.schema.x,
                    y: boss.schema.y,
                    radius,
                    hitPlayerIds,
                };
                this.broadcast(ServerMessage.BossSkillExecute, execEvent);
                this.broadcast(ServerMessage.MonsterSpeak, { monsterId: boss.id, text: "DUAARRR!!" });
            },
            (monsterId, text) => {
                this.broadcast(ServerMessage.MonsterSpeak, { monsterId, text });
            }
        );
        if (now - this.lastPersistAt >= env.PERSIST_INTERVAL_MS) {
            this.lastPersistAt = now;
            void this.persistAll();
        }
    }
    updatePlayers(now) {
        for (const player of this.players.values()) {
            const schema = player.schema;
            if (schema.hp <= 0) {
                schema.moving = false;
                schema.resting = false;
                player.inputs.length = 0;
                if (player.respawnAt > 0 && now >= player.respawnAt) {
                    this.respawnPlayer(player, now);
                }
                continue;
            }
            if ((schema.hp < schema.maxHp || schema.sp < schema.maxSp) &&
                now - player.lastDamagedAt >= PLAYER_REGEN_INTERVAL_MS &&
                now - player.lastRegenAt >= PLAYER_REGEN_INTERVAL_MS) {
                const derived = CombatCalculator.computeDerivedStats(schema, gearBonuses(schema.weaponId, schema.armorId, schema.wingId, schema.garmentId));
                const regenMult = schema.resting ? 1.5 : 1.0;
                if (schema.hp < schema.maxHp) {
                    schema.hp = Math.min(schema.maxHp, schema.hp + Math.max(1, Math.round(derived.hpRegen * regenMult)));
                }
                if (schema.sp < schema.maxSp) {
                    schema.sp = Math.min(schema.maxSp, schema.sp + Math.max(1, Math.round(derived.spRegen * regenMult)));
                }
                player.lastRegenAt = now;
            }
            // Replay up to MAX_INPUTS_PER_TICK queued inputs at a fixed dt. The
            // client simulated the same inputs at the same dt, so the final pose
            // matches without needing interpolation on the server.
            let consumed = 0;
            while (consumed < MAX_INPUTS_PER_TICK && player.inputs.length > 0) {
                const input = player.inputs.shift();
                if (!input)
                    break;
                if (input.seq <= schema.lastProcessedInput)
                    continue;
                if (!schema.frozen) {
                    if (schema.resting && (input.up || input.down || input.left || input.right)) {
                        schema.resting = false;
                    }
                    applyInputMovement(schema, input, TICK_MS / 1000, this.grid, PLAYER_SPEED * (player.speedMultiplier ?? 1), PLAYER_RADIUS);
                    consumed++;
                }
                schema.lastProcessedInput = input.seq;
            }
            if (consumed === 0) {
                schema.moving = false;
            }
            else if (this.doors.length > 0 || (!player.warping && this.portals.length > 0)) {
                for (const door of this.doors) {
                    if (door.open)
                        continue;
                    if (Math.hypot(schema.x - door.x, schema.y - door.y) <= 44) {
                        this.tryOpenDoor(player, door, now);
                    }
                }
                if (!player.warping && this.portals.length > 0) {
                    for (const portal of this.portals) {
                        if (portal.active === false)
                            continue;
                        if (Math.hypot(schema.x - portal.x, schema.y - portal.y) <= 22) {
                            player.warping = true;
                            const targetCfg = getMapConfig(portal.targetMapId);
                            const targetGrid = { rows: targetCfg.rows, tileSize: targetCfg.tileSize };
                            const dest = tileCenter(targetGrid, portal.spawnTx, portal.spawnTy);
                            const c = this.clients.find((cl) => cl.sessionId === player.sessionId);
                            if (c) {
                                c.send(ServerMessage.PortalWarp, {
                                    targetMapId: portal.targetMapId,
                                    targetMapName: portal.targetMapName,
                                    spawnX: dest.x,
                                    spawnY: dest.y,
                                });
                            }
                            break;
                        }
                    }
                }
            }
        }
        if (now - this.lastPartySyncAt >= 500) {
            this.lastPartySyncAt = now;
            for (const p of this.players.values()) {
                PartyManager.instance.updateMemberPresence(p.characterId, {
                    hp: p.schema.hp,
                    maxHp: p.schema.maxHp,
                    sp: p.schema.sp,
                    maxSp: p.schema.maxSp,
                    x: p.schema.x,
                    y: p.schema.y,
                    level: p.schema.level,
                    jobLevel: p.schema.jobLevel,
                });
            }
        }
    }
    // -------------------------------------------------------------------------
    // Client messages
    // -------------------------------------------------------------------------
    handleInput(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        const input = parseInputMessage(raw);
        if (!input)
            return;
        if (input.seq <= player.schema.lastProcessedInput)
            return;
        if (player.schema.hp <= 0) {
            // Acknowledge while dead so the client's pending-input queue does not
            // replay stale movement when it respawns.
            player.schema.lastProcessedInput = input.seq;
            return;
        }
        if (player.inputs.length >= MAX_QUEUED_INPUTS) {
            player.inputs.shift();
        }
        player.inputs.push(input);
    }
    handleChat(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        const now = Date.now();
        const text = extractChatText(raw);
        if (!text)
            return;

        // --- GM Command Interception ---
        const gmLevel = player.gmLevel ?? 0;
        if ((text.startsWith("@") || text.startsWith("/")) && text.length > 1) {
            const ctx = {
                actorSessionId: player.sessionId,
                actorAccountId: player.accountId,
                actorName: player.schema.name,
                gmLevel,
                player,
                room: this,
                sendSystemMessage: (sessionId, msg) => {
                    const c = this.clients.find((cl) => cl.sessionId === sessionId);
                    if (c) {
                        c.send(ServerMessage.Chat, {
                            id: this.nextEventId("sys"),
                            name: "System",
                            text: msg,
                            channel: "system",
                            at: Date.now(),
                        });
                    }
                },
                broadcastAnnouncement: (msg) => {
                    this.broadcast(ServerMessage.Chat, {
                        id: this.nextEventId("broadcast"),
                        name: "PENGUMUMAN",
                        text: msg,
                        channel: "broadcast",
                        at: Date.now(),
                    });
                    logger.info(`[GM BROADCAST] ${player.schema.name}: ${msg}`);
                },
            };
            const handled = handleGmCommand(text, ctx);
            if (handled) return;
        }

        // --- Mute Check ---
        if (player.mutedUntil && now < player.mutedUntil) {
            const remaining = Math.ceil((player.mutedUntil - now) / 1000);
            const c = this.clients.find((cl) => cl.sessionId === player.sessionId);
            if (c) {
                c.send(ServerMessage.Chat, {
                    id: this.nextEventId("sys"),
                    name: "System",
                    text: `Chat Anda di-mute. Sisa waktu: ${remaining} detik.`,
                    channel: "system",
                    at: now,
                });
            }
            return;
        }

        // --- Chat Cooldown ---
        if (now - player.lastChatAt < CHAT_COOLDOWN_MS)
            return;

        // --- Party Chat (% prefix or raw channel 'party') ---
        const isPartyPrefix = text.startsWith("%");
        const isPartyChannel = (raw as any)?.channel === "party";
        if (isPartyPrefix || isPartyChannel) {
            const partyMsg = isPartyPrefix ? text.slice(1).trim() : text.trim();
            if (!partyMsg) return;
            const party = PartyManager.instance.getPartyByPlayer(player.characterId);
            if (!party) {
                const c = this.clients.find((cl) => cl.sessionId === player.sessionId);
                if (c) {
                    c.send(ServerMessage.Chat, {
                        id: this.nextEventId("sys"),
                        name: "System",
                        text: "Kamu tidak sedang berada dalam party. Tekan 'P' untuk membuka menu party.",
                        channel: "system",
                        at: now,
                    });
                }
                return;
            }
            PartyManager.instance.sendPartyChat(party.id, player.schema.name, player.sessionId, partyMsg);
            return;
        }

        // --- Whisper Chat (/nickname pesan) ---
        const reqChannel = typeof (raw as any)?.channel === "string" ? (raw as any).channel : "say";
        const isSlashWhisper = text.startsWith("/");
        if (reqChannel === "whisper" || isSlashWhisper) {
            if (!isSlashWhisper) {
                const c = this.clients.find((cl) => cl.sessionId === player.sessionId);
                c?.send(ServerMessage.Chat, {
                    id: this.nextEventId("sys"),
                    name: "System",
                    text: "Format Wisper harus: /nickname pesan",
                    channel: "system",
                    at: now,
                });
                return;
            }
            const rawBody = text.slice(1).trim();
            const spaceIdx = rawBody.indexOf(" ");
            const targetName = spaceIdx > 0 ? rawBody.slice(0, spaceIdx).trim() : "";
            const whisperMsg = spaceIdx > 0 ? rawBody.slice(spaceIdx + 1).trim() : "";
            if (!targetName || !whisperMsg) {
                const c = this.clients.find((cl) => cl.sessionId === player.sessionId);
                c?.send(ServerMessage.Chat, {
                    id: this.nextEventId("sys"),
                    name: "System",
                    text: "Format Whisper: /nickname pesan",
                    channel: "system",
                    at: now,
                });
                return;
            }
            let foundTarget = null;
            let foundRoom = null;
            for (const room of ACTIVE_ROOMS) {
                for (const p of room.players.values()) {
                    if (p.schema.name.toLowerCase() === targetName.toLowerCase()) {
                        foundTarget = p;
                        foundRoom = room;
                        break;
                    }
                }
                if (foundTarget) break;
            }
            if (!foundTarget || !foundRoom) {
                const c = this.clients.find((cl) => cl.sessionId === player.sessionId);
                c?.send(ServerMessage.Chat, {
                    id: this.nextEventId("sys"),
                    name: "System",
                    text: `Player "${targetName}" tidak ditemukan atau sedang offline.`,
                    channel: "system",
                    at: now,
                });
                return;
            }
            player.lastChatAt = now;
            const targetClient = foundRoom.clients.find((cl) => cl.sessionId === foundTarget.sessionId);
            targetClient?.send(ServerMessage.Chat, {
                id: this.nextEventId("whisp"),
                sessionId: player.sessionId,
                name: `Dari ${player.schema.name}`,
                text: whisperMsg,
                channel: "whisper",
                at: now,
            });
            if (foundTarget.sessionId !== player.sessionId) {
                const senderClient = this.clients.find((cl) => cl.sessionId === player.sessionId);
                senderClient?.send(ServerMessage.Chat, {
                    id: this.nextEventId("whisp"),
                    sessionId: player.sessionId,
                    name: `Ke ${foundTarget.schema.name}`,
                    text: whisperMsg,
                    channel: "whisper",
                    at: now,
                });
            }
            return;
        }

        // --- All Server Broadcast Chat (requires 1x Toa) ---
        if (reqChannel === "all") {
            if (!consumeItemById(player.schema, "toa", 1)) {
                const c = this.clients.find((cl) => cl.sessionId === player.sessionId);
                c?.send(ServerMessage.Chat, {
                    id: this.nextEventId("sys"),
                    name: "System",
                    text: "Kamu membutuhkan item 'Toa' untuk chat di channel ALL.",
                    channel: "system",
                    at: now,
                });
                return;
            }
            player.lastChatAt = now;
            const allEvent = {
                id: this.nextEventId("all"),
                sessionId: player.sessionId,
                name: player.schema.name,
                text,
                channel: "all",
                at: now,
            };
            for (const room of ACTIVE_ROOMS) {
                room.broadcast(ServerMessage.Chat, allEvent);
            }
            return;
        }

        player.lastChatAt = now;
        const event = {
            id: this.nextEventId("chat"),
            sessionId: player.sessionId,
            name: player.schema.name,
            text,
            channel: "say",
            at: now,
        };
        this.broadcast(ServerMessage.Chat, event);
    }
    handleUseSkill(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        const skillId = typeof raw?.skillId === "string" ? raw.skillId : "";
        if (player.schema.hp <= 0 || player.schema.frozen) {
            this.sendMiss(client, player.schema.frozen ? "frozen" : "dead");
            return;
        }
        const now = Date.now();

        if (skillId === "rebahan") {
            player.schema.resting = !player.schema.resting;
            player.schema.moving = false;
            this.broadcast(ServerMessage.SkillUsed, {
                casterId: player.sessionId,
                skillId: "rebahan",
                skillName: "Rebahan",
                x: player.schema.x,
                y: player.schema.y,
                radius: 0,
                at: now,
            });
            return;
        }

        if (skillId === "baledog") {
            if (player.schema.resting) {
                player.schema.resting = false;
            }
            if (now - (player.lastBaledogAt ?? 0) < 1500) {
                this.sendMiss(client, "cooldown");
                return;
            }
            if (player.schema.sp < 5) {
                client.send(ServerMessage.Chat, {
                    id: this.nextEventId("sys"),
                    name: "System",
                    text: "SP tidak cukup untuk Baledog (butuh 5 SP).",
                    channel: "system",
                    at: now,
                });
                return;
            }
            const rangePx = 7 * this.grid.tileSize;
            const requestedId = extractTargetId(raw);
            let target = null;
            if (requestedId) {
                const candidate = this.monsters.get(requestedId);
                if (candidate && this.monsters.isAlive(candidate) &&
                    Math.hypot(candidate.schema.x - player.schema.x, candidate.schema.y - player.schema.y) <= rangePx) {
                    target = candidate;
                }
            }
            if (!target) {
                let bestDist = Number.POSITIVE_INFINITY;
                for (const m of this.monsters.all.values()) {
                    if (!this.monsters.isAlive(m))
                        continue;
                    const dist = Math.hypot(m.schema.x - player.schema.x, m.schema.y - player.schema.y);
                    if (dist <= rangePx && dist < bestDist) {
                        bestDist = dist;
                        target = m;
                    }
                }
            }
            if (!target) {
                this.sendMiss(client, "no-target");
                return;
            }

            player.lastBaledogAt = now;
            player.schema.sp -= 5;
            const dx = target.schema.x - player.schema.x;
            const dy = target.schema.y - player.schema.y;
            if (Math.abs(dx) > Math.abs(dy)) {
                player.schema.dir = dx < 0 ? 1 : 2;
            }
            else if (dy !== 0) {
                player.schema.dir = dy < 0 ? 3 : 0;
            }

            this.broadcast(ServerMessage.SkillUsed, {
                casterId: player.sessionId,
                skillId: "baledog",
                skillName: "Baledog",
                x: player.schema.x,
                y: player.schema.y,
                radius: 0,
                targetX: target.schema.x,
                targetY: target.schema.y,
                at: now,
            });

            const finalDamage = 25;
            const killed = finalDamage >= target.schema.hp;
            target.schema.hp = Math.max(0, target.schema.hp - finalDamage);
            if (!killed) {
                if (!target.targetId)
                    target.targetId = player.sessionId;
                this.monsters.recordHit(target);
            }
            this.broadcast(ServerMessage.CombatHit, {
                attackerId: player.sessionId,
                targetId: target.id,
                targetType: "monster",
                targetName: target.schema.name,
                damage: finalDamage,
                crit: false,
                hp: target.schema.hp,
                maxHp: target.schema.maxHp,
                killed,
                skillId: "baledog",
                at: now,
            });
            if (killed) {
                this.onMonsterKilled(client, player, target, now, " with Baledog");
            }
            return;
        }

        if (skillId !== "magnum-break")
            return;
        if (player.schema.resting) {
            player.schema.resting = false;
        }
        if (player.schema.jobId !== "swordsman") {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: "Magnum Break hanya dapat digunakan oleh Swordsman.",
                channel: "system",
                at: Date.now(),
            });
            return;
        }
        if (now - player.lastSkillAt < 5000) {
            this.sendMiss(client, "cooldown");
            return;
        }
        if (player.schema.sp < 15) {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: "SP tidak cukup untuk Magnum Break (butuh 15 SP).",
                channel: "system",
                at: now,
            });
            return;
        }

        player.lastSkillAt = now;
        player.schema.sp -= 15;
        player.fireEnchantUntil = now + 15_000;
        const centerX = player.schema.x;
        const centerY = player.schema.y;
        const radius = 3 * this.grid.tileSize;
        this.broadcast(ServerMessage.SkillUsed, {
            casterId: player.sessionId,
            skillId,
            skillName: "Magnum Break",
            x: centerX,
            y: centerY,
            radius,
            at: now,
        });

        const gear = gearBonuses(player.schema.weaponId, player.schema.armorId, player.schema.wingId, player.schema.garmentId);
        const derived = CombatCalculator.computeDerivedStats(player.schema, gear);
        for (const target of this.monsters.all.values()) {
            if (!this.monsters.isAlive(target))
                continue;
            if (Math.hypot(target.schema.x - centerX, target.schema.y - centerY) > radius)
                continue;
            if (!hasLineOfSight(this.grid, centerX, centerY, target.schema.x, target.schema.y, PLAYER_RADIUS))
                continue;
            if (!CombatCalculator.rollPlayerHit(derived.hit + 10, target.stats.flee))
                continue;
            const roll = CombatCalculator.playerDamage(Math.round(player.schema.attack * 1.65), derived.critChance, target.stats.def);
            const finalDamage = CombatCalculator.applyFireEnchantMultiplier(roll.damage, true, target.stats.element);
            const killed = finalDamage >= target.schema.hp;
            target.schema.hp = Math.max(0, target.schema.hp - finalDamage);
            if (!killed) {
                if (!target.targetId)
                    target.targetId = player.sessionId;
                this.monsters.recordHit(target);
                this.knockbackMonster(target, player.schema.x, player.schema.y, 3 * this.grid.tileSize);
            }

            const event = {
                attackerId: player.sessionId,
                targetId: target.id,
                targetType: "monster",
                targetName: target.schema.name,
                damage: finalDamage,
                crit: roll.crit,
                hp: target.schema.hp,
                maxHp: target.schema.maxHp,
                killed,
                skillId,
                at: now,
            };
            this.broadcast(ServerMessage.CombatHit, event);
            if (killed) {
                this.onMonsterKilled(client, player, target, now, " with Magnum Break");
            }
        }
    }

    knockbackPlayer(player, fromX, fromY, distancePx) {
        const dx = player.schema.x - fromX;
        const dy = player.schema.y - fromY;
        const len = Math.hypot(dx, dy);
        const ux = len > 0.001 ? dx / len : 1;
        const uy = len > 0.001 ? dy / len : 0;
        const step = 8;
        const steps = Math.max(1, Math.floor(distancePx / step));
        for (let i = 0; i < steps; i++) {
            const nx = player.schema.x + ux * step;
            const ny = player.schema.y + uy * step;
            if (!isWalkablePoint(this.grid, nx, ny, PLAYER_RADIUS))
                break;
            player.schema.x = nx;
            player.schema.y = ny;
        }
    }
    knockbackMonster(monster, fromX, fromY, distancePx) {
        const dx = monster.schema.x - fromX;
        const dy = monster.schema.y - fromY;
        const len = Math.hypot(dx, dy);
        const ux = len > 0.001 ? dx / len : 1;
        const uy = len > 0.001 ? dy / len : 0;
        const step = 8;
        const steps = Math.max(1, Math.floor(distancePx / step));
        for (let i = 0; i < steps; i++) {
            const nx = monster.schema.x + ux * step;
            const ny = monster.schema.y + uy * step;
            if (!isWalkablePoint(this.grid, nx, ny, monster.stats.radius))
                break;
            monster.schema.x = nx;
            monster.schema.y = ny;
        }
        monster.path = [];
    }

    handleAttack(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        const now = Date.now();
        if (player.schema.hp <= 0 || player.schema.frozen) {
            this.sendMiss(client, player.schema.frozen ? "frozen" : "dead");
            return;
        }
        if (player.schema.resting) {
            player.schema.resting = false;
        }
        const derived = CombatCalculator.computeDerivedStats(player.schema, gearBonuses(player.schema.weaponId, player.schema.armorId, player.schema.wingId, player.schema.garmentId));
        const cdRemaining = derived.attackCooldownMs - (now - player.lastAttackAt);
        if (cdRemaining > 0) {
            if (cdRemaining > 150) {
                recordAnomaly(client.sessionId, player.schema.name, "COOLDOWN_VIOLATION", `Attack packet sent ${cdRemaining}ms before cooldown expired`, player.accountId);
            }
            this.sendMiss(client, "cooldown");
            return;
        }
        player.lastAttackAt = now;
        const targetId = extractTargetId(raw);
        const target = this.monsters.findTarget(player, targetId);
        if (!target) {
            if (targetId) {
                const rawMonster = this.monsters.all.get(targetId);
                if (rawMonster && this.monsters.isAlive(rawMonster)) {
                    const dist = this.monsters.distanceToPoint(rawMonster, player.schema.x, player.schema.y);
                    const attackRange = getPlayerAttackRange(player.schema.weaponId);
                    if (dist > attackRange + rawMonster.stats.radius + 30) {
                        recordAnomaly(client.sessionId, player.schema.name, "RANGE_VIOLATION", `Attack attempted beyond range (${Math.round(dist)}px > ${attackRange + rawMonster.stats.radius}px)`, player.accountId);
                    } else if (!hasLineOfSight(this.grid, player.schema.x, player.schema.y, rawMonster.schema.x, rawMonster.schema.y, PLAYER_RADIUS)) {
                        recordAnomaly(client.sessionId, player.schema.name, "WALL_HACK", `Attack blocked by wall to monster "${rawMonster.schema.name}"`, player.accountId);
                    }
                }
            }
            this.sendMiss(client, targetId ? "out-of-range" : "no-target");
            return;
        }
        if (!CombatCalculator.rollPlayerHit(derived.hit, target.stats.flee)) {
            if (!target.targetId) {
                target.targetId = player.sessionId;
            }
            this.sendMiss(client, "miss");
            return;
        }
        const roll = CombatCalculator.playerDamage(player.schema.attack, derived.critChance, target.stats.def);
        const hasFireEnchant = now < (player.fireEnchantUntil ?? 0);
        const finalDamage = CombatCalculator.applyFireEnchantMultiplier(roll.damage, hasFireEnchant, target.stats.element);
        const killed = finalDamage >= target.schema.hp;
        target.schema.hp = Math.max(0, target.schema.hp - finalDamage);
        if (!killed) {
            if (!target.targetId) {
                target.targetId = player.sessionId;
            }
            this.monsters.recordHit(target);
        }
        const event = {
            attackerId: player.sessionId,
            targetId: target.id,
            targetType: "monster",
            targetName: target.schema.name,
            damage: finalDamage,
            crit: roll.crit,
            hp: target.schema.hp,
            maxHp: target.schema.maxHp,
            killed,
            at: now,
        };
        this.broadcast(ServerMessage.CombatHit, event);
        if (killed) {
            this.onMonsterKilled(client, player, target, now);
        }
    }
    onMonsterKilled(client, player, target, now, suffix = "") {
        const killResult = this.monsters.kill(target, now);

        const party = PartyManager.instance.getPartyByPlayer(player.characterId);
        if (party) {
            const candidates = PartyManager.instance.getPartyCandidates(party.id);
            const expResult = calculatePartyExp(
                target.stats.xp,
                target.stats.jobXp,
                party.expShare,
                { mapId: this.mapConfig.id, x: target.schema.x, y: target.schema.y },
                candidates,
                player.characterId
            );

            for (const [charId, reward] of expResult.rewards) {
                const recipientPlayer = Array.from(this.players.values()).find(
                    (p) => p.characterId === charId || p.sessionId === reward.sessionId
                );
                if (recipientPlayer) {
                    this.awardXp(recipientPlayer, reward.baseExp, reward.jobExp);
                    const rClient = this.clients.find((cl) => cl.sessionId === recipientPlayer.sessionId);
                    rClient?.send(ServerMessage.XpAward, {
                        monsterName: target.schema.name,
                        xp: reward.baseExp,
                    });
                }
            }
        } else {
            this.awardXp(player, target.stats.xp, target.stats.jobXp);
            client.send(ServerMessage.XpAward, {
                monsterName: target.schema.name,
                xp: target.stats.xp,
            });
        }

        const guaranteedItems = [];
        if (target.role === "monster_key") {
            guaranteedItems.push({ itemId: "orc-castle-key", qty: 1 });
        }
        else if (target.role === "midboss_key") {
            guaranteedItems.push({ itemId: "orc-castle-last-key", qty: 1 });
        }

        if (party && party.itemShare === "party_share") {
            const recipientMember = PartyManager.instance.getNextItemShareRecipient(
                party.id,
                this.mapConfig.id,
                { x: target.schema.x, y: target.schema.y },
                player.sessionId
            );
            const recipientPlayer = (recipientMember && Array.from(this.players.values()).find(
                (p) => p.characterId === recipientMember.characterId
            )) ?? player;
            const recipientClient = this.clients.find((cl) => cl.sessionId === recipientPlayer.sessionId) ?? client;

            this.awardLoot(recipientClient, recipientPlayer, target.id, target.schema.name, target.stats, now, guaranteedItems);
            if (recipientPlayer !== player) {
                PartyManager.instance.broadcastSystemToParty(
                    party,
                    `[Party Share] ${recipientPlayer.schema.name} menerima item drop dari ${target.schema.name}.`
                );
            }
        } else {
            this.awardLoot(client, player, target.id, target.schema.name, target.stats, now, guaranteedItems);
        }
        this.broadcastSystem(`${player.schema.name} defeated ${target.schema.name}${suffix}.`);
        if (target.role === "boss") {
            let activated = false;
            for (const portal of this.portals) {
                if (portal.active === false) {
                    portal.active = true;
                    activated = true;
                    this.broadcast(ServerMessage.PortalUpdate, { id: portal.id, active: true });
                }
            }
            if (activated) {
                this.broadcastSystem("Boss Orc Castle telah dikalahkan! Warp Portal menuju Adventure Guild kini menyala!");
            }
        }
        if (target.schema.kind === 0 && !killResult.bossSpawned && killResult.progress > 0) {
            this.broadcastSystem(`[BOSS] Moss Slime dikalahkan (${killResult.progress}/10).`);
        }
        if (killResult.bossSpawned) {
            this.broadcast(ServerMessage.BossSpawn, {
                name: "Black Ashura [Lv.15]",
                level: 15,
                x: killResult.bossX,
                y: killResult.bossY,
            });
            this.broadcastSystem(`âš  BOSS MUNCUL! Black Ashura [Lv.15] bangkit di koordinat (${killResult.bossTx}, ${killResult.bossTy})!`);
        }
    }
    setGridTileBlocked(tx, ty, blocked) {
        const row = this.grid.rows[ty];
        if (!row || tx < 0 || tx >= row.length)
            return;
        const ch = blocked ? "#" : ".";
        this.grid.rows[ty] = row.slice(0, tx) + ch + row.slice(tx + 1);
    }
    tryOpenDoor(player, door, now) {
        if (door.open)
            return;
        if (consumeItemById(player.schema, door.keyItemId, 1)) {
            door.open = true;
            for (const tile of door.blockedTiles ?? []) {
                this.setGridTileBlocked(tile.tx, tile.ty, false);
                if (this.state.world.rows[tile.ty] !== undefined) {
                    this.state.world.rows[tile.ty] = this.grid.rows[tile.ty];
                }
            }
            this.broadcast(ServerMessage.DoorOpen, {
                id: door.id,
                tx: door.tx,
                ty: door.ty,
                openedBy: player.schema.name,
            });
            this.broadcastSystem(`${player.schema.name} membuka ${door.name} menggunakan ${door.keyName}!`);
        }
        else if (now - (player.lastDoorHintAt ?? 0) >= 2500) {
            player.lastDoorHintAt = now;
            const c = this.clients.find((cl) => cl.sessionId === player.sessionId);
            c?.send(ServerMessage.Chat, {
                id: `sys-${++this.eventSeq}`,
                name: "System",
                text: `${door.name} terkunci! Kamu membutuhkan "${door.keyName}".`,
                channel: "system",
                at: now,
            });
        }
    }
    handleInteract(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        const targetId = extractTargetId(raw);
        if (!targetId)
            return;
        const door = this.doors.find((d) => d.id === targetId);
        if (door) {
            const now = Date.now();
            const doorDist = Math.hypot(door.x - player.schema.x, door.y - player.schema.y);
            if (doorDist <= INTERACT_RANGE) {
                if (hasLineOfSight(this.grid, player.schema.x, player.schema.y, door.x, door.y, PLAYER_RADIUS)) {
                    this.tryOpenDoor(player, door, now);
                } else {
                    recordAnomaly(client.sessionId, player.schema.name, "WALL_HACK", `Interact with Door "${door.name}" blocked by wall`, player.accountId);
                }
            } else {
                recordAnomaly(client.sessionId, player.schema.name, "RANGE_VIOLATION", `Interact with Door "${door.name}" beyond range (${Math.round(doorDist)}px)`, player.accountId);
            }
            return;
        }
        const npcId = targetId;
        const npc = this.state.npcs.get(npcId);
        if (!npc)
            return;
        const now = Date.now();
        if (now - player.lastInteractAt < INTERACT_COOLDOWN_MS)
            return;
        const distance = Math.hypot(npc.x - player.schema.x, npc.y - player.schema.y);
        if (distance > INTERACT_RANGE) {
            recordAnomaly(client.sessionId, player.schema.name, "RANGE_VIOLATION", `Interact with NPC "${npc.name}" beyond range (${Math.round(distance)}px > ${INTERACT_RANGE}px)`, player.accountId);
            return;
        }
        if (!hasLineOfSight(this.grid, player.schema.x, player.schema.y, npc.x, npc.y, PLAYER_RADIUS)) {
            recordAnomaly(client.sessionId, player.schema.name, "WALL_HACK", `Interact with NPC "${npc.name}" blocked by wall`, player.accountId);
            return;
        }
        player.lastInteractAt = now;
        const lines = NPC_DIALOGS[npcId] ?? [];
        const index = player.npcDialogIndex[npcId] ?? 0;
        const text = lines.length > 0
            ? lines[index % lines.length]
            : `${npc.name} has nothing to say right now.`;
        player.npcDialogIndex[npcId] = index + 1;
        const event = { npcId, npcName: npc.name, text };
        client.send(ServerMessage.NpcDialog, event);
    }
    // -------------------------------------------------------------------------
    // Satchel and equipment
    // -------------------------------------------------------------------------
    handleUseItem(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        if (this.trades.isTrading(player.sessionId))
            return;
        const now = Date.now();
        if (player.schema.hp <= 0) {
            this.sendItemError(client, "dead");
            return;
        }
        if (now - player.lastItemActionAt < ITEM_ACTION_COOLDOWN_MS) {
            this.sendItemError(client, "cooldown");
            return;
        }
        const slot = extractSlotIndex(raw, INVENTORY_SLOTS);
        if (slot === null) {
            recordAnomaly(client.sessionId, player.schema.name, "ITEM_EXPLOIT", `Invalid inventory slot index: ${JSON.stringify(raw?.slot)}`, player.accountId);
            this.sendItemError(client, "empty");
            return;
        }
        const result = consumeAt(player.schema, slot);
        if (!result.ok) {
            this.sendItemError(client, result.reason ?? "empty");
            return;
        }
        player.lastItemActionAt = now;
        const event = {
            slot,
            itemId: result.itemId ?? "",
            healed: result.healed ?? 0,
            hp: player.schema.hp,
            maxHp: player.schema.maxHp,
        };
        client.send(ServerMessage.ItemUsed, event);
    }
    handleEquipItem(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        if (this.trades.isTrading(player.sessionId))
            return;
        const now = Date.now();
        if (player.schema.hp <= 0) {
            this.sendItemError(client, "dead");
            return;
        }
        if (now - player.lastItemActionAt < ITEM_ACTION_COOLDOWN_MS) {
            this.sendItemError(client, "cooldown");
            return;
        }
        const slot = extractSlotIndex(raw, INVENTORY_SLOTS);
        if (slot === null) {
            recordAnomaly(client.sessionId, player.schema.name, "ITEM_EXPLOIT", `Invalid inventory slot index: ${JSON.stringify(raw?.slot)}`, player.accountId);
            this.sendItemError(client, "empty");
            return;
        }
        const result = equipAt(player.schema, slot);
        if (!result.ok) {
            this.sendItemError(client, result.reason ?? "empty");
            return;
        }
        player.lastItemActionAt = now;
        this.sendEquipped(client, player, result.action ?? "equip", result.itemId ?? "", result.slot ?? "weapon");
    }
    handleUnequipItem(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        if (this.trades.isTrading(player.sessionId))
            return;
        const now = Date.now();
        if (player.schema.hp <= 0) {
            this.sendItemError(client, "dead");
            return;
        }
        if (now - player.lastItemActionAt < ITEM_ACTION_COOLDOWN_MS) {
            this.sendItemError(client, "cooldown");
            return;
        }
        const slot = extractEquipSlot(raw);
        if (!slot) {
            this.sendItemError(client, "empty");
            return;
        }
        const result = unequip(player.schema, slot);
        if (!result.ok) {
            this.sendItemError(client, result.reason ?? "empty");
            return;
        }
        player.lastItemActionAt = now;
        this.sendEquipped(client, player, "unequip", result.itemId ?? "", slot);
    }
    handleThrowItem(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        if (this.trades.isTrading(player.sessionId))
            return;
        const slot = extractSlotIndex(raw, INVENTORY_SLOTS);
        if (slot === null) {
            this.sendItemError(client, "empty");
            return;
        }
        const existing = slotAt(player.schema, slot);
        if (!existing || existing.itemId.length === 0 || existing.qty <= 0) {
            this.sendItemError(client, "empty");
            return;
        }
        const requestedQty = Number(raw?.qty);
        const qtyToRemove = Number.isFinite(requestedQty) && requestedQty > 0
            ? Math.min(existing.qty, Math.floor(requestedQty))
            : existing.qty;
        const itemId = existing.itemId;
        const removedQty = qtyToRemove >= existing.qty
            ? (removeSlot(player.schema, slot)?.qty ?? 0)
            : removeAt(player.schema, slot, qtyToRemove);
        if (removedQty <= 0) {
            this.sendItemError(client, "empty");
            return;
        }
        const def = getItem(itemId);
        const label = def?.name ?? itemId;
        client.send(ServerMessage.Chat, {
            id: this.nextEventId("sys"),
            name: "System",
            text: `Membuang ${label} x${removedQty} dari inventory.`,
            channel: "system",
            at: Date.now(),
        });
    }
    handleMoveItem(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        if (this.trades.isTrading(player.sessionId))
            return;
        const fromSlot = extractSlotIndex({ slot: raw?.fromSlot }, INVENTORY_SLOTS);
        const toSlot = extractSlotIndex({ slot: raw?.toSlot }, INVENTORY_SLOTS);
        if (fromSlot === null || toSlot === null)
            return;
        moveInventorySlot(player.schema, fromSlot, toSlot);
    }
    handleSortInventory(client) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        if (this.trades.isTrading(player.sessionId))
            return;
        sortInventory(player.schema);
    }
    handleAllocateStat(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        const parsed = extractStatAllocation(raw);
        if (!parsed) {
            recordAnomaly(client.sessionId, player.schema.name, "INVALID_PACKET", `Malformed stat allocation: ${JSON.stringify(raw)}`, player.accountId);
            client.send(ServerMessage.StatError, { reason: "invalid" });
            return;
        }
        const schema = player.schema;
        if (schema.statPoints < parsed.amount) {
            recordAnomaly(client.sessionId, player.schema.name, "ITEM_EXPLOIT", `Attempted to allocate ${parsed.amount} stats with only ${schema.statPoints} available`, player.accountId);
            client.send(ServerMessage.StatError, { reason: "no-points" });
            return;
        }
        schema[parsed.stat] += parsed.amount;
        schema.statPoints -= parsed.amount;
        refreshStats(schema, "ratio");
    }
    handleJobChange(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        const schema = player.schema;
        const targetJobId = typeof raw?.targetJobId === "string" ? raw.targetJobId : "";
        const target = JOBS[targetJobId];
        if (!target) {
            client.send(ServerMessage.JobError, { reason: "Job tidak valid." });
            return;
        }
        const check = canChangeJob(schema.jobId, schema.level, schema.jobLevel, targetJobId);
        if (check.ok === false) {
            client.send(ServerMessage.JobError, { reason: check.reason });
            return;
        }

        schema.jobId = targetJobId;
        schema.jobLevel = 1;
        schema.jobXp = 0;
        schema.jobXpToNext = jobXpToNextLevel(targetJobId, 1);

        schema.str = Math.max(schema.str, target.baseStats.str);
        schema.agi = Math.max(schema.agi, target.baseStats.agi);
        schema.vit = Math.max(schema.vit, target.baseStats.vit);
        schema.int = Math.max(schema.int, target.baseStats.int);
        schema.dex = Math.max(schema.dex, target.baseStats.dex);
        schema.luk = Math.max(schema.luk, target.baseStats.luk);

        refreshStats(schema, "full");
        schema.hp = schema.maxHp;
        schema.sp = schema.maxSp;

        this.broadcast(ServerMessage.JobChanged, {
            sessionId: player.sessionId,
            jobId: schema.jobId,
            jobLevel: schema.jobLevel,
            jobXpToNext: schema.jobXpToNext,
        }, { afterNextPatch: true });

        this.broadcastSystem(`â˜… SELAMAT! ${schema.name} telah berganti job menjadi ${target.name}!`);
        void this.persistPlayer(player);
    }
    handleTradeRequest(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player || !raw || typeof raw !== "object")
            return;
        const targetId = typeof raw.targetSessionId === "string" ? raw.targetSessionId : "";
        this.trades.requestTrade(client, player, targetId, this.players, this.clients);
    }
    handleTradeRespond(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player || !raw || typeof raw !== "object")
            return;
        const requesterId = typeof raw.requesterId === "string" ? raw.requesterId : "";
        const accept = raw.accept === true;
        this.trades.respondTrade(client, player, requesterId, accept, this.players, this.clients);
    }
    handleTradeUpdate(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player)
            return;
        this.trades.updateOffer(player, raw, this.clients);
    }
    handleTradeConfirm(client, raw) {
        const player = this.players.get(client.sessionId);
        if (!player || !raw || typeof raw !== "object")
            return;
        void this.trades.confirmTrade(player, raw.confirmed === true, this.players, this.clients, async (a, b) => {
            await Promise.allSettled([this.persistPlayer(a), this.persistPlayer(b)]);
        });
    }
    handleTradeCancel(client) {
        this.trades.cancelTrade(client.sessionId, this.clients);
    }
    handlePartyCreate(client: any, raw: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        const partyName = typeof raw?.name === "string" ? raw.name : undefined;
        const res = PartyManager.instance.createParty({
            characterId: player.characterId,
            name: player.schema.name,
            sessionId: client.sessionId,
            jobId: player.schema.jobId,
            level: player.schema.level,
            jobLevel: player.schema.jobLevel,
            hp: player.schema.hp,
            maxHp: player.schema.maxHp,
            sp: player.schema.sp,
            maxSp: player.schema.maxSp,
            mapId: this.mapConfig.id,
            x: player.schema.x,
            y: player.schema.y,
            room: this,
        }, partyName);

        if (res.error) {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: res.error,
                channel: "system",
                at: Date.now(),
            });
        }
    }
    handlePartyInvite(client: any, raw: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        const targetId = typeof raw?.targetId === "string" ? raw.targetId : "";
        if (!targetId) return;

        const target = Array.from(this.players.values()).find(
            (p) => p.sessionId === targetId || p.characterId === targetId || p.name.toLowerCase() === targetId.toLowerCase()
        );
        if (!target) {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: "Pemain tidak ditemukan di sekitar Anda.",
                channel: "system",
                at: Date.now(),
            });
            return;
        }

        const res = PartyManager.instance.invite(player.characterId, {
            characterId: target.characterId,
            name: target.schema.name,
            sessionId: target.sessionId,
            room: this,
        });

        if (!res.success && res.reason) {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: res.reason,
                channel: "system",
                at: Date.now(),
            });
        } else {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: `Mengirim undangan party ke ${target.schema.name}...`,
                channel: "system",
                at: Date.now(),
            });
        }
    }
    handlePartyRespond(client: any, raw: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        const partyId = typeof raw?.partyId === "string" ? raw.partyId : "";
        const accept = Boolean(raw?.accept);

        const res = PartyManager.instance.respondInvite({
            characterId: player.characterId,
            name: player.schema.name,
            sessionId: client.sessionId,
            jobId: player.schema.jobId,
            level: player.schema.level,
            jobLevel: player.schema.jobLevel,
            hp: player.schema.hp,
            maxHp: player.schema.maxHp,
            sp: player.schema.sp,
            maxSp: player.schema.maxSp,
            mapId: this.mapConfig.id,
            x: player.schema.x,
            y: player.schema.y,
            room: this,
        }, partyId, accept);

        if (!res.success && res.reason) {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: res.reason,
                channel: "system",
                at: Date.now(),
            });
        }
    }
    handlePartyLeave(client: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        PartyManager.instance.leaveParty(player.characterId);
    }
    handlePartyKick(client: any, raw: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        const memberId = typeof raw?.memberId === "string" ? raw.memberId : "";
        if (!memberId) return;

        const res = PartyManager.instance.kickMember(player.characterId, memberId);
        if (!res.success && res.reason) {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: res.reason,
                channel: "system",
                at: Date.now(),
            });
        }
    }
    handlePartySettings(client: any, raw: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        const expShare = raw?.expShare;
        const itemShare = raw?.itemShare;

        const res = PartyManager.instance.updateSettings(player.characterId, { expShare, itemShare });
        if (!res.success && res.reason) {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: res.reason,
                channel: "system",
                at: Date.now(),
            });
        }
    }
    handleFriendAdd(client: any, raw: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        const targetName = typeof raw?.targetName === "string" ? raw.targetName.trim() : "";
        if (!targetName) return;
        if (targetName.toLowerCase() === player.schema.name.toLowerCase()) {
            client.send(ServerMessage.Chat, {
                id: this.nextEventId("sys"),
                name: "System",
                text: "Tidak bisa menambahkan diri sendiri sebagai teman.",
                channel: "system",
                at: Date.now(),
            });
            return;
        }
        const key = player.schema.name.toLowerCase();
        let set = FRIEND_LISTS.get(key);
        if (!set) {
            set = new Set<string>();
            FRIEND_LISTS.set(key, set);
        }
        let canonical = targetName;
        for (const room of ACTIVE_ROOMS) {
            for (const p of room.players.values()) {
                if (p.schema.name.toLowerCase() === targetName.toLowerCase()) {
                    canonical = p.schema.name;
                    break;
                }
            }
        }
        const already = [...set].some((n) => n.toLowerCase() === canonical.toLowerCase());
        if (!already) {
            set.add(canonical);
        }
        this.sendFriendList(client);
        client.send(ServerMessage.Chat, {
            id: this.nextEventId("sys"),
            name: "System",
            text: already ? `${canonical} sudah ada di daftar teman.` : `${canonical} ditambahkan ke daftar teman.`,
            channel: "system",
            at: Date.now(),
        });
    }
    handleFriendRemove(client: any, raw: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        const targetName = typeof raw?.targetName === "string" ? raw.targetName.trim() : "";
        if (!targetName) return;
        const key = player.schema.name.toLowerCase();
        const set = FRIEND_LISTS.get(key);
        if (set) {
            for (const entry of [...set]) {
                if (entry.toLowerCase() === targetName.toLowerCase()) {
                    set.delete(entry);
                }
            }
        }
        this.sendFriendList(client);
    }
    sendFriendList(client: any) {
        const player = this.players.get(client.sessionId);
        if (!player) return;
        const key = player.schema.name.toLowerCase();
        const set = FRIEND_LISTS.get(key) ?? new Set<string>();
        const friends: Array<{ name: string; online: boolean; mapId?: string }> = [];
        for (const friendName of set) {
            let online = false;
            let mapId: string | undefined;
            for (const room of ACTIVE_ROOMS) {
                for (const p of room.players.values()) {
                    if (p.schema.name.toLowerCase() === friendName.toLowerCase()) {
                        online = true;
                        mapId = room.mapConfig?.name;
                        break;
                    }
                }
                if (online) break;
            }
            friends.push({ name: friendName, online, mapId });
        }
        friends.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
        client.send(ServerMessage.FriendList, { friends });
    }
    notifyFriendsPresence(changedName: string) {
        const lower = changedName.toLowerCase();
        for (const room of ACTIVE_ROOMS) {
            for (const p of room.players.values()) {
                const set = FRIEND_LISTS.get(p.schema.name.toLowerCase());
                if (!set) continue;
                const hasFriend = [...set].some((n) => n.toLowerCase() === lower);
                if (!hasFriend) continue;
                const c = room.clients.find((cl) => cl.sessionId === p.sessionId);
                if (c) room.sendFriendList(c);
            }
        }
    }
    sendEquipped(client, player, action, itemId, slot) {
        const event = {
            action,
            itemId,
            slot,
            attack: player.schema.attack,
            maxHp: player.schema.maxHp,
            hp: player.schema.hp,
        };
        client.send(ServerMessage.ItemEquipped, event);
    }
    awardLoot(client, player, monsterId, monsterName, stats, now, guaranteedItems = []) {
        const roll = rollLoot(stats);
        const allItems = [...roll.items, ...guaranteedItems];
        const awarded = [];
        let overflow = false;
        for (const stack of allItems) {
            const leftover = addItem(player.schema, stack.itemId, stack.qty);
            const granted = stack.qty - leftover;
            if (granted > 0)
                awarded.push({ itemId: stack.itemId, qty: granted });
            if (leftover > 0)
                overflow = true;
        }
        if (roll.gold > 0) {
            player.schema.gold = Math.min(0xffffffff, player.schema.gold + roll.gold);
        }
        const event = {
            monsterId,
            monsterName,
            gold: roll.gold,
            items: awarded,
            overflow,
            at: now,
        };
        client.send(ServerMessage.LootAward, event);
    }
    // -------------------------------------------------------------------------
    // Combat, death and progression
    // -------------------------------------------------------------------------
    damagePlayer(now, player, damage, sourceName, sourceId) {
        const schema = player.schema;
        if (schema.hp <= 0)
            return;
        // God Mode: GM is completely immune to all damage
        if (player.isGodMode) {
            return;
        }
        const derived = CombatCalculator.computeDerivedStats(schema, gearBonuses(schema.weaponId, schema.armorId, schema.wingId, schema.garmentId));
        if (!schema.frozen && CombatCalculator.rollPlayerDodge(derived.flee, derived.perfectDodge)) {
            const missEvent = {
                attackerId: sourceId,
                targetId: player.sessionId,
                targetType: "player",
                targetName: schema.name,
                damage: 0,
                crit: false,
                hp: schema.hp,
                maxHp: schema.maxHp,
                killed: false,
                at: now,
            };
            this.broadcast(ServerMessage.CombatHit, missEvent);
            return;
        }
        const mitigated = Math.max(1, damage - derived.softDef);
        schema.hp = Math.max(0, schema.hp - mitigated);
        if (schema.frozen) {
            schema.frozen = false;
        }
        if (schema.resting) {
            schema.resting = false;
        }
        player.lastDamagedAt = now;
        const killed = schema.hp <= 0;
        const event = {
            attackerId: sourceId,
            targetId: player.sessionId,
            targetType: "player",
            targetName: schema.name,
            damage: mitigated,
            crit: false,
            hp: schema.hp,
            maxHp: schema.maxHp,
            killed,
            at: now,
        };
        this.broadcast(ServerMessage.CombatHit, event);
        if (!killed)
            return;
        this.trades.handleLeaveOrDeath(player.sessionId, this.clients, "error");
        player.respawnAt = now + PLAYER_RESPAWN_MS;
        player.inputs.length = 0;
        schema.moving = false;
        const died = {
            sessionId: player.sessionId,
            name: schema.name,
            respawnInMs: PLAYER_RESPAWN_MS,
        };
        this.broadcast(ServerMessage.PlayerDied, died, { afterNextPatch: true });
        this.broadcastSystem(`${schema.name} was slain by ${sourceName}.`);
    }
    respawnPlayer(player, now) {
        const schema = player.schema;
        schema.x = player.spawn.x;
        schema.y = player.spawn.y;
        schema.dir = 0;
        schema.hp = schema.maxHp;
        schema.sp = schema.maxSp;
        schema.moving = false;
        player.respawnAt = 0;
        player.lastDamagedAt = now;
        player.lastRegenAt = now;
        player.inputs.length = 0;
        const event = {
            sessionId: player.sessionId,
            name: schema.name,
            hp: schema.hp,
        };
        this.broadcast(ServerMessage.PlayerRespawned, event, { afterNextPatch: true });
        this.broadcastSystem(`${schema.name} returned to the Hollow.`);
    }
    awardXp(player, amount, jobXpOverride?: number) {
        const schema = player.schema;
        if (schema.level >= PLAYER_MAX_LEVEL) {
            schema.xp = 0;
            schema.xpToNext = 0;
            return;
        }
        schema.xp += amount;
        while (schema.level < PLAYER_MAX_LEVEL && schema.xp >= schema.xpToNext) {
            schema.xp -= schema.xpToNext;
            schema.level += 1;
            schema.statPoints += STAT_POINTS_PER_LEVEL;
            refreshStats(schema, "clamp");
            schema.hp = schema.maxHp;
            schema.sp = schema.maxSp;
            schema.xpToNext = CombatCalculator.xpToNextLevel(schema.level);
            this.broadcast(ServerMessage.LevelUp, {
                sessionId: player.sessionId,
                level: schema.level,
                maxHp: schema.maxHp,
                attack: schema.attack,
                statPoints: schema.statPoints,
            }, { afterNextPatch: true });
            this.broadcastSystem(`${schema.name} reached level ${schema.level}!`);
        }
        if (schema.level >= PLAYER_MAX_LEVEL) {
            schema.xp = 0;
            schema.xpToNext = 0;
        }

        // Job XP logic
        const jobDef = JOBS[schema.jobId] ?? JOBS.novice;
        if (schema.jobLevel < jobDef.maxJobLevel) {
            const jobAmount = jobXpOverride ?? Math.max(1, Math.floor(amount * 0.6));
            schema.jobXp += jobAmount;
            while (schema.jobLevel < jobDef.maxJobLevel && schema.jobXp >= schema.jobXpToNext) {
                schema.jobXp -= schema.jobXpToNext;
                schema.jobLevel += 1;
                const growth = jobDef.statGrowthPerLevel;
                if (growth) {
                    if (growth.hp) schema.maxHp += growth.hp;
                    if (growth.sp) schema.maxSp += growth.sp;
                    if (growth.str) schema.str += growth.str;
                    if (growth.agi) schema.agi += growth.agi;
                    if (growth.vit) schema.vit += growth.vit;
                    if (growth.int) schema.int += growth.int;
                    if (growth.dex) schema.dex += growth.dex;
                    if (growth.luk) schema.luk += growth.luk;
                }
                refreshStats(schema, "clamp");
                schema.jobXpToNext = jobXpToNextLevel(schema.jobId, schema.jobLevel);
                this.broadcast(ServerMessage.JobLevelUp, {
                    sessionId: player.sessionId,
                    jobId: schema.jobId,
                    jobLevel: schema.jobLevel,
                    jobXpToNext: schema.jobXpToNext,
                }, { afterNextPatch: true });
                this.broadcastSystem(`${schema.name} reached Job Lv. ${schema.jobLevel} [${jobDef.name}]!`);
            }
            if (schema.jobLevel >= jobDef.maxJobLevel) {
                schema.jobXp = 0;
                schema.jobXpToNext = 0;
            }
        }
        PartyManager.instance.updateMemberPresence(player.characterId, {
            level: schema.level,
            jobLevel: schema.jobLevel,
            hp: schema.hp,
            maxHp: schema.maxHp,
            sp: schema.sp,
            maxSp: schema.maxSp,
        });
    }
    // -------------------------------------------------------------------------
    // Persistence
    // -------------------------------------------------------------------------
    async persistPlayer(player) {
        const schema = player.schema;
        const record = {
            id: player.characterId,
            name: schema.name,
            level: schema.level,
            xp: schema.xp,
            jobId: schema.jobId,
            jobLevel: schema.jobLevel,
            jobXp: schema.jobXp,
            hp: schema.hp,
            maxHp: schema.maxHp,
            sp: schema.sp,
            maxSp: schema.maxSp,
            attack: schema.attack,
            str: schema.str,
            agi: schema.agi,
            vit: schema.vit,
            int: schema.int,
            dex: schema.dex,
            luk: schema.luk,
            statPoints: schema.statPoints,
            x: schema.x,
            y: schema.y,
            dir: schema.dir,
            outfit: schema.outfit,
            gold: schema.gold,
            weaponId: schema.weaponId,
            armorId: schema.armorId,
            wingId: schema.wingId,
            garmentId: schema.garmentId,
            inventory: snapshotInventory(schema),
        };
        try {
            await saveCharacter(player.accountId, record);
        }
        catch (error) {
            logger.warn(`Failed to save character ${schema.name}`, error);
        }
        await cachePosition(schema.name, { x: schema.x, y: schema.y, dir: schema.dir });
    }
    async persistAll() {
        await Promise.allSettled([...this.players.values()].map((player) => this.persistPlayer(player)));
    }
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    sendMiss(client, reason) {
        client.send(ServerMessage.CombatMiss, { reason });
    }
    sendItemError(client, reason) {
        const event = { reason };
        client.send(ServerMessage.ItemError, event);
    }
    broadcastSystem(text) {
        const event = {
            id: this.nextEventId("system"),
            name: "System",
            text,
            channel: "system",
            at: Date.now(),
        };
        this.broadcast(ServerMessage.Chat, event);
    }
    sendPlayerMessage(sessionId, text, channel = "system") {
        const c = this.clients.find((cl) => cl.sessionId === sessionId);
        if (!c) return;
        c.send(ServerMessage.Chat, {
            id: this.nextEventId("pm"),
            name: "System",
            text,
            channel,
            at: Date.now(),
        });
    }
    nextEventId(prefix) {
        this.eventSeq = (this.eventSeq + 1) >>> 0;
        return `${prefix}-${this.eventSeq}`;
    }
}
