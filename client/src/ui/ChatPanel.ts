import Phaser from "phaser";
import { CHAT_MAX_LENGTH, COLORS, UI_FONT } from "../config/gameConfig";
import type { ChatEvent, ChatSendChannel } from "../types";

interface Line {
  text: string;
  color: string;
  bgColor?: number;
  bold?: boolean;
}

const CHANNELS: Array<{ id: ChatSendChannel; label: string; color: string; tip: string }> = [
  { id: "say", label: "PUBLIC", color: "#cfe8c8", tip: "Public: Chat ke semua player dalam 1 map." },
  { id: "party", label: "PARTY", color: "#5bc0de", tip: "Party: Chat khusus anggota party." },
  { id: "whisper", label: "WISPER", color: "#f472b6", tip: "Wisper: Chat privat, wajib format /nickname pesan." },
  { id: "all", label: "ALL", color: "#facc15", tip: "All: Broadcast 1 server (otomatis pakai 1x Toa)." },
];

const MAX_HISTORY = 50;
const PANEL_WIDTH = 470;
const PANEL_HEIGHT = 196;
const INPUT_BAR_HEIGHT = 40;
const MSG_X = 12;
const MSG_Y = 8;
const MSG_W = 430;
const MSG_H = PANEL_HEIGHT - INPUT_BAR_HEIGHT - MSG_Y - 4; // 144px
const TRACK_X = PANEL_WIDTH - 14;
const TRACK_Y = 28;
const TRACK_W = 6;
const TRACK_H = MSG_H - 22;

const SETTINGS_STORAGE_KEY = "pixel-realms:chat-settings";

interface ChatSettings {
  muteDrop: boolean;
  muteExp: boolean;
}

function loadChatSettings(): ChatSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { muteDrop: false, muteExp: false };
    const parsed = JSON.parse(raw) as Partial<ChatSettings>;
    return {
      muteDrop: parsed.muteDrop === true,
      muteExp: parsed.muteExp === true,
    };
  } catch {
    return { muteDrop: false, muteExp: false };
  }
}

