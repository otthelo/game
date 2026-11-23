import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { attachDraggable } from "./draggable";

const PANEL_WIDTH = 440;
const PANEL_HEIGHT = 320;

export interface QuestPanelOptions {
  onFocus?: () => void;
  onClose?: () => void;
}

/**
 * Quest log modal toggled via the bottom QUEST button or [Q].
 */
export class QuestPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly onFocus?: () => void;
  private readonly onClose?: () => void;
  private open = false;
  hasUserMoved = false;

  constructor(scene: Phaser.Scene, options: QuestPanelOptions = {}) {
    this.onFocus = options.onFocus;
    this.onClose = options.onClose;

    const x = Math.floor((scene.scale.width - PANEL_WIDTH) / 2);
    const y = Math.floor((scene.scale.height - PANEL_HEIGHT) / 2);

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

    const title = scene.add.text(20, 16, "QUEST LOG", {
      fontFamily: TITLE_FONT,
      fontSize: "15px",
      color: "#f4c95d",
    });
    this.container.add(title);

    const close = scene.add
      .text(PANEL_WIDTH - 20, 14, "[ Q / ESC ]", {
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
    inner.fillRoundedRect(20, 52, PANEL_WIDTH - 40, PANEL_HEIGHT - 72, 6);
    inner.lineStyle(1, 0x274334, 0.9);
    inner.strokeRoundedRect(20, 52, PANEL_WIDTH - 40, PANEL_HEIGHT - 72, 6);
    this.container.add(inner);

    const empty = scene.add
      .text(
        PANEL_WIDTH / 2,
        PANEL_HEIGHT / 2 + 12,
        "Belum ada quest aktif.\nKunjungi Adventure Guild untuk misi baru!",
        {
          fontFamily: UI_FONT,
          fontSize: "19px",
          color: "#8fa895",
          align: "center",
          lineSpacing: 6,
        },
      )
      .setOrigin(0.5);
    this.container.add(empty);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.openPanel();
  }

  openPanel(): void {
    this.open = true;
    this.container.setVisible(true);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.container.setVisible(false);
  }
}
