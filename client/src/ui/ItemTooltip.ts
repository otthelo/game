import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { colorValue, itemCatalog, itemColor, itemName } from "../items/catalog";
import { ItemKind } from "../types";

/**
 * Floating bubble tooltip that displays item information on hover.
 * Appears near the cursor and disappears when the cursor moves away.
 */
export class ItemTooltip {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly typeText: Phaser.GameObjects.Text;
  private readonly statText: Phaser.GameObjects.Text;
  private readonly descText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;

  private active = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.container = scene.add
      .container(0, 0)
      .setDepth(999)
      .setScrollFactor(0)
      .setVisible(false);

    this.bg = scene.add.graphics();
    this.container.add(this.bg);

    const maxWidth = 224;

    this.titleText = scene.add.text(12, 10, "", {
      fontFamily: TITLE_FONT,
      fontSize: "12px",
      color: "#f4c95d",
      wordWrap: { width: maxWidth },
    });
    this.container.add(this.titleText);

    this.typeText = scene.add.text(12, 28, "", {
      fontFamily: UI_FONT,
      fontSize: "14px",
      color: "#8fa895",
    });
    this.container.add(this.typeText);

    this.statText = scene.add.text(12, 46, "", {
      fontFamily: UI_FONT,
      fontSize: "16px",
      color: "#9fe08a",
      wordWrap: { width: maxWidth },
      lineSpacing: 2,
    });
    this.container.add(this.statText);

    this.descText = scene.add.text(12, 68, "", {
      fontFamily: UI_FONT,
      fontSize: "15px",
      color: "#d0ded0",
      wordWrap: { width: maxWidth },
      lineSpacing: 3,
    });
    this.container.add(this.descText);

    this.hintText = scene.add.text(12, 92, "", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#7f9a84",
    });
    this.container.add(this.hintText);
  }

  show(
    itemId: string,
    qty: number,
    pointerX: number,
    pointerY: number,
    customHint?: string,
  ): void {
    const def = itemCatalog.get(itemId);
    if (!def) {
      this.hide();
      return;
    }

    const name = itemName(itemId);
    this.titleText
      .setText(qty > 1 ? `${name.toUpperCase()} (x${qty})` : name.toUpperCase())
      .setColor(itemColor(itemId, "#f4c95d"));

    let kindLabel = "MATERIAL";
    let kindColor = "#8fa895";
    let hint = customHint ?? "[ Item material / bahan ]";

    if (def.kind === ItemKind.Consumable) {
      kindLabel = "KONSUMSI / POTION";
      kindColor = "#62c4ff";
      if (!customHint) hint = "[ Klik untuk meminum ]";
    } else if (def.kind === ItemKind.Weapon) {
      kindLabel = "SENJATA / WEAPON";
      kindColor = "#f4a45d";
      if (!customHint) hint = "[ Klik untuk memasang ]";
    } else if (def.kind === ItemKind.Armor) {
      kindLabel = "PELINDUNG / ARMOR";
      kindColor = "#9fe08a";
      if (!customHint) hint = "[ Klik untuk memasang ]";
    } else if (def.kind === ItemKind.Wing) {
      kindLabel = "SAYAP / WING";
      kindColor = "#b39ad8";
      if (!customHint) hint = "[ Klik untuk memasang ]";
    } else if (def.kind === ItemKind.Garment) {
      kindLabel = "JUBAH / GARMENT";
      kindColor = "#a87850";
      if (!customHint) hint = "[ Klik untuk memasang ]";
    }

    this.typeText.setText(kindLabel).setColor(kindColor);

    const stats: string[] = [];
    if (def.attack) stats.push(`+${def.attack} Serangan (ATK)`);
    if (def.maxHp) stats.push(`+${def.maxHp} Darah Maks (HP)`);
    if (def.maxSp) stats.push(`+${def.maxSp} Mana Maks (SP)`);
    if (def.heal) stats.push(`Memulihkan +${def.heal} HP`);
    if (def.sellPrice) stats.push(`Harga jual: ${def.sellPrice} Gold`);

    if (stats.length > 0) {
      this.statText.setText(stats.join("\n")).setVisible(true);
    } else {
      this.statText.setText("").setVisible(false);
    }

    if (def.description) {
      this.descText.setText(def.description).setVisible(true);
    } else {
      this.descText.setText("").setVisible(false);
    }

    this.hintText.setText(hint);

    // Dynamic vertical layout based on visible fields
    const padding = 12;
    const contentW = 224;
    let currY = padding;

    this.titleText.setPosition(padding, currY);
    currY += this.titleText.height + 4;

    this.typeText.setPosition(padding, currY);
    currY += this.typeText.height + 6;

    if (stats.length > 0) {
      this.statText.setPosition(padding, currY);
      currY += this.statText.height + 6;
    }

    if (def.description) {
      this.descText.setPosition(padding, currY);
      currY += this.descText.height + 8;
    }

    this.hintText.setPosition(padding, currY);
    currY += this.hintText.height + padding;

    const bubbleW = contentW + padding * 2;
    const bubbleH = currY;

    // Draw bubble background with double border
    this.bg.clear();
    this.bg.fillStyle(COLORS.ink, 0.96);
    this.bg.fillRoundedRect(0, 0, bubbleW, bubbleH, 6);

    const borderColor = colorValue(itemColor(itemId, "#3b5a47"), 0x3b5a47);
    this.bg.lineStyle(1.5, borderColor, 0.95);
    this.bg.strokeRoundedRect(0, 0, bubbleW, bubbleH, 6);

    this.updatePosition(pointerX, pointerY, bubbleW, bubbleH);

    this.active = true;
    this.container.setVisible(true);
  }

  updatePosition(pointerX: number, pointerY: number, width?: number, height?: number): void {
    const bubbleW = width ?? 248;
    const bubbleH = height ?? 130;

    let targetX = pointerX + 16;
    let targetY = pointerY + 16;

    // Flip to left if overflowing screen
    if (targetX + bubbleW > this.scene.scale.width - 10) {
      targetX = pointerX - bubbleW - 12;
    }
    // Flip to top if overflowing bottom
    if (targetY + bubbleH > this.scene.scale.height - 10) {
      targetY = pointerY - bubbleH - 12;
    }

    targetX = Phaser.Math.Clamp(targetX, 8, Math.max(8, this.scene.scale.width - bubbleW - 8));
    targetY = Phaser.Math.Clamp(targetY, 8, Math.max(8, this.scene.scale.height - bubbleH - 8));

    this.container.setPosition(targetX, targetY);
  }

  hide(): void {
    if (!this.active) return;
    this.active = false;
    this.container.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
  }
}
