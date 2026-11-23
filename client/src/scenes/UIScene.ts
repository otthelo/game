import Phaser from "phaser";
import { COLORS, SCENE_KEYS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { itemName, itemTexture } from "../items/catalog";
import { clearSession } from "../network/authApi";
import { network } from "../network/NetworkClient";
import type {
  ChatEvent,
  CombatHitEvent,
  ItemEquippedEvent,
  ItemErrorEvent,
  ItemUsedEvent,
  LootAwardEvent,
  NpcDialogEvent,
  PlayerDiedEvent,
  PlayerRespawnedEvent,
  StatErrorEvent,
} from "../types";
import { ChatPanel } from "../ui/ChatPanel";
import { EquipmentPanel } from "../ui/EquipmentPanel";
import { HealthBar } from "../ui/HealthBar";
import { InventoryPanel } from "../ui/InventoryPanel";
import { SettingPanel } from "../ui/SettingPanel";
import { SkillPanel } from "../ui/SkillPanel";
import { StatusPanel } from "../ui/StatusPanel";
import { TradePanel } from "../ui/TradePanel";
import { JobPanel } from "../ui/JobPanel";
import { MinimapPanel } from "../ui/MinimapPanel";
import { QuestPanel } from "../ui/QuestPanel";
import { ShortcutBar } from "../ui/ShortcutBar";
import { PartyHUD } from "../ui/PartyHUD";
import { PartyPanel } from "../ui/PartyPanel";
import { PlayerContextMenu, type ContextMenuTarget } from "../ui/PlayerContextMenu";
import type { PartyInviteEvent, PartyLeftEvent } from "../types";
import { JOBS } from "../config/jobs";

/**
 * Screen-space HUD and chat. It runs as a separate Phaser scene on top of the
 * world, so the world camera can zoom/scroll without distorting the UI.
 */
export class UIScene extends Phaser.Scene {
  private chat!: ChatPanel;
  private inventory!: InventoryPanel;
  private equipment!: EquipmentPanel;
  private status!: StatusPanel;
  private skill!: SkillPanel;
  private setting!: SettingPanel;
  private trade!: TradePanel;
  private job!: JobPanel;
  private quest!: QuestPanel;
  private minimap!: MinimapPanel;
  private shortcutBar!: ShortcutBar;
  private partyHud!: PartyHUD;
  private partyPanel!: PartyPanel;
  private playerContextMenu!: PlayerContextMenu;
  private partyInviteContainer!: Phaser.GameObjects.Container;
  private partyInviteText!: Phaser.GameObjects.Text;
  private pendingPartyInviteId = "";

  private nameText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private jobBadgeText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private avatar!: Phaser.GameObjects.Sprite;
  private weaponIcon!: Phaser.GameObjects.Image;
  private hpBar!: HealthBar;
  private spBar!: HealthBar;
  private xpBar!: HealthBar;
  private jobXpBar!: HealthBar;
  private mapText!: Phaser.GameObjects.Text;
  private onlineText!: Phaser.GameObjects.Text;
  private controlsHintText!: Phaser.GameObjects.Text;
  private bottomMenuContainer!: Phaser.GameObjects.Container;
  private bottomMenuWidth = 0;

  private deathOverlay!: Phaser.GameObjects.Container;
  private deathShade!: Phaser.GameObjects.Rectangle;
  private deathTitle!: Phaser.GameObjects.Text;
  private deathSub!: Phaser.GameObjects.Text;
  private deathUntil = 0;

  private toastText!: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;
  private damageFlash!: Phaser.GameObjects.Rectangle;

  private keyHandler?: (event: KeyboardEvent) => void;
  private unsubscribe: Array<() => void> = [];
  private lastRefresh = 0;
  private lastRenderedName = "";
  private nextPanelDepth = 60;

  constructor() {
    super(SCENE_KEYS.UI);
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.drawHudPanel();

    const hasSwordsman =
      this.textures.exists("swordsman-idle-front") || this.textures.exists("swordsman-walk-front");
    this.avatar = this.add
      .sprite(
        48,
        48,
        this.textures.exists("swordsman-idle-front") ? "swordsman-idle-front" : "hero-0-down",
        this.textures.exists("swordsman-idle-front") ? "Swordsman_lvl3_Idle_front 0.aseprite" : undefined,
      )
      .setOrigin(30.5 / 64, 27 / 64)
      .setScale(hasSwordsman ? 2.7 : 2.2)
      .setDepth(10);

    const maskShape = this.make.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(22, 22, 52, 52);
    const mask = maskShape.createGeometryMask();
    this.avatar.setMask(mask);

    if (this.anims.exists("swordsman-idle-down")) {
      this.avatar.play("swordsman-idle-down");
    }

    this.nameText = this.add
      .text(86, 18, "ADVENTURER", {
        fontFamily: TITLE_FONT,
        fontSize: "9px",
        color: "#f4c95d",
        stroke: "#1a0e09",
        strokeThickness: 3,
      })
      .setDepth(10);

    this.levelText = this.add
      .text(273, 18, "Lv.1", {
        fontFamily: TITLE_FONT,
        fontSize: "9px",
        color: "#9fe08a",
        stroke: "#1a0e09",
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setDepth(10);

    this.hpBar = new HealthBar(this, 88, 44, {
      width: 184,
      height: 14,
      color: 0xe03535,
      backgroundColor: 0x3d1010,
      borderColor: 0x1a0e09,
      showText: true,
      textSize: 14,
      prefix: "HP ",
    });
    this.hpBar.setDepth(10);

    this.spBar = new HealthBar(this, 88, 68, {
      width: 184,
      height: 14,
      color: 0x2196f3,
      backgroundColor: 0x0e2540,
      borderColor: 0x1a0e09,
      showText: true,
      textSize: 14,
      prefix: "SP ",
    });
    this.spBar.setDepth(10);

    this.coinIcon = this.add
      .image(31, 95, "item-coin")
      .setScale(0.72)
      .setDepth(10);

    this.goldText = this.add
      .text(44, 86, "0 GP", {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#f4c95d",
        stroke: "#1a0e09",
        strokeThickness: 3,
      })
      .setDepth(10);

    this.jobBadgeText = this.add
      .text(207, 95, "Novice J.Lv.1", {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#cfe8c8",
        stroke: "#1a0e09",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.weaponIcon = this.add
      .image(67, 67, "item-unknown")
      .setScale(0.7)
      .setVisible(false)
      .setDepth(11);

    this.xpBar = new HealthBar(this, 12, height - 12, {
      width: width - 24,
      height: 5,
      color: COLORS.xp,
      backgroundColor: 0x121c26,
      borderColor: 0x0a110e,
    });
    this.xpBar.setDepth(10);

    this.jobXpBar = new HealthBar(this, 12, height - 6, {
      width: width - 24,
      height: 5,
      color: 0xa855f7,
      backgroundColor: 0x24112e,
      borderColor: 0x0a110e,
    });
    this.jobXpBar.setDepth(10);

    this.mapText = this.add
      .text(width - 18, 18, "VERDANT HOLLOW", {
        fontFamily: TITLE_FONT,
        fontSize: "12px",
        color: "#f4c95d",
        align: "right",
      })
      .setOrigin(1, 0)
      .setDepth(10);

    this.onlineText = this.add
      .text(width - 18, 44, "", {
        fontFamily: UI_FONT,
        fontSize: "19px",
        color: "#9fb8a0",
        align: "right",
      })
      .setOrigin(1, 0)
      .setDepth(10);

    this.controlsHintText = this.add
      .text(width / 2, height - 24, "WASD MOVE   SPACE ATTACK   I INV   E EQUIP   C STATUS", {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#6f8a76",
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.chat = new ChatPanel(this, (text, channel) => network.sendChat(text, channel));
    this.minimap = new MinimapPanel(this, (text, color) => this.showToast(text, color));
    this.shortcutBar = new ShortcutBar(this, (text, color) => this.showToast(text, color));
    this.inventory = new InventoryPanel(this, {
      onMessage: (text, color) => this.showToast(text, color),
      onFocus: () => this.bringPanelToFront(this.inventory.container),
      onClose: () => this.updateEquipInventoryLayout(),
      onStartDrag: (payload, icon) => this.shortcutBar.startDrag(payload, icon),
      isOverShortcut: (x, y) => this.shortcutBar.isOverSlot(x, y),
    });
    this.equipment = new EquipmentPanel(this, {
      onFocus: () => this.bringPanelToFront(this.equipment.container),
      onClose: () => this.updateEquipInventoryLayout(),
    });
    this.status = new StatusPanel(this, {
      onFocus: () => this.bringPanelToFront(this.status.container),
      onClose: () => this.updateEquipInventoryLayout(),
    });
    this.skill = new SkillPanel(this, {
      onMessage: (text, color) => this.showToast(text, color),
      onCast: (skillId) => network.useSkill(skillId),
      onFocus: () => this.bringPanelToFront(this.skill.container),
      onClose: () => this.updateEquipInventoryLayout(),
      onStartDrag: (payload, icon, tint) => this.shortcutBar.startDrag(payload, icon, tint),
    });
    this.setting = new SettingPanel(this, {
      onLogout: () => void this.logout(),
      onMessage: (text, color) => this.showToast(text, color),
      onFocus: () => this.bringPanelToFront(this.setting.container),
      onClose: () => this.updateEquipInventoryLayout(),
      getShortcutKeys: () => this.shortcutBar.getKeys(),
      onSetShortcutKey: (index, key) => this.shortcutBar.setKey(index, key),
      onResetShortcutKeys: () => this.shortcutBar.resetKeys(),
    });
    this.trade = new TradePanel(this);
    this.job = new JobPanel(this, Math.floor((width - 620) / 2), Math.floor((height - 440) / 2), {
      onFocus: () => this.bringPanelToFront(this.job.container),
      onClose: () => this.updateEquipInventoryLayout(),
    });
    this.quest = new QuestPanel(this, {
      onFocus: () => this.bringPanelToFront(this.quest.container),
      onClose: () => this.updateEquipInventoryLayout(),
    });
    this.partyHud = new PartyHUD(this, (name) => this.chat.openWithText(`/w ${name} `));
    this.partyPanel = new PartyPanel(this, (text, color) => this.showToast(text, color));
    this.playerContextMenu = new PlayerContextMenu(
      this,
      (name) => this.chat.openWithText(`/w ${name} `),
      (text, color) => this.showToast(text, color)
    );
    this.createPartyInviteDialog(width);
    this.buildBottomMenu(width, height);

    // The connection may have produced chat lines before this scene existed
    // (join announcements, the player's own greeting), so backfill them.
    for (const event of network.chatLog) this.chat.addMessage(event);

    this.createDeathOverlay(width, height);

    this.damageFlash = this.add
      .rectangle(0, 0, width, height, 0xd9534f, 1)
      .setOrigin(0)
      .setAlpha(0)
      .setDepth(90);

    this.toastText = this.add
      .text(width / 2, 116, "", {
        fontFamily: TITLE_FONT,
        fontSize: "16px",
        color: "#f4c95d",
        stroke: "#0b1512",
        strokeThickness: 6,
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(110);

    this.bindNetworkEvents();
    this.bindKeyboard();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.refresh();
  }

  update(time: number, _delta: number): void {
    if (time - this.lastRefresh > 100) {
      this.lastRefresh = time;
      this.refresh();
    }

    if (this.deathUntil > 0) {
      const remaining = this.deathUntil - Date.now();
      if (remaining <= 0) {
        this.hideDeath();
      } else {
        this.deathSub.setText(`RESPAWNING IN ${Math.ceil(remaining / 1000)}...`);
      }
    }
  }

  isChatOpen(): boolean {
    return this.chat?.isOpen ?? false;
  }

  isInventoryOpen(): boolean {
    return this.inventory?.isOpen ?? false;
  }

  isStatusOpen(): boolean {
    return this.status?.isOpen ?? false;
  }

  isEquipmentOpen(): boolean {
    return this.equipment?.isOpen ?? false;
  }

  isSettingOpen(): boolean {
    return this.setting?.isOpen ?? false;
  }

  isSkillOpen(): boolean {
    return this.skill?.isOpen ?? false;
  }

  isTradeOpen(): boolean {
    return this.trade?.isOpen ?? false;
  }

  refresh(): void {
    const state = network.state;
    const local = network.players.get(network.sessionId);

    if (state?.world) this.mapText.setText(state.world.name.toUpperCase());
    this.onlineText.setText(
      `${network.players.size} ONLINE   ${network.latency > 0 ? `${network.latency} MS` : "— MS"}`,
    );
    this.minimap?.refresh();

    if (!local) return;

    const jobDef = JOBS[local.jobId] ?? JOBS.novice;
    if (local.name !== this.lastRenderedName) {
      this.lastRenderedName = local.name;
      this.nameText.setScale(1);
      this.nameText.setText(local.name);
      if (this.nameText.width > 130) {
        this.nameText.setScale(130 / this.nameText.width, 1);
      }
    }
    this.levelText.setText(`Lv.${local.level}`);
    this.jobBadgeText.setText(`${jobDef.name} J.Lv.${local.jobLevel ?? 1}`);
    this.hpBar.setValue(local.hp, local.maxHp);
    this.hpBar.setColor(local.hp / local.maxHp < 0.3 ? 0xb82525 : 0xe03535);
    this.spBar.setValue(local.sp ?? 20, local.maxSp ?? 20);
    this.xpBar.setValue(local.xp, local.xpToNext);
    this.jobXpBar.setValue(local.jobXp ?? 0, local.jobXpToNext ?? 20);

    const avatarAnimKey = this.anims.exists(`${local.jobId}-idle-down`)
      ? `${local.jobId}-idle-down`
      : this.anims.exists("novice-idle-down")
      ? "novice-idle-down"
      : this.anims.exists("swordsman-idle-down")
      ? "swordsman-idle-down"
      : null;

    if (avatarAnimKey) {
      if (!this.avatar.anims.isPlaying || this.avatar.anims.currentAnim?.key !== avatarAnimKey) {
        this.avatar.play(avatarAnimKey, true);
      }
      this.avatar.setPosition(48, 48);
      this.avatar.setOrigin(30.5 / 64, 27 / 64);
      this.avatar.setScale(2.7);
    } else {
      const variant = ((local.outfit % 3) + 3) % 3;
      this.avatar.setTexture(`hero-${variant}-down`);
      this.avatar.setPosition(48, 48);
      this.avatar.setOrigin(0.5, 0.4);
      this.avatar.setScale(2.2);
    }

    this.goldText.setText(`${local.gold.toLocaleString()} GP`);

    if (local.weaponId) {
      this.weaponIcon.setTexture(itemTexture(local.weaponId)).setVisible(true);
    } else {
      this.weaponIcon.setVisible(false);
    }

    this.inventory.refresh();
    this.equipment.refresh();
    this.status.refresh();
    this.skill.refresh();
    this.trade.refresh();
    this.job.refresh();
    this.shortcutBar?.refresh();

    if (local.hp > 0 && this.deathUntil > 0) this.hideDeath();
  }

  flashDamage(): void {
    this.tweens.killTweensOf(this.damageFlash);
    this.damageFlash.setAlpha(0.24);
    this.tweens.add({
      targets: this.damageFlash,
      alpha: 0,
      duration: 280,
      ease: "Quad.easeOut",
    });
  }

  private broadcastContainer?: Phaser.GameObjects.Container;
  private broadcastTimer?: Phaser.Time.TimerEvent;

  showBroadcastBanner(text: string): void {
    this.broadcastTimer?.remove(false);
    this.broadcastContainer?.destroy(true);

    const w = this.scale.width;
    const msg = this.add
      .text(0, 0, text, {
        fontFamily: UI_FONT,
        fontSize: "17px",
        fontStyle: "bold",
        color: "#000000",
        align: "center",
        wordWrap: { width: Math.min(620, w - 120) },
      })
      .setOrigin(0.5);

    const boxW = Math.max(260, Math.ceil(msg.width) + 32);
    const boxH = Math.ceil(msg.height) + 14;
    const bg = this.add.graphics();
    bg.fillStyle(0xfacc15, 0.96);
    bg.fillRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 6);
    bg.lineStyle(2, 0x78350f, 1);
    bg.strokeRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 6);

    const cont = this.add.container(w / 2, 74, [bg, msg]).setDepth(220).setScrollFactor(0);
    this.broadcastContainer = cont;

    this.broadcastTimer = this.time.delayedCall(5000, () => {
      if (!this.scene.isActive()) return;
      this.tweens.add({
        targets: cont,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          cont.destroy(true);
          if (this.broadcastContainer === cont) {
            this.broadcastContainer = undefined;
          }
        },
      });
    });
  }

  showToast(text: string, color = "#f4c95d"): void {
    this.toastTween?.remove();
    this.toastText.setText(text).setColor(color).setAlpha(0).setY(116);
    this.toastTween = this.tweens.add({
      targets: this.toastText,
      alpha: 1,
      y: 100,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          if (!this.scene.isActive()) return;
          this.tweens.add({
            targets: this.toastText,
            alpha: 0,
            y: 88,
            duration: 320,
            ease: "Quad.easeIn",
          });
        });
      },
    });
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private drawHudPanel(): void {
    const g = this.add.graphics().setDepth(5);

    // Outer dark pixel outline for the wooden HUD
    g.fillStyle(0x1a0e09, 0.96);
    g.fillRect(10, 10, 274, 104);

    // Main warm wood / bronze body
    g.fillStyle(0x5c3824, 0.96);
    g.fillRect(12, 12, 270, 100);

    // Inner bevel highlight along top & left edges
    g.fillStyle(0x8e5c3a, 1);
    g.fillRect(13, 13, 268, 2);
    g.fillRect(13, 13, 2, 98);

    // Carved corner accents
    g.fillStyle(0xb57d4c, 1);
    g.fillRect(13, 13, 6, 3);
    g.fillRect(13, 13, 3, 6);
    g.fillRect(275, 13, 6, 3);
    g.fillRect(278, 13, 3, 6);
    g.fillRect(13, 108, 6, 3);
    g.fillRect(13, 105, 3, 6);
    g.fillRect(275, 108, 6, 3);
    g.fillRect(278, 105, 3, 6);

    // Portrait frame (left)
    g.fillStyle(0x402416, 1);
    g.fillRect(18, 18, 60, 60);
    g.lineStyle(2, 0x8e5c3a, 1);
    g.strokeRect(19, 19, 58, 58);
    g.fillStyle(0x281913, 1);
    g.fillRect(22, 22, 52, 52);

    // Carved frames around HP & SP bars
    g.fillStyle(0x402416, 1);
    g.fillRect(85, 34, 190, 20);
    g.fillRect(85, 58, 190, 20);
    g.lineStyle(1, 0x8e5c3a, 1);
    g.strokeRect(85, 34, 190, 20);
    g.strokeRect(85, 58, 190, 20);

    // Carved frame for GP (gold) tab
    g.fillStyle(0x3a2114, 1);
    g.fillRect(18, 84, 116, 22);
    g.lineStyle(1, 0x8e5c3a, 1);
    g.strokeRect(18, 84, 116, 22);

    // Carved frame for Job badge tab
    g.fillStyle(0x3a2114, 1);
    g.fillRect(140, 84, 135, 22);
    g.lineStyle(1, 0x8e5c3a, 1);
    g.strokeRect(140, 84, 135, 22);
  }

  private createDeathOverlay(width: number, height: number): void {
    this.deathShade = this.add.rectangle(0, 0, width, height, 0x2a0808, 0.68).setOrigin(0);
    this.deathTitle = this.add
      .text(width / 2, height / 2 - 36, "YOU DIED", {
        fontFamily: TITLE_FONT,
        fontSize: "32px",
        color: "#e08a7a",
        stroke: "#0b1512",
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.deathSub = this.add
      .text(width / 2, height / 2 + 28, "RESPAWNING...", {
        fontFamily: UI_FONT,
        fontSize: "26px",
        color: "#f1ecd8",
      })
      .setOrigin(0.5);

    this.deathOverlay = this.add
      .container(0, 0, [this.deathShade, this.deathTitle, this.deathSub])
      .setDepth(100)
      .setVisible(false);
  }

  private bindNetworkEvents(): void {
    this.unsubscribe.push(
      network.on("chat", (event: ChatEvent) => {
        this.chat.addMessage(event);
        if (event.channel === "all") {
          this.showBroadcastBanner(`📢 [ALL] ${event.name}: ${event.text}`);
        } else if (event.channel === "broadcast") {
          this.showBroadcastBanner(`📢 ${event.name}: ${event.text}`);
        }
      }),
      network.on("npc:dialog", (event: NpcDialogEvent) => {
        this.chat.addLocalText(`[${event.npcName}] ${event.text}`, "#f4c95d");
      }),
      network.on("loot:award", (event: LootAwardEvent) => {
        if (event.overflow) {
          this.showToast("SATCHEL FULL - SOME LOOT WAS LOST", "#e08a7a");
        }
        if (!this.chat.isDropMuted()) {
          const parts: string[] = [];
          if (event.gold > 0) parts.push(`+${event.gold} GP`);
          for (const stack of event.items) {
            parts.push(`${itemName(stack.itemId)} x${stack.qty}`);
          }
          if (parts.length > 0) {
            this.chat.addLocalText(
              `[DROP] ${event.monsterName}: ${parts.join(", ")}`,
              "#9fe08a",
            );
          }
        }
        this.inventory.refresh();
        this.status.refresh();
      }),
      network.on("xp:award", (event) => {
        if (!this.chat.isExpMuted() && event.xp > 0) {
          this.chat.addLocalText(
            `[EXP] +${event.xp} EXP (${event.monsterName})`,
            "#78d6ff",
          );
        }
      }),
      network.on("item:used", (event: ItemUsedEvent) => {
        this.showToast(`+${event.healed} HP`, "#9fe08a");
        this.inventory.refresh();
    this.equipment.refresh();
    this.status.refresh();
    this.skill.refresh();
    this.trade.refresh();
    this.job.refresh();
    this.shortcutBar?.refresh();
      }),
      network.on("item:equipped", (event: ItemEquippedEvent) => {
        const verb = event.action === "equip" ? "EQUIPPED" : "REMOVED";
        this.showToast(`${itemName(event.itemId).toUpperCase()} ${verb}`, "#f4c95d");
        this.inventory.refresh();
    this.equipment.refresh();
    this.status.refresh();
    this.skill.refresh();
    this.trade.refresh();
    this.job.refresh();
    this.shortcutBar?.refresh();
      }),
      network.on("item:error", (event: ItemErrorEvent) => {
        this.showToast(itemErrorMessage(event.reason), "#e08a7a");
      }),
      network.on("stat:error", (event: StatErrorEvent) => {
        this.showToast(
          event.reason === "no-points" ? "NO STAT POINTS LEFT." : "INVALID STAT.",
          "#e08a7a",
        );
      }),
      network.on("trade:invite", (event) => {
        this.trade.showInvite(event);
        this.showToast(`${event.requesterName.toUpperCase()} MENGAJAK TRADE`, "#f4c95d");
      }),
      network.on("trade:state", (event) => {
        this.closeAllPanels();
        this.trade.applyTradeState(event);
      }),
      network.on("trade:closed", (event) => {
        this.trade.close();
        this.inventory.refresh();
        if (event.message) {
          this.showToast(
            event.message.toUpperCase(),
            event.reason === "completed" ? "#9fe08a" : "#e08a7a",
          );
        }
      }),
      network.on("boss:spawn", (event) => {
        this.showToast(`⚠ BOSS MUNCUL: ${event.name.toUpperCase()}!`, "#ff6b6b");
      }),
      network.on("combat:hit", (event: CombatHitEvent) => {
        if (event.targetId === network.sessionId && event.damage > 0) this.flashDamage();
      }),
      network.on("player:died", (event: PlayerDiedEvent) => {
        if (event.sessionId !== network.sessionId) return;
        this.deathUntil = Date.now() + event.respawnInMs;
        this.deathOverlay.setVisible(true);
        this.deathSub.setText(`RESPAWNING IN ${Math.ceil(event.respawnInMs / 1000)}...`);
      }),
      network.on("player:respawned", (event: PlayerRespawnedEvent) => {
        if (event.sessionId !== network.sessionId) return;
        this.hideDeath();
      }),
      network.on("player:levelup", (event) => {
        if (event.sessionId !== network.sessionId) return;
        this.showToast(`LEVEL ${event.level}! +3 STAT PTS (C)`, "#f4c95d");
      }),
      network.on("player:joblevelup", (event) => {
        if (event.sessionId !== network.sessionId) return;
        const jobName = JOBS[event.jobId]?.name ?? "Job";
        this.showToast(`JOB LEVEL ${event.jobLevel} [${jobName.toUpperCase()}]!`, "#a855f7");
        this.job.refresh();
      }),
      network.on("player:jobchanged", (event) => {
        if (event.sessionId !== network.sessionId) return;
        const jobName = JOBS[event.jobId]?.name ?? event.jobId;
        this.showToast(`SELAMAT! GANTI JOB: ${jobName.toUpperCase()}!`, "#9fe08a");
        this.job.refresh();
      }),
      network.on("job:error", (event) => {
        this.showToast(event.reason.toUpperCase(), "#e08a7a");
      }),
      network.on("party:update", () => {
        this.partyHud.refresh();
        this.partyPanel.refresh();
      }),
      network.on("party:member:update", () => {
        this.partyHud.refresh();
        this.partyPanel.refresh();
      }),
      network.on("party:invite", (event: PartyInviteEvent) => {
        this.showPartyInvite(event);
        this.showToast(`${event.inviterName.toUpperCase()} MENGAJAK KE PARTY!`, "#9fe08a");
      }),
      network.on("party:left", (event: PartyLeftEvent) => {
        this.partyHud.refresh();
        this.partyPanel.refresh();
        if (event.reason) {
          this.showToast(event.reason.toUpperCase(), "#e08a7a");
        }
      }),
      network.on("friend:list", () => {
        this.partyPanel.refresh();
      }),
      network.on("disconnected", () => {
        this.showToast("CONNECTION LOST", "#e08a7a");
      }),
      network.on("error", (error) => {
        this.showToast(error.message.toUpperCase().slice(0, 60), "#e08a7a");
      }),
    );
  }

  private bindKeyboard(): void {
    this.keyHandler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (this.chat.isOpen) {
        this.chat.handleKey(event);
        return;
      }

      if (this.setting.isListeningForKey) {
        this.setting.handleKeyBind(event);
        return;
      }

      if (event.key === "Enter" || event.key === "/") {
        event.preventDefault();
        this.chat.openInput();
        return;
      }

      if (event.key === "Escape") {
        if (this.trade.isOpen) {
          network.cancelTrade();
          this.trade.close();
        }
        this.partyPanel.close();
        this.playerContextMenu.hide();
        this.hidePartyInvite();
        this.closeAllPanels();
        this.chat.closeSettings();
        this.minimap.closePopup();
        return;
      }

      const lower = event.key.toLowerCase();
      if (this.pendingPartyInviteId) {
        if (lower === "y") {
          network.respondPartyInvite(this.pendingPartyInviteId, true);
          this.hidePartyInvite();
          return;
        } else if (lower === "n") {
          network.respondPartyInvite(this.pendingPartyInviteId, false);
          this.hidePartyInvite();
          return;
        }
      }

      if (this.shortcutBar.handleKey(event.key)) {
        return;
      }
      if (event.key === "1") {
        network.useSkill("magnum-break");
      } else if (lower === "i") {
        this.togglePanel("inventory");
      } else if (lower === "e") {
        this.togglePanel("equipment");
      } else if (lower === "c") {
        this.togglePanel("status");
      } else if (lower === "k") {
        this.togglePanel("skill");
      } else if (lower === "j") {
        this.togglePanel("job");
      } else if (lower === "p") {
        this.togglePanel("party");
      } else if (lower === "q") {
        this.togglePanel("quest");
      }
    };

    this.input.keyboard?.on("keydown", this.keyHandler);
  }

  private buildBottomMenu(width: number, height: number): void {
    const items: Array<{
      id: "status" | "equipment" | "skill" | "job" | "party" | "quest" | "inventory" | "setting";
      label: string;
      icon: string;
    }> = [
      { id: "status", label: "STATUS", icon: "menu-status" },
      { id: "equipment", label: "EQUIP", icon: "menu-equipment" },
      { id: "skill", label: "SKILL", icon: "menu-skill" },
      { id: "job", label: "JOB", icon: "menu-job" },
      { id: "party", label: "PARTY", icon: "menu-party" },
      { id: "quest", label: "QUEST", icon: "menu-quest" },
      { id: "inventory", label: "INV", icon: "menu-inventory" },
      { id: "setting", label: "SETTING", icon: "menu-setting" },
    ];

    const iconSize = 39; // 26 * 1.5 (+0.5x)
    const btnW = 44;
    const btnH = 44;
    const gap = 8;
    const totalW = items.length * btnW + (items.length - 1) * gap;
    this.bottomMenuWidth = totalW;
    const startX = width - 16 - totalW;
    const startY = height - btnH - 20;

    this.bottomMenuContainer = this.add.container(startX, startY).setDepth(15);

    items.forEach((item, index) => {
      const bx = index * (btnW + gap);
      const icon = this.add
        .image(bx + btnW / 2, btnH / 2, item.icon)
        .setDisplaySize(iconSize, iconSize);

      const hit = this.add
        .rectangle(bx, 0, btnW, btnH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

      hit.on("pointerover", () => {
        icon.setDisplaySize(iconSize + 5, iconSize + 5);
      });
      hit.on("pointerout", () => {
        icon.setDisplaySize(iconSize, iconSize);
      });
      hit.on("pointerdown", () => this.togglePanel(item.id));

      this.bottomMenuContainer.add([icon, hit]);
    });
  }

  bringPanelToFront(container: Phaser.GameObjects.Container): void {
    this.nextPanelDepth += 1;
    container.setDepth(this.nextPanelDepth);
  }

  private togglePanel(target: "status" | "equipment" | "skill" | "inventory" | "setting" | "job" | "quest" | "party"): void {
    if (target === "equipment") {
      this.status.close();
      this.skill.close();
      this.setting.close();
      this.job.close();
      this.quest.close();
      this.partyPanel.close();
      this.equipment.toggle();
      if (this.equipment.isOpen) this.bringPanelToFront(this.equipment.container);
    } else if (target === "inventory") {
      this.status.close();
      this.skill.close();
      this.setting.close();
      this.job.close();
      this.quest.close();
      this.partyPanel.close();
      this.inventory.toggle();
      if (this.inventory.isOpen) this.bringPanelToFront(this.inventory.container);
    } else {
      this.equipment.close();
      this.inventory.close();
      if (target !== "status") this.status.close();
      if (target !== "skill") this.skill.close();
      if (target !== "setting") this.setting.close();
      if (target !== "job") this.job.close();
      if (target !== "quest") this.quest.close();
      if (target !== "party") this.partyPanel.close();

      if (target === "status") {
        this.status.toggle();
        if (this.status.isOpen) this.bringPanelToFront(this.status.container);
      } else if (target === "skill") {
        this.skill.toggle();
        if (this.skill.isOpen) this.bringPanelToFront(this.skill.container);
      } else if (target === "setting") {
        this.setting.toggle();
        if (this.setting.isOpen) this.bringPanelToFront(this.setting.container);
      } else if (target === "job") {
        this.job.toggle();
        if (this.job.isOpen) this.bringPanelToFront(this.job.container);
      } else if (target === "quest") {
        this.quest.toggle();
        if (this.quest.isOpen) this.bringPanelToFront(this.quest.container);
      } else if (target === "party") {
        this.partyPanel.toggle();
        if (this.partyPanel.visible) this.bringPanelToFront(this.partyPanel.container);
      }
    }

    this.updateEquipInventoryLayout();
  }

  private updateEquipInventoryLayout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const equipW = 370;
    const equipH = 224;
    const invW = 328;
    const invH = 370;
    const gap = 20;

    const equipOpen = this.equipment?.isOpen ?? false;
    const invOpen = this.inventory?.isOpen ?? false;

    if (!this.equipment.hasUserMoved && !this.inventory.hasUserMoved) {
      if (equipOpen && invOpen) {
        const totalW = equipW + gap + invW;
        const startX = Math.max(16, Math.floor((width - totalW) / 2));
        this.equipment.container.setPosition(startX, Math.floor((height - equipH) / 2));
        this.inventory.container.setPosition(startX + equipW + gap, Math.floor((height - invH) / 2));
      } else {
        if (equipOpen) {
          this.equipment.container.setPosition(
            Math.floor((width - equipW) / 2),
            Math.floor((height - equipH) / 2),
          );
        }
        if (invOpen) {
          this.inventory.container.setPosition(
            Math.floor((width - invW) / 2),
            Math.floor((height - invH) / 2),
          );
        }
      }
    } else {
      if (!this.equipment.hasUserMoved && equipOpen) {
        this.equipment.container.setPosition(
          Math.floor((width - equipW) / 2),
          Math.floor((height - equipH) / 2),
        );
      }
      if (!this.inventory.hasUserMoved && invOpen) {
        this.inventory.container.setPosition(
          Math.floor((width - invW) / 2),
          Math.floor((height - invH) / 2),
        );
      }
    }
  }

  private closeAllPanels(): void {
    this.status.close();
    this.equipment.close();
    this.skill.close();
    this.inventory.close();
    this.setting.close();
    this.job.close();
    this.quest.close();
    this.partyPanel.close();
    this.playerContextMenu.hide();
    this.updateEquipInventoryLayout();
  }

  showPlayerContextMenu(x: number, y: number, target: ContextMenuTarget): void {
    this.playerContextMenu.show(x, y, target);
  }

  private createPartyInviteDialog(width: number): void {
    const invW = 380;
    const invH = 100;
    this.partyInviteContainer = this.add
      .container((width - invW) / 2, 80)
      .setDepth(85)
      .setScrollFactor(0)
      .setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a0e09, 0.96);
    bg.fillRoundedRect(0, 0, invW, invH, 8);
    bg.lineStyle(2, 0x9fe08a, 1);
    bg.strokeRoundedRect(1, 1, invW - 2, invH - 2, 8);
    this.partyInviteContainer.add(bg);

    this.partyInviteText = this.add
      .text(invW / 2, 16, "", {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#f4c95d",
        align: "center",
      })
      .setOrigin(0.5, 0);
    this.partyInviteContainer.add(this.partyInviteText);

    // Accept button
    const btnW = 120;
    const btnH = 32;
    const btnY = 54;

    const acceptBtn = this.add.graphics();
    acceptBtn.fillStyle(0x2e5426, 1);
    acceptBtn.fillRoundedRect(50, btnY, btnW, btnH, 4);
    acceptBtn.lineStyle(1.5, 0x9fe08a, 1);
    acceptBtn.strokeRoundedRect(50, btnY, btnW, btnH, 4);

    const acceptLabel = this.add
      .text(50 + btnW / 2, btnY + btnH / 2, "TERIMA (Y)", {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const acceptHit = this.add
      .rectangle(50, btnY, btnW, btnH)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    acceptHit.on("pointerdown", () => {
      if (this.pendingPartyInviteId) {
        network.respondPartyInvite(this.pendingPartyInviteId, true);
        this.hidePartyInvite();
      }
    });

    // Decline button
    const declineBtn = this.add.graphics();
    declineBtn.fillStyle(0x5a1f18, 1);
    declineBtn.fillRoundedRect(210, btnY, btnW, btnH, 4);
    declineBtn.lineStyle(1.5, 0xe08a7a, 1);
    declineBtn.strokeRoundedRect(210, btnY, btnW, btnH, 4);

    const declineLabel = this.add
      .text(210 + btnW / 2, btnY + btnH / 2, "TOLAK (N)", {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const declineHit = this.add
      .rectangle(210, btnY, btnW, btnH)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    declineHit.on("pointerdown", () => {
      if (this.pendingPartyInviteId) {
        network.respondPartyInvite(this.pendingPartyInviteId, false);
        this.hidePartyInvite();
      }
    });

    this.partyInviteContainer.add([
      acceptBtn,
      acceptLabel,
      acceptHit,
      declineBtn,
      declineLabel,
      declineHit,
    ]);
  }

  showPartyInvite(event: PartyInviteEvent): void {
    this.pendingPartyInviteId = event.partyId;
    this.partyInviteText.setText(
      `${event.inviterName} mengundang ke Party "${event.partyName}"\nApakah anda ingin bergabung ? Y/N`
    );
    this.partyInviteContainer.setVisible(true);
  }

  hidePartyInvite(): void {
    this.pendingPartyInviteId = "";
    this.partyInviteContainer.setVisible(false);
  }

  private hideDeath(): void {
    this.deathUntil = 0;
    this.deathOverlay.setVisible(false);
  }

  private async logout(): Promise<void> {
    clearSession();
    await network.disconnect();

    this.scene.stop(SCENE_KEYS.Game);
    this.scene.start(SCENE_KEYS.MainMenu);
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    const width = gameSize.width;
    const height = gameSize.height;

    this.mapText.setPosition(width - 18, 18);
    this.onlineText.setPosition(width - 18, 44);
    this.controlsHintText.setPosition(width / 2, height - 24);
    this.xpBar.setPosition(12, height - 12);
    this.xpBar.setBarWidth(width - 24);
    this.jobXpBar.setPosition(12, height - 6);
    this.jobXpBar.setBarWidth(width - 24);
    this.chat.reposition(height);
    this.minimap.reposition(width);
    this.shortcutBar.reposition(width);
    this.bottomMenuContainer.setPosition(width - 16 - this.bottomMenuWidth, height - 44 - 20);
    this.damageFlash.setSize(width, height);
    this.toastText.setPosition(width / 2, 116);

    this.deathShade.setSize(width, height);
    this.deathTitle.setPosition(width / 2, height / 2 - 36);
    this.deathSub.setPosition(width / 2, height / 2 + 28);

    this.updateEquipInventoryLayout();
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);

    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];

    if (this.keyHandler) {
      this.input.keyboard?.off("keydown", this.keyHandler);
      this.keyHandler = undefined;
    }

    this.toastTween?.remove();
    this.minimap?.destroy();
    this.shortcutBar?.destroy();
    this.partyHud?.destroy();
    this.partyPanel?.destroy();
    this.playerContextMenu?.destroy();
  }
}

function itemErrorMessage(reason: ItemErrorEvent["reason"]): string {
  switch (reason) {
    case "dead":
      return "NOT WHILE DEAD.";
    case "cooldown":
      return "TOO SOON.";
    case "empty":
      return "THAT SLOT IS EMPTY.";
    case "not-usable":
      return "THAT ITEM CANNOT BE USED.";
    case "not-equippable":
      return "THAT ITEM CANNOT BE EQUIPPED.";
    case "full-hp":
      return "YOU ARE ALREADY AT FULL HEALTH.";
    case "inventory-full":
      return "YOUR SATCHEL IS FULL.";
    default:
      return "NOTHING HAPPENS.";
  }
}
