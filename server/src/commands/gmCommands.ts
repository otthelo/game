import { logger } from "../utils/logger.js";
import { getPool } from "../database/postgres.js";
import { MonsterKind, ServerMessage } from "../types/protocol.js";
import { MAPS } from "../config/map.js";
import { tileCenter } from "../utils/map.js";
import { ITEMS } from "../config/items.js";
import { addItem, refreshStats } from "../items/inventory.js";
import { PLAYER_MAX_LEVEL, STAT_POINTS_PER_LEVEL, TICK_RATE } from "../config/gameplay.js";
import { JOBS, jobXpToNextLevel } from "../config/jobs.js";
import { CombatCalculator } from "../entities/CombatCalculator.js";
import { getRecentAnomalies, clearAnomalies } from "../utils/security.js";

const MONSTER_NAME_MAP = {
    slime: MonsterKind.Slime,
    moss: MonsterKind.Slime,
    bat: MonsterKind.Bat,
    dusk: MonsterKind.Bat,
    ashura: MonsterKind.BlackAshura,
    blackashura: MonsterKind.BlackAshura,
    boss: MonsterKind.BlackAshura,
    marin: MonsterKind.Marin,
    magmaring: MonsterKind.Magmaring,
    poporing: MonsterKind.Poporing,
    stalker: MonsterKind.ForestStalker,
    venom: MonsterKind.VenomPoring,
    shadow: MonsterKind.ShadowAshura,
    bunny: MonsterKind.MadBunny,
    madbunny: MonsterKind.MadBunny,
    huskar: MonsterKind.Huskar,
    highorc: MonsterKind.HighOrc,
    orc: MonsterKind.Orc,
    pochi: MonsterKind.Pochi,
};

function logAudit(ctx, cmd, argsStr) {
    logger.info(`[GM AUDIT] [Lv.${ctx.gmLevel}] ${ctx.actorName} (${ctx.actorAccountId}) executed: @${cmd} ${argsStr}`.trim());
    const pool = getPool();
    if (pool) {
        pool.query(
            `INSERT INTO gm_audit_logs (account_id, character_name, gm_level, command, args)
             VALUES ($1, $2, $3, $4, $5)`,
            [ctx.actorAccountId, ctx.actorName, ctx.gmLevel, cmd, argsStr || null]
        ).catch((err) => {
            logger.warn("Failed to persist GM audit log:", err);
        });
    }
}

function findTargetPlayer(room, name) {
    if (!name) return undefined;
    const lower = name.trim().toLowerCase();
    for (const p of room.players.values()) {
        if (p.schema.name.toLowerCase() === lower) {
            return p;
        }
    }
    return undefined;
}

