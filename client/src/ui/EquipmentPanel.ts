import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { attachDraggable } from "./draggable";
import { ItemTooltip } from "./ItemTooltip";
import {
  colorValue,
  itemCatalog,
  itemColor,
  itemTexture,
} from "../items/catalog";
import { network } from "../network/NetworkClient";
import type { EquipSlot } from "../types";

const PANEL_WIDTH = 530;
const PANEL_HEIGHT = 224;
const SLOT_SIZE = 68;

interface EquipSlotView {
  slot: EquipSlot;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
}

export interface EquipmentPanelOptions {
  onFocus?: () => void;
  onClose?: () => void;
}

/**
 * Dedicated Equipment window separated from Inventory.
 * Displays character preview and equipped Weapon & Armor slots.
 * Hovering over an equipped item displays the floating bubble tooltip.
 */
export class EquipmentPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly onFocus?: () => void;
  private readonly onClose?: () => void;
  private readonly equips: EquipSlotView[] = [];
  private readonly avatar: Phaser.GameObjects.Image;
  private readonly statsText: Phaser.GameObjects.Text;
  private readonly tooltip: ItemTooltip;

  private hovered: EquipSlot | null = null;
  private open = false;
  hasUserMoved = false;

  constructor(scene: Phaser.Scene, options: EquipmentPanelOptions = {}) {
    this.scene = scene;
    this.onFocus = options.onFocus;
    this.onClose = options.onClose;
    this.tooltip = new ItemTooltip(scene);

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

    const title = scene.add.text(20, 14, "EQUIPMENT", {
      fontFamily: TITLE_FONT,
      fontSize: "15px",
      color: "#f4c95d",
    });
    this.container.add(title);

    const close = scene.add
      .text(PANEL_WIDTH - 20, 12, "[ E / ESC ]", {
        fontFamily: UI_FONT,
        fontSize: "18px",
        color: "#8fa895",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.close();
      this.onClose?.();
    });
    this.container.add(close);

    // Left character preview box
    const previewBg = scene.add.graphics();
    previewBg.fillStyle(0x102019, 1);
    previewBg.fillRoundedRect(20, 56, 134, 148, 6);
    previewBg.lineStyle(1, 0x2f4a3b, 1);
    previewBg.strokeRoundedRect(20, 56, 134, 148, 6);
    this.container.add(previewBg);

    const hasSwordsman = scene.textures.exists("swordsman-walk-front");
    this.avatar = scene.add
      .image(
        88,
        148,
        hasSwordsman ? "swordsman-walk-front" : "hero-0-down",
        hasSwordsman ? "Swordsman_lvl3_Walk_front 0.aseprite" : undefined,
      )
      .setOrigin(0.5, 1)
      .setScale(hasSwordsman ? 1.25 : 2.8);
    this.container.add(this.avatar);

    this.statsText = scene.add
      .text(87, 158, "LV. 1   ATK 10", {
        fontFamily: UI_FONT,
        fontSize: "18px",
        color: "#cfe8c8",
        align: "center",
      })
      .setOrigin(0.5, 0);
    this.container.add(this.statsText);

    // Right equipment slots (Weapon, Armor, Wing, Garment)
    this.buildSlot("weapon", "WEAPON", 174, 76);
    this.buildSlot("armor", "ARMOR", 258, 76);
    this.buildSlot("wing", "WING", 342, 76);
    this.buildSlot("garment", "GARMENT", 426, 76);

    const note = scene.add.text(174, 160, "Klik slot untuk\nmelepas gear.", {
      fontFamily: UI_FONT,
      fontSize: "16px",
      color: "#7f9a84",
      lineSpacing: 3,
    });
    this.container.add(note);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.container.setVisible(this.open);
    if (this.open) {
      this.refresh();
    } else {
      this.hovered = null;
      this.tooltip.hide();
    }
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.hovered = null;
    this.tooltip.hide();
    this.container.setVisible(false);
  }

  refresh(): void {
    if (!this.open) return;
    const player = network.players.get(network.sessionId);
    if (!player) return;

    if (this.scene.textures.exists("swordsman-walk-front")) {
      this.avatar.setTexture("swordsman-walk-front", "Swordsman_lvl3_Walk_front 0.aseprite");
      this.avatar.setScale(1.25);
    } else {
      const variant = ((player.outfit % 3) + 3) % 3;
      this.avatar.setTexture(`hero-${variant}-down`);
      this.avatar.setScale(2.8);
    }
    this.statsText.setText(`LV.${player.level}  ATK ${player.attack}`);

    this.renderSlot(this.equips[0], player.weaponId, this.hovered === "weapon");
    this.renderSlot(this.equips[1], player.armorId, this.hovered === "armor");
    this.renderSlot(this.equips[2], player.wingId ?? "", this.hovered === "wing");
    this.renderSlot(this.equips[3], player.garmentId ?? "", this.hovered === "garment");
  }

  private buildSlot(slot: EquipSlot, label: string, x: number, y: number): void {
    const caption = this.scene.add
      .text(x + SLOT_SIZE / 2, y - 22, label, {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#7f9a84",
      })
      .setOrigin(0.5, 0);
    this.container.add(caption);

    const bg = this.scene.add.graphics();
    bg.setPosition(x, y);
    this.container.add(bg);

    const icon = this.scene.add
      .image(x + SLOT_SIZE / 2, y + SLOT_SIZE / 2, "item-unknown")
      .setScale(1.9)
      .setVisible(false);
    this.container.add(icon);

    const hit = this.scene.add
      .rectangle(x, y, SLOT_SIZE, SLOT_SIZE, 0x000000, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    hit.on("pointerover", (pointer: Phaser.Input.Pointer) => {
      this.hovered = slot;
      this.refresh();
      const player = network.players.get(network.sessionId);
      const itemId =
        slot === "weapon"
          ? player?.weaponId
          : slot === "armor"
            ? player?.armorId
            : slot === "wing"
              ? (player?.wingId ?? "")
              : (player?.garmentId ?? "");
      if (itemId) {
        this.tooltip.show(itemId, 1, pointer.x, pointer.y, "[ Klik untuk melepas ]");
      } else {
        this.tooltip.hide();
      }
    });

    hit.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.hovered === slot) {
        this.tooltip.updatePosition(pointer.x, pointer.y);
      }
    });

    hit.on("pointerout", () => {
      if (this.hovered === slot) {
        this.hovered = null;
        this.tooltip.hide();
        this.refresh();
      }
    });

    hit.on("pointerdown", () => {
      const player = network.players.get(network.sessionId);
      if (!player) return;
      const itemId =
        slot === "weapon"
          ? player.weaponId
          : slot === "armor"
            ? player.armorId
            : slot === "wing"
              ? (player.wingId ?? "")
              : (player.garmentId ?? "");
      if (itemId) {
        network.unequipItem(slot);
        this.tooltip.hide();
      }
    });

    this.container.add(hit);
    this.equips.push({ slot, bg, icon });
  }

  private renderSlot(view: EquipSlotView, itemId: string, hovered: boolean): void {
    const hasItem = itemId.length > 0;
    const accent = hasItem ? itemColor(itemId) : "#304b3c";

    view.bg.clear();
    view.bg.fillStyle(hasItem ? 0x1a2c24 : 0x15231d, 1);
    view.bg.fillRoundedRect(0, 0, SLOT_SIZE, SLOT_SIZE, 4);
    const border = hovered ? 0xf4c95d : colorValue(accent, 0x304b3c);
    view.bg.lineStyle(hovered ? 2 : 1, border, hovered ? 1 : 0.9);
    view.bg.strokeRoundedRect(1, 1, SLOT_SIZE - 2, SLOT_SIZE - 2, 4);

    if (hasItem) {
      view.icon.setTexture(itemTexture(itemId)).setVisible(true);
    } else {
      view.icon.setVisible(false);
    }
  }
}
