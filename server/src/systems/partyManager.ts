import { ServerMessage, type ExpShareMode, type ItemShareMode, type PartyData, type PartyMemberData } from "../types/protocol.js";
import { logger } from "../utils/logger.js";
import type { PartyExpCandidate } from "./partyExp.js";

export const MAX_PARTY_MEMBERS = 12;
export const MAX_EVEN_SHARE_GAP = 15;
export const PARTY_INVITE_TTL_MS = 30_000;

export interface InternalPartyMember {
    characterId: string;
    name: string;
    sessionId: string;
    jobId: string;
    level: number;
    jobLevel: number;
    hp: number;
    maxHp: number;
    sp: number;
    maxSp: number;
    mapId: string;
    x: number;
    y: number;
    online: boolean;
    isLeader: boolean;
    room?: any; // GameRoom reference for sending messages
}

export interface InternalParty {
    id: string;
    name: string;
    leaderId: string; // characterId or name
    expShare: ExpShareMode;
    itemShare: ItemShareMode;
    members: Map<string, InternalPartyMember>; // key = characterId
    itemShareIndex: number;
}

interface PendingInvite {
    partyId: string;
    partyName: string;
    inviterName: string;
    inviterId: string;
    expiresAt: number;
}

export class PartyManager {
    private static _instance: PartyManager;

    static get instance(): PartyManager {
        if (!PartyManager._instance) {
            PartyManager._instance = new PartyManager();
        }
        return PartyManager._instance;
    }

    private parties = new Map<string, InternalParty>();
    private playerToParty = new Map<string, string>(); // characterId -> partyId
    private pendingInvites = new Map<string, PendingInvite>(); // target characterId -> invite
    private partySeq = 0;

    /**
     * Finds party by character identifier (characterId or name fallback).
     */
    getPartyByPlayer(characterId: string): InternalParty | undefined {
        const partyId = this.playerToParty.get(characterId);
        if (!partyId) return undefined;
        return this.parties.get(partyId);
    }

    /**
     * Creates a new party with the given creator as leader.
     */
    createParty(
        creator: Omit<InternalPartyMember, "isLeader" | "online">,
        partyName?: string
    ): { party: InternalParty; error?: string } {
        if (this.playerToParty.has(creator.characterId)) {
            return { party: null as any, error: "Kamu sudah memiliki party." };
        }

        const id = `party_${Date.now()}_${++this.partySeq}`;
        const name = (partyName?.trim() || `${creator.name}'s Party`).slice(0, 24);

        const member: InternalPartyMember = {
            ...creator,
            online: true,
            isLeader: true,
        };

        const party: InternalParty = {
            id,
            name,
            leaderId: creator.characterId,
            expShare: "individual",
            itemShare: "each_take",
            members: new Map([[creator.characterId, member]]),
            itemShareIndex: 0,
        };

        this.parties.set(id, party);
        this.playerToParty.set(creator.characterId, id);

        this.broadcastPartyUpdate(party);
        this.sendSystemNoticeToMember(member, `Party "${name}" berhasil dibuat! Kamu adalah Leader.`);

        logger.info(`Party "${name}" (${id}) created by ${creator.name}`);
        return { party };
    }

    /**
     * Sends a party invite from inviter to target.
     */
    invite(
        inviterId: string,
        target: { characterId: string; name: string; sessionId: string; room: any }
    ): { success: boolean; reason?: string } {
        let party = this.getPartyByPlayer(inviterId);

        // If inviter has no party, reject or require creating party
        if (!party) {
            return { success: false, reason: "Kamu harus membuat party terlebih dahulu." };
        }

        if (party.leaderId !== inviterId) {
            return { success: false, reason: "Hanya Ketua Party yang dapat mengundang anggota." };
        }

        if (party.members.size >= MAX_PARTY_MEMBERS) {
            return { success: false, reason: "Party sudah penuh (maksimal 12 anggota)." };
        }

        if (this.playerToParty.has(target.characterId)) {
            return { success: false, reason: `${target.name} sudah bergabung dalam party lain.` };
        }

        const now = Date.now();
        const pending = this.pendingInvites.get(target.characterId);
        if (pending && pending.expiresAt > now) {
            return { success: false, reason: `${target.name} sedang memiliki undangan tertunda.` };
        }

        const inviterMember = party.members.get(inviterId);
        const inviterName = inviterMember?.name ?? "Leader";

        this.pendingInvites.set(target.characterId, {
            partyId: party.id,
            partyName: party.name,
            inviterName,
            inviterId,
            expiresAt: now + PARTY_INVITE_TTL_MS,
        });

        // Send invite prompt to target client
        const client = target.room?.clients?.find((c: any) => c.sessionId === target.sessionId);
        if (client) {
            client.send(ServerMessage.PartyInvite, {
                partyId: party.id,
                partyName: party.name,
                inviterName,
                inviterId,
            });
        }

        return { success: true };
    }

