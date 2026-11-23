import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { network } from "../network/NetworkClient";

const MENU_WIDTH = 160;
const ITEM_HEIGHT = 28;

export interface ContextMenuTarget {
  sessionId: string;
  name: string;
}

export class PlayerContextMenu {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly bg: Phaser.GameObjects.Graphics;
  private currentTarget: ContextMenuTarget | null = null;
  private onWhisper?: (name: string) => void;
  private onToast?: (text: string, color?: string) => void;

  constructor(
    scene: Phaser.Scene,
    onWhisper?: (name: string) => void,
    onToast?: (text: string, color?: string) => void
  ) {
    this.scene = scene;
    this.onWhisper = onWhisper;
    this.onToast = onToast;

    this.container = scene.add
      .container(0, 0)
      .setDepth(90)
      .setScrollFactor(0)
      .setVisible(false);

    this.bg = scene.add.graphics();
    this.container.add(this.bg);
  }

  show(x: number, y: number, target: ContextMenuTarget): void {
    this.currentTarget = target;
    this.container.remove(this.bg, false);
    this.container.removeAll(true);
    this.container.add(this.bg);

    const items = [
      {
        icon: "🤝",
        label: "Trade",
        action: () => {
          network.requestTrade(target.sessionId);
          this.onToast?.(`MENGAJAK TRADE DENGAN ${target.name.toUpperCase()}...`, "#f4c95d");
          this.hide();
        },
      },
      {
        icon: "⭐",
        label: "Add Friend",
        action: () => {
          network.addFriend(target.name);
          this.hide();
        },
      },
      {
        icon: "👑",
        label: "Invite Party",
        action: () => {
          network.inviteToParty(target.sessionId);
          this.onToast?.(`MENGUNDANG ${target.name.toUpperCase()} KE PARTY...`, "#f4c95d");
          this.hide();
        },
      },
      {
        icon: "⚠",
        label: "Report Player",
        action: () => {
          this.onToast?.("Fitur Report Player akan ditambahkan nanti.", "#f4c95d");
          this.hide();
        },
      },
      {
        icon: "💬",
        label: "Kirim Bisikan",
        action: () => {
          this.onWhisper?.(target.name);
          this.hide();
        },
      },
      {
        icon: "❌",
        label: "Batal",
        action: () => {
          this.hide();
        },
      },
    ];

    const totalHeight = 32 + items.length * ITEM_HEIGHT + 6;

    // Clamp to screen bounds
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;
    const posX = Math.max(10, Math.min(x, screenW - MENU_WIDTH - 10));
    const posY = Math.max(10, Math.min(y, screenH - totalHeight - 10));

    this.container.setPosition(posX, posY);

    // Draw frame
    this.bg.clear();
    this.bg.fillStyle(0x1a0e09, 0.96);
    this.bg.fillRoundedRect(0, 0, MENU_WIDTH, totalHeight, 6);
    this.bg.fillStyle(0x3e2416, 0.95);
    this.bg.fillRoundedRect(2, 2, MENU_WIDTH - 4, totalHeight - 4, 5);
    this.bg.lineStyle(1.5, 0xd4a359, 0.9);
    this.bg.strokeRoundedRect(1, 1, MENU_WIDTH - 2, totalHeight - 2, 6);

    // Header with player name
    const headerTitle = this.scene.add
      .text(MENU_WIDTH / 2, 8, target.name.toUpperCase(), {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: "#f4c95d",
      })
      .setOrigin(0.5, 0);
    this.container.add(headerTitle);

    // Divider line
    const divG = this.scene.add.graphics();
    divG.lineStyle(1, 0x8e5c3a, 0.8);
    divG.lineBetween(8, 28, MENU_WIDTH - 8, 28);
    this.container.add(divG);

    // Menu options
    let itemY = 32;
    for (const item of items) {
      const itBg = this.scene.add.graphics();
      const drawIt = (hover: boolean) => {
        itBg.clear();
        if (hover) {
          itBg.fillStyle(0x5c3824, 1);
          itBg.fillRoundedRect(4, itemY, MENU_WIDTH - 8, ITEM_HEIGHT - 2, 4);
          itBg.lineStyle(1, 0xf4c95d, 0.8);
          itBg.strokeRoundedRect(4, itemY, MENU_WIDTH - 8, ITEM_HEIGHT - 2, 4);
        }
      };
      drawIt(false);
      this.container.add(itBg);

      const label = this.scene.add.text(12, itemY + 5, `${item.icon} ${item.label}`, {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: "#f1ecd8",
      });
      this.container.add(label);

      const hit = this.scene.add
        .rectangle(4, itemY, MENU_WIDTH - 8, ITEM_HEIGHT - 2)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

      hit.on("pointerover", () => {
        drawIt(true);
        label.setColor("#ffd32a");
      });
      hit.on("pointerout", () => {
        drawIt(false);
        label.setColor("#f1ecd8");
      });
      hit.on("pointerdown", item.action);

      this.container.add(hit);
      itemY += ITEM_HEIGHT;
    }

    this.container.setVisible(true);
  }

  hide(): void {
    this.currentTarget = null;
    this.container.setVisible(false);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
