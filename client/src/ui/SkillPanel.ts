import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { attachDraggable } from "./draggable";
import { network } from "../network/NetworkClient";
import type { PlayerState, SkillId } from "../types";
import type { ShortcutPayload } from "./ShortcutBar";

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 360;

interface SkillDefinition {
  id: SkillId;
  name: string;
  jobLabel: string;
  icon: string;
  accent: string;
  accentHex: number;
  description: string;
  isUnlocked: (player?: PlayerState) => boolean;
}

const SKILLS: SkillDefinition[] = [
  {
    id: "rebahan",
    name: "REBAHAN",
    jobLabel: "NOVICE",
    icon: "skill-rebahan",
    accent: "#c084fc",
    accentHex: 0xc084fc,
    description:
      "Beristirahat dengan cara tiduran di tanah.\nRegenerasi HP & SP meningkat +50%.\nEfek batal jika bergerak atau terkena hit monster.",
    isUnlocked: () => true,
  },
  {
    id: "baledog",
    name: "BALEDOG",
    jobLabel: "NOVICE",
    icon: "skill-baledog",
    accent: "#cbd5e1",
    accentHex: 0x94a3b8,
    description:
      "Melempar batu ke arah monster dari jarak 7 tile.\nDamage: 25 (Fixed) • 5 SP • 1.5s CD",
    isUnlocked: () => true,
  },
  {
    id: "magnum-break",
    name: "MAGNUM BREAK",
    jobLabel: "SWORDSMAN",
    icon: "skill-magnum-break",
    accent: "#ffb45c",
    accentHex: 0xff9a52,
    description:
      "AoE Fire • 15 SP • 5 detik cooldown\nDamage 165% ATK dalam radius 3 tile (Self-Cast).\nKnockback 3 tile + Fire Enchant 15 detik.",
    isUnlocked: (player) => player?.jobId === "swordsman",
  },
];

export interface SkillPanelOptions {
  onMessage?: (text: string, color?: string) => void;
  onFocus?: () => void;
  onClose?: () => void;
  onCast?: (skillId: SkillId) => void;
  onStartDrag?: (payload: ShortcutPayload, icon: string, tint?: number) => void;
}

/**
 * Interactive Skill Window toggled with [K] or bottom menu.
 * Displays only unlocked skills; descriptions appear in a hover tips box over icons.
 */
