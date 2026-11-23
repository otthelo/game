import Phaser from "phaser";
import {
  ATTACK_ANIMATION_MS,
  ATTACK_COOLDOWN_MS,
  CAMERA_LERP,
  CAMERA_ZOOM,
  CORRECTION_MS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SCENE_KEYS,
  SNAP_DISTANCE,
  TICK_MS,
  UI_FONT,
} from "../config/gameConfig";
import { Monster } from "../entities/Monster";
import { NPC } from "../entities/NPC";
import { Player } from "../entities/Player";
import { itemName } from "../items/catalog";
import { network } from "../network/NetworkClient";
import {
  type BossSkillCastEvent,
  type BossSkillExecuteEvent,
  type CombatHitEvent,
  type CombatMissEvent,
  type GameState,
  type InputMessage,
  type ItemUsedEvent,
  type LootAwardEvent,
  type MonsterState,
  type NpcDialogEvent,
  type NpcState,
  type PlayerDiedEvent,
  type PlayerRespawnedEvent,
  type PlayerState,
  type SkillUsedEvent,
} from "../types";
import { applyMovement, isBlocked, type Movable, type WorldGrid } from "../utils/movement";
import type { UIScene } from "./UIScene";

interface PredictedPose extends Movable {
  dir: number;
  moving: boolean;
}

/**
 * The world scene. Responsibilities:
 *  - draw the server-provided tile map,
 *  - render players/monsters/NPCs,
 *  - capture input and send it to the server at a fixed 30 Hz,
 *  - predict the local player and reconcile against authoritative snapshots,
 *  - interpolate remote entities,
 *  - translate gameplay events into particles, floating text and camera feedback.
 */
