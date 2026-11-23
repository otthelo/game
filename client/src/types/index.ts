/**
 * Client-side views of the synchronized Colyseus state, plus the wire messages.
 *
 * Colyseus decodes the server schema into plain MapSchema/ArraySchema instances,
 * so these interfaces intentionally mirror the server schemas. They are used for
 * type-safety only; the runtime objects are owned by the SDK.
 */

// Keep in sync with server/src/schemas/*.ts
export interface WorldState {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  rows: string[];
}

export interface PlayerState {
  sessionId: string;
  name: string;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  level: number;
  xp: number;
  xpToNext: number;
  jobId: string;
  jobLevel: number;
  jobXp: number;
  jobXpToNext: number;
  attack: number;
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
  statPoints: number;
  outfit: number;
  lastProcessedInput: number;
  gold: number;
  weaponId: string;
  armorId: string;
  wingId: string;
  garmentId: string;
  gmLevel: number;
  frozen?: boolean;
  resting?: boolean;
  /** Satchel slots keyed by the stringified index ("0".."15"). */
  inventory: Map<string, InventorySlotState>;
}

export interface InventorySlotState {
  itemId: string;
  qty: number;
}

export interface MonsterState {
  id: string;
  kind: number;
  name: string;
  x: number;
  y: number;
  dir: number;
  hp: number;
  maxHp: number;
  state: number;
}

export interface NpcState {
  id: string;
  name: string;
  x: number;
  y: number;
  dir: number;
  kind: number;
}

export interface GameState {
  world: WorldState;
  players: Map<string, PlayerState>;
  monsters: Map<string, MonsterState>;
  npcs: Map<string, NpcState>;
  tick: number;
}

export const Direction = {
  Down: 0,
  Left: 1,
  Right: 2,
  Up: 3,
} as const;

export type DirectionValue = (typeof Direction)[keyof typeof Direction];

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
} as const;

export const MonsterStatus = {
  Idle: 0,
  Chase: 1,
  Attack: 2,
  Dead: 3,
  Cast: 4,
} as const;

export const NpcKind = {
  Elder: 0,
  Merchant: 1,
  Guard: 2,
} as const;

export const ItemKind = {
  Material: 0,
  Consumable: 1,
  Weapon: 2,
  Armor: 3,
  Wing: 4,
  Garment: 5,
} as const;

export type ItemKindValue = (typeof ItemKind)[keyof typeof ItemKind];

export type EquipSlot = "weapon" | "armor" | "wing" | "garment";

export type StatKey = "str" | "agi" | "vit" | "int" | "dex" | "luk";

// ---------------------------------------------------------------------------
// Wire messages
// Keep in sync with server/src/types/protocol.ts
// ---------------------------------------------------------------------------

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
} as const;

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
} as const;

export interface FriendEntry {
  name: string;
  online: boolean;
  mapId?: string;
}

export interface FriendListEvent {
  friends: FriendEntry[];
}

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

export interface PartyInviteEvent {
  partyId: string;
  partyName: string;
  inviterName: string;
  inviterId: string;
}

export interface PartyLeftEvent {
  reason?: string;
}

