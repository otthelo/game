export interface PartyExpCandidate {
    characterId: string;
    sessionId: string;
    baseLevel: number;
    mapId: string;
    x: number;
    y: number;
    isAlive: boolean;
}

export interface ExpShareResult {
    rewards: Map<string, { baseExp: number; jobExp: number; sessionId: string }>;
    evenShareActive: boolean;
}

/**
 * Calculates Ragnarok Online-style party experience distribution:
 * - Leech prevention: candidate must be alive, on the same map, and within maxRadius (default 450px)
 * - Level Gap validation: maxLevel - minLevel <= maxLevelGap (default 15) for Even Share
 * - Party Bonus: +10% EXP per extra candidate (capped at +50%)
 * - Even Share divides the boosted total equally among all eligible candidates
 * - Fallback to Individual (killer takes full raw EXP) if conditions fail
 */
export function calculatePartyExp(
    rawBaseExp: number,
    rawJobExp: number,
    expShareMode: "even" | "individual",
    monsterPos: { mapId: string; x: number; y: number },
    members: PartyExpCandidate[],
    killerId: string,
    maxRadius = 450,
    maxLevelGap = 15,
    bonusPerMember = 0.1
): ExpShareResult {
    const rewards = new Map<string, { baseExp: number; jobExp: number; sessionId: string }>();

    const killer = members.find((m) => m.characterId === killerId || m.sessionId === killerId);
    const killerSessionId = killer?.sessionId ?? killerId;

    // Leech prevention: same map, alive, and within radius of monster death
    const eligible = members.filter((m) => {
        if (!m.isAlive || m.mapId !== monsterPos.mapId) return false;
        const dist = Math.hypot(m.x - monsterPos.x, m.y - monsterPos.y);
        return dist <= maxRadius;
    });

    if (eligible.length <= 1) {
        rewards.set(killerId, { baseExp: rawBaseExp, jobExp: rawJobExp, sessionId: killerSessionId });
        return { rewards, evenShareActive: false };
    }

    const levels = eligible.map((m) => m.baseLevel);
    const levelGap = Math.max(...levels) - Math.min(...levels);
    const evenShareActive = expShareMode === "even" && levelGap <= maxLevelGap;

    if (!evenShareActive) {
        // Individual mode or level gap exceeded: killer gets normal EXP
        rewards.set(killerId, { baseExp: rawBaseExp, jobExp: rawJobExp, sessionId: killerSessionId });
        return { rewards, evenShareActive: false };
    }

    // RO Party Bonus: +10% per extra candidate, capped at +50%
    const extraCount = Math.max(0, eligible.length - 1);
    const multiplier = 1 + Math.min(extraCount * bonusPerMember, 0.5);

    const totalBase = Math.floor(rawBaseExp * multiplier);
    const totalJob = Math.floor(rawJobExp * multiplier);

    const shareBase = Math.max(1, Math.floor(totalBase / eligible.length));
    const shareJob = Math.max(1, Math.floor(totalJob / eligible.length));

    for (const member of eligible) {
        rewards.set(member.characterId, {
            baseExp: shareBase,
            jobExp: shareJob,
            sessionId: member.sessionId,
        });
    }

    return { rewards, evenShareActive: true };
}
