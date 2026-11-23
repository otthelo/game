import Phaser from "phaser";
import {
  COLORS,
  NAME_MAX_LENGTH,
  SCENE_KEYS,
  SERVER_URL,
  TITLE_FONT,
  UI_FONT,
} from "../config/gameConfig";
import { network, type NetworkError } from "../network/NetworkClient";
import {
  AuthError,
  clearSession,
  createCharacter,
  deleteCharacter,
  fetchCharacters,
  loadSession,
  type AuthSession,
} from "../network/authApi";
import type { CharacterSummary } from "../types";
import { JOBS } from "../config/jobs";

const MAX_SLOTS = 3;
const SLOT_WIDTH = 210;
const SLOT_HEIGHT = 330;
const SLOT_GAP = 22;
const PANEL_TOP = 175;

function outfitForName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (Math.imul(hash, 31) + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 3;
}

export class CharacterSelectScene extends Phaser.Scene {
  private session: AuthSession | null = null;
  private characters: CharacterSummary[] = [];
  private loading = false;
  private entering = false;

  // Visual containers
  private backdropObjects: Phaser.GameObjects.GameObject[] = [];
  private titleObjects: Phaser.GameObjects.GameObject[] = [];
  private contentObjects: Phaser.GameObjects.GameObject[] = [];
  private modalObjects: Phaser.GameObjects.GameObject[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private accountInfoText!: Phaser.GameObjects.Text;

  // Modal state
  private activeModal: "none" | "create" | "delete" = "none";
  private newCharName = "";
  private deleteTarget: CharacterSummary | null = null;
  private caretVisible = true;
  private caretTimer?: Phaser.Time.TimerEvent;
  private keyHandler?: (event: KeyboardEvent) => void;

  constructor() {
    super(SCENE_KEYS.CharacterSelect);
  }

  init(data?: { session?: AuthSession }): void {
    this.session = data?.session ?? loadSession();
  }

  create(): void {
    if (!this.session) {
      this.scene.start(SCENE_KEYS.MainMenu);
      return;
    }

    this.cameras.main.setBackgroundColor("#081010");
    this.cameras.main.fadeIn(280, 8, 16, 16);

    this.drawBackdrop();
    this.drawTitle();

    this.statusText = this.add
      .text(this.scale.width / 2, 595, "", {
        fontFamily: UI_FONT,
        fontSize: "19px",
        color: "#86a58a",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.accountInfoText = this.add
      .text(
        this.scale.width / 2,
        642,
        `LOGGED IN AS: ${this.session.account.username.toUpperCase()}    [ LOGOUT / SWITCH ACCOUNT ]`,
        {
          fontFamily: UI_FONT,
          fontSize: "17px",
          color: "#7f9a84",
        }
      )
      .setOrigin(0.5)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });

    this.accountInfoText.on("pointerover", () => this.accountInfoText.setColor("#f4c95d"));
    this.accountInfoText.on("pointerout", () => this.accountInfoText.setColor("#7f9a84"));
    this.accountInfoText.on("pointerdown", () => this.logout());

    this.keyHandler = (e) => this.onKeyDown(e);
    this.input.keyboard?.on("keydown", this.keyHandler);

    this.caretTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.caretVisible = !this.caretVisible;
        if (this.activeModal === "create") {
          this.refreshCreateModalInput();
        }
      },
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    void this.loadCharactersList();
  }