export function handleGmCommand(rawText, ctx) {
    const trimmed = rawText.trim();
    if (!trimmed.startsWith("@") && !trimmed.startsWith("/")) {
        return false;
    }

    const parts = trimmed.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] ?? "").toLowerCase();
    const args = parts.slice(1);
    const argsStr = args.join(" ");

    if (ctx.gmLevel <= 0) {
        ctx.sendSystemMessage(ctx.actorSessionId, "Anda tidak memiliki akses Game Master.");
        return true;
    }

    logAudit(ctx, cmd, argsStr);

    switch (cmd) {
        // =====================================================================
        // LEVEL 1: GM / Moderator Commands
        // =====================================================================
        case "help":
        case "commands": {
            const lines = [
                "=== PERINTAH GAME MASTER (GM) ===",
                "â€¢ @warp <x> <y> : Teleport ke koordinat tertentu",
                "â€¢ @goto <player> : Teleport ke posisi pemain",
                "â€¢ @recall <player> : Panggil pemain ke posisi Anda",
                "â€¢ @mute <player> [menit] : Mute chat pemain",
                "â€¢ @unmute <player> : Hapus mute pemain",
                "â€¢ @kick <player> [alasan] : Kick pemain dari server",
                "â€¢ @broadcast <pesan> : Kirim pengumuman global",
                "â€¢ @who : Daftar pemain online & koordinat",
                "â€¢ @status / @serverinfo : Info performa & RAM server",
            ];
            if (ctx.gmLevel >= 2) {
                lines.push(
                    "--- PERINTAH KHUSUS ADMIN (Lv.2) ---",
                    "â€¢ @god : Toggle kebal damage (God Mode)",
                    "â€¢ @heal [player] : Pulihkan HP & SP penuh",
                    "â€¢ @spawn <monster> [jumlah] : Spawn monster (1-20)",
                    "â€¢ @go <mapId> : Pindah ke map berdasarkan ID",
                    "â€¢ @killall : Bersihkan semua monster di map",
                    "â€¢ @item <itemId> [qty] : Tambahkan item ke tas",
                    "â€¢ @gold <jumlah> : Tambahkan Gold",
                    "â€¢ @level <baseLv> [jobLv] : Ubah Level karakter",
                    "â€¢ @statpoint <jumlah> : Tambahkan Stat Point",
                    "â€¢ @speed <1-3> : Kecepatan jalan tester",
                    "â€¢ @clearbag : Kosongkan inventory tas",
                    "â€¢ @anomalies [clear] : Cek log anti-cheat / anomali",
                    "â€¢ @setgm <player> <0-2> : Atur GM Level pemain"
                );
            }
            for (const line of lines) {
                ctx.sendSystemMessage(ctx.actorSessionId, line);
            }
            return true;
        }

        case "warp": {
            // Support: @warp <x> <y> or @warp <mapId> <x> <y>
            let targetX, targetY;
            if (args.length >= 3) {
                targetX = Number(args[1]);
                targetY = Number(args[2]);
            } else if (args.length >= 2) {
                targetX = Number(args[0]);
                targetY = Number(args[1]);
            }

            if (targetX === undefined || targetY === undefined || Number.isNaN(targetX) || Number.isNaN(targetY)) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @warp <x> <y> (contoh: @warp 400 300)");
                return true;
            }

            // Clamp coordinate within world map
            const clampedX = Math.max(20, Math.min(targetX, 2400));
            const clampedY = Math.max(20, Math.min(targetY, 1600));

            ctx.player.schema.x = clampedX;
            ctx.player.schema.y = clampedY;
            ctx.player.inputs.length = 0;
            ctx.sendSystemMessage(ctx.actorSessionId, `Teleport berhasil ke koordinat (${clampedX}, ${clampedY}).`);
            return true;
        }

        case "goto": {
            const targetName = args[0];
            if (!targetName) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @goto <nama_pemain>");
                return true;
            }
            const target = findTargetPlayer(ctx.room, targetName);
            if (!target) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${targetName}" tidak ditemukan atau offline.`);
                return true;
            }
            ctx.player.schema.x = target.schema.x;
            ctx.player.schema.y = target.schema.y;
            ctx.player.inputs.length = 0;
            ctx.sendSystemMessage(ctx.actorSessionId, `Teleport ke posisi ${target.schema.name} (${Math.round(target.schema.x)}, ${Math.round(target.schema.y)}).`);
            return true;
        }

        case "bring":
        case "recall": {
            const targetName = args[0];
            if (!targetName) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @recall <nama_pemain>");
                return true;
            }
            const target = findTargetPlayer(ctx.room, targetName);
            if (!target) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${targetName}" tidak ditemukan atau offline.`);
                return true;
            }
            target.schema.x = ctx.player.schema.x;
            target.schema.y = ctx.player.schema.y;
            target.inputs.length = 0;
            ctx.sendSystemMessage(target.sessionId, `Anda dipanggil oleh Game Master ${ctx.actorName}.`);
            ctx.sendSystemMessage(ctx.actorSessionId, `${target.schema.name} berhasil dipanggil ke posisi Anda.`);
            return true;
        }

        case "mute": {
            const targetName = args[0];
            const minutes = Math.max(1, Math.min(Number(args[1] || 5), 1440));
            if (!targetName) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @mute <nama_pemain> [menit]");
                return true;
            }
            const target = findTargetPlayer(ctx.room, targetName);
            if (!target) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${targetName}" tidak ditemukan.`);
                return true;
            }
            target.mutedUntil = Date.now() + minutes * 60 * 1000;
            ctx.sendSystemMessage(target.sessionId, `Anda di-mute oleh Game Master selama ${minutes} menit.`);
            ctx.sendSystemMessage(ctx.actorSessionId, `${target.schema.name} berhasil di-mute selama ${minutes} menit.`);
            return true;
        }

        case "unmute": {
            const targetName = args[0];
            if (!targetName) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @unmute <nama_pemain>");
                return true;
            }
            const target = findTargetPlayer(ctx.room, targetName);
            if (!target) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${targetName}" tidak ditemukan.`);
                return true;
            }
            target.mutedUntil = 0;
            ctx.sendSystemMessage(target.sessionId, "Mute chat Anda telah dicabut oleh Game Master.");
            ctx.sendSystemMessage(ctx.actorSessionId, `${target.schema.name} berhasil di-unmute.`);
            return true;
        }

        case "kick": {
            const targetName = args[0];
            const reason = args.slice(1).join(" ") || "Dikeluarkan oleh Game Master.";
            if (!targetName) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @kick <nama_pemain> [alasan]");
                return true;
            }
            const target = findTargetPlayer(ctx.room, targetName);
            if (!target) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${targetName}" tidak ditemukan.`);
                return true;
            }
            const client = ctx.room.clients.find((c) => c.sessionId === target.sessionId);
            if (client) {
                client.leave(4000, reason);
            }
            ctx.sendSystemMessage(ctx.actorSessionId, `${target.schema.name} telah di-kick dari server.`);
            return true;
        }

        case "broadcast":
        case "b": {
            const message = args.join(" ");
            if (!message) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @broadcast <pesan>");
                return true;
            }
            ctx.broadcastAnnouncement(message);
            return true;
        }

        case "who":
        case "online": {
            const players = [...ctx.room.players.values()];
            const entries = players.map(
                (p) => `${p.schema.name} [Lv.${p.schema.level}/${p.schema.jobId}] (${Math.round(p.schema.x)}, ${Math.round(p.schema.y)})`
            );
            ctx.sendSystemMessage(ctx.actorSessionId, `Total Online: ${players.length} pemain`);
            for (const entry of entries) {
                ctx.sendSystemMessage(ctx.actorSessionId, `â€¢ ${entry}`);
            }
            return true;
        }

        // =====================================================================
        // LEVEL 2: Admin / Developer Commands
        // =====================================================================
        case "god": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @god khusus Admin (GM Lv.2).");
                return true;
            }
            ctx.player.isGodMode = !ctx.player.isGodMode;
            ctx.sendSystemMessage(ctx.actorSessionId, `God Mode: ${ctx.player.isGodMode ? "AKTIF (ON - Kebal Damage)" : "NONAKTIF (OFF)"}`);
            return true;
        }

        case "heal": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @heal khusus Admin (GM Lv.2).");
                return true;
            }
            const targetName = args[0];
            const target = targetName ? findTargetPlayer(ctx.room, targetName) : ctx.player;
            if (!target) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${targetName}" tidak ditemukan.`);
                return true;
            }
            target.schema.hp = target.schema.maxHp;
            target.schema.sp = target.schema.maxSp;
            ctx.sendSystemMessage(ctx.actorSessionId, `HP & SP ${target.schema.name} telah dipulihkan penuh (${target.schema.maxHp}/${target.schema.maxHp}).`);
            if (target !== ctx.player) {
                ctx.sendSystemMessage(target.sessionId, "HP & SP Anda telah dipulihkan oleh Admin.");
            }
            return true;
        }

        case "go": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @go khusus Admin (GM Lv.2).");
                return true;
            }
            const mapId = (args[0] ?? "").trim().toLowerCase();
            if (!mapId) {
                const mapIds = Object.keys(MAPS).join(", ");
                ctx.sendSystemMessage(ctx.actorSessionId, `Format salah. Gunakan: @go <mapId>. Map tersedia: ${mapIds}`);
                return true;
            }
            const targetCfg = MAPS[mapId];
            if (!targetCfg) {
                const mapIds = Object.keys(MAPS).join(", ");
                ctx.sendSystemMessage(ctx.actorSessionId, `Map "${mapId}" tidak ditemukan. Map tersedia: ${mapIds}`);
                return true;
            }
            const spawn = targetCfg.playerSpawns?.[0];
            if (!spawn) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Map "${mapId}" tidak memiliki titik spawn pemain.`);
                return true;
            }
            const targetGrid = { rows: targetCfg.rows, tileSize: targetCfg.tileSize };
            const dest = tileCenter(targetGrid, spawn.tx, spawn.ty);
            ctx.player.warping = true;
            ctx.player.inputs.length = 0;
            const client = ctx.room.clients.find((c) => c.sessionId === ctx.actorSessionId);
            if (client) {
                client.send(ServerMessage.PortalWarp, {
                    targetMapId: targetCfg.id,
                    targetMapName: targetCfg.name,
                    spawnX: dest.x,
                    spawnY: dest.y,
                });
            }
            ctx.sendSystemMessage(ctx.actorSessionId, `Berpindah ke map ${targetCfg.name} (${targetCfg.id}).`);
            return true;
        }

        case "spawn": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @spawn khusus Admin (GM Lv.2).");
                return true;
            }
            const monsterKey = (args[0] ?? "slime").toLowerCase();
            const count = Math.min(Math.max(Number(args[1] ?? 1) || 1, 1), 20); // Batasi maksimal 20 monster

            let kind = MONSTER_NAME_MAP[monsterKey];
            if (kind === undefined && !Number.isNaN(Number(monsterKey))) {
                kind = Number(monsterKey);
            }

            if (kind === undefined) {
                ctx.sendSystemMessage(
                    ctx.actorSessionId,
                    "Monster tidak dikenal. Pilihan: slime, bat, ashura, marin, magmaring, poporing (atau angka 0-5)"
                );
                return true;
            }

            const spawned = ctx.room.monsters.spawnCustom(kind, count, ctx.player.schema.x, ctx.player.schema.y);
            ctx.sendSystemMessage(ctx.actorSessionId, `Berhasil spawn ${spawned}x monster (${monsterKey}) di posisi Anda.`);
            return true;
        }

        case "killall": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @killall khusus Admin (GM Lv.2).");
                return true;
            }
            const killed = ctx.room.monsters.killAll();
            ctx.sendSystemMessage(ctx.actorSessionId, `Berhasil mengeliminasi ${killed} monster di map.`);
            return true;
        }

        case "item": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @item khusus Admin (GM Lv.2).");
                return true;
            }
            const itemId = (args[0] ?? "").toLowerCase();
            const qty = Math.min(Math.max(Number(args[1] ?? 1) || 1, 1), 99);

            const def = ITEMS[itemId];
            if (!def) {
                const sampleItems = Object.keys(ITEMS).slice(0, 6).join(", ");
                ctx.sendSystemMessage(ctx.actorSessionId, `Item "${itemId}" tidak ditemukan. Contoh: @item health-potion 10 (Item lain: ${sampleItems})`);
                return true;
            }

            const overflow = addItem(ctx.player.schema, itemId, qty);
            const added = qty - overflow;
            if (overflow > 0) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Tas penuh! Ditambahkan ${added}x ${def.name}, gagal ${overflow}x.`);
            } else {
                ctx.sendSystemMessage(ctx.actorSessionId, `Berhasil menambahkan ${qty}x ${def.name} ke inventory.`);
            }
            return true;
        }

        case "gold": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @gold khusus Admin (GM Lv.2).");
                return true;
            }
            const amount = Number(args[0]);
            if (Number.isNaN(amount)) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @gold <jumlah> (contoh: @gold 50000)");
                return true;
            }
            ctx.player.schema.gold = Math.max(0, Math.min(ctx.player.schema.gold + amount, 2_000_000_000));
            ctx.sendSystemMessage(ctx.actorSessionId, `Gold diperbarui. Saldo saat ini: ${ctx.player.schema.gold.toLocaleString()} Gold.`);
            return true;
        }

        case "level":
        case "lv": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @level khusus Admin (GM Lv.2).");
                return true;
            }

            let target = ctx.player;
            let baseLvArg = args[0];
            let jobLvArg = args[1];

            // Mendukung format: @level <nama_pemain> <baseLv> [jobLv] atau @level <baseLv> [jobLv]
            if (args[0] && Number.isNaN(Number(args[0]))) {
                const found = findTargetPlayer(ctx.room, args[0]);
                if (!found) {
                    ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${args[0]}" tidak ditemukan.`);
                    return true;
                }
                target = found;
                baseLvArg = args[1];
                jobLvArg = args[2];
            }

            if (!baseLvArg || Number.isNaN(Number(baseLvArg))) {
                ctx.sendSystemMessage(
                    ctx.actorSessionId,
                    "Format salah. Gunakan: @level <baseLv> [jobLv] atau @level <nama_pemain> <baseLv> [jobLv] (contoh: @level 50 atau @level 50 10)"
                );
                return true;
            }

            const oldBaseLv = target.schema.level;
            const baseLv = Math.min(Math.max(Number(baseLvArg) || 1, 1), PLAYER_MAX_LEVEL);
            const jobLv = jobLvArg !== undefined ? Math.min(Math.max(Number(jobLvArg) || 1, 1), 50) : undefined;

            target.schema.level = baseLv;
            target.schema.xp = 0;
            target.schema.xpToNext = CombatCalculator.xpToNextLevel(baseLv);

            // Akumulasi stat points berdasarkan perubahan Base Level (+3 stat points per level)
            const levelDiff = baseLv - oldBaseLv;
            if (levelDiff > 0) {
                target.schema.statPoints += levelDiff * STAT_POINTS_PER_LEVEL;
            } else if (levelDiff < 0) {
                const pointsToDeduct = (oldBaseLv - baseLv) * STAT_POINTS_PER_LEVEL;
                target.schema.statPoints = Math.max(0, target.schema.statPoints - pointsToDeduct);
            }

            // Update Job Level jika diisi
            const jobDef = JOBS[target.schema.jobId] ?? JOBS.novice;
            if (jobLv !== undefined) {
                const newJobLv = Math.min(jobLv, jobDef.maxJobLevel);
                const oldJobLv = target.schema.jobLevel;
                target.schema.jobLevel = newJobLv;
                target.schema.jobXp = 0;
                target.schema.jobXpToNext = jobXpToNextLevel(target.schema.jobId, target.schema.jobLevel);

                const growth = jobDef.statGrowthPerLevel;
                if (growth && newJobLv > oldJobLv) {
                    const diff = newJobLv - oldJobLv;
                    if (growth.hp) target.schema.maxHp += growth.hp * diff;
                    if (growth.sp) target.schema.maxSp += growth.sp * diff;
                    if (growth.str) target.schema.str += growth.str * diff;
                    if (growth.agi) target.schema.agi += growth.agi * diff;
                    if (growth.vit) target.schema.vit += growth.vit * diff;
                    if (growth.int) target.schema.int += growth.int * diff;
                    if (growth.dex) target.schema.dex += growth.dex * diff;
                    if (growth.luk) target.schema.luk += growth.luk * diff;
                }

                ctx.room.broadcast(ServerMessage.JobLevelUp, {
                    sessionId: target.sessionId,
                    jobId: target.schema.jobId,
                    jobLevel: target.schema.jobLevel,
                    jobXpToNext: target.schema.jobXpToNext,
                }, { afterNextPatch: true });
            }

            // Jika stat points karakter belum terakumulasi (misalnya akibat bug @level sebelumnya
            // atau dipanggil di level yang sama), pastikan stat points minimal sesuai total level yang dicapai dikurangi alokasi stat.
            const maxLifetimeEarned = (baseLv - 1) * STAT_POINTS_PER_LEVEL;
            const jobBaseStats = (jobDef.baseStats?.str ?? 1) + (jobDef.baseStats?.agi ?? 1) + (jobDef.baseStats?.vit ?? 1) +
                                 (jobDef.baseStats?.int ?? 1) + (jobDef.baseStats?.dex ?? 1) + (jobDef.baseStats?.luk ?? 1);
            const jobGrowthStats = Math.max(0, target.schema.jobLevel - 1) * (
                (jobDef.statGrowthPerLevel?.str ?? 0) + (jobDef.statGrowthPerLevel?.agi ?? 0) + (jobDef.statGrowthPerLevel?.vit ?? 0) +
                (jobDef.statGrowthPerLevel?.int ?? 0) + (jobDef.statGrowthPerLevel?.dex ?? 0) + (jobDef.statGrowthPerLevel?.luk ?? 0)
            );
            const naturalTotal = jobBaseStats + jobGrowthStats;
            const currentTotal = target.schema.str + target.schema.agi + target.schema.vit +
                                 target.schema.int + target.schema.dex + target.schema.luk;
            const estimatedSpent = Math.max(0, currentTotal - naturalTotal);
            const expectedRemaining = Math.max(0, maxLifetimeEarned - estimatedSpent);

            if (target.schema.statPoints < expectedRemaining) {
                target.schema.statPoints = expectedRemaining;
            }

            refreshStats(target.schema, "clamp");
            target.schema.hp = target.schema.maxHp;
            target.schema.sp = target.schema.maxSp;

            ctx.room.broadcast(ServerMessage.LevelUp, {
                sessionId: target.sessionId,
                level: target.schema.level,
                maxHp: target.schema.maxHp,
                attack: target.schema.attack,
                statPoints: target.schema.statPoints,
            }, { afterNextPatch: true });

            if (typeof ctx.room.persistPlayer === "function") {
                void ctx.room.persistPlayer(target);
            }

            const msg = `Level disetel: Base Lv.${target.schema.level}, Job Lv.${target.schema.jobLevel} [${target.schema.jobId}] | Stat Points: ${target.schema.statPoints}.`;
            if (target !== ctx.player) {
                ctx.sendSystemMessage(target.sessionId, `Level Anda telah diubah oleh Admin: Base Lv.${target.schema.level}, Job Lv.${target.schema.jobLevel} (Stat Points: ${target.schema.statPoints}).`);
                ctx.sendSystemMessage(ctx.actorSessionId, `Level ${target.schema.name} berhasil diubah: Base Lv.${target.schema.level}, Job Lv.${target.schema.jobLevel} (Stat Points: ${target.schema.statPoints}).`);
            } else {
                ctx.sendSystemMessage(ctx.actorSessionId, msg);
            }
            return true;
        }

        case "statpoint":
        case "statpoints": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @statpoint khusus Admin (GM Lv.2).");
                return true;
            }
            let target = ctx.player;
            let amountArg = args[0];
            if (args[0] && Number.isNaN(Number(args[0]))) {
                const found = findTargetPlayer(ctx.room, args[0]);
                if (!found) {
                    ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${args[0]}" tidak ditemukan.`);
                    return true;
                }
                target = found;
                amountArg = args[1];
            }
            const amount = Number(amountArg);
            if (Number.isNaN(amount)) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @statpoint <jumlah> [nama_pemain] (contoh: @statpoint 10)");
                return true;
            }
            target.schema.statPoints = Math.max(0, Math.min(target.schema.statPoints + amount, 9999));
            if (typeof ctx.room.persistPlayer === "function") {
                void ctx.room.persistPlayer(target);
            }
            const msg = `Stat points ${target.schema.name} diperbarui: ${target.schema.statPoints} pts.`;
            ctx.sendSystemMessage(ctx.actorSessionId, msg);
            if (target !== ctx.player) {
                ctx.sendSystemMessage(target.sessionId, `Stat points Anda diperbarui oleh Admin menjadi: ${target.schema.statPoints} pts.`);
            }
            return true;
        }

        case "setgm": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @setgm khusus Admin (GM Lv.2).");
                return true;
            }
            const targetName = args[0];
            const newLevel = Number(args[1]);
            if (!targetName || Number.isNaN(newLevel) || newLevel < 0 || newLevel > 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Format salah. Gunakan: @setgm <nama_pemain> <0|1|2>");
                return true;
            }
            const target = findTargetPlayer(ctx.room, targetName);
            if (!target) {
                ctx.sendSystemMessage(ctx.actorSessionId, `Pemain "${targetName}" tidak ditemukan.`);
                return true;
            }
            target.gmLevel = newLevel;
            target.schema.gmLevel = newLevel;
            const pool = getPool();
            if (pool) {
                pool.query("UPDATE accounts SET gm_level = $1 WHERE id = $2", [newLevel, target.accountId]).catch((err) => {
                    logger.warn("Could not persist new gm_level to account:", err);
                });
            }
            const roleName = newLevel === 2 ? "Admin" : newLevel === 1 ? "Game Master" : "Player";
            ctx.sendSystemMessage(target.sessionId, `Hak akses Anda telah diubah menjadi: ${roleName} (Lv.${newLevel}).`);
            ctx.sendSystemMessage(ctx.actorSessionId, `Hak akses ${target.schema.name} diubah menjadi: ${roleName} (Lv.${newLevel}).`);
            return true;
        }

        case "status":
        case "serverinfo": {
            const uptime = Math.round(process.uptime());
            const mem = process.memoryUsage();
            const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
            const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
            const rssMb = Math.round(mem.rss / 1024 / 1024);
            const onlineCount = ctx.room.players.size;
            const monsterCount = ctx.room.monsters.all.size;
            const mapName = ctx.room.mapConfig?.name ?? ctx.room.roomId;

            ctx.sendSystemMessage(ctx.actorSessionId, `=== SERVER STATUS & TELEMETRY ===`);
            ctx.sendSystemMessage(ctx.actorSessionId, `• Map Aktif: ${mapName} (${ctx.room.mapConfig?.id ?? "unknown"})`);
            ctx.sendSystemMessage(ctx.actorSessionId, `• Uptime: ${Math.floor(uptime / 60)}m ${uptime % 60}s | Tick Rate: ${TICK_RATE} Hz`);
            ctx.sendSystemMessage(ctx.actorSessionId, `• Pemain Online: ${onlineCount} | Monster Aktif: ${monsterCount}`);
            ctx.sendSystemMessage(ctx.actorSessionId, `• RAM: Heap ${heapUsedMb}/${heapTotalMb} MB | RSS: ${rssMb} MB`);
            return true;
        }

        case "speed": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @speed khusus Admin (GM Lv.2).");
                return true;
            }
            const mult = Math.min(Math.max(Number(args[0]) || 1, 1), 3);
            ctx.player.speedMultiplier = mult;
            ctx.sendSystemMessage(ctx.actorSessionId, `Kecepatan gerak karakter disetel ke ${mult}x.`);
            return true;
        }

        case "clearbag":
        case "cleartas": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @clearbag khusus Admin (GM Lv.2).");
                return true;
            }
            ctx.player.schema.inventory.clear();
            if (typeof ctx.room.persistPlayer === "function") {
                void ctx.room.persistPlayer(ctx.player);
            }
            ctx.sendSystemMessage(ctx.actorSessionId, "Inventory tas Anda telah dikosongkan.");
            return true;
        }

        case "anomalies":
        case "anticheat":
        case "security": {
            if (ctx.gmLevel < 2) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Perintah @anomalies khusus Admin (GM Lv.2).");
                return true;
            }
            if (args[0]?.toLowerCase() === "clear") {
                clearAnomalies();
                ctx.sendSystemMessage(ctx.actorSessionId, "Log anomali keamanan telah dibersihkan.");
                return true;
            }
            const targetFilter = args[0] ? args[0].trim() : undefined;
            const anomalies = getRecentAnomalies(10, targetFilter);
            if (anomalies.length === 0) {
                ctx.sendSystemMessage(ctx.actorSessionId, "Tidak ada anomali keamanan yang tercatat saat ini.");
                return true;
            }
            ctx.sendSystemMessage(ctx.actorSessionId, `=== LOG ANOMALI KEAMANAN (${anomalies.length} TERBARU) ===`);
            for (const a of anomalies) {
                const timeStr = new Date(a.timestamp).toTimeString().slice(0, 8);
                ctx.sendSystemMessage(ctx.actorSessionId, `• [${timeStr}] ${a.characterName}: ${a.type} -> ${a.details}`);
            }
            return true;
        }

        default:
            ctx.sendSystemMessage(ctx.actorSessionId, `Perintah tidak dikenal: @${cmd}. Ketik @help untuk daftar perintah.`);
            return true;
    }
}
