import { PLAYER_ATTACK_COOLDOWN_MS, PLAYER_ATTACK_PER_LEVEL, PLAYER_BASE_ATTACK, PLAYER_BASE_HP, PLAYER_BASE_SP, PLAYER_BASE_STAT, PLAYER_HP_PER_LEVEL, PLAYER_MAX_LEVEL, PLAYER_REGEN_AMOUNT, PLAYER_SP_PER_LEVEL, } from "../config/gameplay.js";
/**
 * All combat math lives here so balancing is a single-file operation.
 *
 * Damage is deliberately simple: base attack, a small random spread, and a
 * critical chance. Stats grow linearly with level and primary attributes.
 */
export class CombatCalculator {
    static CRIT_CHANCE = 0.12;
    static CRIT_MULTIPLIER = 1.75;
    static DAMAGE_SPREAD = 0.15;
    /** Player -> monster hit check using player HIT vs monster FLEE. */
    static rollPlayerHit(playerHit = 100, monsterFlee = 0) {
        const hitChance = Math.max(0.35, Math.min(0.99, (playerHit - monsterFlee) / 100));
        return Math.random() < hitChance;
    }
    /** Player -> monster damage (monster DEF mitigates non-crit hits). */
    static playerDamage(attack, critChance = CombatCalculator.CRIT_CHANCE, targetDef = 0) {
        const crit = Math.random() < critChance;
        const spread = 1 - CombatCalculator.DAMAGE_SPREAD + Math.random() * CombatCalculator.DAMAGE_SPREAD * 2;
        const raw = attack * spread * (crit ? CombatCalculator.CRIT_MULTIPLIER : 1);
        const mitigation = crit ? Math.floor(targetDef * 0.5) : targetDef;
        return {
            damage: Math.max(1, Math.round(raw) - Math.max(0, mitigation)),
            crit,
        };
    }
    /** Fire Enchant / Fire skill elemental modifier (+40% vs earth, -40% vs fire). */
    static applyFireEnchantMultiplier(damage, hasFireEnchant, targetElement) {
        if (!hasFireEnchant)
            return damage;
        if (targetElement === "earth")
            return Math.max(1, Math.round(damage * 1.4));
        if (targetElement === "fire")
            return Math.max(1, Math.round(damage * 0.6));
        return damage;
    }
    /** Monster -> player damage. Monsters cannot critically strike yet. */
    static monsterDamage(attack, softDef = 0) {
        const spread = 1 - CombatCalculator.DAMAGE_SPREAD + Math.random() * CombatCalculator.DAMAGE_SPREAD * 2;
        return Math.max(1, Math.round(attack * spread) - Math.max(0, softDef));
    }
    /** Checks if player dodges an incoming monster hit via Perfect Dodge (LUK) or FLEE (AGI). */
    static rollPlayerDodge(flee, perfectDodgePct) {
        if (Math.random() * 100 < perfectDodgePct) {
            return true;
        }
        const dodgePct = Math.min(45, Math.max(0, (flee - 100) * 0.45));
        return Math.random() * 100 < dodgePct;
    }
    static statsForLevel(level) {
        const safeLevel = Math.max(1, Math.min(PLAYER_MAX_LEVEL, Math.floor(level)));
        return {
            maxHp: PLAYER_BASE_HP + (safeLevel - 1) * PLAYER_HP_PER_LEVEL,
            maxSp: PLAYER_BASE_SP + (safeLevel - 1) * PLAYER_SP_PER_LEVEL,
            attack: PLAYER_BASE_ATTACK + (safeLevel - 1) * PLAYER_ATTACK_PER_LEVEL,
        };
    }
    /**
     * Computes all derived combat and character stats from level, primary attributes
     * (STR, AGI, VIT, INT, DEX, LUK), and equipped gear.
     */
    static computeDerivedStats(source: any, gear: { attack?: number; maxHp?: number; maxSp?: number } = { attack: 0, maxHp: 0, maxSp: 0 }) {
        const base = CombatCalculator.statsForLevel(source.level ?? 1);
        const level = Math.max(1, Math.min(PLAYER_MAX_LEVEL, Math.floor(source.level ?? 1)));
        const str = Math.max(PLAYER_BASE_STAT, Math.floor(source.str ?? PLAYER_BASE_STAT));
        const agi = Math.max(PLAYER_BASE_STAT, Math.floor(source.agi ?? PLAYER_BASE_STAT));
        const vit = Math.max(PLAYER_BASE_STAT, Math.floor(source.vit ?? PLAYER_BASE_STAT));
        const intStat = Math.max(PLAYER_BASE_STAT, Math.floor(source.int ?? PLAYER_BASE_STAT));
        const dex = Math.max(PLAYER_BASE_STAT, Math.floor(source.dex ?? PLAYER_BASE_STAT));
        const luk = Math.max(PLAYER_BASE_STAT, Math.floor(source.luk ?? PLAYER_BASE_STAT));

        const lukBonus = Math.floor((luk - 1) / 3);
        const attack = base.attack + (gear.attack ?? 0) + (str - 1) * 2 + lukBonus;
        const rangedAtk = base.attack + (gear.attack ?? 0) + (dex - 1) * 2 + lukBonus;
        const matk = 8 + (level - 1) * 2 + (intStat - 1) * 3 + lukBonus;
        const maxHp = base.maxHp + (gear.maxHp ?? 0) + (vit - 1) * 10;
        const maxSp = base.maxSp + (gear.maxSp ?? 0) + (intStat - 1) * 8;
        const softDef = vit - 1;
        const softMdef = intStat - 1;
        const hit = 100 + (level - 1) + (dex - 1) * 2;
        const flee = 100 + (level - 1) + (agi - 1) * 2;
        const aspd = Math.min(195, 150 + (agi - 1) * 2 + Math.floor((dex - 1) * 0.5));
        const attackCooldownMs = Math.max(180, Math.round(PLAYER_ATTACK_COOLDOWN_MS * (150 / aspd)));
        const critChance = Math.min(0.65, CombatCalculator.CRIT_CHANCE + (luk - 1) * 0.015);
        const perfectDodge = Math.min(25, 1 + Math.floor((luk - 1) * 0.5));
        const castReduction = Math.min(80, Math.round(((dex - 1) * 2 + (intStat - 1) * 0.8) * 10) / 10);
        const weightLimit = 200 + (str - 1) * 30;
        const hpRegen = PLAYER_REGEN_AMOUNT + Math.floor((vit - 1) / 2);
        const spRegen = 2 + Math.floor((intStat - 1) / 2);
        const stunResist = Math.min(80, (vit - 1) * 2);
        const curseResist = Math.min(80, (luk - 1) * 2);

        return {
            maxHp,
            maxSp,
            attack,
            rangedAtk,
            matk,
            softDef,
            softMdef,
            hit,
            flee,
            aspd,
            attackCooldownMs,
            critChance,
            perfectDodge,
            castReduction,
            weightLimit,
            hpRegen,
            spRegen,
            stunResist,
            curseResist,
        };
    }
    /** XP required to advance from `level` to `level + 1`. */
    static xpToNextLevel(level) {
        const safeLevel = Math.max(1, Math.min(PLAYER_MAX_LEVEL, Math.floor(level)));
        if (safeLevel >= PLAYER_MAX_LEVEL)
            return 0;
        return Math.floor(40 * Math.pow(safeLevel, 1.45));
    }
}