function saveChatSettings(settings: ChatSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

/**
 * Phaser-native chat panel with scrollable 50-message history, collapse/expand
 * toggle, and minimal text input.
 */
export class ChatPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly historyContainer: Phaser.GameObjects.Container;
  private readonly messagesContainer: Phaser.GameObjects.Container;
  private readonly maskGraphics: Phaser.GameObjects.Graphics;
  private readonly scrollTrack: Phaser.GameObjects.Graphics;
  private readonly scrollThumb: Phaser.GameObjects.Graphics;
  private readonly showChatBtn: Phaser.GameObjects.Container;
  private readonly inputText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly onSend: (text: string, channel: ChatSendChannel) => void;

  private messages: Line[] = [];
  private messageObjects: Phaser.GameObjects.GameObject[] = [];
  private selectedChannel: ChatSendChannel = "say";
  private channelMenuOpen = false;
  private channelBtnText!: Phaser.GameObjects.Text;
  private channelMenu!: Phaser.GameObjects.Container;
  private channelTipContainer!: Phaser.GameObjects.Container;
  private channelTipBg!: Phaser.GameObjects.Graphics;
  private channelTipText!: Phaser.GameObjects.Text;
  private totalContentHeight = 0;
  private scrollOffset = 0;
  private maxScroll = 0;
  private draggingThumb = false;
  private dragStartY = 0;
  private dragStartScroll = 0;
  private collapsed = false;

  private open = false;
  private value = "";
  private settings: ChatSettings = loadChatSettings();
  private settingsOpen = false;
  private settingsPopup!: Phaser.GameObjects.Container;
  private dropCheckText!: Phaser.GameObjects.Text;
  private expCheckText!: Phaser.GameObjects.Text;

  private readonly onWheelHandler: (
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
  ) => void;
  private readonly onPointerMoveHandler: (pointer: Phaser.Input.Pointer) => void;
  private readonly onPointerUpHandler: () => void;

  constructor(scene: Phaser.Scene, onSend: (text: string, channel: ChatSendChannel) => void) {
    this.scene = scene;
    this.onSend = onSend;

    const x = 16;
    const y = Math.max(120, scene.scale.height - PANEL_HEIGHT - 20);

    this.container = scene.add.container(x, y).setDepth(50).setScrollFactor(0);

    // 1. Expandable history box (background, messages, scrollbar, hide button)
    this.historyContainer = scene.add.container(0, 0);
    this.container.add(this.historyContainer);

    const historyBoard = scene.add.graphics();
    historyBoard.fillStyle(COLORS.ink, 0.72);
    historyBoard.fillRoundedRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT - INPUT_BAR_HEIGHT + 6, {
      tl: 6,
      tr: 6,
      bl: 0,
      br: 0,
    });
    historyBoard.lineStyle(2, 0x2f4a3b, 1);
    historyBoard.strokeRoundedRect(1, 1, PANEL_WIDTH - 2, PANEL_HEIGHT - INPUT_BAR_HEIGHT + 5, {
      tl: 6,
      tr: 6,
      bl: 0,
      br: 0,
    });
    this.historyContainer.add(historyBoard);

    // Mask for scrollable message area
    this.maskGraphics = scene.make.graphics({ x: 0, y: 0 }, false);
    this.updateMaskGeometry();
    const mask = this.maskGraphics.createGeometryMask();

    this.messagesContainer = scene.add.container(MSG_X, MSG_Y);
    this.messagesContainer.setMask(mask);
    this.historyContainer.add(this.messagesContainer);

    // Scrollbar track & thumb
    this.scrollTrack = scene.add.graphics();
    this.historyContainer.add(this.scrollTrack);

    this.scrollThumb = scene.add.graphics();
    this.historyContainer.add(this.scrollThumb);

    const scrollHit = scene.add
      .rectangle(TRACK_X - 4, TRACK_Y, TRACK_W + 8, TRACK_H)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    scrollHit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.maxScroll <= 0) return;
      const localY = pointer.y - this.container.y - TRACK_Y;
      const thumbH = this.getThumbHeight();
      const thumbTop = this.getThumbTop(thumbH);
      if (localY >= thumbTop && localY <= thumbTop + thumbH) {
        this.draggingThumb = true;
        this.dragStartY = pointer.y;
        this.dragStartScroll = this.scrollOffset;
      } else {
        const ratio = Phaser.Math.Clamp((localY - thumbH / 2) / Math.max(1, TRACK_H - thumbH), 0, 1);
        this.setScroll(ratio * this.maxScroll);
      }
    });
    this.historyContainer.add(scrollHit);

    // Top-right hide button
    this.buildHideButton();

    // 2. Always-visible bottom input bar
    const barY = PANEL_HEIGHT - INPUT_BAR_HEIGHT;
    const barBoard = scene.add.graphics();
    barBoard.fillStyle(COLORS.ink, 0.82);
    barBoard.fillRoundedRect(0, barY, PANEL_WIDTH, INPUT_BAR_HEIGHT, 6);
    barBoard.lineStyle(2, 0x2f4a3b, 1);
    barBoard.strokeRoundedRect(1, barY + 1, PANEL_WIDTH - 2, INPUT_BAR_HEIGHT - 2, 6);
    // Input textbox background (shifted right for Channel Droplist Box)
    const dropW = 78;
    const inputX = 10 + dropW + 6;
    const inputW = PANEL_WIDTH - 114 - (dropW + 6);
    barBoard.fillStyle(0x09100f, 0.9);
    barBoard.fillRoundedRect(inputX, barY + 8, inputW, 24, 4);
    barBoard.lineStyle(1, 0x284032, 1);
    barBoard.strokeRoundedRect(inputX, barY + 8, inputW, 24, 4);
    this.container.add(barBoard);

    this.buildChannelDroplist(10, barY + 8, dropW, 24, barY);

    this.hintText = scene.add
      .text(inputX + 6, barY + 12, "PRESS ENTER TO CHAT", {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#7f9a84",
      })
      .setShadow(1, 1, "#000000", 0, true, true);
    this.container.add(this.hintText);

    this.inputText = scene.add
      .text(inputX + 6, barY + 11, "", {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#f4c95d",
      })
      .setShadow(1, 1, "#000000", 0, true, true)
      .setVisible(false);
    this.container.add(this.inputText);

    this.buildSettingsButton(PANEL_WIDTH, PANEL_HEIGHT);
    this.showChatBtn = this.buildShowButton(PANEL_WIDTH, barY);
    this.buildSettingsPopup(PANEL_WIDTH, PANEL_HEIGHT);

    // Wheel & drag listeners
    this.onWheelHandler = (pointer, _over, _dx, deltaY) => {
      if (this.collapsed || this.maxScroll <= 0) return;
      const lx = pointer.x - this.container.x;
      const ly = pointer.y - this.container.y;
      if (lx >= 0 && lx <= PANEL_WIDTH && ly >= 0 && ly <= PANEL_HEIGHT - INPUT_BAR_HEIGHT) {
        this.setScroll(this.scrollOffset + Math.sign(deltaY) * 24);
      }
    };
    this.onPointerMoveHandler = (pointer) => {
      if (!this.draggingThumb || this.maxScroll <= 0) return;
      const thumbH = this.getThumbHeight();
      const travel = Math.max(1, TRACK_H - thumbH);
      const dy = pointer.y - this.dragStartY;
      this.setScroll(this.dragStartScroll + (dy / travel) * this.maxScroll);
    };
    this.onPointerUpHandler = () => {
      this.draggingThumb = false;
    };

    scene.input.on("wheel", this.onWheelHandler);
    scene.input.on("pointermove", this.onPointerMoveHandler);
    scene.input.on("pointerup", this.onPointerUpHandler);

    this.redrawScrollbar();
  }

  get isOpen(): boolean {
    return this.open;
  }

  isDropMuted(): boolean {
    return this.settings.muteDrop;
  }

  isExpMuted(): boolean {
    return this.settings.muteExp;
  }

  closeSettings(): void {
    this.settingsOpen = false;
    this.settingsPopup.setVisible(false);
    this.channelMenuOpen = false;
    this.channelMenu?.setVisible(false);
  }

  private buildChannelDroplist(x: number, y: number, w: number, h: number, barY: number): void {
    const btnBg = this.scene.add.graphics();
    const drawBtn = (hovered: boolean) => {
      btnBg.clear();
      btnBg.fillStyle(hovered ? 0x1e3328 : 0x0f1c17, 0.95);
      btnBg.fillRoundedRect(x, y, w, h, 4);
      btnBg.lineStyle(1, hovered ? 0xf4c95d : 0x3b5a47, 1);
      btnBg.strokeRoundedRect(x, y, w, h, 4);
    };
    drawBtn(false);
    this.container.add(btnBg);

    this.channelBtnText = this.scene.add
      .text(x + w / 2, y + h / 2, "PUBLIC ▼", {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: "#cfe8c8",
      })
      .setOrigin(0.5);
    this.container.add(this.channelBtnText);

    const btnHit = this.scene.add
      .rectangle(x, y, w, h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    btnHit.on("pointerover", (pointer: Phaser.Input.Pointer) => {
      drawBtn(true);
      const current = CHANNELS.find((c) => c.id === this.selectedChannel) ?? CHANNELS[0];
      this.showChannelTip(current.tip, current.color, pointer.x, pointer.y);
    });
    btnHit.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.channelTipContainer.visible) {
        this.positionChannelTip(pointer.x, pointer.y);
      }
    });
    btnHit.on("pointerout", () => {
      drawBtn(false);
      this.hideChannelTip();
    });
    btnHit.on("pointerdown", () => {
      this.channelMenuOpen = !this.channelMenuOpen;
      this.channelMenu.setVisible(this.channelMenuOpen);
      if (this.channelMenuOpen) {
        this.settingsOpen = false;
        this.settingsPopup.setVisible(false);
      }
    });
    this.container.add(btnHit);

    // Hover tooltip box for channel droplist
    this.channelTipBg = this.scene.add.graphics();
    this.channelTipText = this.scene.add.text(8, 6, "", {
      fontFamily: UI_FONT,
      fontSize: "14px",
      color: "#f4c95d",
      wordWrap: { width: 240 },
    });
    this.channelTipContainer = this.scene.add
      .container(0, 0, [this.channelTipBg, this.channelTipText])
      .setDepth(280)
      .setScrollFactor(0)
      .setVisible(false);

    const menuW = 96;
    const rowH = 26;
    const menuH = CHANNELS.length * rowH + 6;
    const menuY = barY - menuH - 4;
    this.channelMenu = this.scene.add.container(x, menuY).setVisible(false);

    const menuBg = this.scene.add.graphics();
    menuBg.fillStyle(COLORS.ink, 0.96);
    menuBg.fillRoundedRect(0, 0, menuW, menuH, 6);
    menuBg.lineStyle(1.5, 0x3b5a47, 1);
    menuBg.strokeRoundedRect(0, 0, menuW, menuH, 6);
    this.channelMenu.add(menuBg);

    CHANNELS.forEach((ch, idx) => {
      const ry = 3 + idx * rowH;
      const rowBg = this.scene.add.graphics();
      const drawRow = (hovered: boolean) => {
        rowBg.clear();
        if (hovered) {
          rowBg.fillStyle(0x1f382c, 1);
          rowBg.fillRoundedRect(4, ry, menuW - 8, rowH - 2, 4);
        }
      };
      this.channelMenu.add(rowBg);

      const lbl = this.scene.add
        .text(10, ry + rowH / 2 - 1, ch.label, {
          fontFamily: UI_FONT,
          fontSize: "14px",
          color: ch.color,
        })
        .setOrigin(0, 0.5);
      this.channelMenu.add(lbl);

      const rHit = this.scene.add
        .rectangle(4, ry, menuW - 8, rowH - 2)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      rHit.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        drawRow(true);
        this.showChannelTip(ch.tip, ch.color, pointer.x, pointer.y);
      });
      rHit.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (this.channelTipContainer.visible) {
          this.positionChannelTip(pointer.x, pointer.y);
        }
      });
      rHit.on("pointerout", () => {
        drawRow(false);
        this.hideChannelTip();
      });
      rHit.on("pointerdown", () => {
        this.hideChannelTip();
        this.selectChannel(ch.id);
      });
      this.channelMenu.add(rHit);
    });

    this.container.add(this.channelMenu);
  }

  private showChannelTip(text: string, color: string, screenX: number, screenY: number): void {
    this.channelTipText.setText(text).setColor(color);
    const w = Math.ceil(this.channelTipText.width) + 16;
    const h = Math.ceil(this.channelTipText.height) + 12;
    this.channelTipBg.clear();
    this.channelTipBg.fillStyle(0x0b1512, 0.96);
    this.channelTipBg.fillRoundedRect(0, 0, w, h, 6);
    this.channelTipBg.lineStyle(1.5, 0x3b5a47, 1);
    this.channelTipBg.strokeRoundedRect(0, 0, w, h, 6);
    this.channelTipContainer.setSize(w, h).setVisible(true);
    this.positionChannelTip(screenX, screenY);
  }

  private positionChannelTip(screenX: number, screenY: number): void {
    const w = this.channelTipContainer.width || 200;
    const h = this.channelTipContainer.height || 36;
    const tx = Phaser.Math.Clamp(screenX + 12, 8, this.scene.scale.width - w - 8);
    const ty = Phaser.Math.Clamp(screenY - h - 10, 8, this.scene.scale.height - h - 8);
    this.channelTipContainer.setPosition(tx, ty);
  }

  private hideChannelTip(): void {
    this.channelTipContainer?.setVisible(false);
  }

  private selectChannel(channel: ChatSendChannel): void {
    this.selectedChannel = channel;
    const found = CHANNELS.find((c) => c.id === channel) ?? CHANNELS[0];
    this.channelBtnText.setText(`${found.label} ▼`).setColor(found.color);
    this.channelMenuOpen = false;
    this.channelMenu.setVisible(false);
    this.hintText.setText(channel === "whisper" ? "/nickname pesan" : "PRESS ENTER TO CHAT");
    if (channel === "whisper" && this.open && this.value.length === 0) {
      this.value = "/";
      this.refreshInput();
    }
  }

  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.historyContainer.setVisible(!collapsed);
    this.showChatBtn.setVisible(collapsed);
    if (collapsed) {
      this.draggingThumb = false;
    }
  }

  private buildHideButton(): void {
    const btnW = 22;
    const btnH = 18;
    const btnX = PANEL_WIDTH - btnW - 6;
    const btnY = 6;

    const bg = this.scene.add.graphics();
    const draw = (hovered: boolean) => {
      bg.clear();
      bg.fillStyle(hovered ? 0x223b2d : 0x15261e, 0.95);
      bg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
      bg.lineStyle(1, hovered ? 0xf4c95d : 0x3b5a47, 1);
      bg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
    };
    draw(false);
    this.historyContainer.add(bg);

    const label = this.scene.add
      .text(btnX + btnW / 2, btnY + btnH / 2 - 1, "▼", {
        fontFamily: UI_FONT,
        fontSize: "12px",
        color: "#f4c95d",
      })
      .setOrigin(0.5);
    this.historyContainer.add(label);

    const hit = this.scene.add
      .rectangle(btnX, btnY, btnW, btnH)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerdown", () => this.setCollapsed(true));
    this.historyContainer.add(hit);
  }

  private buildShowButton(panelWidth: number, barY: number): Phaser.GameObjects.Container {
    const btnW = 24;
    const btnH = 24;
    const btnX = panelWidth - btnW - 8;
    const btnY = barY + 8;

    const cont = this.scene.add.container(0, 0).setVisible(false);

    const bg = this.scene.add.graphics();
    const draw = (hovered: boolean) => {
      bg.clear();
      bg.fillStyle(hovered ? 0x223b2d : 0x15261e, 0.95);
      bg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
      bg.lineStyle(1, hovered ? 0xf4c95d : 0x3b5a47, 1);
      bg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
    };
    draw(false);
    cont.add(bg);

    const label = this.scene.add
      .text(btnX + btnW / 2, btnY + btnH / 2 - 1, "▲", {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: "#f4c95d",
      })
      .setOrigin(0.5);
    cont.add(label);

    const hit = this.scene.add
      .rectangle(btnX, btnY, btnW, btnH)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerdown", () => this.setCollapsed(false));
    cont.add(hit);

    this.container.add(cont);
    return cont;
  }

  private buildSettingsButton(panelWidth: number, panelHeight: number): void {
    const btnX = panelWidth - 96;
    const btnY = panelHeight - 32;
    const btnW = 56;
    const btnH = 24;

    const btnBg = this.scene.add.graphics();
    const drawBtn = (hovered: boolean) => {
      btnBg.clear();
      btnBg.fillStyle(hovered ? 0x223b2d : 0x15261e, 0.95);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
      btnBg.lineStyle(1, hovered ? 0xf4c95d : 0x3b5a47, 1);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
    };
    drawBtn(false);
    this.container.add(btnBg);

    const btnLabel = this.scene.add
      .text(btnX + btnW / 2, btnY + btnH / 2, "SET", {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#f4c95d",
      })
      .setOrigin(0.5);
    this.container.add(btnLabel);

    const hit = this.scene.add
      .rectangle(btnX, btnY, btnW, btnH)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => drawBtn(true));
    hit.on("pointerout", () => drawBtn(false));
    hit.on("pointerdown", () => {
      this.settingsOpen = !this.settingsOpen;
      this.settingsPopup.setVisible(this.settingsOpen);
    });
    this.container.add(hit);
  }

  private buildSettingsPopup(panelWidth: number, panelHeight: number): void {
    const popW = 216;
    const popH = 82;
    const popX = panelWidth - popW - 10;
    const popY = panelHeight - INPUT_BAR_HEIGHT - popH - 6;

    this.settingsPopup = this.scene.add.container(popX, popY).setVisible(false);

    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.ink, 0.96);
    bg.fillRoundedRect(0, 0, popW, popH, 6);
    bg.lineStyle(1.5, 0x3b5a47, 1);
    bg.strokeRoundedRect(0, 0, popW, popH, 6);
    this.settingsPopup.add(bg);

    const title = this.scene.add.text(10, 6, "CHAT SETTING", {
      fontFamily: UI_FONT,
      fontSize: "16px",
      color: "#f4c95d",
    });
    this.settingsPopup.add(title);

    this.dropCheckText = this.scene.add.text(10, 29, "", {
      fontFamily: UI_FONT,
      fontSize: "17px",
      color: "#cfe8c8",
    });
    this.settingsPopup.add(this.dropCheckText);

    const dropHit = this.scene.add
      .rectangle(8, 27, popW - 16, 22)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    dropHit.on("pointerdown", () => {
      this.settings.muteDrop = !this.settings.muteDrop;
      saveChatSettings(this.settings);
      this.refreshSettingsLabels();
    });
    this.settingsPopup.add(dropHit);

    this.expCheckText = this.scene.add.text(10, 53, "", {
      fontFamily: UI_FONT,
      fontSize: "17px",
      color: "#cfe8c8",
    });
    this.settingsPopup.add(this.expCheckText);

    const expHit = this.scene.add
      .rectangle(8, 51, popW - 16, 22)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    expHit.on("pointerdown", () => {
      this.settings.muteExp = !this.settings.muteExp;
      saveChatSettings(this.settings);
      this.refreshSettingsLabels();
    });
    this.settingsPopup.add(expHit);

    this.refreshSettingsLabels();
    this.container.add(this.settingsPopup);
  }

  private refreshSettingsLabels(): void {
    this.dropCheckText.setText(
      `[${this.settings.muteDrop ? "x" : " "}] Matikan info drop`,
    );
    this.dropCheckText.setColor(this.settings.muteDrop ? "#e08a7a" : "#cfe8c8");

    this.expCheckText.setText(
      `[${this.settings.muteExp ? "x" : " "}] Matikan info exp`,
    );
    this.expCheckText.setColor(this.settings.muteExp ? "#e08a7a" : "#cfe8c8");
  }

  openInput(): void {
    if (this.open) return;
    this.open = true;
    this.value = "";
    this.hintText.setVisible(false);
    this.inputText.setVisible(true);
    this.refreshInput();
  }

  openWithText(text: string): void {
    this.open = true;
    this.value = text;
    this.hintText.setVisible(false);
    this.inputText.setVisible(true);
    this.refreshInput();
  }

  closeInput(): void {
    if (!this.open) return;
    this.open = false;
    this.value = "";
    this.hintText.setVisible(true);
    this.inputText.setVisible(false);
  }

  /**
   * Handles a raw DOM keyboard event while the input is open.
   * Returns true when the event was consumed by the chat.
   */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.open) return false;

    if (event.key === "Escape") {
      this.closeInput();
      return true;
    }

    if (event.key === "Enter") {
      const text = this.value.trim();
      if (text.length > 0) {
        this.onSend(text.slice(0, CHAT_MAX_LENGTH), this.selectedChannel);
      }
      this.closeInput();
      return true;
    }

    if (event.key === "Backspace") {
      this.value = this.value.slice(0, -1);
      this.refreshInput();
      return true;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (this.value.length < CHAT_MAX_LENGTH) {
        this.value += event.key;
        this.refreshInput();
      }
      return true;
    }

    // Consume movement/action keys so typing does not move the character.
    return true;
  }

  addMessage(event: ChatEvent): void {
    if (event.channel === "all") {
      this.pushHistory({
        text: ` [ALL] ${event.name}: ${event.text} `,
        color: "#000000",
        bgColor: 0xfacc15,
        bold: true,
      });
      return;
    }
    if (event.channel === "whisper") {
      this.pushHistory({
        text: `[Wisper ${event.name}] ${event.text}`,
        color: "#f472b6",
      });
      return;
    }
    const isSystem = event.channel === "system";
    const isBroadcast = event.channel === "broadcast";
    const isParty = event.channel === "party";
    const prefix = isBroadcast
      ? "📢 [PENGUMUMAN]"
      : isSystem
        ? "»"
        : isParty
          ? `[Party] [${event.name}]`
          : `[${event.name}]`;
    const color = isBroadcast
      ? "#ffdd44"
      : isSystem
        ? "#f4c95d"
        : isParty
          ? "#5bc0de"
          : "#cfe8c8";
    this.pushHistory({ text: `${prefix} ${event.text}`, color });
  }

  addLocalText(text: string, color = "#cfe8c8"): void {
    this.pushHistory({ text, color });
  }

  private pushHistory(entry: Line): void {
    const wasAtBottom = this.maxScroll - this.scrollOffset <= 12;
    this.messages.push(entry);
    if (this.messages.length > MAX_HISTORY) this.messages.shift();
    this.renderMessages(wasAtBottom);
  }

  private refreshInput(): void {
    this.inputText.setText(`> ${this.value}_`);
  }

  private renderMessages(scrollToBottom = false): void {
    for (const obj of this.messageObjects) obj.destroy();
    this.messageObjects = [];

    let y = 0;
    for (const message of this.messages) {
      const line = this.scene.add.text(0, y, message.text, {
        fontFamily: UI_FONT,
        fontSize: "18px",
        fontStyle: message.bold ? "bold" : "normal",
        color: message.color,
        wordWrap: { width: MSG_W - 6, useAdvancedWrap: true },
      });
      if (message.bgColor !== undefined) {
        const bg = this.scene.add.graphics();
        bg.fillStyle(message.bgColor, 0.96);
        bg.fillRoundedRect(-2, y - 1, MSG_W - 2, line.height + 2, 3);
        this.messagesContainer.add(bg);
        this.messageObjects.push(bg);
      } else {
        line.setShadow(1, 1, "#000000", 0, true, true);
      }
      this.messagesContainer.add(line);
      this.messageObjects.push(line);
      y += line.height + 2;
    }

    this.totalContentHeight = y;
    this.maxScroll = Math.max(0, this.totalContentHeight - MSG_H);
    if (scrollToBottom) {
      this.scrollOffset = this.maxScroll;
    } else {
      this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset, 0, this.maxScroll);
    }

    this.applyScroll();
  }

  private setScroll(offset: number): void {
    this.scrollOffset = Phaser.Math.Clamp(offset, 0, this.maxScroll);
    this.applyScroll();
  }

  private applyScroll(): void {
    this.messagesContainer.setY(MSG_Y - this.scrollOffset);
    this.redrawScrollbar();
  }

  private getThumbHeight(): number {
    if (this.totalContentHeight <= MSG_H) return TRACK_H;
    return Math.max(18, Math.floor((MSG_H / this.totalContentHeight) * TRACK_H));
  }

  private getThumbTop(thumbH: number): number {
    if (this.maxScroll <= 0) return TRACK_Y;
    const ratio = this.scrollOffset / this.maxScroll;
    return TRACK_Y + ratio * (TRACK_H - thumbH);
  }

  private redrawScrollbar(): void {
    this.scrollTrack.clear();
    this.scrollThumb.clear();

    this.scrollTrack.fillStyle(0x0a1412, 0.7);
    this.scrollTrack.fillRoundedRect(TRACK_X, TRACK_Y, TRACK_W, TRACK_H, 3);

    if (this.maxScroll <= 0) {
      this.scrollThumb.fillStyle(0x2f4a3b, 0.6);
      this.scrollThumb.fillRoundedRect(TRACK_X, TRACK_Y, TRACK_W, TRACK_H, 3);
      return;
    }

    const thumbH = this.getThumbHeight();
    const thumbY = this.getThumbTop(thumbH);
    this.scrollThumb.fillStyle(0xf4c95d, 0.85);
    this.scrollThumb.fillRoundedRect(TRACK_X, thumbY, TRACK_W, thumbH, 3);
  }

  private updateMaskGeometry(): void {
    this.maskGraphics.clear();
    this.maskGraphics.fillStyle(0xffffff);
    this.maskGraphics.fillRect(
      this.container.x + MSG_X,
      this.container.y + MSG_Y,
      MSG_W,
      MSG_H,
    );
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
    if (!visible) this.closeInput();
  }

  reposition(height: number): void {
    this.container.setPosition(16, Math.max(120, height - PANEL_HEIGHT - 20));
    this.updateMaskGeometry();
  }

  destroy(): void {
    this.scene.input.off("wheel", this.onWheelHandler);
    this.scene.input.off("pointermove", this.onPointerMoveHandler);
    this.scene.input.off("pointerup", this.onPointerUpHandler);
    this.maskGraphics.destroy();
    this.container.destroy(true);
  }
}
