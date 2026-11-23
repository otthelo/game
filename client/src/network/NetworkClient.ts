import { Callbacks, Client, Room } from "@colyseus/sdk";
import { ROOM_NAME, SERVER_URL } from "../config/gameConfig";
import { itemCatalog } from "../items/catalog";
import type {
  AttackMessage,
  BossSpawnEvent,
  BossSkillCastEvent,
  BossSkillExecuteEvent,
  ChatEvent,
  ChatMessage,
  CombatHitEvent,
  CombatMissEvent,
  DoorInfo,
  DoorOpenEvent,
  EquipItemMessage,
  EquipSlot,
  FriendEntry,
  FriendListEvent,
  GameState,
  InputMessage,
  InteractMessage,
  ItemEquippedEvent,
  ItemErrorEvent,
  ItemUsedEvent,
  JobChangedEvent,
  JobLevelUpEvent,
  JobErrorEvent,
  LevelUpEvent,
  LootAwardEvent,
  MonsterSpeakEvent,
  MonsterState,
  NpcDialogEvent,
  NpcState,
  PlayerDiedEvent,
  PlayerRespawnedEvent,
  SkillUsedEvent,
  PlayerState,
  PortalInfo,
  PortalUpdateEvent,
  PortalWarpEvent,
  StatErrorEvent,
  StatKey,
  TradeClosedEvent,
  TradeInviteEvent,
  TradeStateEvent,
  UnequipItemMessage,
  UseItemMessage,
  WelcomeEvent,
  XpAwardEvent,
  PartyData,
  PartyInviteEvent,
  PartyLeftEvent,
  PartyMemberData,
  ExpShareMode,
  ItemShareMode,
} from "../types";
import { ClientMessage, ServerMessage } from "../types";
import { Emitter } from "./Emitter";

/**
 * Narrow view of the Colyseus schema callbacks.
 *
 * The client mirrors the server schemas as plain interfaces (see types/index.ts),
 * so the generic `Callbacks` helper cannot infer collection keys. Declaring the
 * handful of callbacks this layer uses keeps everything else fully typed.
 */
interface StateCallbacks {
  onAdd<V>(property: string, handler: (value: V, key: string) => void, immediate?: boolean): () => void;
  onRemove<V>(property: string, handler: (value: V, key: string) => void): () => void;
  onChange(instance: object, handler: () => void): () => void;
}

type NetworkEvents = {
  ready: { sessionId: string; roomId: string };
  disconnected: { code: number; reason?: string };
  reconnecting: { attempt: number; maxAttempts: number };
  reconnected: { sessionId: string };
  error: Error;
  latency: number;
  welcome: WelcomeEvent;
  chat: ChatEvent;
  "combat:hit": CombatHitEvent;
  "combat:miss": CombatMissEvent;
  "player:add": { id: string; state: PlayerState };
  "player:remove": { id: string };
  "player:sync": { id: string; state: PlayerState };
  "player:levelup": LevelUpEvent;
  "player:died": PlayerDiedEvent;
  "player:respawned": PlayerRespawnedEvent;
  "monster:add": { id: string; state: MonsterState };
  "monster:remove": { id: string };
  "npc:add": { id: string; state: NpcState };
  "npc:remove": { id: string };
  "npc:dialog": NpcDialogEvent;
  "loot:award": LootAwardEvent;
  "xp:award": XpAwardEvent;
  "item:used": ItemUsedEvent;
  "item:equipped": ItemEquippedEvent;
  "item:error": ItemErrorEvent;
  "stat:error": StatErrorEvent;
  "trade:invite": TradeInviteEvent;
  "trade:state": TradeStateEvent;
  "trade:closed": TradeClosedEvent;
  "boss:spawn": BossSpawnEvent;
  "boss:skill:cast": BossSkillCastEvent;
  "boss:skill:execute": BossSkillExecuteEvent;
  "monster:speak": MonsterSpeakEvent;
  "player:jobchanged": JobChangedEvent;
  "player:joblevelup": JobLevelUpEvent;
  "job:error": JobErrorEvent;
  "portal:warp": PortalWarpEvent;
  "portal:update": PortalUpdateEvent;
  "door:open": DoorOpenEvent;
  "skill:used": SkillUsedEvent;
  "party:update": PartyData;
  "party:invite": PartyInviteEvent;
  "party:left": PartyLeftEvent;
  "party:member:update": Partial<PartyMemberData> & { characterId: string };
  "friend:list": FriendListEvent;
};

