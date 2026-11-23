/**
 * Wire protocol shared by the server and mirrored in client/src/types/index.ts.
 * Keep both files in sync when adding a message.
 */
export const Direction = {
    Down: 0,
    Left: 1,
    Right: 2,
    Up: 3,
};
export const MonsterKind = {
    Slime: 0,
    Bat: 1,
    BlackAshura: 2,
    Marin: 3,
    Magmaring: 4,
    Poporing: 5,
    ForestStalker: 6,
    VenomPoring: 7,
    ShadowAshura: 8,
    MadBunny: 9,
    Huskar: 10,
    HighOrc: 11,
    Orc: 12,
    Pochi: 13,
    WhiteSnakeLady: 14,
};
export const MonsterStatus = {
    Idle: 0,
    Chase: 1,
    Attack: 2,
    Dead: 3,
    Cast: 4,
};
export const NpcKind = {
    Elder: 0,
    Merchant: 1,
    Guard: 2,
};
export const ItemKind = {
    Material: 0,
    Consumable: 1,
    Weapon: 2,
    Armor: 3,
    Wing: 4,
    Garment: 5,
};
export const ClientMessage = {
    Input: "input",
    Chat: "chat",
    Attack: "attack",
    Interact: "interact",
    UseItem: "item:use",
    EquipItem: "item:equip",
    UnequipItem: "item:unequip",
    ThrowItem: "item:throw",
    MoveItem: "item:move",
    SortInventory: "item:sort",
    AllocateStat: "stat:allocate",
    TradeRequest: "trade:request",
    TradeRespond: "trade:respond",
    TradeUpdate: "trade:update",
    TradeConfirm: "trade:confirm",
    TradeCancel: "trade:cancel",
    JobChange: "job:change",
    UseSkill: "skill:use",
    PartyCreate: "party:create",
    PartyInvite: "party:invite",
    PartyRespond: "party:respond",
    PartyLeave: "party:leave",
    PartyKick: "party:kick",
    PartySettings: "party:settings",
    FriendAdd: "friend:add",
    FriendRemove: "friend:remove",
    FriendList: "friend:list",
};
export const ServerMessage = {
    Welcome: "welcome",
    Chat: "chat",
    CombatHit: "combat:hit",
    CombatMiss: "combat:miss",
    LevelUp: "player:levelup",
    PlayerDied: "player:died",
    PlayerRespawned: "player:respawned",
    NpcDialog: "npc:dialog",
    LootAward: "loot:award",
    XpAward: "xp:award",
    ItemUsed: "item:used",
    ItemEquipped: "item:equipped",
    ItemError: "item:error",
    StatError: "stat:error",
    TradeInvite: "trade:invite",
    TradeState: "trade:state",
    TradeClosed: "trade:closed",
    BossSpawn: "boss:spawn",
    BossSkillCast: "boss:skill:cast",
    BossSkillExecute: "boss:skill:execute",
    MonsterSpeak: "monster:speak",
    JobChanged: "player:jobchanged",
    JobLevelUp: "player:joblevelup",
    JobError: "job:error",
    PortalWarp: "portal:warp",
    PortalUpdate: "portal:update",
    DoorOpen: "door:open",
    SkillUsed: "skill:used",
    PartyUpdate: "party:update",
    PartyInvite: "party:invite",
    PartyLeft: "party:left",
    PartyMemberUpdate: "party:member:update",
    FriendList: "friend:list",
};

export type ExpShareMode = "even" | "individual";
export type ItemShareMode = "each_take" | "party_share";

export interface PartyMemberData {
    sessionId: string;
    characterId: string;
    name: string;
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
}

export interface PartyData {
    id: string;
    name: string;
    leaderId: string;
    expShare: ExpShareMode;
    itemShare: ItemShareMode;
    members: PartyMemberData[];
}