    /**
     * Handles target's response to an invite.
     */
    respondInvite(
        target: Omit<InternalPartyMember, "isLeader" | "online">,
        partyId: string,
        accept: boolean
    ): { success: boolean; reason?: string } {
        const invite = this.pendingInvites.get(target.characterId);
        this.pendingInvites.delete(target.characterId);

        if (!invite || invite.partyId !== partyId || invite.expiresAt < Date.now()) {
            return { success: false, reason: "Undangan party sudah kadaluarsa atau tidak valid." };
        }

        const party = this.parties.get(partyId);
        if (!party) {
            return { success: false, reason: "Party sudah tidak ada." };
        }

        if (!accept) {
            // Notify leader
            const leader = party.members.get(party.leaderId);
            if (leader) {
                this.sendSystemNoticeToMember(leader, `${target.name} menolak undangan party.`);
            }
            return { success: true };
        }

        if (this.playerToParty.has(target.characterId)) {
            return { success: false, reason: "Kamu sudah tergabung dalam party lain." };
        }

        if (party.members.size >= MAX_PARTY_MEMBERS) {
            return { success: false, reason: "Party sudah penuh." };
        }

        const newMember: InternalPartyMember = {
            ...target,
            online: true,
            isLeader: false,
        };

        party.members.set(target.characterId, newMember);
        this.playerToParty.set(target.characterId, party.id);

        this.broadcastPartyUpdate(party);
        this.broadcastSystemToParty(party, `${newMember.name} telah bergabung ke dalam party!`);

        // If party is in even share, verify level gap doesn't break
        if (party.expShare === "even") {
            const levels = Array.from(party.members.values()).filter((m) => m.online).map((m) => m.level);
            const gap = Math.max(...levels) - Math.min(...levels);
            if (gap > MAX_EVEN_SHARE_GAP) {
                party.expShare = "individual";
                this.broadcastPartyUpdate(party);
                this.broadcastSystemToParty(
                    party,
                    `[PARTY] Even Share otomatis dinonaktifkan karena selisih level anggota (${gap}) melebihi batas ${MAX_EVEN_SHARE_GAP} level.`
                );
            }
        }

        return { success: true };
    }

    /**
     * Removes a player from their party (leave or kick).
     */
    leaveParty(characterId: string, isKick = false, kickerName = ""): { success: boolean; reason?: string } {
        const partyId = this.playerToParty.get(characterId);
        if (!partyId) return { success: false, reason: "Tidak sedang dalam party." };

        const party = this.parties.get(partyId);
        if (!party) {
            this.playerToParty.delete(characterId);
            return { success: true };
        }

        const member = party.members.get(characterId);
        const memberName = member?.name ?? "Anggota";

        // Notify the leaving member
        if (member?.room && member?.sessionId) {
            const client = member.room.clients?.find((c: any) => c.sessionId === member.sessionId);
            if (client) {
                client.send(ServerMessage.PartyLeft, {
                    reason: isKick
                        ? `Kamu telah dikeluarkan dari party oleh ${kickerName}.`
                        : "Kamu telah meninggalkan party.",
                });
            }
        }

        party.members.delete(characterId);
        this.playerToParty.delete(characterId);

        // If party is empty, remove it
        if (party.members.size === 0) {
            this.parties.delete(partyId);
            logger.info(`Party "${party.name}" (${partyId}) disbanded (no members).`);
            return { success: true };
        }

        // If leader left, promote the next member
        if (party.leaderId === characterId) {
            const nextLeader = party.members.values().next().value as InternalPartyMember;
            if (nextLeader) {
                nextLeader.isLeader = true;
                party.leaderId = nextLeader.characterId;
                this.broadcastSystemToParty(party, `${nextLeader.name} sekarang adalah Ketua Party baru!`);
            }
        }

        const notice = isKick
            ? `${memberName} telah dikeluarkan dari party.`
            : `${memberName} telah meninggalkan party.`;
        this.broadcastSystemToParty(party, notice);
        this.broadcastPartyUpdate(party);

        return { success: true };
    }

    /**
     * Kicks a member by leader.
     */
    kickMember(leaderId: string, targetId: string): { success: boolean; reason?: string } {
        const party = this.getPartyByPlayer(leaderId);
        if (!party) return { success: false, reason: "Kamu tidak sedang dalam party." };
        if (party.leaderId !== leaderId) return { success: false, reason: "Hanya Ketua Party yang dapat mengeluarkan anggota." };
        if (leaderId === targetId) return { success: false, reason: "Ketua tidak dapat menendang diri sendiri (gunakan tinggalkan party)." };
        if (!party.members.has(targetId)) return { success: false, reason: "Pemain bukan anggota party ini." };

        const leader = party.members.get(leaderId);
        return this.leaveParty(targetId, true, leader?.name ?? "Leader");
    }