export class SkillPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly onFocus?: () => void;
  private readonly onClose?: () => void;
  private readonly onCast?: (skillId: SkillId) => void;
  private readonly onStartDrag?: (payload: ShortcutPayload, icon: string, tint?: number) => void;
  private readonly listContainer: Phaser.GameObjects.Container;
  private readonly tipContainer: Phaser.GameObjects.Container;
  private readonly tipBg: Phaser.GameObjects.Graphics;
  private readonly tipTitle: Phaser.GameObjects.Text;
  private readonly tipBody: Phaser.GameObjects.Text;

  private open = false;
  private renderedSignature = "";
  hasUserMoved = false;

  constructor(scene: Phaser.Scene, options: SkillPanelOptions = {}) {
    this.scene = scene;
    this.onFocus = options.onFocus;
    this.onClose = options.onClose;
    this.onCast = options.onCast;
    this.onStartDrag = options.onStartDrag;

    const x = (scene.scale.width - PANEL_WIDTH) / 2;
    const y = (scene.scale.height - PANEL_HEIGHT) / 2;

    this.container = scene.add
      .container(x, y)
      .setDepth(60)
      .setScrollFactor(0)
      .setVisible(false);

    attachDraggable(scene, this.container, {
      panelWidth: PANEL_WIDTH,
      panelHeight: PANEL_HEIGHT,
      handleHeight: 48,
      onFocus: () => {
        this.hasUserMoved = true;
        this.onFocus?.();
      },
      onDragEnd: () => {
        this.hasUserMoved = true;
      },
    });

    const board = scene.add.graphics();
    board.fillStyle(COLORS.ink, 0.96);
    board.fillRoundedRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 8);
    board.lineStyle(2, 0x3b5a47, 1);
    board.strokeRoundedRect(1, 1, PANEL_WIDTH - 2, PANEL_HEIGHT - 2, 8);
    this.container.add(board);

    const title = scene.add.text(20, 16, "SKILL", {
      fontFamily: TITLE_FONT,
      fontSize: "15px",
      color: "#f4c95d",
    });
    this.container.add(title);

    const close = scene.add
      .text(PANEL_WIDTH - 20, 14, "[ K / ESC ]", {
        fontFamily: UI_FONT,
        fontSize: "18px",
        color: "#8fa895",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => {
      this.close();
      this.onClose?.();
    });
    this.container.add(close);

    const inner = scene.add.graphics();
    inner.fillStyle(0x101c17, 0.85);
    inner.fillRoundedRect(18, 52, PANEL_WIDTH - 36, PANEL_HEIGHT - 70, 6);
    inner.lineStyle(1, 0x274334, 0.9);
    inner.strokeRoundedRect(18, 52, PANEL_WIDTH - 36, PANEL_HEIGHT - 70, 6);
    this.container.add(inner);

    this.listContainer = scene.add.container(0, 0);
    this.container.add(this.listContainer);

    // Floating Tips Box for hovered skill icon
    this.tipBg = scene.add.graphics();
    this.tipTitle = scene.add.text(10, 8, "", {
      fontFamily: TITLE_FONT,
      fontSize: "13px",
      color: "#f4c95d",
    });
    this.tipBody = scene.add.text(10, 28, "", {
      fontFamily: UI_FONT,
      fontSize: "15px",
      color: "#d6ead0",
      lineSpacing: 3,
      wordWrap: { width: 250 },
    });
    this.tipContainer = scene.add
      .container(0, 0, [this.tipBg, this.tipTitle, this.tipBody])
      .setDepth(280)
      .setScrollFactor(0)
      .setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.openPanel();
    }
  }

  openPanel(): void {
    this.open = true;
    this.container.setVisible(true);
    this.rebuildList(true);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.hideTip();
    this.container.setVisible(false);
  }

  refresh(): void {
    if (!this.open) return;
    this.rebuildList(false);
  }

  private rebuildList(force: boolean): void {
    const local = network.players.get(network.sessionId);
    const unlocked = SKILLS.filter((s) => s.isUnlocked(local));
    const signature = unlocked.map((s) => s.id).join(",");
    if (!force && signature === this.renderedSignature) return;
    this.renderedSignature = signature;

    this.listContainer.removeAll(true);

    let y = 68;
    const rowH = 74;
    for (const skill of unlocked) {
      const card = this.scene.add.graphics();
      card.fillStyle(0x1a2b22, 0.98);
      card.fillRoundedRect(30, y, PANEL_WIDTH - 60, rowH, 8);
      card.lineStyle(1.5, skill.accentHex, 0.9);
      card.strokeRoundedRect(30, y, PANEL_WIDTH - 60, rowH, 8);
      this.listContainer.add(card);

      const iconX = 66;
      const iconY = y + rowH / 2;
      const icon = this.scene.add.image(iconX, iconY, skill.icon).setDisplaySize(44, 44);
      this.listContainer.add(icon);

      const iconHit = this.scene.add
        .rectangle(iconX - 24, iconY - 24, 48, 48, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

      let dragOrigin: { x: number; y: number; started: boolean } | null = null;
      iconHit.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        this.showTip(skill, pointer.x, pointer.y);
      });
      iconHit.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (this.tipContainer.visible) {
          this.positionTip(pointer.x, pointer.y);
        }
        if (dragOrigin && !dragOrigin.started && pointer.isDown) {
          if (Phaser.Math.Distance.Between(dragOrigin.x, dragOrigin.y, pointer.x, pointer.y) > 5) {
            dragOrigin.started = true;
            this.hideTip();
            this.onStartDrag?.(
              { type: "skill", skillId: skill.id, name: skill.name },
              skill.icon,
            );
          }
        }
      });
      iconHit.on("pointerout", () => {
        this.hideTip();
      });
      iconHit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        dragOrigin = { x: pointer.x, y: pointer.y, started: false };
      });
      iconHit.on("pointerup", () => {
        dragOrigin = null;
      });
      this.listContainer.add(iconHit);

      const name = this.scene.add.text(102, y + 14, skill.name, {
        fontFamily: TITLE_FONT,
        fontSize: "15px",
        color: skill.accent,
      });
      this.listContainer.add(name);

      const jobTag = this.scene.add.text(102, y + 39, `[ ${skill.jobLabel} ]`, {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#8fa895",
      });
      this.listContainer.add(jobTag);

      const castBtn = this.scene.add
        .text(PANEL_WIDTH - 48, iconY, "CAST", {
          fontFamily: UI_FONT,
          fontSize: "16px",
          color: "#0c1414",
          backgroundColor: skill.accent,
          padding: { x: 14, y: 8 },
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true });
      castBtn.on("pointerdown", () => this.onCast?.(skill.id));
      this.listContainer.add(castBtn);

      y += rowH + 12;
    }
  }

  private showTip(skill: SkillDefinition, screenX: number, screenY: number): void {
    this.tipTitle.setText(skill.name).setColor(skill.accent);
    this.tipBody.setText(skill.description);
    const w = Math.max(210, Math.ceil(Math.max(this.tipTitle.width, this.tipBody.width)) + 22);
    const h = Math.ceil(this.tipBody.y + this.tipBody.height + 12);

    this.tipBg.clear();
    this.tipBg.fillStyle(0x0b1512, 0.96);
    this.tipBg.fillRoundedRect(0, 0, w, h, 6);
    this.tipBg.lineStyle(1.5, skill.accentHex, 1);
    this.tipBg.strokeRoundedRect(0, 0, w, h, 6);

    this.tipContainer.setSize(w, h).setVisible(true);
    this.positionTip(screenX, screenY);
  }

  private positionTip(screenX: number, screenY: number): void {
    const w = this.tipContainer.width || 240;
    const h = this.tipContainer.height || 80;
    const tx = Phaser.Math.Clamp(screenX + 14, 8, this.scene.scale.width - w - 8);
    const ty = Phaser.Math.Clamp(screenY + 14, 8, this.scene.scale.height - h - 8);
    this.tipContainer.setPosition(tx, ty);
  }

  private hideTip(): void {
    this.tipContainer.setVisible(false);
  }
}