/**
 * Error raised by a failed join. Colyseus reports application-level rejections
 * (such as an invalid auth token) with a numeric code, which the menu uses to
 * decide whether the stored session should be discarded.
 */
export interface NetworkError extends Error {
  code?: number;
}

/**
 * Owns the Colyseus connection and exposes a Phaser-friendly API.
 *
 * State is decoded by the SDK into the snapshot maps below (kept up to date by
 * schema callbacks). The scenes read these maps instead of touching the wire
 * protocol directly. Player movement is NOT applied here: GameScene predicts
 * locally and reconciles using the `player:sync` event.
 */
export class NetworkClient {
  private readonly events = new Emitter<NetworkEvents>();
  private client: Client | null = null;
  private room: Room<any, GameState> | null = null;
  private pingTimer: number | null = null;
  private intentionalLeave = false;

  readonly players = new Map<string, PlayerState>();
  readonly monsters = new Map<string, MonsterState>();
  readonly npcs = new Map<string, NpcState>();
  /** Recent chat lines, so a scene that starts late can backfill its panel. */
  readonly chatLog: ChatEvent[] = [];

  latency = 0;
  connected = false;
  currentMapId = "verdant_hollow";
  portals: PortalInfo[] = [];
  doors: DoorInfo[] = [];
  party: PartyData | null = null;
  friends: FriendEntry[] = [];
  private lastToken = "";
  private lastCharacterId?: number;

  get sessionId(): string {
    return this.room?.sessionId ?? "";
  }

  get roomId(): string {
    return this.room?.roomId ?? "";
  }

  get state(): GameState | null {
    return (this.room?.state as GameState | undefined) ?? null;
  }

  on<K extends keyof NetworkEvents>(event: K, listener: (payload: NetworkEvents[K]) => void): () => void {
    return this.events.on(event, listener);
  }