    /**
     * Updates party settings (Even Share vs Individual, Each Take vs Party Share).
     */
    updateSettings(
        leaderId: string,
        settings: { expShare?: ExpShareMode; itemShare?: ItemShareMode }
    ): { success: boolean; reason?: string } {
        const party = this.getPartyByPlayer(leaderId);
        if (!party) return { success: false, reason: "Kamu tidak sedang dalam party." };
        if (party.leaderId !== leaderId) return { success: false, reason: "Hanya Ketua Party yang dapat mengubah aturan party." };

        if (settings.expShare) {
            if (settings.expShare === "even") {
                const onlineMembers = Array.from(party.members.values()).filter((m) => m.online);
                if (onlineMembers.length > 1) {
                    const levels = onlineMembers.map((m) => m.level);
                    const gap = Math.max(...levels) - Math.min(...levels);
                    if (gap > MAX_EVEN_SHARE_GAP) {
                        return {
                            success: false,
                            reason: `Gagal mengaktifkan Even Share: Selisih level anggota (${gap}) melebihi batas maksimal ${MAX_EVEN_SHARE_GAP} level.`,
                        };
                    }
                }
                party.expShare = "even";
                this.broadcastSystemToParty(party, `[PARTY] Aturan EXP diubah ke: Even Share (+10% Bonus per anggota aktif)!`);
            } else {
                party.expShare = "individual";
                this.broadcastSystemToParty(party, `[PARTY] Aturan EXP diubah ke: Each Take (Individual).`);
            }
        }

        if (settings.itemShare) {
            party.itemShare = settings.itemShare;
            const modeName = settings.itemShare === "party_share" ? "Party Share (Bergiliran)" : "Each Take (Masing-masing)";
            this.broadcastSystemToParty(party, `[PARTY] Aturan Item Drop diubah ke: ${modeName}.`);
        }

        this.broadcastPartyUpdate(party);
        return { success: true };
    }

    /**
     * Updates a member's position/vitals and syncs to party members.
     */
    updateMemberPresence(
        characterId: string,
        data: Partial<InternalPartyMember> & { room?: any }
    ): void {
        const party = this.getPartyByPlayer(characterId);
        if (!party) return;

        const member = party.members.get(characterId);
        if (!member) return;

        let changed = false;
        if (data.room !== undefined) member.room = data.room;
        if (data.sessionId !== undefined && member.sessionId !== data.sessionId) {
            member.sessionId = data.sessionId;
            changed = true;
        }
        if (data.online !== undefined && member.online !== data.online) {
            member.online = data.online;
            changed = true;
        }
        if (data.mapId !== undefined && member.mapId !== data.mapId) {
            member.mapId = data.mapId;
            changed = true;
        }
        if (data.hp !== undefined) member.hp = data.hp;
        if (data.maxHp !== undefined) member.maxHp = data.maxHp;
        if (data.sp !== undefined) member.sp = data.sp;
        if (data.maxSp !== undefined) member.maxSp = data.maxSp;
        if (data.level !== undefined) member.level = data.level;
        if (data.jobLevel !== undefined) member.jobLevel = data.jobLevel;
        if (data.jobId !== undefined) member.jobId = data.jobId;
        if (data.x !== undefined) member.x = data.x;
        if (data.y !== undefined) member.y = data.y;

        if (changed) {
            this.broadcastPartyUpdate(party);
        } else {
            // Lightweight update
            this.broadcastMemberVitals(party, member);
        }
    }

    /**
     * Marks player offline on disconnect without removing them immediately.
     */
    onPlayerDisconnect(characterId: string): void {
        const party = this.getPartyByPlayer(characterId);
        if (!party) return;
        const member = party.members.get(characterId);
        if (!member) return;

        member.online = false;
        this.broadcastPartyUpdate(party);
    }

    /**
     * Returns candidates for party experience distribution.
     */
    getPartyCandidates(partyId: string): PartyExpCandidate[] {
        const party = this.parties.get(partyId);
        if (!party) return [];

        const candidates: PartyExpCandidate[] = [];
        for (const m of party.members.values()) {
            candidates.push({
                characterId: m.characterId,
                sessionId: m.sessionId,
                baseLevel: m.level,
                mapId: m.mapId,
                x: m.x,
                y: m.y,
                isAlive: m.hp > 0 && m.online,
            });
        }
        return candidates;
    }