export interface InputMessage {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type ChatSendChannel = "say" | "party" | "whisper" | "all";

export interface ChatMessage {
  text: string;
  channel?: ChatSendChannel;
}

export interface AttackMessage {
  targetId?: string;
}

export interface InteractMessage {
  targetId: string;
}

export interface UseItemMessage {
  slot: number;
}

export interface EquipItemMessage {
  slot: number;
}

export interface UnequipItemMessage {
  slot: EquipSlot;
}

export interface ItemDefinition {
  id: string;
  name: string;
  kind: ItemKindValue;
  icon: string;
  color: string;
  description: string;
  stackLimit: number;
  sellPrice: number;
  heal?: number;
  attack?: number;
  maxHp?: number;
  maxSp?: number;
}

export interface PortalInfo {
  id: string;
  label: string;
  x: number;
  y: number;
  targetMapId: string;
  targetMapName: string;
  active?: boolean;
}

export interface DoorInfo {
  id: string;
  name: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  open: boolean;
  keyItemId: string;
  keyName: string;
}

export interface DoorOpenEvent {
  id: string;
  tx: number;
  ty: number;
  openedBy: string;
}

export interface PortalUpdateEvent {
  id: string;
  active: boolean;
}

export interface PortalWarpEvent {
  targetMapId: string;
  targetMapName: string;
  spawnX: number;
  spawnY: number;
}

export interface WelcomeEvent {
  sessionId: string;
  roomId: string;
  mapId?: string;
  tickRate: number;
  serverVersion: string;
  at: number;
  items: ItemDefinition[];
  portals?: PortalInfo[];
  doors?: DoorInfo[];
}

export interface ChatEvent {
  id: string;
  sessionId?: string;
  name: string;
  text: string;
  channel: "say" | "system" | "broadcast" | "party" | "whisper" | "all";
  at: number;
}

export interface CombatHitEvent {
  attackerId: string;
  targetId: string;
  targetType: "player" | "monster";
  targetName: string;
  damage: number;
  crit: boolean;
  hp: number;
  maxHp: number;
  killed: boolean;
  skillId?: SkillId;
  at: number;
}

export type SkillId = "magnum-break" | "rebahan" | "baledog";

export interface SkillUsedEvent {
  casterId: string;
  skillId: SkillId;
  skillName: string;
  x: number;
  y: number;
  radius: number;
  targetX?: number;
  targetY?: number;
  at: number;
}

export interface CombatMissEvent {
  reason: "no-target" | "out-of-range" | "cooldown" | "dead";
}

export interface LevelUpEvent {
  sessionId: string;
  level: number;
  maxHp: number;
  attack: number;
  statPoints?: number;
}

export interface PlayerDiedEvent {
  sessionId: string;
  name: string;
  respawnInMs: number;
}

export interface PlayerRespawnedEvent {
  sessionId: string;
  name: string;
  hp: number;
}

export interface NpcDialogEvent {
  npcId: string;
  npcName: string;
  text: string;
}

export interface LootItemStack {
  itemId: string;
  qty: number;
}

export interface LootAwardEvent {
  monsterId: string;
  monsterName: string;
  gold: number;
  items: LootItemStack[];
  overflow: boolean;
  at: number;
}

export interface XpAwardEvent {
  monsterName: string;
  xp: number;
}

export interface ItemUsedEvent {
  slot: number;
  itemId: string;
  healed: number;
  hp: number;
  maxHp: number;
}

export interface ItemEquippedEvent {
  action: "equip" | "unequip";
  itemId: string;
  slot: EquipSlot;
  attack: number;
  maxHp: number;
  hp: number;
}

export type ItemErrorReason =
  | "dead"
  | "cooldown"
  | "empty"
  | "not-usable"
  | "not-equippable"
  | "full-hp"
  | "inventory-full";

export interface ItemErrorEvent {
  reason: ItemErrorReason;
}

export interface AllocateStatMessage {
  stat: StatKey;
  amount?: number;
}

export interface StatErrorEvent {
  reason: "invalid" | "no-points";
}

export interface TradeOfferItem {
  slot: number;
  itemId: string;
  qty: number;
}

export interface TradeSideState {
  sessionId: string;
  name: string;
  items: TradeOfferItem[];
  gold: number;
  confirmed: boolean;
}

export interface TradeInviteEvent {
  requesterId: string;
  requesterName: string;
}

export interface TradeStateEvent {
  tradeId: string;
  me: TradeSideState;
  partner: TradeSideState;
}

export interface TradeClosedEvent {
  reason:
    | "completed"
    | "cancelled"
    | "declined"
    | "disconnected"
    | "out-of-range"
    | "busy"
    | "error";
  message?: string;
}

export interface BossSpawnEvent {
  name: string;
  level: number;
  x: number;
  y: number;
}

export interface BossSkillCastEvent {
  bossId: string;
  skillName: string;
  x: number;
  y: number;
  radius: number;
  castDurationMs: number;
  targetX?: number;
  targetY?: number;
}

export interface BossSkillExecuteEvent {
  bossId: string;
  skillName: string;
  x: number;
  y: number;
  radius: number;
  hitPlayerIds: string[];
  frozenPlayerIds?: string[];
  targetX?: number;
  targetY?: number;
}

export interface MonsterSpeakEvent {
  monsterId: string;
  text: string;
}

export interface JobChangedEvent {
  sessionId: string;
  jobId: string;
  jobLevel: number;
  jobXpToNext: number;
}

export interface JobLevelUpEvent {
  sessionId: string;
  jobId: string;
  jobLevel: number;
  jobXpToNext: number;
}

export interface JobErrorEvent {
  reason: string;
}

export interface CharacterSummary {
  id: number;
  name: string;
  level: number;
  jobId?: string;
  jobLevel?: number;
  outfit: number;
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
}
