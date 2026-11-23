import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { attachDraggable } from "./draggable";

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 430;

export interface SettingPanelOptions {
  onLogout: () => void;
  onMessage?: (text: string, color?: string) => void;
  onFocus?: () => void;
  onClose?: () => void;
  getShortcutKeys?: () => string[];
  onSetShortcutKey?: (index: number, key: string) => void;
  onResetShortcutKeys?: () => void;
}

/**
 * Game Settings modal: Display mode (Window Mode / Full Screen) and Log Out.
 */
export class SettingPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly onLogout: () => void;
  private readonly onMessage?: (text: string, color?: string) => void;
  private readonly onFocus?: () => void;
  private readonly onClose?: () => void;
  private readonly getShortcutKeys?: () => string[];
  private readonly onSetShortcutKey?: (index: number, key: string) => void;
  private readonly onResetShortcutKeys?: () => void;
  private readonly windowBtnBg: Phaser.GameObjects.Graphics;
  private readonly windowBtnText: Phaser.GameObjects.Text;
  private readonly fullBtnBg: Phaser.GameObjects.Graphics;
  private readonly fullBtnText: Phaser.GameObjects.Text;
  private readonly keybindViews: Array<{ bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; x: number; y: number; w: number; h: number }> = [];
  private listeningIndex: number | null = null;
  private readonly handleFullscreenChange = () => this.onFullscreenChange();
  private open = false;
  hasUserMoved = false;

  constructor(scene: Phaser.Scene, options: SettingPanelOptions) {
    this.scene = scene;
    this.onLogout = options.onLogout;
    this.onMessage = options.onMessage;
    this.onFocus = options.onFocus;
    this.onClose = options.onClose;
    this.getShortcutKeys = options.getShortcutKeys;
    this.onSetShortcutKey = options.onSetShortcutKey;
    this.onResetShortcutKeys = options.onResetShortcutKeys;

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

    const title = scene.add.text(20, 16, "SETTING", {
      fontFamily: TITLE_FONT,
      fontSize: "15px",
      color: "#f4c95d",
    });
    this.container.add(title);

    const close = scene.add
      .text(PANEL_WIDTH - 20, 14, "[ ESC ]", {
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

    const displayLabel = scene.add.text(24, 62, "LAYAR / DISPLAY MODE", {
      fontFamily: UI_FONT,
      fontSize: "19px",
      color: "#cfe8c8",
    });
    this.container.add(displayLabel);

    // Window Mode button
    this.windowBtnBg = scene.add.graphics();
    this.container.add(this.windowBtnBg);
    this.windowBtnText = scene.add
      .text(98, 110, "WINDOW MODE", {
        fontFamily: UI_FONT,
        fontSize: "19px",
        color: "#f4c95d",
      })
      .setOrigin(0.5);
    this.container.add(this.windowBtnText);

    const windowHit = scene.add
      .rectangle(24, 92, 148, 36)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    windowHit.on("pointerdown", () => this.setFullscreen(false));
    this.container.add(windowHit);

    // Full Screen button
    this.fullBtnBg = scene.add.graphics();
    this.container.add(this.fullBtnBg);
    this.fullBtnText = scene.add
      .text(262, 110, "FULL SCREEN", {
        fontFamily: UI_FONT,
        fontSize: "19px",
        color: "#cfe8c8",
      })
      .setOrigin(0.5);
    this.container.add(this.fullBtnText);

    const fullHit = scene.add
      .rectangle(188, 92, 148, 36)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    fullHit.on("pointerdown", () => this.setFullscreen(true));
    this.container.add(fullHit);

    // Divider 1
    const divider1 = scene.add.graphics();
    divider1.lineStyle(1, 0x2f4a3b, 1);
    divider1.lineBetween(24, 146, PANEL_WIDTH - 24, 146);
    this.container.add(divider1);

    const shortcutLabel = scene.add.text(24, 158, "SHORTCUT KEYS (1 - 9)", {
      fontFamily: UI_FONT,
      fontSize: "19px",
      color: "#cfe8c8",
    });
    this.container.add(shortcutLabel);

    const resetBtn = scene.add
      .text(PANEL_WIDTH - 24, 160, "[ RESET ]", {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#e08a7a",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    resetBtn.on("pointerdown", () => {
      this.listeningIndex = null;
      this.onResetShortcutKeys?.();
      this.refresh();
      this.onMessage?.("SHORTCUT DI-RESET KE 1-9.", "#9fe08a");
    });
    this.container.add(resetBtn);

    const cols = 3;
    const kw = 98;
    const kh = 28;
    const kgap = 9;
    for (let i = 0; i < 9; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const kx = 24 + col * (kw + kgap);
      const ky = 188 + row * (kh + 6);

      const bg = scene.add.graphics();
      this.container.add(bg);

      const text = scene.add
        .text(kx + kw / 2, ky + kh / 2, "", {
          fontFamily: UI_FONT,
          fontSize: "16px",
          color: "#f4c95d",
        })
        .setOrigin(0.5);
      this.container.add(text);

      const hit = scene.add
        .rectangle(kx, ky, kw, kh)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        this.listeningIndex = this.listeningIndex === i ? null : i;
        this.refresh();
      });
      this.container.add(hit);

      this.keybindViews.push({ bg, text, x: kx, y: ky, w: kw, h: kh });
    }

    const hint = scene.add.text(24, 292, "Klik slot lalu tekan tombol keyboard baru.", {
      fontFamily: UI_FONT,
      fontSize: "15px",
      color: "#8fa895",
    });
    this.container.add(hint);

    // Divider 2
    const divider2 = scene.add.graphics();
    divider2.lineStyle(1, 0x2f4a3b, 1);
    divider2.lineBetween(24, 320, PANEL_WIDTH - 24, 320);
    this.container.add(divider2);

    const accountLabel = scene.add.text(24, 334, "AKUN / SESSION", {
      fontFamily: UI_FONT,
      fontSize: "19px",
      color: "#cfe8c8",
    });
    this.container.add(accountLabel);

    // Logout button
    const logoutBg = scene.add.graphics();
    const drawLogout = (hovered: boolean) => {
      logoutBg.clear();
      logoutBg.fillStyle(hovered ? 0x521d1d : 0x381515, 1);
      logoutBg.fillRoundedRect(24, 366, PANEL_WIDTH - 48, 40, 6);
      logoutBg.lineStyle(1.5, hovered ? 0xe08a7a : 0x8a3b3b, 1);
      logoutBg.strokeRoundedRect(24, 366, PANEL_WIDTH - 48, 40, 6);
    };
    drawLogout(false);
    this.container.add(logoutBg);

    const logoutText = scene.add
      .text(PANEL_WIDTH / 2, 386, "LOG OUT", {
        fontFamily: TITLE_FONT,
        fontSize: "12px",
        color: "#f1c8c2",
      })
      .setOrigin(0.5);
    this.container.add(logoutText);

    const logoutHit = scene.add
      .rectangle(24, 366, PANEL_WIDTH - 48, 40)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    logoutHit.on("pointerover", () => drawLogout(true));
    logoutHit.on("pointerout", () => drawLogout(false));
    logoutHit.on("pointerdown", () => {
      this.close();
      this.onLogout();
    });
    this.container.add(logoutHit);

    scene.scale.on("enterfullscreen", this.handleFullscreenChange);
    scene.scale.on("leavefullscreen", this.handleFullscreenChange);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off("enterfullscreen", this.handleFullscreenChange);
      scene.scale.off("leavefullscreen", this.handleFullscreenChange);
      document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.container.setVisible(this.open);
    if (this.open) this.refresh();
  }

  get isListeningForKey(): boolean {
    return this.open && this.listeningIndex !== null;
  }

  handleKeyBind(event: KeyboardEvent): boolean {
    if (!this.open || this.listeningIndex === null) return false;
    event.preventDefault();
    if (event.key === "Escape") {
      this.listeningIndex = null;
      this.refresh();
      return true;
    }
    if (event.key.length === 1 || /^F\d{1,2}$/i.test(event.key)) {
      const idx = this.listeningIndex;
      this.listeningIndex = null;
      this.onSetShortcutKey?.(idx, event.key.toUpperCase());
      this.refresh();
    }
    return true;
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.listeningIndex = null;
    this.container.setVisible(false);
  }

  refresh(): void {
    if (!this.open) return;
    const isFull = Boolean(document.fullscreenElement);

    this.drawModeButton(this.windowBtnBg, 24, 92, 148, 36, !isFull);
    this.windowBtnText.setColor(!isFull ? "#f4c95d" : "#8fa895");

    this.drawModeButton(this.fullBtnBg, 188, 92, 148, 36, isFull);
    this.fullBtnText.setColor(isFull ? "#f4c95d" : "#8fa895");

    const keys = this.getShortcutKeys?.() ?? ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    for (let i = 0; i < this.keybindViews.length; i++) {
      const v = this.keybindViews[i];
      const listening = this.listeningIndex === i;
      this.drawModeButton(v.bg, v.x, v.y, v.w, v.h, listening);
      v.text.setText(listening ? `Slot ${i + 1}: ...` : `Slot ${i + 1}: [ ${keys[i]} ]`);
      v.text.setColor(listening ? "#9fe08a" : "#f4c95d");
    }
  }

  private drawModeButton(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    active: boolean,
  ): void {
    g.clear();
    g.fillStyle(active ? 0x1e3829 : 0x13201a, 1);
    g.fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(active ? 2 : 1, active ? 0xf4c95d : 0x2f4a3b, 1);
    g.strokeRoundedRect(x, y, w, h, 5);
  }

  private onFullscreenChange(): void {
    this.syncCanvasScale();
    window.setTimeout(() => this.syncCanvasScale(), 120);
    window.setTimeout(() => this.syncCanvasScale(), 280);
    this.refresh();
  }

  private syncCanvasScale(): void {
    const scale = this.scene.scale;
    const canvas = this.scene.game.canvas;
    const isFull = Boolean(document.fullscreenElement);

    if (!isFull && canvas) {
      canvas.style.marginLeft = "0px";
      canvas.style.marginTop = "0px";
    }

    scale.updateBounds();
    scale.refresh();
    window.dispatchEvent(new Event("resize"));
  }

  private setFullscreen(enable: boolean): void {
    try {
      if (enable) {
        if (!document.fullscreenElement) {
          void document.documentElement.requestFullscreen?.().then(() => {
            this.onFullscreenChange();
          });
        }
      } else {
        if (document.fullscreenElement) {
          void document.exitFullscreen?.().then(() => {
            this.onFullscreenChange();
          });
        } else {
          this.onFullscreenChange();
        }
      }
      this.refresh();
    } catch {
      this.onMessage?.("FULLSCREEN NOT SUPPORTED.", "#e08a7a");
    }
  }
}