    /**
     * Selects next round-robin member for party item sharing who is online, alive, same map & in radius.
     */
    getNextItemShareRecipient(
        partyId: string,
        mapId: string,
        pos: { x: number; y: number },
        fallbackSessionId: string,
        maxRadius = 450
    ): InternalPartyMember | undefined {
        const party = this.parties.get(partyId);
        if (!party) return undefined;

        const eligible = Array.from(party.members.values()).filter((m) => {
            if (!m.online || m.hp <= 0 || m.mapId !== mapId) return false;
            return Math.hypot(m.x - pos.x, m.y - pos.y) <= maxRadius;
        });

        if (eligible.length === 0) return undefined;
        if (eligible.length === 1) return eligible[0];

        // Round-robin selection
        party.itemShareIndex = (party.itemShareIndex + 1) % eligible.length;
        return eligible[party.itemShareIndex];
    }

    /**
     * Distributes Party Chat to all party members across any room.
     */
    sendPartyChat(partyId: string, senderName: string, senderSessionId: string, text: string): void {
        const party = this.parties.get(partyId);
        if (!party) return;

        const now = Date.now();
        const event = {
            id: `party-chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sessionId: senderSessionId,
            name: senderName,
            text,
            channel: "party",
            at: now,
        };

        for (const member of party.members.values()) {
            if (!member.online || !member.room) continue;
            const client = member.room.clients?.find((c: any) => c.sessionId === member.sessionId);
            if (client) {
                client.send(ServerMessage.Chat, event);
            }
        }
    }

    /**
     * Serializes party data for network synchronization.
     */
    private serializeParty(party: InternalParty): PartyData {
        const members: PartyMemberData[] = [];
        for (const m of party.members.values()) {
            members.push({
                sessionId: m.sessionId,
                characterId: m.characterId,
                name: m.name,
                jobId: m.jobId,
                level: m.level,
                jobLevel: m.jobLevel,
                hp: m.hp,
                maxHp: m.maxHp,
                sp: m.sp,
                maxSp: m.maxSp,
                mapId: m.mapId,
                x: m.x,
                y: m.y,
                online: m.online,
                isLeader: m.isLeader,
            });
        }

        return {
            id: party.id,
            name: party.name,
            leaderId: party.leaderId,
            expShare: party.expShare,
            itemShare: party.itemShare,
            members,
        };
    }

    /**
     * Broadcasts full PartyUpdate event to all connected members.
     */
    broadcastPartyUpdate(party: InternalParty): void {
        const data = this.serializeParty(party);
        for (const member of party.members.values()) {
            if (!member.online || !member.room) continue;
            const client = member.room.clients?.find((c: any) => c.sessionId === member.sessionId);
            if (client) {
                client.send(ServerMessage.PartyUpdate, data);
            }
        }
    }

    /**
     * Broadcasts lightweight vitals update to party members.
     */
    private broadcastMemberVitals(party: InternalParty, member: InternalPartyMember): void {
        const data: Partial<PartyMemberData> & { characterId: string } = {
            characterId: member.characterId,
            hp: member.hp,
            maxHp: member.maxHp,
            sp: member.sp,
            maxSp: member.maxSp,
            x: member.x,
            y: member.y,
            mapId: member.mapId,
            level: member.level,
            jobLevel: member.jobLevel,
            online: member.online,
        };

        for (const m of party.members.values()) {
            if (!m.online || !m.room) continue;
            const client = m.room.clients?.find((c: any) => c.sessionId === m.sessionId);
            if (client) {
                client.send(ServerMessage.PartyMemberUpdate, data);
            }
        }
    }

    /**
     * Broadcasts a system chat line to the whole party.
     */
    broadcastSystemToParty(party: InternalParty, text: string): void {
        const now = Date.now();
        const event = {
            id: `party-sys-${now}-${Math.random().toString(36).slice(2, 6)}`,
            sessionId: "system",
            name: "Party",
            text,
            channel: "party",
            at: now,
        };

        for (const member of party.members.values()) {
            if (!member.online || !member.room) continue;
            const client = member.room.clients?.find((c: any) => c.sessionId === member.sessionId);
            if (client) {
                client.send(ServerMessage.Chat, event);
            }
        }
    }

    private sendSystemNoticeToMember(member: InternalPartyMember, text: string): void {
        if (!member.room) return;
        const client = member.room.clients?.find((c: any) => c.sessionId === member.sessionId);
        if (client) {
            client.send(ServerMessage.Chat, {
                id: `party-notice-${Date.now()}`,
                sessionId: "system",
                name: "System",
                text,
                channel: "system",
                at: Date.now(),
            });
        }
    }
}