  async connect(
    token: string,
    characterId?: number,
    mapId = "verdant_hollow",
    spawnX?: number,
    spawnY?: number,
  ): Promise<void> {
    if (this.room) return;

    this.lastToken = token;
    this.lastCharacterId = characterId;
    this.currentMapId = mapId;
    this.portals = [];
    this.doors = [];
    this.intentionalLeave = false;
    this.client = new Client(SERVER_URL);

    try {
      // The token is verified by GameRoom.onAuth before the player is admitted.
      const room = (await this.client.joinOrCreate<GameState>(ROOM_NAME, {
        token,
        characterId,
        mapId,
        spawnX,
        spawnY,
      })) as Room<any, GameState>;
      this.room = room;

      // Register message handlers synchronously after the handshake: the server
      // sends `welcome` and the "entered the realm" chat line immediately after
      // onJoin(), so any await before this point would drop those messages.
      this.registerMessageHandlers(room);
      this.registerLifecycleHandlers(room);

      // The first state frame may arrive after joinOrCreate() resolves. Wait
      // until the world rows are available before handing control to scenes.
      // (Callbacks registered below still fire once per existing entity.)
      await this.waitForWorldState();

      this.registerStateCallbacks(room);

      this.connected = true;
      this.events.emit("ready", { sessionId: room.sessionId, roomId: room.roomId });

      this.pingTimer = window.setInterval(() => {
        if (!this.room) return;
        this.room.ping((ms) => {
          this.latency = ms;
          this.events.emit("latency", ms);
        });
      }, 3000);
    } catch (error) {
      this.reset();
      const wrapped: NetworkError =
        error instanceof Error ? error : new Error(String(error));
      // Preserve Colyseus rejection codes (e.g. 4001 = invalid/expired session).
      const code = (error as { code?: unknown } | null)?.code;
      if (typeof code === "number") wrapped.code = code;

      this.events.emit("error", wrapped);
      throw wrapped;
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalLeave = true;
    const room = this.room;
    this.reset();

    if (room) {
      try {
        await room.leave();
      } catch {
        // The socket may already be closed; nothing else to clean up.
      }
    }
  }

  async warpToMap(targetMapId: string, spawnX: number, spawnY: number): Promise<void> {
    await this.disconnect();
    await this.connect(this.lastToken, this.lastCharacterId, targetMapId, spawnX, spawnY);
  }

  async reconnect(onAttempt?: (attempt: number, max: number) => void): Promise<boolean> {
    if (this.room && this.connected) return true;
    if (!this.lastToken) return false;

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt?.(attempt, maxAttempts);
      this.events.emit("reconnecting", { attempt, maxAttempts });
      try {
        await this.connect(
          this.lastToken,
          this.lastCharacterId,
          this.currentMapId,
        );
        if (this.connected && this.room) {
          this.events.emit("reconnected", { sessionId: this.sessionId });
          return true;
        }
      } catch {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 1200));
        }
      }
    }
    return false;
  }

  sendInput(input: InputMessage): void {
    this.room?.send(ClientMessage.Input, input);
  }

  sendChat(text: string, channel: "say" | "party" | "whisper" | "all" = "say"): void {
    const payload: ChatMessage = { text, channel };
    this.room?.send(ClientMessage.Chat, payload);
  }

  attack(targetId?: string): void {
    const payload: AttackMessage = targetId ? { targetId } : {};
    this.room?.send(ClientMessage.Attack, payload);
  }
  useSkill(skillId: "magnum-break" | "rebahan" | "baledog", targetId?: string): void {
    this.room?.send(ClientMessage.UseSkill, targetId ? { skillId, targetId } : { skillId });
  }

  interact(targetId: string): void {
    const payload: InteractMessage = { targetId };
    this.room?.send(ClientMessage.Interact, payload);
  }

  useItem(slot: number): void {
    const payload: UseItemMessage = { slot };
    this.room?.send(ClientMessage.UseItem, payload);
  }

  equipItem(slot: number): void {
    const payload: EquipItemMessage = { slot };
    this.room?.send(ClientMessage.EquipItem, payload);
  }

  unequipItem(slot: EquipSlot): void {
    const payload: UnequipItemMessage = { slot };
    this.room?.send(ClientMessage.UnequipItem, payload);
  }

  throwItem(slot: number, qty?: number): void {
    this.room?.send(ClientMessage.ThrowItem, qty !== undefined ? { slot, qty } : { slot });
  }

  moveItem(fromSlot: number, toSlot: number): void {
    this.room?.send(ClientMessage.MoveItem, { fromSlot, toSlot });
  }

  sortInventory(): void {
    this.room?.send(ClientMessage.SortInventory);
  }

  allocateStat(stat: StatKey, amount = 1): void {
    this.room?.send(ClientMessage.AllocateStat, { stat, amount });
  }

  requestTrade(targetSessionId: string): void {
    this.room?.send(ClientMessage.TradeRequest, { targetSessionId });
  }

  respondTrade(requesterId: string, accept: boolean): void {
    this.room?.send(ClientMessage.TradeRespond, { requesterId, accept });
  }

  updateTrade(items: Array<{ slot: number; qty: number }>, gold: number): void {
    this.room?.send(ClientMessage.TradeUpdate, { items, gold });
  }

  confirmTrade(confirmed: boolean): void {
    this.room?.send(ClientMessage.TradeConfirm, { confirmed });
  }

  cancelTrade(): void {
    this.room?.send(ClientMessage.TradeCancel, {});
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async waitForWorldState(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = this.state;
      if (state?.world?.rows && state.world.rows.length > 0) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }

    throw new Error("Server did not send the world state in time.");
  }

  private registerStateCallbacks(room: Room<any, GameState>): void {
    const callbacks = Callbacks.get(room as any) as unknown as StateCallbacks;

    callbacks.onAdd("players", (player: PlayerState, id: string) => {
      this.players.set(id, player);
      this.watchPlayer(callbacks, id, player);
      this.events.emit("player:add", { id, state: player });
    });

    callbacks.onRemove("players", (_player: PlayerState, id: string) => {
      this.players.delete(id);
      this.events.emit("player:remove", { id });
    });

    callbacks.onAdd("monsters", (monster: MonsterState, id: string) => {
      this.monsters.set(id, monster);
      this.events.emit("monster:add", { id, state: monster });
    });

    callbacks.onRemove("monsters", (_monster: MonsterState, id: string) => {
      this.monsters.delete(id);
      this.events.emit("monster:remove", { id });
    });

    callbacks.onAdd("npcs", (npc: NpcState, id: string) => {
      this.npcs.set(id, npc);
      this.events.emit("npc:add", { id, state: npc });
    });

    callbacks.onRemove("npcs", (_npc: NpcState, id: string) => {
      this.npcs.delete(id);
      this.events.emit("npc:remove", { id });
    });
  }

  private watchPlayer(callbacks: StateCallbacks, id: string, player: PlayerState): void {
    // One coalesced event per patch. The scene decides what changed (position,
    // ack, health, ...), which keeps the network layer free of game rules.
    callbacks.onChange(player, () => {
      this.events.emit("player:sync", { id, state: player });
    });
  }

  private registerMessageHandlers(room: Room<any, GameState>): void {
    room.onMessage(ServerMessage.Welcome, (payload: WelcomeEvent) => {
      itemCatalog.hydrate(payload.items);
      this.currentMapId = payload.mapId ?? this.currentMapId;
      this.portals = payload.portals ?? [];
      this.doors = payload.doors ?? [];
      this.events.emit("welcome", payload);
    });

    room.onMessage(ServerMessage.Chat, (payload: ChatEvent) => {
      this.pushChat(payload);
      this.events.emit("chat", payload);
    });

    room.onMessage(ServerMessage.CombatHit, (payload: CombatHitEvent) => {
      this.events.emit("combat:hit", payload);
    });

    room.onMessage(ServerMessage.CombatMiss, (payload: CombatMissEvent) => {
      this.events.emit("combat:miss", payload);
    });

    room.onMessage(ServerMessage.LevelUp, (payload: LevelUpEvent) => {
      this.events.emit("player:levelup", payload);
    });

    room.onMessage(ServerMessage.PlayerDied, (payload: PlayerDiedEvent) => {
      this.events.emit("player:died", payload);
    });

    room.onMessage(ServerMessage.PlayerRespawned, (payload: PlayerRespawnedEvent) => {
      this.events.emit("player:respawned", payload);
    });

    room.onMessage(ServerMessage.NpcDialog, (payload: NpcDialogEvent) => {
      this.events.emit("npc:dialog", payload);
    });

    room.onMessage(ServerMessage.LootAward, (payload: LootAwardEvent) => {
      this.events.emit("loot:award", payload);
    });

    room.onMessage(ServerMessage.XpAward, (payload: XpAwardEvent) => {
      this.events.emit("xp:award", payload);
    });

    room.onMessage(ServerMessage.ItemUsed, (payload: ItemUsedEvent) => {
      this.events.emit("item:used", payload);
    });

    room.onMessage(ServerMessage.ItemEquipped, (payload: ItemEquippedEvent) => {
      this.events.emit("item:equipped", payload);
    });

    room.onMessage(ServerMessage.ItemError, (payload: ItemErrorEvent) => {
      this.events.emit("item:error", payload);
    });

    room.onMessage(ServerMessage.StatError, (payload: StatErrorEvent) => {
      this.events.emit("stat:error", payload);
    });

    room.onMessage(ServerMessage.TradeInvite, (payload: TradeInviteEvent) => {
      this.events.emit("trade:invite", payload);
    });

    room.onMessage(ServerMessage.TradeState, (payload: TradeStateEvent) => {
      this.events.emit("trade:state", payload);
    });

    room.onMessage(ServerMessage.TradeClosed, (payload: TradeClosedEvent) => {
      this.events.emit("trade:closed", payload);
    });

    room.onMessage(ServerMessage.BossSpawn, (payload: BossSpawnEvent) => {
      this.events.emit("boss:spawn", payload);
    });

    room.onMessage(ServerMessage.BossSkillCast, (payload: BossSkillCastEvent) => {
      this.events.emit("boss:skill:cast", payload);
    });

    room.onMessage(ServerMessage.BossSkillExecute, (payload: BossSkillExecuteEvent) => {
      this.events.emit("boss:skill:execute", payload);
    });

    room.onMessage(ServerMessage.MonsterSpeak, (payload: MonsterSpeakEvent) => {
      this.events.emit("monster:speak", payload);
    });

    room.onMessage(ServerMessage.JobChanged, (payload: JobChangedEvent) => {
      this.events.emit("player:jobchanged", payload);
    });

    room.onMessage(ServerMessage.JobLevelUp, (payload: JobLevelUpEvent) => {
      this.events.emit("player:joblevelup", payload);
    });

    room.onMessage(ServerMessage.PortalWarp, (payload: PortalWarpEvent) => {
      this.events.emit("portal:warp", payload);
    });
    room.onMessage(ServerMessage.PortalUpdate, (payload: PortalUpdateEvent) => {
      const portal = this.portals.find((p) => p.id === payload.id);
      if (portal) portal.active = payload.active;
      this.events.emit("portal:update", payload);
    });
    room.onMessage(ServerMessage.DoorOpen, (payload: DoorOpenEvent) => {
      const door = this.doors.find((d) => d.id === payload.id);
      if (door) door.open = true;
      this.events.emit("door:open", payload);
    });
    room.onMessage(ServerMessage.SkillUsed, (payload: SkillUsedEvent) => {
      this.events.emit("skill:used", payload);
    });

    room.onMessage(ServerMessage.JobError, (payload: JobErrorEvent) => {
      this.events.emit("job:error", payload);
    });

    room.onMessage(ServerMessage.PartyUpdate, (payload: PartyData) => {
      this.party = payload;
      this.events.emit("party:update", payload);
    });

    room.onMessage(ServerMessage.PartyInvite, (payload: PartyInviteEvent) => {
      this.events.emit("party:invite", payload);
    });

    room.onMessage(ServerMessage.PartyLeft, (payload: PartyLeftEvent) => {
      this.party = null;
      this.events.emit("party:left", payload);
    });

    room.onMessage(ServerMessage.PartyMemberUpdate, (payload: Partial<PartyMemberData> & { characterId: string }) => {
      if (this.party) {
        const member = this.party.members.find((m) => m.characterId === payload.characterId);
        if (member) {
          Object.assign(member, payload);
        }
      }
      this.events.emit("party:member:update", payload);
    });

    room.onMessage(ServerMessage.FriendList, (payload: FriendListEvent) => {
      this.friends = payload.friends ?? [];
      this.events.emit("friend:list", payload);
    });
  }

  createParty(name?: string): void {
    this.room?.send(ClientMessage.PartyCreate, { name });
  }

  inviteToParty(targetId: string): void {
    this.room?.send(ClientMessage.PartyInvite, { targetId });
  }

  respondPartyInvite(partyId: string, accept: boolean): void {
    this.room?.send(ClientMessage.PartyRespond, { partyId, accept });
  }

  leaveParty(): void {
    this.room?.send(ClientMessage.PartyLeave, {});
  }

  kickPartyMember(memberId: string): void {
    this.room?.send(ClientMessage.PartyKick, { memberId });
  }

  updatePartySettings(settings: { expShare?: ExpShareMode; itemShare?: ItemShareMode }): void {
    this.room?.send(ClientMessage.PartySettings, settings);
  }

  addFriend(targetName: string): void {
    this.room?.send(ClientMessage.FriendAdd, { targetName });
  }

  removeFriend(targetName: string): void {
    this.room?.send(ClientMessage.FriendRemove, { targetName });
  }

  requestFriendList(): void {
    this.room?.send(ClientMessage.FriendList);
  }

  sendPartyChat(text: string): void {
    this.room?.send(ClientMessage.Chat, { text, channel: "party" });
  }

  changeJob(targetJobId: string): void {
    if (!this.room) return;
    this.room.send(ClientMessage.JobChange, { targetJobId });
  }

  private pushChat(event: ChatEvent): void {
    this.chatLog.push(event);
    if (this.chatLog.length > 40) this.chatLog.shift();
  }

  private registerLifecycleHandlers(room: Room<any, GameState>): void {
    room.onError((code, message) => {
      this.events.emit("error", new Error(`Server error ${code}${message ? `: ${message}` : ""}`));
    });

    room.onLeave((code, reason) => {
      const wasIntentional = this.intentionalLeave;
      this.reset();
      if (!wasIntentional) {
        this.events.emit("disconnected", { code, reason });
      }
    });
  }

  private reset(): void {
    this.connected = false;
    this.room = null;
    this.client = null;
    this.players.clear();
    this.monsters.clear();
    this.npcs.clear();
    this.party = null;
    this.chatLog.length = 0;

    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

/** Single shared connection for the whole client application. */
export const network = new NetworkClient();
