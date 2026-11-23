import { ATTACK_RANGE, BOSS_TRIGGER_KILLS, MONSTER_TYPES, PLAYER_RADIUS, getPlayerAttackRange } from "../config/gameplay.js";
import { MONSTER_SPAWNS } from "../config/map.js";
import { MonsterSchema } from "../schemas/MonsterSchema.js";
import { MonsterKind, MonsterStatus } from "../types/protocol.js";
import { isWalkablePoint, tileCenter, WORLD_GRID } from "../utils/map.js";
import { moveToward } from "../utils/movement.js";
import { findPath, hasLineOfSight } from "../utils/pathfinding.js";
import { CombatCalculator } from "./CombatCalculator.js";
/**
 * Owns monster spawning, AI, movement and respawning.
 *
 * The AI is intentionally lightweight: acquire the nearest visible player,
 * path around blocked tiles when needed, attack in range, and walk home when
 * the player escapes. Dead monsters stay in the schema as `Dead` (the client
 * hides them) and respawn at the same home point.
 */
export class MonsterManager {
    all = new Map();
    state;
    grid;
    isDungeon = false;
    mossSlimeKills = 0;
    bossId = "boss-black-ashura";
    constructor(
        state,
        grid = WORLD_GRID,
        spawns: Array<{ kind: number; tx: number; ty: number; role?: string; fixedSpawn?: boolean }> = MONSTER_SPAWNS,
        isDungeon = false,
    ) {
        this.state = state;
        this.grid = grid;
        this.isDungeon = isDungeon;
        spawns.forEach((spawn, index) => {
            const stats = MONSTER_TYPES[spawn.kind];
            if (!stats)
                return;
            const id = `monster-${spawn.kind}-${index}`;
            const home = spawn.fixedSpawn
                ? tileCenter(this.grid, spawn.tx, spawn.ty)
                : this.randomWalkablePoint(stats.radius);
            const role = spawn.role ?? "monster";
            const roleTag = role === "boss"
                ? "[Boss]"
                : role === "midboss_key"
                    ? "[MidBoss]"
                    : role === "monster_key"
                        ? "[Key]"
                        : `[Lv.${stats.level}]`;
            const schema = new MonsterSchema({
                id,
                kind: spawn.kind,
                name: `${stats.name} ${roleTag}`,
                x: home.x,
                y: home.y,
                dir: 0,
                hp: stats.maxHp,
                maxHp: stats.maxHp,
                state: MonsterStatus.Idle,
            });
            state.monsters.set(id, schema);
            this.all.set(id, {
                id,
                stats,
                schema,
                home,
                role,
                fixedSpawn: Boolean(spawn.fixedSpawn),
                targetId: null,
                attackAt: 0,
                respawnAt: 0,
                path: [],
                nextRepathAt: 0,
                wanderTarget: null,
                nextWanderAt: Date.now() + Math.floor(Math.random() * 2500),
                wanderUntil: 0,
                hitCount: 0,
                hasBeenAttacked: false,
                distanceThunderCooldownAt: 0,
                lastRegenAt: 0,
                isCasting: false,
                castUntil: 0,
                castDurationMs: 0,
                skillRadius: 0,
                castingSkill: null,
                pendingSkill: null,
                pendingSkillTargetId: null,
                triggeredThresholds: { 80: false, 50: false, 20: false },
            });
        });

        // Pre-register Black Ashura entry in `all` (added to `state.monsters` when triggered).
        const bossStats = MONSTER_TYPES[MonsterKind.BlackAshura];
        if (bossStats) {
            const home = tileCenter(this.grid, 20, 15);
            const bossSchema = new MonsterSchema({
                id: this.bossId,
                kind: MonsterKind.BlackAshura,
                name: `${bossStats.name} [Lv.${bossStats.level}]`,
                x: home.x,
                y: home.y,
                dir: 0,
                hp: 0,
                maxHp: bossStats.maxHp,
                state: MonsterStatus.Dead,
            });
            this.all.set(this.bossId, {
                id: this.bossId,
                stats: bossStats,
                schema: bossSchema,
                home,
                targetId: null,
                attackAt: 0,
                respawnAt: 0,
                path: [],
                nextRepathAt: 0,
                isCasting: false,
                castUntil: 0,
                castDurationMs: 3000,
                skillRadius: 140,
                nextSkillAt: 0,
                triggeredThresholds: { 80: false, 50: false, 20: false },
                dialogFlags: { aggro: false, hp50: false, lowHp: false },
            });
        }
    }
    get(id) {
        return this.all.get(id);
    }
    isAlive(monster) {
        return monster.schema.hp > 0 && monster.schema.state !== MonsterStatus.Dead;
    }
    /**
     * Resolves a player attack target. An explicit id only matches when the
     * monster is alive and inside attack range; without an id the nearest living
     * monster in range is selected, which is what the spacebar swing uses.
     */
    findTarget(player, targetId) {
        const attackRange = getPlayerAttackRange(player.schema.weaponId);
        if (targetId) {
            const monster = this.all.get(targetId);
            if (!monster || !this.isAlive(monster))
                return null;
            const distance = this.distanceToPoint(monster, player.schema.x, player.schema.y);
            if (distance > attackRange + monster.stats.radius)
                return null;
            if (!hasLineOfSight(this.grid, player.schema.x, player.schema.y, monster.schema.x, monster.schema.y, PLAYER_RADIUS))
                return null;
            return monster;
        }
        let best = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const monster of this.all.values()) {
            if (!this.isAlive(monster))
                continue;
            const distance = this.distanceToPoint(monster, player.schema.x, player.schema.y);
            if (distance > attackRange + monster.stats.radius)
                continue;
            if (distance >= bestDistance)
                continue;
            if (!hasLineOfSight(this.grid, player.schema.x, player.schema.y, monster.schema.x, monster.schema.y, PLAYER_RADIUS))
                continue;
            best = monster;
            bestDistance = distance;
        }
        return best;
    }
    tick(now, dt, players, onAttack, onBossSkillCast, onBossSkillExecute, onMonsterSpeak) {
        for (const monster of this.all.values()) {
            if (!this.isAlive(monster)) {
                if (monster.respawnAt > 0 && now >= monster.respawnAt)
                    this.respawn(monster);
                continue;
            }

            // Boss skill casting & dialog checks (Asura Strike at 80%, 50%, and 20% HP)
            if (monster.schema.kind === MonsterKind.BlackAshura) {
                if (!monster.dialogFlags) {
                    monster.dialogFlags = { aggro: false, hp50: false, lowHp: false };
                }

                const hpRatio = monster.schema.hp / monster.schema.maxHp;

                // Dialog: when dying (HP 1% - 5%)
                if (!monster.dialogFlags.lowHp && monster.schema.hp > 0 && hpRatio <= 0.05) {
                    monster.dialogFlags.lowHp = true;
                    if (onMonsterSpeak) {
                        onMonsterSpeak(monster.id, "Bajigur !!, gw bilangin bapak gw");
                    }
                }

                // Dialog: when HP <= 50%
                if (!monster.dialogFlags.hp50 && monster.schema.hp > 0 && hpRatio <= 0.50) {
                    monster.dialogFlags.hp50 = true;
                    if (onMonsterSpeak) {
                        onMonsterSpeak(monster.id, "hebat juga kau bajigur !!");
                    }
                }

                if (monster.isCasting) {
                    monster.schema.state = MonsterStatus.Cast;
                    monster.path = [];
                    if (now >= monster.castUntil) {
                        monster.isCasting = false;
                        monster.schema.state = MonsterStatus.Attack;
                        if (onBossSkillExecute) {
                            onBossSkillExecute(monster);
                        }
                    }
                    continue;
                }

                if (!monster.triggeredThresholds) {
                    monster.triggeredThresholds = { 80: false, 50: false, 20: false };
        monster.dialogFlags = { aggro: false, hp50: false, lowHp: false };
                }

                let shouldCast = false;

                if (hpRatio <= 0.20 && !monster.triggeredThresholds[20]) {
                    monster.triggeredThresholds[20] = true;
                    monster.triggeredThresholds[50] = true;
                    monster.triggeredThresholds[80] = true;
                    shouldCast = true;
                } else if (hpRatio <= 0.50 && !monster.triggeredThresholds[50]) {
                    monster.triggeredThresholds[50] = true;
                    monster.triggeredThresholds[80] = true;
                    shouldCast = true;
                } else if (hpRatio <= 0.80 && !monster.triggeredThresholds[80]) {
                    monster.triggeredThresholds[80] = true;
                    shouldCast = true;
                }

                if (shouldCast) {
                    monster.isCasting = true;
                    monster.castUntil = now + (monster.castDurationMs || 3000);
                    monster.schema.state = MonsterStatus.Cast;
                    monster.path = [];
                    if (onBossSkillCast) {
                        onBossSkillCast(monster);
                    }
                    continue;
                }
            }

            // White Snake Lady skill casting (Freeze Domination at 80%/50% HP, Thunder Shot on Freeze, every 15 hits, or >= 6 tiles away)
            if (monster.schema.kind === MonsterKind.WhiteSnakeLady) {
                if (monster.schema.hp < monster.schema.maxHp && now - (monster.lastRegenAt ?? 0) >= 1000) {
                    monster.lastRegenAt = now;
                    const regenAmount = Math.max(1, Math.round(monster.schema.maxHp * 0.02));
                    monster.schema.hp = Math.min(monster.schema.maxHp, monster.schema.hp + regenAmount);
                    if (!monster.triggeredThresholds) {
                        monster.triggeredThresholds = { 80: false, 50: false, 40: false, 20: false };
                    }
                    const regenRatio = monster.schema.hp / monster.schema.maxHp;
                    if (regenRatio > 0.80) monster.triggeredThresholds[80] = false;
                    if (regenRatio > 0.50) monster.triggeredThresholds[50] = false;
                    if (regenRatio > 0.40) monster.triggeredThresholds[40] = false;
                    if (monster.schema.hp >= monster.schema.maxHp) {
                        monster.hitCount = 0;
                    }
                }

                if (monster.isCasting) {
                    monster.schema.state = MonsterStatus.Cast;
                    monster.path = [];
                    if (now >= monster.castUntil) {
                        monster.isCasting = false;
                        monster.schema.state = MonsterStatus.Attack;
                        if (onBossSkillExecute) {
                            onBossSkillExecute(monster);
                        }
                        monster.castingSkill = null;
                    }
                    continue;
                }

                if (monster.pendingSkill === "thunder_shot") {
                    monster.pendingSkill = null;
                    const targetPlayer =
                        (monster.pendingSkillTargetId ? players.get(monster.pendingSkillTargetId) : undefined) ??
                        (monster.targetId ? players.get(monster.targetId) : undefined);
                    if (targetPlayer && targetPlayer.schema.hp > 0) {
                        this.startWhiteSnakeCast(monster, "thunder_shot", now, targetPlayer, onBossSkillCast);
                        continue;
                    }
                }

                if (monster.targetId) {
                    if (!monster.triggeredThresholds) {
                        monster.triggeredThresholds = { 80: false, 50: false, 40: false, 20: false };
                    }
                    const hpRatio = monster.schema.hp / monster.schema.maxHp;
                    if (hpRatio <= 0.40 && !monster.triggeredThresholds[40]) {
                        monster.triggeredThresholds[40] = true;
                        this.summonMonstersAround(monster, MonsterKind.Huskar, 6, 2, 5);
                        if (onMonsterSpeak) {
                            onMonsterSpeak(monster.id, "Pengawal!! Hancurkan mereka!!");
                        }
                    }
                    if (hpRatio <= 0.50 && !monster.triggeredThresholds[50]) {
                        monster.triggeredThresholds[50] = true;
                        monster.triggeredThresholds[80] = true;
                        this.startWhiteSnakeCast(monster, "freeze_domination", now, undefined, onBossSkillCast);
                        continue;
                    }
                    if (hpRatio <= 0.80 && !monster.triggeredThresholds[80]) {
                        monster.triggeredThresholds[80] = true;
                        this.startWhiteSnakeCast(monster, "freeze_domination", now, undefined, onBossSkillCast);
                        continue;
                    }

                    if (monster.hasBeenAttacked && now >= (monster.distanceThunderCooldownAt ?? 0)) {
                        const targetPlayer = players.get(monster.targetId);
                        if (targetPlayer && targetPlayer.schema.hp > 0) {
                            const dist = this.distanceToPoint(monster, targetPlayer.schema.x, targetPlayer.schema.y);
                            if (dist >= 6 * this.grid.tileSize) {
                                monster.distanceThunderCooldownAt = now + 5000;
                                this.startWhiteSnakeCast(monster, "thunder_shot", now, targetPlayer, onBossSkillCast);
                                continue;
                            }
                        }
                    }
                }
            }
            // Drop a target that died, disconnected, or escaped well beyond the
            // aggro radius. The larger leash prevents flickering at the edge.
            if (monster.targetId) {
                const current = players.get(monster.targetId);
                const lost = !current ||
                    current.schema.hp <= 0 ||
                    this.distanceToPoint(monster, current.schema.x, current.schema.y) >
                        monster.stats.aggroRange * 1.5;
                if (lost) {
                    monster.targetId = null;
                    monster.hasBeenAttacked = false;
                    monster.path = [];
                }
            }
            if (!monster.targetId) {
                const acquired = this.acquireTarget(monster, players);
                if (acquired) {
                    monster.targetId = acquired.sessionId;
                    if (monster.schema.kind === MonsterKind.BlackAshura && !monster.dialogFlags?.aggro) {
                        monster.dialogFlags.aggro = true;
                        if (onMonsterSpeak) {
                            onMonsterSpeak(monster.id, "Kunyuk goblog awas udah bunuh kroco gw");
                        }
                    }
                }
            } else if (monster.schema.kind === MonsterKind.BlackAshura && !monster.dialogFlags?.aggro) {
                monster.dialogFlags.aggro = true;
                if (onMonsterSpeak) {
                    onMonsterSpeak(monster.id, "Kunyuk goblog awas udah bunuh kroco gw");
                }
            }
            const target = monster.targetId ? players.get(monster.targetId) : undefined;
            if (target && target.schema.hp > 0) {
                this.updateTargetedMonster(monster, target, now, dt, onAttack);
            }
            else {
                this.updateIdleMonster(monster, now, dt);
            }
        }
    }
    /** Called by the room when a player's final blow lands. */
    kill(monster, now) {
        monster.schema.hp = 0;
        monster.schema.state = MonsterStatus.Dead;
        monster.targetId = null;
        monster.path = [];
        monster.isCasting = false;
        monster.castUntil = 0;
        monster.triggeredThresholds = { 80: false, 50: false, 20: false };
        monster.dialogFlags = { aggro: false, hp50: false, lowHp: false };
        monster.respawnAt = (!this.isDungeon && monster.stats.respawnMs > 0) ? now + monster.stats.respawnMs : 0;

        if (monster.schema.kind === MonsterKind.BlackAshura) {
            this.state.monsters.delete(this.bossId);
            return { bossSpawned: false, progress: this.mossSlimeKills };
        }

        if (monster.schema.kind !== MonsterKind.Slime) {
            return { bossSpawned: false, progress: this.mossSlimeKills };
        }

        const boss = this.all.get(this.bossId);
        if (!boss || this.isAlive(boss)) {
            return { bossSpawned: false, progress: this.mossSlimeKills };
        }

        this.mossSlimeKills += 1;
        if (this.mossSlimeKills < BOSS_TRIGGER_KILLS) {
            return { bossSpawned: false, progress: this.mossSlimeKills };
        }

        this.mossSlimeKills = 0;
        const pos = this.randomWalkablePoint(boss.stats.radius);
        boss.home = pos;
        this.respawn(boss);
        this.state.monsters.set(this.bossId, boss.schema);
        return {
            bossSpawned: true,
            progress: BOSS_TRIGGER_KILLS,
            bossX: pos.x,
            bossY: pos.y,
            bossTx: Math.floor(pos.x / this.grid.tileSize),
            bossTy: Math.floor(pos.y / this.grid.tileSize),
        };
    }

    randomWalkablePoint(radius) {
        const rows = this.grid.rows.length;
        const cols = this.grid.rows[0].length;
        for (let attempt = 0; attempt < 120; attempt++) {
            const tx = 1 + Math.floor(Math.random() * (cols - 2));
            const ty = 1 + Math.floor(Math.random() * (rows - 2));
            const pt = tileCenter(this.grid, tx, ty);
            if (isWalkablePoint(this.grid, pt.x, pt.y, radius)) {
                return pt;
            }
        }
        return tileCenter(this.grid, 20, 15);
    }
    acquireTarget(monster, players) {
        if (!monster.stats.aggressive)
            return null;
        let best = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const player of players.values()) {
            if (player.schema.hp <= 0)
                continue;
            const distance = this.distanceToPoint(monster, player.schema.x, player.schema.y);
            if (distance > monster.stats.aggroRange || distance >= bestDistance)
                continue;
            if (!hasLineOfSight(this.grid, monster.schema.x, monster.schema.y, player.schema.x, player.schema.y, monster.stats.radius)) {
                continue;
            }
            best = player;
            bestDistance = distance;
        }
        return best;
    }
    updateTargetedMonster(monster, target, now, dt, onAttack) {
        const { x, y } = target.schema;
        const distance = this.distanceToPoint(monster, x, y);
        const inReach = distance <= monster.stats.attackRange + PLAYER_RADIUS;
        const visible = hasLineOfSight(this.grid, monster.schema.x, monster.schema.y, x, y, monster.stats.radius);
        this.faceToward(monster, x, y);
        if (inReach && visible) {
            monster.schema.state = MonsterStatus.Attack;
            monster.path = [];
            if (now >= monster.attackAt) {
                monster.attackAt = now + monster.stats.attackCooldownMs;
                onAttack(monster, target, CombatCalculator.monsterDamage(monster.stats.damage));
            }
            return;
        }
        monster.schema.state = MonsterStatus.Chase;
        this.chase(monster, x, y, now, dt);
    }
    updateIdleMonster(monster, now, dt) {
        monster.targetId = null;

        if (this.isDungeon) {
            const homeDist = this.distanceToPoint(monster, monster.home.x, monster.home.y);
            if (homeDist > 4) {
                monster.schema.state = MonsterStatus.Chase;
                this.chase(monster, monster.home.x, monster.home.y, now, dt);
            }
            else {
                monster.schema.state = MonsterStatus.Idle;
                monster.path = [];
            }
            return;
        }

        monster.schema.state = MonsterStatus.Idle;

        if (!monster.wanderTarget) {
            if (now >= (monster.nextWanderAt ?? 0)) {
                monster.wanderTarget = this.pickWanderPoint(monster);
                monster.wanderUntil = now + 6000;
            }
            return;
        }

        const dist = this.distanceToPoint(monster, monster.wanderTarget.x, monster.wanderTarget.y);
        if (dist <= 8 || now >= (monster.wanderUntil ?? 0)) {
            monster.wanderTarget = null;
            monster.nextWanderAt = now + 5000;
            return;
        }

        const prevX = monster.schema.x;
        const prevY = monster.schema.y;
        this.navigate(monster, monster.wanderTarget.x, monster.wanderTarget.y, now, dt, monster.stats.speed * 0.5, 4);
        if (Math.hypot(monster.schema.x - prevX, monster.schema.y - prevY) < 0.05) {
            // Hit an obstacle while wandering: idle 5 seconds before picking a new direction.
            monster.wanderTarget = null;
            monster.nextWanderAt = now + 5000;
        }
    }
    pickWanderPoint(monster) {
        const rows = this.grid.rows.length;
        const cols = this.grid.rows[0].length;
        const originTx = Math.floor(monster.schema.x / this.grid.tileSize);
        const originTy = Math.floor(monster.schema.y / this.grid.tileSize);
        for (let attempt = 0; attempt < 15; attempt++) {
            const dx = Math.floor((Math.random() - 0.5) * 16);
            const dy = Math.floor((Math.random() - 0.5) * 16);
            const tx = Math.max(1, Math.min(cols - 2, originTx + dx));
            const ty = Math.max(1, Math.min(rows - 2, originTy + dy));
            const pt = tileCenter(this.grid, tx, ty);
            if (isWalkablePoint(this.grid, pt.x, pt.y, monster.stats.radius) &&
                hasLineOfSight(this.grid, monster.schema.x, monster.schema.y, pt.x, pt.y, monster.stats.radius)) {
                return pt;
            }
        }
        return this.randomWalkablePoint(monster.stats.radius);
    }
    chase(monster, targetX, targetY, now, dt) {
        const direct = hasLineOfSight(this.grid, monster.schema.x, monster.schema.y, targetX, targetY, monster.stats.radius + 2);
        if (direct) {
            monster.path = [];
            this.navigate(monster, targetX, targetY, now, dt, monster.stats.speed, 2);
            return;
        }
        if (now >= monster.nextRepathAt || monster.path.length === 0) {
            monster.path =
                findPath(this.grid, monster.schema.x, monster.schema.y, targetX, targetY) ?? [];
            monster.nextRepathAt = now + 650;
        }
        // Consume waypoints that are already close enough.
        while (monster.path.length > 0) {
            const waypoint = monster.path[0];
            const distance = Math.hypot(waypoint.x - monster.schema.x, waypoint.y - monster.schema.y);
            if (distance >= 12)
                break;
            monster.path.shift();
        }
        const next = monster.path[0];
        if (next) {
            this.navigate(monster, next.x, next.y, now, dt, monster.stats.speed, 1);
        }
        else {
            // No route found: still push toward the target and let wall sliding do
            // its best rather than freezing in place.
            this.navigate(monster, targetX, targetY, now, dt, monster.stats.speed, 2);
        }
    }
    navigate(monster, targetX, targetY, _now, dt, speed, stopDistance = 2) {
        const pose = {
            x: monster.schema.x,
            y: monster.schema.y,
            dir: monster.schema.dir,
            moving: false,
        };
        moveToward(pose, targetX, targetY, dt, this.grid, speed, monster.stats.radius, stopDistance);
        monster.schema.x = pose.x;
        monster.schema.y = pose.y;
        monster.schema.dir = pose.dir;
    }
    faceToward(monster, x, y) {
        const dx = x - monster.schema.x;
        const dy = y - monster.schema.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            monster.schema.dir = dx < 0 ? 1 : 2;
        }
        else if (dy !== 0) {
            monster.schema.dir = dy < 0 ? 3 : 0;
        }
    }
    respawn(monster) {
        if (monster.schema.kind !== MonsterKind.BlackAshura && !monster.isCustom && !monster.fixedSpawn) {
            monster.home = this.randomWalkablePoint(monster.stats.radius);
        }
        monster.schema.x = monster.home.x;
        monster.schema.y = monster.home.y;
        monster.schema.hp = monster.stats.maxHp;
        monster.schema.maxHp = monster.stats.maxHp;
        monster.schema.state = MonsterStatus.Idle;
        monster.schema.dir = 0;
        monster.targetId = null;
        monster.attackAt = 0;
        monster.respawnAt = 0;
        monster.path = [];
        monster.nextRepathAt = 0;
        monster.wanderTarget = null;
        monster.nextWanderAt = Date.now() + 1000 + Math.random() * 2500;
        monster.wanderUntil = 0;
        monster.isCasting = false;
        monster.castUntil = 0;
        monster.castingSkill = null;
        monster.pendingSkill = null;
        monster.pendingSkillTargetId = null;
        monster.hitCount = 0;
        monster.hasBeenAttacked = false;
        monster.distanceThunderCooldownAt = 0;
        monster.lastRegenAt = 0;
        monster.triggeredThresholds = { 80: false, 50: false, 40: false, 20: false };
        monster.dialogFlags = { aggro: false, hp50: false, lowHp: false };
    }
    summonMonstersAround(centerMonster, kind, count, minTiles, maxTiles) {
        const stats = MONSTER_TYPES[kind];
        if (!stats)
            return 0;
        const minDist = minTiles * this.grid.tileSize;
        const maxDist = maxTiles * this.grid.tileSize;
        let spawned = 0;
        for (let i = 0; i < count; i++) {
            let spawnX = centerMonster.schema.x;
            let spawnY = centerMonster.schema.y;
            for (let attempt = 0; attempt < 24; attempt++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = minDist + Math.random() * (maxDist - minDist);
                const candidateX = centerMonster.schema.x + Math.cos(angle) * dist;
                const candidateY = centerMonster.schema.y + Math.sin(angle) * dist;
                if (isWalkablePoint(this.grid, candidateX, candidateY, stats.radius)) {
                    spawnX = candidateX;
                    spawnY = candidateY;
                    break;
                }
            }
            const id = `summon-${kind}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
            const home = { x: spawnX, y: spawnY };
            const schema = new MonsterSchema({
                id,
                kind,
                name: `${stats.name} [Lv.${stats.level}]`,
                x: home.x,
                y: home.y,
                dir: 0,
                hp: stats.maxHp,
                maxHp: stats.maxHp,
                state: MonsterStatus.Idle,
            });
            this.state.monsters.set(id, schema);
            this.all.set(id, {
                id,
                stats,
                schema,
                home,
                targetId: centerMonster.targetId ?? null,
                attackAt: 0,
                respawnAt: 0,
                path: [],
                nextRepathAt: 0,
                isCustom: true,
            });
            spawned++;
        }
        return spawned;
    }
    startWhiteSnakeCast(monster, skill, now, targetPlayer, onBossSkillCast) {
        monster.isCasting = true;
        monster.castingSkill = skill;
        monster.schema.state = MonsterStatus.Cast;
        monster.path = [];
        if (skill === "freeze_domination") {
            monster.castDurationMs = 4000;
            monster.skillRadius = 480;
            monster.pendingSkillTargetId = null;
        }
        else {
            monster.castDurationMs = 2000;
            monster.skillRadius = 48;
            monster.pendingSkillTargetId = targetPlayer?.sessionId ?? monster.targetId ?? null;
        }
        monster.castUntil = now + monster.castDurationMs;
        if (onBossSkillCast) {
            onBossSkillCast(monster, targetPlayer);
        }
    }
    recordHit(monster) {
        monster.hitCount = (monster.hitCount ?? 0) + 1;
        monster.hasBeenAttacked = true;
        if (monster.schema.kind === MonsterKind.WhiteSnakeLady && monster.hitCount % 15 === 0) {
            if (monster.castingSkill !== "thunder_shot" && monster.pendingSkill !== "thunder_shot") {
                monster.pendingSkill = "thunder_shot";
                if (!monster.pendingSkillTargetId && monster.targetId) {
                    monster.pendingSkillTargetId = monster.targetId;
                }
            }
        }
    }
    distanceToPoint(monster, x, y) {
        return Math.hypot(x - monster.schema.x, y - monster.schema.y);
    }
    spawnCustom(kind, count, x, y) {
        if (kind === MonsterKind.BlackAshura) {
            const boss = this.all.get(this.bossId);
            if (boss) {
                boss.home = { x, y };
                this.respawn(boss);
                this.state.monsters.set(this.bossId, boss.schema);
                return 1;
            }
        }
        const stats = MONSTER_TYPES[kind];
        if (!stats) return 0;
        let spawnedCount = 0;
        for (let i = 0; i < count; i++) {
            const id = `gm-spawn-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const offsetX = count > 1 ? (Math.random() - 0.5) * 60 : 0;
            const offsetY = count > 1 ? (Math.random() - 0.5) * 60 : 0;
            const spawnX = Math.max(30, Math.min(x + offsetX, 1280));
            const spawnY = Math.max(30, Math.min(y + offsetY, 720));
            const home = { x: spawnX, y: spawnY };
            const schema = new MonsterSchema({
                id,
                kind,
                name: `${stats.name} [Lv.${stats.level}]`,
                x: home.x,
                y: home.y,
                dir: 0,
                hp: stats.maxHp,
                maxHp: stats.maxHp,
                state: MonsterStatus.Idle,
            });
            this.state.monsters.set(id, schema);
            this.all.set(id, {
                id,
                stats,
                schema,
                home,
                targetId: null,
                attackAt: 0,
                respawnAt: 0,
                path: [],
                nextRepathAt: 0,
                isCustom: true,
            });
            spawnedCount++;
        }
        return spawnedCount;
    }
    killAll() {
        let count = 0;
        for (const [id, monster] of [...this.all.entries()]) {
            if (monster.schema.hp > 0 && monster.schema.state !== MonsterStatus.Dead) {
                monster.schema.hp = 0;
                monster.schema.state = MonsterStatus.Dead;
                count++;
            }
            if (monster.isCustom) {
                this.state.monsters.delete(id);
                this.all.delete(id);
            }
        }
        return count;
    }
}