  private onResize(): void {
    this.drawBackdrop();
    this.drawTitle();
    const cx = this.scale.width / 2;
    this.statusText.setX(cx);
    this.accountInfoText.setX(cx);
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Backdrop & Title
  // ---------------------------------------------------------------------------

  private drawBackdrop(): void {
    for (const obj of this.backdropObjects) obj.destroy();
    this.backdropObjects = [];

    const width = this.scale.width;
    const height = this.scale.height;
    const groundY = Math.max(470, Math.floor(height * 0.65));

    const sky = this.add.graphics().setDepth(-20);
    sky.fillGradientStyle(0x0b1d22, 0x0b1d22, 0x1c3a2b, 0x1c3a2b, 1);
    sky.fillRect(0, 0, width, height);
    this.backdropObjects.push(sky);

    // Far mountains
    const far = this.add.graphics().setDepth(-15);
    far.fillStyle(0x142c2a, 1);
    const farCount = Math.ceil(width / 220) + 2;
    for (let i = 0; i < farCount; i++) {
      const x = i * 220 - 80;
      far.fillTriangle(x, groundY, x + 150, groundY - 220 + (i % 3) * 35, x + 300, groundY);
    }
    far.fillStyle(0x1b3a30, 1);
    const nearCount = Math.ceil(width / 190) + 2;
    for (let i = 0; i < nearCount; i++) {
      const x = i * 190 - 50;
      far.fillTriangle(x, groundY + 30, x + 120, groundY - 150 + (i % 2) * 40, x + 250, groundY + 30);
    }
    this.backdropObjects.push(far);

    // Glow
    const glow = this.add.graphics().setDepth(-14);
    glow.fillStyle(0xf4c95d, 0.04);
    glow.fillEllipse(width / 2, 130, 640, 240);
    glow.fillStyle(0x9fe08a, 0.03);
    glow.fillEllipse(width / 2, 150, 900, 340);
    this.backdropObjects.push(glow);

    const ground = this.add
      .tileSprite(0, groundY, width, Math.max(100, height - groundY), "grass-0")
      .setOrigin(0)
      .setTileScale(2)
      .setDepth(-10);
    ground.setAlpha(0.9);
    this.backdropObjects.push(ground);

    // Trees
    const treeCount = Math.ceil(width / 84) + 2;
    for (let i = 0; i < treeCount; i++) {
      const x = i * 84 + ((i % 3) * 17) - 20;
      const tree = this.add
        .image(x, groundY + 30, "tree")
        .setOrigin(0.5, 1)
        .setScale(1.7 + (i % 2) * 0.25)
        .setTint(0x5d8a55)
        .setAlpha(0.75)
        .setDepth(-5);
      tree.y += (i % 2) * 4;
      this.backdropObjects.push(tree);
    }

    // Vignette
    const vignette = this.add.graphics().setDepth(30);
    vignette.fillStyle(0x000000, 0.35);
    vignette.fillRect(0, 0, width, 60);
    vignette.fillRect(0, height - 60, width, 60);
    vignette.fillRect(0, 0, 40, height);
    vignette.fillRect(width - 40, 0, 40, height);
    this.backdropObjects.push(vignette);
  }

  private drawTitle(): void {
    for (const obj of this.titleObjects) obj.destroy();
    this.titleObjects = [];

    const width = this.scale.width;
    const title = this.add
      .text(width / 2, 58, "CHARACTER SELECTION", {
        fontFamily: TITLE_FONT,
        fontSize: "24px",
        color: "#f4c95d",
        stroke: "#0b1512",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 4, "#000000", 8, true, true);
    this.titleObjects.push(title);

    const subtitle = this.add
      .text(width / 2, 94, "Choose your adventurer or forge a new hero to enter the realm", {
        fontFamily: UI_FONT,
        fontSize: "19px",
        color: "#b9d3b0",
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.titleObjects.push(subtitle);
  }

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  private async loadCharactersList(): Promise<void> {
    if (!this.session) return;
    this.loading = true;
    this.setStatus("LOADING HEROES...", "#f4c95d");
    this.render();

    try {
      this.characters = await fetchCharacters(this.session.token);
      this.loading = false;
      this.setStatus(
        this.characters.length === 0
          ? "NO CHARACTERS YET. CREATE ONE TO BEGIN YOUR ADVENTURE!"
          : "SELECT A CHARACTER TO ENTER THE REALM.",
        "#86a58a"
      );
      this.render();
    } catch (error) {
      this.loading = false;
      if (error instanceof AuthError && error.status === 401) {
        clearSession();
        this.setStatus("SESSION EXPIRED. PLEASE LOG IN AGAIN.", "#e08a7a");
        this.time.delayedCall(1200, () => {
          this.scene.start(SCENE_KEYS.MainMenu);
        });
        return;
      }
      this.setStatus("COULD NOT LOAD CHARACTERS. CHECK SERVER CONNECTION.", "#e08a7a");
      this.render();
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering Slots
  // ---------------------------------------------------------------------------

  private render(): void {
    for (const obj of this.contentObjects) obj.destroy();
    this.contentObjects = [];

    if (this.loading) {
      const cx = this.scale.width / 2;
      const spinner = this.add
        .text(cx, 320, "GATHERING HEROES FROM THE REALM...", {
          fontFamily: TITLE_FONT,
          fontSize: "14px",
          color: "#9fe08a",
        })
        .setOrigin(0.5)
        .setDepth(12);
      this.contentObjects.push(spinner);
      return;
    }

    const totalWidth = MAX_SLOTS * SLOT_WIDTH + (MAX_SLOTS - 1) * SLOT_GAP;
    const startX = (this.scale.width - totalWidth) / 2;

    for (let i = 0; i < MAX_SLOTS; i++) {
      const slotX = startX + i * (SLOT_WIDTH + SLOT_GAP);
      const char = this.characters[i];

      if (char) {
        this.renderOccupiedSlot(slotX, PANEL_TOP, char);
      } else {
        this.renderEmptySlot(slotX, PANEL_TOP, i);
      }
    }
  }

  private renderOccupiedSlot(x: number, y: number, char: CharacterSummary): void {
    const cx = x + SLOT_WIDTH / 2;

    // Panel card
    const card = this.add.graphics().setDepth(5);
    card.fillStyle(COLORS.ink, 0.94);
    card.fillRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
    card.lineStyle(2, 0x3b5a47, 1);
    card.strokeRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
    this.contentObjects.push(card);

    // Interactive hover zone
    const hitZone = this.add
      .rectangle(cx, y + SLOT_HEIGHT / 2, SLOT_WIDTH, SLOT_HEIGHT, 0x000000, 0)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });
    this.contentObjects.push(hitZone);

    hitZone.on("pointerover", () => {
      card.clear();
      card.fillStyle(0x0e1c16, 0.96);
      card.fillRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
      card.lineStyle(2, 0x9fe08a, 1);
      card.strokeRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
    });

    hitZone.on("pointerout", () => {
      card.clear();
      card.fillStyle(COLORS.ink, 0.94);
      card.fillRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
      card.lineStyle(2, 0x3b5a47, 1);
      card.strokeRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
    });

    // Character sprite preview
    const jobId = char.jobId ?? "novice";
    const idleAnimKey = this.anims.exists(`${jobId}-idle-down`)
      ? `${jobId}-idle-down`
      : this.anims.exists("novice-idle-down")
      ? "novice-idle-down"
      : this.anims.exists("swordsman-idle-down")
      ? "swordsman-idle-down"
      : null;

    // Shadow below sprite
    const shadow = this.add.image(cx, y + 76, "shadow").setDepth(7).setScale(1.2);
    this.contentObjects.push(shadow);

    if (idleAnimKey) {
      const sprite = this.add.sprite(cx, y + 62, "").setDepth(8).setScale(2.5);
      sprite.play(idleAnimKey);
      this.contentObjects.push(sprite);
    } else {
      const outfitIndex = ((char.outfit % 3) + 3) % 3;
      const spriteKey = `hero-${outfitIndex}-down`;
      const sprite = this.add.image(cx, y + 62, spriteKey).setDepth(8).setScale(2.5);
      this.contentObjects.push(sprite);
    }

    // Character Name
    const nameText = this.add
      .text(cx, y + 104, char.name.toUpperCase(), {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: "#f4c95d",
      })
      .setOrigin(0.5)
      .setDepth(8);
    this.contentObjects.push(nameText);

    // Level & Job Badge
    const jobName = (char.jobId && JOBS[char.jobId]?.name) ? JOBS[char.jobId].name : "Novice";
    const jobLv = char.jobLevel ?? 1;
    const levelText = this.add
      .text(cx, y + 128, `Lv.${char.level}  [${jobName} J.Lv.${jobLv}]`, {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#9fe08a",
      })
      .setOrigin(0.5)
      .setDepth(8);
    this.contentObjects.push(levelText);

    // Stat divider line
    const divider = this.add.graphics().setDepth(7);
    divider.lineStyle(1, 0x274332, 1);
    divider.lineBetween(x + 16, y + 148, x + SLOT_WIDTH - 16, y + 148);
    this.contentObjects.push(divider);

    // Stat rows (2 columns)
    const statsY = y + 158;
    const col1X = x + 24;
    const col2X = x + SLOT_WIDTH / 2 + 10;
    const rowH = 19;

    const stats = [
      { col: 1, row: 0, label: "STR", val: char.str },
      { col: 2, row: 0, label: "INT", val: char.int },
      { col: 1, row: 1, label: "AGI", val: char.agi },
      { col: 2, row: 1, label: "DEX", val: char.dex },
      { col: 1, row: 2, label: "VIT", val: char.vit },
      { col: 2, row: 2, label: "LUK", val: char.luk },
    ];

    for (const stat of stats) {
      const sx = stat.col === 1 ? col1X : col2X;
      const sy = statsY + stat.row * rowH;
      const statLabel = this.add
        .text(sx, sy, `${stat.label}  ${stat.val}`, {
          fontFamily: UI_FONT,
          fontSize: "16px",
          color: "#9db7a2",
        })
        .setDepth(8);
      this.contentObjects.push(statLabel);
    }

    // Play Button
    const playBtn = this.add
      .text(cx, y + 244, "[ PLAY ]", {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: "#9fe08a",
        backgroundColor: "#14251d",
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setInteractive({ useHandCursor: true });
    this.contentObjects.push(playBtn);

    playBtn.on("pointerover", () => playBtn.setColor("#f4c95d"));
    playBtn.on("pointerout", () => playBtn.setColor("#9fe08a"));
    playBtn.on("pointerdown", () => this.selectCharacter(char));

    // Delete Button
    const delBtn = this.add
      .text(cx, y + 294, "[ DELETE ]", {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#a05b53",
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setInteractive({ useHandCursor: true });
    this.contentObjects.push(delBtn);

    delBtn.on("pointerover", () => delBtn.setColor("#e08a7a"));
    delBtn.on("pointerout", () => delBtn.setColor("#a05b53"));
    delBtn.on("pointerdown", () => this.openDeleteModal(char));
  }

  private renderEmptySlot(x: number, y: number, slotIndex: number): void {
    const cx = x + SLOT_WIDTH / 2;

    const card = this.add.graphics().setDepth(5);
    card.fillStyle(0x071110, 0.7);
    card.fillRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
    card.lineStyle(2, 0x1f3429, 0.8);
    card.strokeRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
    this.contentObjects.push(card);

    const plusIcon = this.add
      .text(cx, y + 100, "+", {
        fontFamily: TITLE_FONT,
        fontSize: "36px",
        color: "#35513f",
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.contentObjects.push(plusIcon);

    const emptyLabel = this.add
      .text(cx, y + 148, `SLOT ${slotIndex + 1}`, {
        fontFamily: TITLE_FONT,
        fontSize: "11px",
        color: "#46624f",
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.contentObjects.push(emptyLabel);

    const descLabel = this.add
      .text(cx, y + 176, "EMPTY SLOT", {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#3a5342",
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.contentObjects.push(descLabel);

    const createBtn = this.add
      .text(cx, y + 244, "[ + CREATE ]", {
        fontFamily: TITLE_FONT,
        fontSize: "11px",
        color: "#7f9a84",
        backgroundColor: "#0d1b15",
        padding: { x: 14, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setInteractive({ useHandCursor: true });
    this.contentObjects.push(createBtn);

    createBtn.on("pointerover", () => {
      createBtn.setColor("#9fe08a");
      card.clear();
      card.fillStyle(0x0b1a15, 0.85);
      card.fillRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
      card.lineStyle(2, 0x4a7258, 1);
      card.strokeRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
    });

    createBtn.on("pointerout", () => {
      createBtn.setColor("#7f9a84");
      card.clear();
      card.fillStyle(0x071110, 0.7);
      card.fillRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
      card.lineStyle(2, 0x1f3429, 0.8);
      card.strokeRoundedRect(x, y, SLOT_WIDTH, SLOT_HEIGHT, 8);
    });

    createBtn.on("pointerdown", () => this.openCreateModal());
  }

  // ---------------------------------------------------------------------------
  // Character Selection & Game Launch
  // ---------------------------------------------------------------------------

  private async selectCharacter(char: CharacterSummary): Promise<void> {
    if (this.entering || !this.session) return;
    this.entering = true;
    this.setStatus(`CONNECTING WITH ${char.name.toUpperCase()}...`, "#f4c95d");

    try {
      if (!network.connected) {
        await network.connect(this.session.token, char.id);
      }

      this.setStatus(`ENTERING REALM AS ${char.name.toUpperCase()}...`, "#9fe08a");
      this.cameras.main.fadeOut(240, 8, 16, 16);
      this.time.delayedCall(260, () => {
        this.scene.start(SCENE_KEYS.Game);
      });
    } catch (error) {
      this.entering = false;
      const code = (error as NetworkError)?.code;
      if (code === 4001) {
        clearSession();
        this.setStatus("SESSION EXPIRED. PLEASE LOG IN AGAIN.", "#e08a7a");
        this.time.delayedCall(1200, () => {
          this.scene.start(SCENE_KEYS.MainMenu);
        });
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`COULD NOT ENTER REALM: ${msg}`.toUpperCase().slice(0, 80), "#e08a7a");
    }
  }

  // ---------------------------------------------------------------------------
  // Modal: Character Creation
  // ---------------------------------------------------------------------------

  private createInputText?: Phaser.GameObjects.Text;
  private createPreviewSprite?: Phaser.GameObjects.Image;
  private createErrorText?: Phaser.GameObjects.Text;

  private openCreateModal(): void {
    if (this.entering || this.loading) return;
    this.activeModal = "create";
    this.newCharName = "";
    this.caretVisible = true;
    this.renderCreateModal();
  }

  private renderCreateModal(): void {
    this.clearModal();

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const modalW = 460;
    const modalH = 340;

    // Dark backdrop blocker
    const blocker = this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.72)
      .setDepth(50)
      .setInteractive();
    this.modalObjects.push(blocker);

    // Modal panel
    const panel = this.add.graphics().setDepth(51);
    panel.fillStyle(COLORS.ink, 0.97);
    panel.fillRoundedRect(cx - modalW / 2, cy - modalH / 2, modalW, modalH, 8);
    panel.lineStyle(2, 0x3b5a47, 1);
    panel.strokeRoundedRect(cx - modalW / 2, cy - modalH / 2, modalW, modalH, 8);
    this.modalObjects.push(panel);

    // Modal Title
    const title = this.add
      .text(cx, cy - modalH / 2 + 32, "FORGE NEW CHARACTER", {
        fontFamily: TITLE_FONT,
        fontSize: "15px",
        color: "#f4c95d",
      })
      .setOrigin(0.5)
      .setDepth(52);
    this.modalObjects.push(title);

    // Character preview shadow & sprite
    const shadow = this.add.image(cx, cy - 44, "shadow").setDepth(52).setScale(1.2);
    this.modalObjects.push(shadow);

    this.createPreviewSprite = this.add
      .image(cx, cy - 58, "hero-0-down")
      .setDepth(53)
      .setScale(2.6);
    this.modalObjects.push(this.createPreviewSprite);

    // Input Label
    const label = this.add
      .text(cx, cy + 2, "CHARACTER NAME", {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#86a58a",
      })
      .setOrigin(0.5)
      .setDepth(52);
    this.modalObjects.push(label);

    // Input box
    const inputW = 320;
    const inputH = 38;
    const inputY = cy + 30;

    const inputBox = this.add.graphics().setDepth(52);
    inputBox.fillStyle(0x0a1412, 0.95);
    inputBox.fillRoundedRect(cx - inputW / 2, inputY - inputH / 2, inputW, inputH, 4);
    inputBox.lineStyle(2, 0x9fe08a, 1);
    inputBox.strokeRoundedRect(cx - inputW / 2, inputY - inputH / 2, inputW, inputH, 4);
    this.modalObjects.push(inputBox);

    this.createInputText = this.add
      .text(cx, inputY, "|", {
        fontFamily: UI_FONT,
        fontSize: "22px",
        color: "#f1ecd8",
      })
      .setOrigin(0.5)
      .setDepth(53);
    this.modalObjects.push(this.createInputText);

    // Error feedback label
    this.createErrorText = this.add
      .text(cx, cy + 62, "3-16 characters, letters, numbers, underscores", {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#5c7663",
      })
      .setOrigin(0.5)
      .setDepth(52);
    this.modalObjects.push(this.createErrorText);

    // Submit button
    const submitBtn = this.add
      .text(cx - 80, cy + 110, "[ CREATE ]", {
        fontFamily: TITLE_FONT,
        fontSize: "12px",
        color: "#9fe08a",
        backgroundColor: "#14251d",
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(54)
      .setInteractive({ useHandCursor: true });
    this.modalObjects.push(submitBtn);

    submitBtn.on("pointerover", () => submitBtn.setColor("#f4c95d"));
    submitBtn.on("pointerout", () => submitBtn.setColor("#9fe08a"));
    submitBtn.on("pointerdown", () => void this.submitCreateCharacter());

    // Cancel button
    const cancelBtn = this.add
      .text(cx + 80, cy + 110, "[ CANCEL ]", {
        fontFamily: TITLE_FONT,
        fontSize: "12px",
        color: "#7f9a84",
        backgroundColor: "#0d1915",
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(54)
      .setInteractive({ useHandCursor: true });
    this.modalObjects.push(cancelBtn);

    cancelBtn.on("pointerover", () => cancelBtn.setColor("#cfe3c4"));
    cancelBtn.on("pointerout", () => cancelBtn.setColor("#7f9a84"));
    cancelBtn.on("pointerdown", () => this.closeModal());
  }

  private refreshCreateModalInput(): void {
    if (!this.createInputText || this.activeModal !== "create") return;
    const caret = this.caretVisible ? "|" : " ";
    this.createInputText.setText(`${this.newCharName}${caret}`);

    // Update sprite preview based on name hash
    if (this.createPreviewSprite) {
      const outfit = outfitForName(this.newCharName || "A");
      this.createPreviewSprite.setTexture(`hero-${outfit}-down`);
    }
  }

  private async submitCreateCharacter(): Promise<void> {
    if (!this.session) return;
    const name = this.newCharName.trim();

    if (name.length < 3) {
      this.createErrorText?.setText("NAME MUST BE AT LEAST 3 CHARACTERS.");
      this.createErrorText?.setColor("#e08a7a");
      return;
    }
    if (name.length > NAME_MAX_LENGTH) {
      this.createErrorText?.setText(`NAME CANNOT EXCEED ${NAME_MAX_LENGTH} CHARACTERS.`);
      this.createErrorText?.setColor("#e08a7a");
      return;
    }
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      this.createErrorText?.setText("ONLY LETTERS, NUMBERS AND UNDERSCORES.");
      this.createErrorText?.setColor("#e08a7a");
      return;
    }

    this.createErrorText?.setText("CREATING HERO IN REALM...");
    this.createErrorText?.setColor("#f4c95d");

    try {
      const newChar = await createCharacter(this.session.token, name);
      this.characters.push(newChar);
      this.closeModal();
      this.setStatus(`HERO "${newChar.name.toUpperCase()}" FORGED!`, "#9fe08a");
      this.render();
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.status === 409) {
          this.createErrorText?.setText("A CHARACTER WITH THIS NAME ALREADY EXISTS.");
        } else if (error.status === 403) {
          this.createErrorText?.setText("MAXIMUM CHARACTER LIMIT REACHED (3).");
        } else {
          this.createErrorText?.setText(error.message.toUpperCase().slice(0, 48));
        }
      } else {
        this.createErrorText?.setText("FAILED TO CREATE CHARACTER. TRY AGAIN.");
      }
      this.createErrorText?.setColor("#e08a7a");
    }
  }

  // ---------------------------------------------------------------------------
  // Modal: Delete Character
  // ---------------------------------------------------------------------------

  private openDeleteModal(char: CharacterSummary): void {
    if (this.entering || this.loading) return;
    this.activeModal = "delete";
    this.deleteTarget = char;
    this.renderDeleteModal(char);
  }

  private renderDeleteModal(char: CharacterSummary): void {
    this.clearModal();

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const modalW = 440;
    const modalH = 250;

    const blocker = this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.72)
      .setDepth(50)
      .setInteractive();
    this.modalObjects.push(blocker);

    const panel = this.add.graphics().setDepth(51);
    panel.fillStyle(COLORS.ink, 0.97);
    panel.fillRoundedRect(cx - modalW / 2, cy - modalH / 2, modalW, modalH, 8);
    panel.lineStyle(2, 0x8f3a36, 1);
    panel.strokeRoundedRect(cx - modalW / 2, cy - modalH / 2, modalW, modalH, 8);
    this.modalObjects.push(panel);

    const title = this.add
      .text(cx, cy - 64, "DELETE CHARACTER?", {
        fontFamily: TITLE_FONT,
        fontSize: "15px",
        color: "#e08a7a",
      })
      .setOrigin(0.5)
      .setDepth(52);
    this.modalObjects.push(title);

    const prompt = this.add
      .text(
        cx,
        cy - 18,
        `Are you sure you want to permanently delete\n${char.name.toUpperCase()} (Lv. ${char.level})?\nThis cannot be undone.`,
        {
          fontFamily: UI_FONT,
          fontSize: "18px",
          color: "#f1ecd8",
          align: "center",
        }
      )
      .setOrigin(0.5)
      .setDepth(52);
    this.modalObjects.push(prompt);

    // Confirm button
    const deleteBtn = this.add
      .text(cx - 86, cy + 62, "[ YES, DELETE ]", {
        fontFamily: TITLE_FONT,
        fontSize: "11px",
        color: "#e08a7a",
        backgroundColor: "#2a1210",
        padding: { x: 14, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(54)
      .setInteractive({ useHandCursor: true });
    this.modalObjects.push(deleteBtn);

    deleteBtn.on("pointerover", () => deleteBtn.setColor("#ff5544"));
    deleteBtn.on("pointerout", () => deleteBtn.setColor("#e08a7a"));
    deleteBtn.on("pointerdown", () => void this.submitDeleteCharacter());

    // Cancel button
    const cancelBtn = this.add
      .text(cx + 86, cy + 62, "[ CANCEL ]", {
        fontFamily: TITLE_FONT,
        fontSize: "11px",
        color: "#86a58a",
        backgroundColor: "#0d1915",
        padding: { x: 14, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(54)
      .setInteractive({ useHandCursor: true });
    this.modalObjects.push(cancelBtn);

    cancelBtn.on("pointerover", () => cancelBtn.setColor("#cfe3c4"));
    cancelBtn.on("pointerout", () => cancelBtn.setColor("#86a58a"));
    cancelBtn.on("pointerdown", () => this.closeModal());
  }

  private async submitDeleteCharacter(): Promise<void> {
    if (!this.session || !this.deleteTarget) return;
    const target = this.deleteTarget;
    this.setStatus(`DELETING ${target.name.toUpperCase()}...`, "#f4c95d");

    try {
      await deleteCharacter(this.session.token, target.id);
      this.characters = this.characters.filter((c) => c.id !== target.id);
      this.closeModal();
      this.setStatus(`CHARACTER "${target.name.toUpperCase()}" DELETED.`, "#86a58a");
      this.render();
    } catch (error) {
      this.closeModal();
      this.setStatus("COULD NOT DELETE CHARACTER. TRY AGAIN.", "#e08a7a");
    }
  }

  private closeModal(): void {
    this.activeModal = "none";
    this.deleteTarget = null;
    this.clearModal();
  }

  private clearModal(): void {
    for (const obj of this.modalObjects) obj.destroy();
    this.modalObjects = [];
    this.createInputText = undefined;
    this.createPreviewSprite = undefined;
    this.createErrorText = undefined;
  }

  // ---------------------------------------------------------------------------
  // Input Handling
  // ---------------------------------------------------------------------------

  private onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (this.activeModal === "create") {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.submitCreateCharacter();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeModal();
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        this.newCharName = this.newCharName.slice(0, -1);
        this.caretVisible = true;
        this.refreshCreateModalInput();
        return;
      }
      if (event.key.length === 1 && /^[A-Za-z0-9_]$/.test(event.key)) {
        if (this.newCharName.length < NAME_MAX_LENGTH) {
          event.preventDefault();
          this.newCharName += event.key;
          this.caretVisible = true;
          this.refreshCreateModalInput();
        }
        return;
      }
    } else if (this.activeModal === "delete") {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeModal();
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private setStatus(text: string, color: string): void {
    this.statusText.setText(text);
    this.statusText.setColor(color);
  }

  private logout(): void {
    clearSession();
    this.scene.start(SCENE_KEYS.MainMenu);
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (this.keyHandler) {
      this.input.keyboard?.off("keydown", this.keyHandler);
    }
    this.caretTimer?.remove(false);
    this.clearModal();
    for (const obj of this.contentObjects) obj.destroy();
    for (const obj of this.backdropObjects) obj.destroy();
    for (const obj of this.titleObjects) obj.destroy();
    this.contentObjects = [];
    this.backdropObjects = [];
    this.titleObjects = [];
  }
}