export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private grid: WorldGrid = { rows: [], tileSize: 32 };
  private localSessionId = "";
  private localState?: PlayerState;
  private localPlayer?: Player;

  private readonly players = new Map<string, Player>();
  private readonly monsters = new Map<string, Monster>();
  private readonly npcs = new Map<string, NPC>();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private attackKeyHandler?: (event: KeyboardEvent) => void;
  private unsubscribe: Array<() => void> = [];

  private readonly predicted: PredictedPose = { x: 0, y: 0, dir: 0, moving: false };
  private readonly correction = { x: 0, y: 0 };
  private readonly pendingInputs: InputMessage[] = [];
  private inputSeq = 0;
  private inputAccumulator = 0;
  private attackReadyAt = 0;
  private lastHudTick = 0;
  private localDead = false;
  private leaving = false;
  private bossTelegraphGraphics?: Phaser.GameObjects.Graphics;
  private bossCastBarContainer?: Phaser.GameObjects.Container;
  private bossCastTween?: Phaser.Tweens.Tween;
  private bossCastProgressTween?: Phaser.Tweens.Tween;

  constructor() {
    super(SCENE_KEYS.Game);
  }

  create(): void {
    this.leaving = false;
    const state = network.state;
    if (!state?.world?.rows?.length) {
      this.scene.start(SCENE_KEYS.CharacterSelect);
      return;
    }

    this.state = state;
    this.localSessionId = network.sessionId;
    this.grid = {
      rows: Array.from(state.world.rows as unknown as string[]),
      tileSize: state.world.tileSize,
    };

    this.cameras.main.setBackgroundColor("#081010");
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.roundPixels = false;
    this.updateCameraBounds();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.updateCameraBounds, this);

    this.buildGround();
    this.buildPortals();
    this.buildDoors();
    this.spawnInitialEntities();

    this.localState = network.players.get(this.localSessionId);
    this.localPlayer = this.players.get(this.localSessionId);

    if (this.localPlayer && this.localState) {
      this.predicted.x = this.localState.x;
      this.predicted.y = this.localState.y;
      this.predicted.dir = this.localState.dir;
      this.predicted.moving = false;
      this.localPlayer.setLocalPose(this.predicted.x, this.predicted.y, false, this.predicted.dir);
      this.cameras.main.startFollow(this.localPlayer, true, CAMERA_LERP, CAMERA_LERP);
    }

    this.setupInput();
    this.input.mouse?.disableContextMenu();
    this.bindNetworkEvents();
    this.cameras.main.fadeIn(260, 8, 16, 16);

    if (!this.scene.isActive(SCENE_KEYS.UI)) {
      this.scene.launch(SCENE_KEYS.UI);
    }
    this.scene.bringToTop(SCENE_KEYS.UI);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  update(time: number, delta: number): void {
    if (!this.localPlayer || !this.localState) return;

    const dt = Math.min(delta, 100) / 1000;
    const chatOpen = this.isChatOpen();
    const dead = this.localState.hp <= 0;
    const frozen = Boolean(this.localState.frozen);
    this.localDead = dead;

    this.inputAccumulator = Math.min(this.inputAccumulator + delta, 250);
    while (this.inputAccumulator >= TICK_MS) {
      this.inputAccumulator -= TICK_MS;
      this.simulateStep(TICK_MS / 1000, chatOpen || dead || frozen);
    }

    // Fade out the reconciliation offset instead of snapping the camera/sprite.
    const decay = Math.exp(-dt / (CORRECTION_MS / 1000));
    this.correction.x *= decay;
    this.correction.y *= decay;
    if (Math.abs(this.correction.x) < 0.05) this.correction.x = 0;
    if (Math.abs(this.correction.y) < 0.05) this.correction.y = 0;

    if (dead) {
      this.localPlayer.setLocalPose(this.localState.x, this.localState.y, false, this.localState.dir);
    } else {
      // Sub-tick prediction / extrapolation:
      // The network simulation runs at a fixed 30 Hz (TICK_MS = 33.33ms).
      // Between ticks, extrapolate the remaining accumulator progress so movement
      // renders smoothly at the monitor's native refresh rate (60Hz, 120Hz, 144Hz+) with zero judder.
      const currentInput = this.readInput(chatOpen || dead || frozen);
      const isMoving = currentInput.left || currentInput.right || currentInput.up || currentInput.down;
      const subDt = Math.max(0, this.inputAccumulator) / 1000;

      let subX = 0;
      let subY = 0;
      let dir = this.predicted.dir;

      if (isMoving && subDt > 0) {
        let dx = (currentInput.right ? 1 : 0) - (currentInput.left ? 1 : 0);
        let dy = (currentInput.down ? 1 : 0) - (currentInput.up ? 1 : 0);
        if (dx !== 0 && dy !== 0) {
          dx *= Math.SQRT1_2;
          dy *= Math.SQRT1_2;
        }

        if (dx !== 0) {
          dir = dx < 0 ? 1 : 2;
        } else if (dy !== 0) {
          dir = dy < 0 ? 3 : 0;
        }

        const nextX = this.predicted.x + dx * PLAYER_SPEED * subDt;
        if (!isBlocked(this.grid, nextX, this.predicted.y, PLAYER_RADIUS)) {
          subX = dx * PLAYER_SPEED * subDt;
        }

        const nextY = this.predicted.y + dy * PLAYER_SPEED * subDt;
        if (!isBlocked(this.grid, this.predicted.x + subX, nextY, PLAYER_RADIUS)) {
          subY = dy * PLAYER_SPEED * subDt;
        }
      }

      this.localPlayer.setLocalPose(
        this.predicted.x + subX + this.correction.x,
        this.predicted.y + subY + this.correction.y,
        isMoving,
        dir,
      );
    }

    for (const player of this.players.values()) player.update(dt, time);
    for (const monster of this.monsters.values()) monster.update(dt, time);
    for (const npc of this.npcs.values()) npc.update(dt, time);

    this.updateDungeonVision();

    // Cheap fallback HUD heartbeat (UIScene also updates itself).
    if (time - this.lastHudTick > 250) {
      this.lastHudTick = time;
      this.getUi()?.refresh();
    }
  }

  // -------------------------------------------------------------------------
  // World rendering
  // -------------------------------------------------------------------------

  private buildGround(): void {
    const { rows, tileSize } = this.grid;
    const { width, height } = this.state.world;

    if (this.state.world.name === "Hollowed Forest" && this.cache.tilemap.exists("map-hollowed-forest")) {
      const tilemap = this.make.tilemap({ key: "map-hollowed-forest" });
      const tileset = tilemap.addTilesetImage("Hollowed Forest", "tileset-overworld");
      if (tileset) {
        const groundLayers = ["Ground", "Ground2", "Ground3", "Batas"];
        groundLayers.forEach((layerName, index) => {
          const layer = tilemap.createLayer(layerName, tileset, 0, 0);
          if (layer) {
            layer.setScale(2);
            layer.setDepth(-1000 + index);
          }
        });
        const pohonLayer = tilemap.createLayer("Pohon", tileset, 0, 0);
        if (pohonLayer) {
          pohonLayer.setScale(2);
          pohonLayer.setDepth(5000);
        }
      }

      const border = this.add.graphics().setDepth(-990);
      border.lineStyle(6, 0x081010, 0.8);
      border.strokeRect(3, 3, width - 6, height - 6);
      return;
    }

    if (
      this.state.world.name === "Adventure Guild Forest" &&
      this.cache.tilemap.exists("map-adventure-guild-forest")
    ) {
      const tilemap = this.make.tilemap({ key: "map-adventure-guild-forest" });
      const tsForest = tilemap.addTilesetImage("gentle forest v01", "tileset-gentle-forest");
      const tsTreeWall = tilemap.addTilesetImage(
        "gentle tree wall, canopy only",
        "tileset-gentle-tree-wall",
      );
      const tsGuild = tilemap.addTilesetImage("Adventurers Guild", "tileset-adventurers-guild");
      const tsOrcCastle = tilemap.addTilesetImage("Orc Castle", "tileset-orc-castle-building");
      const tilesets = [tsForest, tsTreeWall, tsGuild, tsOrcCastle].filter(
        (t): t is Phaser.Tilemaps.Tileset => Boolean(t),
      );
      if (tilesets.length > 0) {
        const ground =
          tilemap.createLayer("Ground/1", tilesets, 0, 0) ??
          tilemap.createLayer("Ground", tilesets, 0, 0);
        if (ground) {
          ground.setScale(2);
          ground.setDepth(-1000);
        }
        const ground1 =
          tilemap.createLayer("Ground/2", tilesets, 0, 0) ??
          tilemap.createLayer("Ground1", tilesets, 0, 0);
        if (ground1) {
          ground1.setScale(2);
          ground1.setDepth(-999);
        }
        const props =
          tilemap.createLayer("Props", tilesets, 0, 0) ??
          tilemap.createLayer("Decoration", tilesets, 0, 0);
        if (props) {
          props.setScale(2);
          props.setDepth(5000);
          this.setupOrcCastleFireAnimations(props);
        }
      }

      this.setupDungeonVision();

      const border = this.add.graphics().setDepth(-990);
      border.lineStyle(6, 0x081010, 0.8);
      border.strokeRect(3, 3, width - 6, height - 6);
      return;
    }

    if (
      this.state.world.name === "Adventure Guild" &&
      this.cache.tilemap.exists("map-adventure-guild")
    ) {
      const tilemap = this.make.tilemap({ key: "map-adventure-guild" });
      const tileset = tilemap.addTilesetImage("atlas_16x", "tileset-atlas-16x");
      if (tileset) {
        const ground =
          tilemap.createLayer("Ground/1", tileset, 0, 0) ??
          tilemap.createLayer("Ground", tileset, 0, 0);
        if (ground) {
          ground.setScale(2);
          ground.setDepth(-1000);
        }
        const ground1 =
          tilemap.createLayer("Ground/2", tileset, 0, 0) ??
          tilemap.createLayer("Ground1", tileset, 0, 0);
        if (ground1) {
          ground1.setScale(2);
          ground1.setDepth(-999);
        }
        const props =
          tilemap.createLayer("Props", tileset, 0, 0) ??
          tilemap.createLayer("Decoration", tileset, 0, 0);
        if (props) {
          props.setScale(2);
          props.setDepth(5000);
        }
      }

      const border = this.add.graphics().setDepth(-990);
      border.lineStyle(6, 0x081010, 0.8);
      border.strokeRect(3, 3, width - 6, height - 6);
      return;
    }

    if (
      this.state.world.name === "Orc Castle" &&
      this.cache.tilemap.exists("map-orc-castle")
    ) {
      const tilemap = this.make.tilemap({ key: "map-orc-castle" });
      const tilesets = [
        tilemap.addTilesetImage("decorative_cracks_coasts_animation", "tileset-orc-coasts"),
        tilemap.addTilesetImage("decorative_cracks_floor", "tileset-orc-floor"),
        tilemap.addTilesetImage("decorative_cracks_walls", "tileset-orc-walls"),
        tilemap.addTilesetImage("doors_lever_chest_animation", "tileset-orc-doors"),
        tilemap.addTilesetImage("Objects", "tileset-orc-objects"),
        tilemap.addTilesetImage("fire_animation", "tileset-orc-fire"),
        tilemap.addTilesetImage("walls_floor", "tileset-orc-walls-floor"),
      ].filter((t): t is Phaser.Tilemaps.Tileset => Boolean(t));

      if (tilesets.length > 0) {
        const ground =
          tilemap.createLayer("Ground/1", tilesets, 0, 0) ??
          tilemap.createLayer("Ground", tilesets, 0, 0);
        if (ground) {
          ground.setScale(2);
          ground.setDepth(-1000);
        }
        const ground1 =
          tilemap.createLayer("Ground/2", tilesets, 0, 0) ??
          tilemap.createLayer("Ground1", tilesets, 0, 0);
        if (ground1) {
          ground1.setScale(2);
          ground1.setDepth(-999);
          this.orcCastleDoorLayer = ground1;
        }
        const props =
          tilemap.createLayer("Props", tilesets, 0, 0) ??
          tilemap.createLayer("Decoration", tilesets, 0, 0);
        if (props) {
          props.setScale(2);
          props.setDepth(5000);
          this.setupOrcCastleFireAnimations(props);
        }
      }

      this.setupDungeonVision();

      const border = this.add.graphics().setDepth(-990);
      border.lineStyle(6, 0x081010, 0.8);
      border.strokeRect(3, 3, width - 6, height - 6);
      return;
    }

    const rt = this.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setDepth(-1000);

    for (let ty = 0; ty < rows.length; ty++) {
      const row = rows[ty];
      for (let tx = 0; tx < row.length; tx++) {
        const tile = row[tx];
        const x = tx * tileSize;
        const y = ty * tileSize;

        let groundKey = `grass-${(tx * 7 + ty * 13) % 3}`;
        if (tile === "=") groundKey = "path";
        if (tile === "~") groundKey = "water";
        rt.draw(groundKey, x, y);

        if (tile === ",") {
          rt.draw("flower", x + 12, y + 12);
        }
      }
    }

    // Depth-sorted props are separate sprites so the player can walk behind
    // tree canopies while the trunk tile stays blocked.
    for (let ty = 0; ty < rows.length; ty++) {
      const row = rows[ty];
      for (let tx = 0; tx < row.length; tx++) {
        const tile = row[tx];
        if (tile !== "#" && tile !== "R") continue;

        const x = tx * tileSize + tileSize / 2;
        const y = (ty + 1) * tileSize;
        const seed = (tx * 31 + ty * 17) % 11;

        if (tile === "#") {
          this.add
            .image(x, y, "tree")
            .setOrigin(0.5, 1)
            .setScale(0.92 + (seed % 4) * 0.045)
            .setDepth(y)
            .setAlpha(0.98);
        } else {
          this.add
            .image(x, y, "rock")
            .setOrigin(0.5, 1)
            .setScale(0.9 + (seed % 3) * 0.08)
            .setDepth(y);
        }
      }
    }

    // A soft border so the playable island feels contained.
    const border = this.add.graphics().setDepth(-999);
    border.lineStyle(6, 0x081010, 0.8);
    border.strokeRect(3, 3, width - 6, height - 6);
  }

  private portalBuiltIds = new Set<string>();
  private portalVisuals = new Map<string, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text }>();
  private doorBuiltIds = new Set<string>();
  private doorLabels = new Map<string, Phaser.GameObjects.Text>();
  private orcCastleDoorLayer?: Phaser.Tilemaps.TilemapLayer;
  private dungeonDarkness?: Phaser.GameObjects.RenderTexture;
  private fireAnimTimer?: Phaser.Time.TimerEvent;

  private setupOrcCastleFireAnimations(propsLayer: Phaser.Tilemaps.TilemapLayer): void {
    const fireBaseGids = new Set([1218, 1219, 1229, 1230, 1240, 1241]);
    const fireTiles: Array<{ x: number; y: number; baseGid: number }> = [];
    propsLayer.forEachTile((tile) => {
      if (fireBaseGids.has(tile.index)) {
        fireTiles.push({ x: tile.x, y: tile.y, baseGid: tile.index });
      }
    });
    if (fireTiles.length === 0) return;

    let frame = 0;
    this.fireAnimTimer = this.time.addEvent({
      delay: 140,
      loop: true,
      callback: () => {
        frame = (frame + 1) % 6;
        const offset = frame * 33;
        for (const ft of fireTiles) {
          propsLayer.putTileAt(ft.baseGid + offset, ft.x, ft.y);
        }
      },
    });
  }

  private setupDungeonVision(): void {
    if (this.state.world.name !== "Orc Castle") return;
    const radius = 6 * this.grid.tileSize; // 6 tiles = 192px
    const size = radius * 2;
    const brushKey = "dungeon-vision-light";
    if (!this.textures.exists(brushKey)) {
      const canvasTex = this.textures.createCanvas(brushKey, size, size);
      if (canvasTex) {
        const ctx = canvasTex.getContext();
        const grad = ctx.createRadialGradient(radius, radius, radius * 0.45, radius, radius, radius);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.7, "rgba(255,255,255,0.85)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        canvasTex.refresh();
      }
    }

    const { width, height } = this.state.world;
    this.dungeonDarkness = this.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(9000);
  }

  private updateDungeonVision(): void {
    if (!this.dungeonDarkness || !this.localPlayer) return;
    const radius = 6 * this.grid.tileSize;
    this.dungeonDarkness.fill(0x04060a, 0.94);
    this.dungeonDarkness.erase(
      "dungeon-vision-light",
      this.localPlayer.x - radius,
      this.localPlayer.y - radius,
    );
  }

  private buildPortals(): void {
    for (const portal of network.portals) {
      if (this.portalBuiltIds.has(portal.id)) continue;
      this.portalBuiltIds.add(portal.id);

      const isActive = portal.active !== false;
      const portalSprite = this.add
        .sprite(portal.x, portal.y, "portal", "1 0.gif")
        .setScale(0.65)
        .setDepth(portal.y - 1)
        .setVisible(isActive);
      if (isActive && this.anims.exists("portal-spin")) {
        portalSprite.play("portal-spin");
      }

      const label = this.add
        .text(portal.x, portal.y - 30, `PORTAL: ${portal.targetMapName.toUpperCase()}`, {
          fontFamily: UI_FONT,
          fontSize: "14px",
          color: "#78e8ff",
          stroke: "#081010",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(portal.y + 10)
        .setVisible(isActive);

      this.portalVisuals.set(portal.id, { sprite: portalSprite, label });
    }
  }

  private updatePortalVisual(portalId: string, active: boolean): void {
    const visual = this.portalVisuals.get(portalId);
    if (!visual) return;
    visual.sprite.setVisible(active);
    visual.label.setVisible(active);
    if (active && this.anims.exists("portal-spin")) {
      visual.sprite.play("portal-spin");
    }
  }

  private buildDoors(): void {
    for (const door of network.doors) {
      if (this.doorBuiltIds.has(door.id)) continue;
      this.doorBuiltIds.add(door.id);

      if (door.open) {
        this.applyDoorTileFrame(door.tx, door.ty, 4);
        this.unblockLocalDoorTiles(door.tx, door.ty);
        continue;
      }

      const label = this.add
        .text(door.x, door.y - 28, `${door.name.toUpperCase()} [${door.keyName.toUpperCase()}]`, {
          fontFamily: UI_FONT,
          fontSize: "12px",
          color: "#fbbf24",
          stroke: "#081010",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(door.y + 20);
      this.doorLabels.set(door.id, label);
    }
  }

  private unblockLocalDoorTiles(tx: number, ty: number): void {
    const row = this.grid.rows[ty];
    if (!row) return;
    let next = row;
    for (const col of [Math.max(0, tx - 1), tx]) {
      if (col >= 0 && col < next.length) {
        next = next.slice(0, col) + "." + next.slice(col + 1);
      }
    }
    this.grid.rows[ty] = next;
  }

  private applyDoorTileFrame(tx: number, ty: number, frame: number): void {
    if (!this.orcCastleDoorLayer) return;
    const baseGid = 852 + frame * 30;
    const leftTx = Math.max(0, tx - 1);
    const offsets: Array<[number, number, number]> = [
      [leftTx, ty - 1, baseGid + 4],
      [tx, ty - 1, baseGid + 5],
      [leftTx, ty, baseGid + 14],
      [tx, ty, baseGid + 15],
      [leftTx, ty + 1, baseGid + 24],
      [tx, ty + 1, baseGid + 25],
    ];
    for (const [cx, cy, gid] of offsets) {
      this.orcCastleDoorLayer.putTileAt(gid, cx, cy);
    }
  }

  private onDoorOpen(id: string, tx: number, ty: number): void {
    this.unblockLocalDoorTiles(tx, ty);
    const label = this.doorLabels.get(id);
    if (label) {
      label.destroy();
      this.doorLabels.delete(id);
    }
    let frame = 1;
    this.applyDoorTileFrame(tx, ty, frame);
    this.time.addEvent({
      delay: 130,
      repeat: 2,
      callback: () => {
        frame = Math.min(4, frame + 1);
        this.applyDoorTileFrame(tx, ty, frame);
      },
    });
  }

  private spawnInitialEntities(): void {
    network.players.forEach((state, id) => this.addPlayer(id, state));
    network.monsters.forEach((state, id) => this.addMonster(id, state));
    network.npcs.forEach((state, id) => this.addNpc(id, state));
  }

  private addPlayer(id: string, state: PlayerState): void {
    if (this.players.has(id)) return;
    const isLocal = id === this.localSessionId;
    const player = new Player(this, id, state, isLocal);
    this.players.set(id, player);

    if (isLocal) {
      this.localPlayer = player;
      this.localState = state;
      this.predicted.x = state.x;
      this.predicted.y = state.y;
      this.predicted.dir = state.dir;
      if (this.cameras.main) {
        this.cameras.main.startFollow(player, true, CAMERA_LERP, CAMERA_LERP);
      }
    } else {
      player.sprite.setInteractive({ useHandCursor: true });
      player.sprite.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!pointer.rightButtonDown()) return;
        if (this.localDead || this.isChatOpen() || this.isModalOpen()) return;
        this.getUi()?.showPlayerContextMenu(pointer.x, pointer.y, { sessionId: id, name: state.name });
      });
    }
  }

  private addMonster(id: string, state: MonsterState): void {
    if (this.monsters.has(id)) return;
    const monster = new Monster(this, id, state);
    monster.sprite.on("pointerdown", () => this.tryAttack(id));
    this.monsters.set(id, monster);
  }

  private addNpc(id: string, state: NpcState): void {
    if (this.npcs.has(id)) return;
    const npc = new NPC(this, id, state);
    npc.sprite.on("pointerdown", () => this.interact(id));
    this.npcs.set(id, npc);
  }

  // -------------------------------------------------------------------------
  // Input + prediction
  // -------------------------------------------------------------------------

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

    this.attackKeyHandler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (this.isChatOpen()) return;
      this.tryAttack();
    };
    keyboard.on("keydown-SPACE", this.attackKeyHandler);
    keyboard.addCapture(["SPACE", "UP", "DOWN", "LEFT", "RIGHT"]);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.rightButtonDown()) return;
      if (this.localDead || this.isChatOpen() || this.isModalOpen()) return;
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      for (const [id, p] of this.players.entries()) {
        if (id === this.localSessionId) continue;
        if (Math.abs(worldPt.x - p.x) <= 22 && worldPt.y >= p.y - 48 && worldPt.y <= p.y + 12) {
          this.getUi()?.showPlayerContextMenu(pointer.x, pointer.y, {
            sessionId: id,
            name: p.snapshot.name,
          });
          return;
        }
      }
    });
  }

  private readInput(forceIdle: boolean): Pick<InputMessage, "up" | "down" | "left" | "right"> {
    if (forceIdle) return { up: false, down: false, left: false, right: false };

    const left = this.wasd.A.isDown || this.cursors.left.isDown;
    const right = this.wasd.D.isDown || this.cursors.right.isDown;
    const up = this.wasd.W.isDown || this.cursors.up.isDown;
    const down = this.wasd.S.isDown || this.cursors.down.isDown;

    return {
      left: left && !right,
      right: right && !left,
      up: up && !down,
      down: down && !up,
    };
  }

  private simulateStep(dt: number, forceIdle: boolean): void {
    if (!this.localPlayer || !this.localState) return;
    if (this.localState.hp <= 0) {
      this.pendingInputs.length = 0;
      this.predicted.x = this.localState.x;
      this.predicted.y = this.localState.y;
      this.predicted.moving = false;
      return;
    }

    const input = this.readInput(forceIdle);
    const message: InputMessage = {
      seq: ++this.inputSeq,
      ...input,
    };

    this.pendingInputs.push(message);
    if (this.pendingInputs.length > 180) this.pendingInputs.shift();
    network.sendInput(message);

    applyMovement(this.predicted, input, dt, this.grid, PLAYER_SPEED, PLAYER_RADIUS);
  }

  private reconcile(state: PlayerState): void {
    if (!this.localPlayer || state.hp <= 0) return;

    const visualX = this.localPlayer.x;
    const visualY = this.localPlayer.y;
    const ack = state.lastProcessedInput;

    // Drop inputs the server has already simulated, then replay the rest from
    // authoritative state. This is the core of client-side prediction.
    while (this.pendingInputs.length > 0 && this.pendingInputs[0].seq <= ack) {
      this.pendingInputs.shift();
    }

    this.predicted.x = state.x;
    this.predicted.y = state.y;
    this.predicted.dir = state.dir;
    for (const input of this.pendingInputs) {
      applyMovement(this.predicted, input, TICK_MS / 1000, this.grid, PLAYER_SPEED, PLAYER_RADIUS);
    }

    const errorX = visualX - this.predicted.x;
    const errorY = visualY - this.predicted.y;
    const distance = Math.hypot(errorX, errorY);

    if (distance > SNAP_DISTANCE) {
      this.correction.x = 0;
      this.correction.y = 0;
    } else {
      // Smoothly absorb small divergence (latency, floating point, wall slides).
      this.correction.x = Phaser.Math.Clamp(errorX, -48, 48);
      this.correction.y = Phaser.Math.Clamp(errorY, -48, 48);
    }
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  private tryAttack(targetId?: string): void {
    if (this.localDead || this.localState?.frozen || this.isChatOpen() || this.isModalOpen()) return;
    const now = this.time.now;
    if (now < this.attackReadyAt) return;

    const local = network.players.get(this.localSessionId);
    const agi = local?.agi ?? 1;
    const dex = local?.dex ?? 1;
    const aspd = Math.min(195, 150 + (agi - 1) * 2 + Math.floor((dex - 1) * 0.5));
    const cooldown = Math.max(190, Math.round(ATTACK_COOLDOWN_MS * (150 / aspd)));

    this.attackReadyAt = now + cooldown;
    network.attack(targetId);
    this.localPlayer?.playAttack();
    this.showSlash();
  }

  private interact(npcId: string): void {
    if (this.localDead || this.isChatOpen() || this.isModalOpen()) return;
    network.interact(npcId);
  }

  private showSlash(): void {
    if (!this.localPlayer) return;
    const dir = this.predicted.dir;
    const offsets = [
      { x: 0, y: 4, rot: Math.PI / 2 }, // down
      { x: -14, y: -6, rot: Math.PI }, // left
      { x: 14, y: -6, rot: 0 }, // right
      { x: 0, y: -20, rot: -Math.PI / 2 }, // up
    ];
    const offset = offsets[dir] ?? offsets[0];

    const slash = this.add
      .image(this.localPlayer.x + offset.x, this.localPlayer.y - 12 + offset.y, "slash")
      .setDepth(this.localPlayer.y + 100)
      .setRotation(offset.rot)
      .setScale(0.9)
      .setAlpha(0.95);

    this.tweens.add({
      targets: slash,
      alpha: 0,
      scale: 1.5,
      duration: ATTACK_ANIMATION_MS,
      ease: "Cubic.easeOut",
      onComplete: () => slash.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // Network events
  // -------------------------------------------------------------------------

  private bindNetworkEvents(): void {
    this.unsubscribe.push(
      network.on("player:add", ({ id, state }) => this.addPlayer(id, state)),
      network.on("player:remove", ({ id }) => {
        this.players.get(id)?.destroy();
        this.players.delete(id);
      }),
      network.on("monster:add", ({ id, state }) => this.addMonster(id, state)),
      network.on("monster:remove", ({ id }) => {
        this.monsters.get(id)?.destroy();
        this.monsters.delete(id);
        if (id.includes("ashura") || id.includes("boss")) {
          this.clearBossCastVisuals();
        }
      }),
      network.on("npc:add", ({ id, state }) => this.addNpc(id, state)),
      network.on("npc:remove", ({ id }) => {
        this.npcs.get(id)?.destroy();
        this.npcs.delete(id);
      }),
      network.on("player:sync", ({ id, state }) => {
        if (id === this.localSessionId) this.reconcile(state);
      }),
      network.on("combat:hit", (event) => this.onCombatHit(event)),
      network.on("combat:miss", (event) => this.onCombatMiss(event)),
      network.on("skill:used", (event) => this.onSkillUsed(event)),
      network.on("player:died", (event) => this.onPlayerDied(event)),
      network.on("player:respawned", (event) => this.onPlayerRespawned(event)),
      network.on("npc:dialog", (event) => this.onNpcDialog(event)),
      network.on("loot:award", (event) => this.onLootAward(event)),
      network.on("item:used", (event) => this.onItemUsed(event)),
      network.on("boss:skill:cast", (event) => this.onBossSkillCast(event)),
      network.on("welcome", () => {
        this.buildPortals();
        this.buildDoors();
      }),
      network.on("portal:update", (event) => {
        this.updatePortalVisual(event.id, event.active);
        if (event.active) {
          this.getUi()?.showToast("WARP PORTAL MENYALA!", "#78e8ff");
        }
      }),
      network.on("door:open", (event) => {
        this.onDoorOpen(event.id, event.tx, event.ty);
        this.getUi()?.showToast("PINTU TERBUKA!", "#fbbf24");
      }),
      network.on("portal:warp", (event) => {
        if (this.leaving) return;
        this.leaving = true;
        this.getUi()?.showToast(`MENUJU ${event.targetMapName.toUpperCase()}...`, "#78e8ff");
        this.cameras.main.fadeOut(250, 8, 16, 16);
        this.time.delayedCall(260, async () => {
          try {
            await network.warpToMap(event.targetMapId, event.spawnX, event.spawnY);
            this.scene.restart();
          } catch {
            this.leaving = false;
            this.cameras.main.fadeIn(200, 8, 16, 16);
          }
        });
      }),
      network.on("boss:skill:execute", (event) => this.onBossSkillExecute(event)),
      network.on("monster:speak", (event) => {
        const monster = this.monsters.get(event.monsterId);
        monster?.showChatBubble(event.text);
      }),
      network.on("chat", (event) => {
        if (event.channel !== "say") return;
        const speaker =
          (event.sessionId ? this.players.get(event.sessionId) : undefined) ??
          [...this.players.values()].find((p) => p.snapshot.name === event.name);
        speaker?.showChatBubble(event.text);
      }),
      network.on("disconnected", () => this.onDisconnected()),
    );
  }

  private onSkillUsed(event: SkillUsedEvent): void {
    const caster = this.players.get(event.casterId);
    if (event.skillId === "rebahan") {
      if (caster?.snapshot.resting) {
        this.floatingText(event.x, event.y - 42, "Zzz...", "#c084fc", 16);
      }
      return;
    }

    if (event.skillId === "baledog") {
      caster?.playAttack();
      const tx = event.targetX ?? event.x;
      const ty = event.targetY ?? event.y;
      const stone = this.add
        .circle(event.x, event.y - 16, 4.5, 0x94a3b8, 1)
        .setStrokeStyle(1.5, 0x1e293b, 1)
        .setDepth(Math.max(event.y, ty) + 120);
      this.tweens.add({
        targets: stone,
        x: tx,
        y: ty - 10,
        duration: 160,
        ease: "Linear",
        onComplete: () => {
          stone.destroy();
          this.spawnBurst(tx, ty - 10, 0xcbd5e1);
        },
      });
      return;
    }

    if (event.skillId !== "magnum-break") return;

    if (this.textures.exists("fx-magnum-break") && this.anims.exists("fx-magnum-break")) {
      const boom = this.add
        .sprite(event.x, event.y, "fx-magnum-break", 0)
        .setScale(2.1)
        .setDepth(5500);
      boom.play("fx-magnum-break");
      boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
    }

    if (event.casterId === this.localSessionId) {
      this.getUi()?.showToast("FIRE ENCHANT AKTIF (15 DETIK)!", "#ff9a52");
    }

    const ring = this.add
      .circle(event.x, event.y, event.radius, 0xff5a22, 0.14)
      .setStrokeStyle(6, 0xffc14d, 0.85)
      .setDepth(event.y + 20);
    if (caster) caster.playAttack();
    this.cameras.main.shake(220, 0.006);
    this.tweens.add({
      targets: ring,
      scaleX: 1.35,
      scaleY: 1.35,
      alpha: 0,
      duration: 550,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private onCombatHit(event: CombatHitEvent): void {
    if (event.attackerId && event.attackerId !== this.localSessionId) {
      const attacker = this.players.get(event.attackerId);
      attacker?.playAttack();
    }

    let targetX: number | undefined;
    let targetY: number | undefined;

    if (event.targetType === "monster") {
      const monster = this.monsters.get(event.targetId);
      if (monster) {
        monster.flash();
        targetX = monster.x;
        targetY = monster.y;
        if (event.killed) this.spawnBurst(monster.x, monster.y - 8, event.skillId ? 0xff5a22 : 0x9fe08a);
      }
    } else {
      const player = this.players.get(event.targetId);
      if (player) {
        if (event.damage > 0) {
          player.flash();
          player.playHurt();
        }
        targetX = player.x;
        targetY = player.y;
      }
    }

    if (targetX !== undefined && targetY !== undefined) {
      if (event.damage === 0) {
        this.floatingText(targetX, targetY - 42, "MISS", "#9fe08a", 20);
      } else {
        this.floatingText(
          targetX,
          targetY - 42,
          `-${event.damage}${event.crit ? "!" : ""}`,
          event.crit ? "#f4c95d" : "#ff9a8a",
          event.crit ? 26 : 21,
        );
      }
    }

    if (event.targetId === this.localSessionId && event.damage > 0) {
      this.cameras.main.shake(90, 0.0035);
    }
  }

  private onCombatMiss(_event: CombatMissEvent): void {
    // Reserved for "out of range" UI feedback; silence keeps combat snappy.
  }

  private onPlayerDied(event: PlayerDiedEvent): void {
    const player = this.players.get(event.sessionId);
    player?.playDeath();
    if (event.sessionId !== this.localSessionId) return;
    this.pendingInputs.length = 0;
    this.correction.x = 0;
    this.correction.y = 0;
    this.cameras.main.shake(180, 0.006);
  }

  private onPlayerRespawned(event: PlayerRespawnedEvent): void {
    const player = this.players.get(event.sessionId);
    player?.onRespawn();
    if (event.sessionId !== this.localSessionId || !this.localState) return;
    this.pendingInputs.length = 0;
    this.correction.x = 0;
    this.correction.y = 0;
    this.predicted.x = this.localState.x;
    this.predicted.y = this.localState.y;
    this.predicted.dir = this.localState.dir;
    this.localPlayer?.setLocalPose(this.localState.x, this.localState.y, false, this.localState.dir);
    this.cameras.main.flash(180, 240, 235, 200);
  }

  private onNpcDialog(event: NpcDialogEvent): void {
    const npc = this.npcs.get(event.npcId);
    if (!npc) return;

    const bubble = this.add
      .text(npc.x, npc.y - 62, `${event.npcName}\n${event.text}`, {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#20261f",
        backgroundColor: "#f1ecd8",
        padding: { x: 8, y: 6 },
        align: "center",
        wordWrap: { width: 210, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 1)
      .setDepth(npc.y + 1000);

    this.tweens.add({
      targets: bubble,
      alpha: 0,
      y: bubble.y - 10,
      delay: 3400,
      duration: 500,
      onComplete: () => bubble.destroy(),
    });
  }

  private onLootAward(event: LootAwardEvent): void {
    const monster = this.monsters.get(event.monsterId);
    const x = monster?.x ?? this.localPlayer?.x ?? 0;
    const y = monster?.y ?? this.localPlayer?.y ?? 0;

    if (event.gold > 0) {
      this.floatingText(x, y - 48, `+${event.gold} GOLD`, "#f4c95d", 19);
    }

    event.items.forEach((stack, index) => {
      this.floatingText(
        x,
        y - 68 - index * 19,
        `+${stack.qty} ${itemName(stack.itemId)}`,
        "#9fe08a",
        17,
      );
    });
  }

  private onItemUsed(event: ItemUsedEvent): void {
    if (!this.localPlayer) return;
    this.floatingText(this.localPlayer.x, this.localPlayer.y - 56, `+${event.healed} HP`, "#9fe08a", 21);
  }

  private isReconnecting = false;

  private onDisconnected(): void {
    this.clearBossCastVisuals();
    if (this.leaving || this.isReconnecting) return;
    this.isReconnecting = true;

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x050b09, 0.88)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(15000);

    const title = this.add
      .text(cx, cy - 60, "KONEKSI TERPUTUS", {
        fontFamily: UI_FONT,
        fontSize: "36px",
        color: "#e08a7a",
        stroke: "#0b1512",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(15001);

    const statusText = this.add
      .text(cx, cy, "Mencoba menghubungkan kembali (1/3)...", {
        fontFamily: UI_FONT,
        fontSize: "18px",
        color: "#f4c95d",
        stroke: "#0b1512",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(15001);

    const btnBox = this.add.container(cx, cy + 70).setScrollFactor(0).setDepth(15001);

    const btnRetryBg = this.add
      .rectangle(-110, 0, 190, 42, 0x224c3a)
      .setStrokeStyle(2, 0x489065)
      .setInteractive({ useHandCursor: true });
    const btnRetryText = this.add
      .text(-110, 0, "HUBUNGKAN ULANG", {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#d8f8d0",
      })
      .setOrigin(0.5);

    const btnMenuBg = this.add
      .rectangle(110, 0, 190, 42, 0x3d2020)
      .setStrokeStyle(2, 0x8a3c3c)
      .setInteractive({ useHandCursor: true });
    const btnMenuText = this.add
      .text(110, 0, "MENU UTAMA", {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#ffd4d4",
      })
      .setOrigin(0.5);

    btnBox.add([btnRetryBg, btnRetryText, btnMenuBg, btnMenuText]);

    const cleanupUI = () => {
      overlay.destroy();
      title.destroy();
      statusText.destroy();
      btnBox.destroy();
    };

    const goToMenu = () => {
      cleanupUI();
      this.leaving = true;
      this.isReconnecting = false;
      this.scene.stop(SCENE_KEYS.UI);
      this.scene.start(SCENE_KEYS.MainMenu);
    };

    btnMenuBg.on("pointerdown", goToMenu);

    const performReconnect = async () => {
      btnRetryBg.disableInteractive();
      btnRetryBg.setFillStyle(0x1a2e24);
      statusText.setText("Mencoba menghubungkan kembali (1/3)...").setColor("#f4c95d");

      const success = await network.reconnect((attempt, max) => {
        if (!statusText.active) return;
        statusText.setText(`Mencoba menghubungkan kembali (${attempt}/${max})...`);
      });

      if (!statusText.active) return;

      if (success) {
        statusText.setText("Berhasil terhubung! Memuat realm...").setColor("#9fe08a");
        this.time.delayedCall(600, () => {
          cleanupUI();
          this.isReconnecting = false;
          this.scene.restart();
        });
      } else {
        statusText.setText("Gagal terhubung ke server. Periksa jaringan Anda.").setColor("#e08a7a");
        btnRetryBg.setInteractive({ useHandCursor: true });
        btnRetryBg.setFillStyle(0x224c3a);
      }
    };

    btnRetryBg.on("pointerdown", () => {
      void performReconnect();
    });

    void performReconnect();
  }

  // -------------------------------------------------------------------------
  // Feedback helpers
  // -------------------------------------------------------------------------

  private floatingText(x: number, y: number, text: string, color: string, size = 20): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: UI_FONT,
        fontSize: `${size}px`,
        color,
        stroke: "#0b1512",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(9000);

    this.tweens.add({
      targets: label,
      y: y - 30,
      alpha: 0,
      duration: 750,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private spawnBurst(x: number, y: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const distance = 18 + (i % 3) * 8;
      const spark = this.add
        .image(x, y, "spark")
        .setTint(color)
        .setDepth(9001)
        .setScale(1.4);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance * 0.7,
        alpha: 0,
        duration: 420 + (i % 4) * 60,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private isChatOpen(): boolean {
    return this.getUi()?.isChatOpen() ?? false;
  }

  private isModalOpen(): boolean {
    const ui = this.getUi();
    if (!ui) return false;
    return (
      ui.isInventoryOpen() ||
      ui.isEquipmentOpen() ||
      ui.isStatusOpen() ||
      ui.isSkillOpen() ||
      ui.isSettingOpen() ||
      ui.isTradeOpen()
    );
  }

  private getUi(): UIScene | undefined {
    const scene = this.scene.get(SCENE_KEYS.UI) as UIScene | undefined;
    return scene?.scene.isActive() ? scene : undefined;
  }

  private updateCameraBounds(): void {
    const cam = this.cameras?.main;
    if (!cam || !this.state?.world) return;
    const viewW = this.scale.width / CAMERA_ZOOM;
    const viewH = this.scale.height / CAMERA_ZOOM;
    const worldW = this.state.world.width;
    const worldH = this.state.world.height;

    const boundsX = worldW < viewW ? -(viewW - worldW) / 2 : 0;
    const boundsY = worldH < viewH ? -(viewH - worldH) / 2 : 0;
    const boundsW = Math.max(worldW, viewW);
    const boundsH = Math.max(worldH, viewH);

    cam.setBounds(boundsX, boundsY, boundsW, boundsH);
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.updateCameraBounds, this);
    this.clearBossCastVisuals();
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];

    if (this.attackKeyHandler) {
      this.input.keyboard?.off("keydown-SPACE", this.attackKeyHandler);
      this.attackKeyHandler = undefined;
    }

    for (const player of this.players.values()) player.destroy();
    for (const monster of this.monsters.values()) monster.destroy();
    for (const npc of this.npcs.values()) npc.destroy();
    this.players.clear();
    this.monsters.clear();
    this.npcs.clear();
    this.portalBuiltIds.clear();
    this.portalVisuals.clear();
    this.doorBuiltIds.clear();
    this.doorLabels.clear();
    this.orcCastleDoorLayer = undefined;
    this.fireAnimTimer?.remove();
    this.fireAnimTimer = undefined;
    this.dungeonDarkness?.destroy();
    this.dungeonDarkness = undefined;
  }

  // -------------------------------------------------------------------------
  // Black Ashura Skill Telegraph & Effects
  // -------------------------------------------------------------------------

  private onBossSkillCast(event: BossSkillCastEvent): void {
    this.clearBossCastVisuals();

    const isFreeze = event.skillName === "Freeze Domination";
    const isThunder = event.skillName === "Thunder Shot";
    const isEnraged = event.skillName.includes("ENRAGED");

    const strokeColor = isFreeze ? 0x38bdf8 : isThunder ? 0xfacc15 : isEnraged ? 0xff0022 : 0xff3b30;
    const fillColor = isFreeze ? 0x0ea5e9 : isThunder ? 0xfef08a : isEnraged ? 0xcc0000 : 0xff2200;
    const warnColor = isFreeze ? "#7dd3fc" : isThunder ? "#fef08a" : isEnraged ? "#ff2222" : "#ffdd44";
    const ringX = isThunder && event.targetX !== undefined ? event.targetX : event.x;
    const ringY = isThunder && event.targetY !== undefined ? event.targetY : event.y;

    // 1. Telegraph Warning Circle on the ground
    const g = this.add.graphics().setDepth(ringY - 5);
    this.bossTelegraphGraphics = g;

    const progressObj = { progress: 0 };
    this.bossCastTween = this.tweens.add({
      targets: progressObj,
      progress: 1,
      duration: event.castDurationMs,
      ease: "Linear",
      onUpdate: () => {
        if (!g.scene) return;
        g.clear();
        g.lineStyle(isEnraged ? 3.5 : 2.5, strokeColor, 0.9);
        g.strokeCircle(ringX, ringY, event.radius);

        g.lineStyle(1.5, fillColor, 0.7);
        g.strokeCircle(ringX, ringY, Math.max(4, event.radius - 4));

        if (isThunder && event.targetX !== undefined && event.targetY !== undefined) {
          g.lineStyle(2, 0xfef08a, 0.55 + 0.35 * progressObj.progress);
          g.lineBetween(event.x, event.y - 24, ringX, ringY);
        }

        const currentRadius = event.radius * progressObj.progress;
        g.fillStyle(fillColor, isEnraged ? 0.35 : 0.2);
        g.fillCircle(ringX, ringY, currentRadius);
      },
      onComplete: () => {
        g.destroy();
        this.bossTelegraphGraphics = undefined;
      },
    });

    // 2. Boss Casting Bar & Warning Text overhead
    const container = this.add.container(event.x, event.y - 78).setDepth(event.y + 2000);
    this.bossCastBarContainer = container;

    // Warning Banner Text
    const warnText = this.add
      .text(0, -22, `⚠ ${event.skillName.toUpperCase()} ⚠`, {
        fontFamily: UI_FONT,
        fontSize: isEnraged ? "15px" : "14px",
        color: warnColor,
        stroke: "#330000",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    // Bar Background
    const barBg = this.add.graphics();
    barBg.fillStyle(0x1a0505, 0.85);
    barBg.fillRoundedRect(-62, -7, 124, 14, 4);
    barBg.lineStyle(2, 0xff4422, 0.9);
    barBg.strokeRoundedRect(-62, -7, 124, 14, 4);

    // Fill bar
    const fillG = this.add.graphics();
    container.add([barBg, fillG, warnText]);

    const barProgress = { width: 0 };
    this.bossCastProgressTween = this.tweens.add({
      targets: barProgress,
      width: 120,
      duration: event.castDurationMs,
      ease: "Linear",
      onUpdate: () => {
        if (!fillG.scene) return;
        fillG.clear();
        fillG.fillStyle(0xff4422, 0.95);
        fillG.fillRoundedRect(-60, -5, barProgress.width, 10, 3);
        // Highlight strip
        fillG.fillStyle(0xffaa44, 0.8);
        fillG.fillRect(-60, -5, barProgress.width, 3);
      },
      onComplete: () => {
        container.destroy();
        this.bossCastBarContainer = undefined;
      },
    });

    // Alert floating text if local player is nearby
    if (this.localPlayer) {
      const dist = Phaser.Math.Distance.Between(this.localPlayer.x, this.localPlayer.y, event.x, event.y);
      if (dist <= event.radius + 60) {
        this.floatingText(this.localPlayer.x, this.localPlayer.y - 70, "! AWAS AREA SERANGAN !", "#ff4422", 18);
      }
    }
  }

  private onBossSkillExecute(event: BossSkillExecuteEvent): void {
    this.clearBossCastVisuals();

    if (event.skillName === "Freeze Domination") {
      const iceWave = this.add
        .circle(event.x, event.y, event.radius, 0x38bdf8, 0.22)
        .setStrokeStyle(5, 0xbae6fd, 0.95)
        .setDepth(event.y + 50);
      this.cameras.main.shake(260, 0.006);
      this.tweens.add({
        targets: iceWave,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0,
        duration: 650,
        ease: "Cubic.easeOut",
        onComplete: () => iceWave.destroy(),
      });

      const frozenSet = new Set(event.frozenPlayerIds ?? []);
      for (const pid of frozenSet) {
        const target = pid === this.localSessionId ? this.localPlayer : this.players.get(pid);
        if (target) {
          this.floatingText(target.x, target.y - 54, "FROZEN!", "#7dd3fc", 20);
        }
      }
      return;
    }

    if (event.skillName === "Thunder Shot") {
      const tx = event.targetX ?? event.x;
      const ty = event.targetY ?? event.y;
      const bolt = this.add.graphics().setDepth(Math.max(event.y, ty) + 120);
      bolt.lineStyle(5, 0x38bdf8, 0.9);
      const midX = (event.x + tx) / 2 + (Math.random() - 0.5) * 28;
      const midY = (event.y - 24 + ty - 12) / 2 + (Math.random() - 0.5) * 24;
      bolt.beginPath();
      bolt.moveTo(event.x, event.y - 24);
      bolt.lineTo(midX, midY);
      bolt.lineTo(tx, ty - 12);
      bolt.strokePath();
      bolt.lineStyle(2.5, 0xfef08a, 1);
      bolt.beginPath();
      bolt.moveTo(event.x, event.y - 24);
      bolt.lineTo(midX, midY);
      bolt.lineTo(tx, ty - 12);
      bolt.strokePath();
      bolt.fillStyle(0xfef08a, 0.85);
      bolt.fillCircle(tx, ty - 12, 16);

      this.cameras.main.shake(300, 0.009);
      this.tweens.add({
        targets: bolt,
        alpha: 0,
        duration: 380,
        onComplete: () => bolt.destroy(),
      });
      for (const pid of event.hitPlayerIds) {
        const target = pid === this.localSessionId ? this.localPlayer : this.players.get(pid);
        if (target) {
          this.floatingText(target.x, target.y - 52, "THUNDER SHOT!", "#fef08a", 20);
        }
      }
      return;
    }

    // 1. Spawn AoE Ground Blast Explosion
    // ashura_skill_aoe is 80x80; radius is 140 (diameter 280), scale ~ 3.5
    const blast = this.add
      .sprite(event.x, event.y, "ashura-skill-aoe")
      .setOrigin(0.5, 0.5)
      .setScale(3.5)
      .setDepth(event.y + 10);

    blast.play("ashura-skill-aoe-anim");
    blast.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      blast.destroy();
    });

    // Screen Shake
    this.cameras.main.shake(320, 0.008);

    // 2. Play hit effect on all players who were hit
    const hitSet = new Set(event.hitPlayerIds);
    for (const pid of event.hitPlayerIds) {
      const player = this.players.get(pid);
      if (player) {
        this.spawnBossHitEffect(player.x, player.y - 12);
      }
    }

    if (hitSet.has(this.localSessionId) && this.localPlayer) {
      this.spawnBossHitEffect(this.localPlayer.x, this.localPlayer.y - 12);
      this.floatingText(this.localPlayer.x, this.localPlayer.y - 50, `${event.skillName.toUpperCase()} HIT!`, "#ff3333", 22);
    }
  }

  private spawnBossHitEffect(x: number, y: number): void {
    const hitSprite = this.add
      .sprite(x, y, "ashura-skill-hit")
      .setOrigin(0.5, 0.5)
      .setScale(1.5)
      .setDepth(y + 80);

    hitSprite.play("ashura-skill-hit-anim");
    hitSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      hitSprite.destroy();
    });
  }

  private clearBossCastVisuals(): void {
    this.bossCastTween?.remove();
    this.bossCastTween = undefined;
    this.bossCastProgressTween?.remove();
    this.bossCastProgressTween = undefined;

    if (this.bossTelegraphGraphics) {
      this.bossTelegraphGraphics.destroy();
      this.bossTelegraphGraphics = undefined;
    }
    if (this.bossCastBarContainer) {
      this.bossCastBarContainer.destroy();
      this.bossCastBarContainer = undefined;
    }
  }
}
