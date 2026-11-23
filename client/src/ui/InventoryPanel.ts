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
import { ItemKind, type PlayerState } from "../types";
import type { ShortcutPayload } from "./ShortcutBar";

const PANEL_WIDTH = 328;
const PANEL_HEIGHT = 408;

const SLOT_SIZE = 64;
const SLOT_GAP = 8;
const GRID_COLS = 4;
const GRID_ROWS = 4;
const GRID_X = 24;
const GRID_Y = 70;

interface SlotView {
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  qty: Phaser.GameObjects.Text;
}

type HoverTarget = { kind: "inventory"; slot: number } | null;

export interface InventoryPanelOptions {
  /** Used for local hints such as "materials cannot be used". */
  onMessage?: (text: string, color?: string) => void;
  onFocus?: () => void;
  onClose?: () => void;
  onStartDrag?: (payload: ShortcutPayload, icon: string) => void;
  isOverShortcut?: (screenX: number, screenY: number) => boolean;
}

/**
 * Interactive satchel / inventory panel.
 * Displays a 4x4 item grid, gold count, and floating bubble tooltip on item hover.
 */
export class InventoryPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly onMessage?: (text: string, color?: string) => void;
  private readonly onFocus?: () => void;
  private readonly onClose?: () => void;
  private readonly onStartDrag?: (payload: ShortcutPayload, icon: string) => void;
  private readonly isOverShortcut?: (screenX: number, screenY: number) => boolean;
  private readonly slots: SlotView[] = [];
  private readonly goldText: Phaser.GameObjects.Text;
  private readonly tooltip: ItemTooltip;

  private hovered: HoverTarget = null;
  private selectedSlot: number | null = null;
  private lastClickSlot = -1;
  private lastClickAt = 0;
  private dragState: {
    startX: number;
    startY: number;
    slot: number;
    itemId: string;
    kind: number;
    started: boolean;
  } | null = null;
  private dragGhost?: Phaser.GameObjects.Image;
  private confirmContainer?: Phaser.GameObjects.Container;
  private confirmKeyHandler?: (event: KeyboardEvent) => void;
  private open = false;
  hasUserMoved = false;

  constructor(scene: Phaser.Scene, options: InventoryPanelOptions = {}) {
    this.scene = scene;
    this.onMessage = options.onMessage;
    this.onFocus = options.onFocus;
    this.onClose = options.onClose;
    this.onStartDrag = options.onStartDrag;
    this.isOverShortcut = options.isOverShortcut;
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

    const title = scene.add.text(20, 14, "INVENTORY", {
      fontFamily: TITLE_FONT,
      fontSize: "15px",
      color: "#f4c95d",
    });
    this.container.add(title);

    const close = scene.add
      .text(PANEL_WIDTH - 20, 12, "[ I / ESC ]", {
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

    const coin = scene.add.image(24, 44, "item-coin").setScale(0.9);
    this.container.add(coin);

    this.goldText = scene.add.text(38, 33, "GOLD 0", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: "#f4c95d",
    });
    this.container.add(this.goldText);

    this.buildGrid();
    this.buildFooterButtons();
    this.bindGlobalDragEvents();
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
      this.selectedSlot = null;
      this.clearDrag();
      this.closeConfirm();
      this.tooltip.hide();
    }
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.hovered = null;
    this.selectedSlot = null;
    this.clearDrag();
    this.closeConfirm();
    this.tooltip.hide();
    this.container.setVisible(false);
  }

  refresh(): void {
    if (!this.open) return;

    const player = network.players.get(network.sessionId);
    if (!player) return;

    this.goldText.setText(`GOLD ${player.gold.toLocaleString()}`);

    if (this.selectedSlot !== null) {
      const selStack = player.inventory?.get(String(this.selectedSlot));
      if (!selStack?.itemId) {
        this.selectedSlot = null;
      }
    }

    for (let i = 0; i < this.slots.length; i++) {
      const stack = player.inventory?.get(String(i));
      const itemId = stack?.itemId ?? "";
      this.renderSlot(
        this.slots[i],
        itemId,
        stack?.qty ?? 0,
        this.isHoveredInventory(i),
        this.selectedSlot === i,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private buildGrid(): void {
    for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const sx = GRID_X + col * (SLOT_SIZE + SLOT_GAP);
      const sy = GRID_Y + row * (SLOT_SIZE + SLOT_GAP);

      const view = this.createSlotView(sx, sy, String(i + 1));
      const hit = this.scene.add
        .rectangle(sx, sy, SLOT_SIZE, SLOT_SIZE, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      this.container.add(hit);

      hit.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        this.hovered = { kind: "inventory", slot: i };
        this.refresh();
        const player = network.players.get(network.sessionId);
        const stack = player?.inventory?.get(String(i));
        if (stack?.itemId) {
          this.tooltip.show(stack.itemId, stack.qty, pointer.x, pointer.y);
        } else {
          this.tooltip.hide();
        }
      });

      let dragState: { x: number; y: number; itemId: string; started: boolean } | null = null;

      hit.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (this.isHoveredInventory(i)) {
          this.tooltip.updatePosition(pointer.x, pointer.y);
        }
      });

      hit.on("pointerout", () => {
        if (this.isHoveredInventory(i)) {
          this.hovered = null;
          this.tooltip.hide();
          this.refresh();
        }
      });

      hit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        const player = network.players.get(network.sessionId);
        const stack = player?.inventory?.get(String(i));
        const def = stack?.itemId ? itemCatalog.get(stack.itemId) : undefined;
        if (stack?.itemId && def) {
          this.dragState = {
            startX: pointer.x,
            startY: pointer.y,
            slot: i,
            itemId: stack.itemId,
            kind: def.kind,
            started: false,
          };
        } else {
          this.dragState = null;
        }
      });

      hit.on("pointerup", () => {
        const wasDragged = this.dragState?.started ?? false;
        if (wasDragged) return;

        const now = Date.now();
        const player = network.players.get(network.sessionId);
        const stack = player?.inventory?.get(String(i));
        if (stack?.itemId) {
          this.selectedSlot = i;
          if (this.lastClickSlot === i && now - this.lastClickAt <= 380) {
            this.lastClickSlot = -1;
            this.lastClickAt = 0;
            this.activateSlot(i);
          } else {
            this.lastClickSlot = i;
            this.lastClickAt = now;
          }
        } else {
          this.selectedSlot = null;
        }
        this.refresh();

        this.scene.time.delayedCall(60, () => {
          if (this.isHoveredInventory(i)) {
            const p = network.players.get(network.sessionId);
            const st = p?.inventory?.get(String(i));
            if (st?.itemId) {
              const ptr = this.scene.input.activePointer;
              this.tooltip.show(st.itemId, st.qty, ptr.x, ptr.y);
            } else {
              this.tooltip.hide();
            }
          }
        });
      });

      this.slots.push(view);
    }
  }

  private bindGlobalDragEvents(): void {
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragState || !pointer.isDown) return;
      if (!this.dragState.started) {
        if (Phaser.Math.Distance.Between(this.dragState.startX, this.dragState.startY, pointer.x, pointer.y) > 6) {
          this.dragState.started = true;
          this.tooltip.hide();
          if (this.dragState.kind === ItemKind.Consumable) {
            this.onStartDrag?.({ type: "item", itemId: this.dragState.itemId }, itemTexture(this.dragState.itemId));
          } else {
            this.dragGhost = this.scene.add
              .image(pointer.x, pointer.y, itemTexture(this.dragState.itemId))
              .setDepth(250)
              .setScrollFactor(0)
              .setScale(1.6)
              .setAlpha(0.88);
          }
        }
      } else if (this.dragGhost) {
        this.dragGhost.setPosition(pointer.x, pointer.y);
      }
    });

    this.scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const active = this.dragState;
      this.clearDrag();
      if (!active?.started || !this.open) return;

      const cx = this.container.x;
      const cy = this.container.y;
      const outsideInventory =
        pointer.x < cx ||
        pointer.x > cx + PANEL_WIDTH ||
        pointer.y < cy ||
        pointer.y > cy + PANEL_HEIGHT;

      if (!outsideInventory) {
        const targetSlot = this.findInventorySlotAt(pointer.x, pointer.y);
        if (targetSlot !== -1 && targetSlot !== active.slot) {
          network.moveItem(active.slot, targetSlot);
          this.selectedSlot = targetSlot;
          this.refresh();
        }
        return;
      }

      if (active.kind === ItemKind.Consumable && this.isOverShortcut?.(pointer.x, pointer.y)) {
        return;
      }

      this.selectedSlot = active.slot;
      this.refresh();
      this.promptThrow(active.slot);
    });
  }

  private findInventorySlotAt(screenX: number, screenY: number): number {
    const lx = screenX - this.container.x;
    const ly = screenY - this.container.y;
    for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const sx = GRID_X + col * (SLOT_SIZE + SLOT_GAP);
      const sy = GRID_Y + row * (SLOT_SIZE + SLOT_GAP);
      if (lx >= sx && lx <= sx + SLOT_SIZE && ly >= sy && ly <= sy + SLOT_SIZE) {
        return i;
      }
    }
    return -1;
  }

  private clearDrag(): void {
    this.dragState = null;
    this.dragGhost?.destroy();
    this.dragGhost = undefined;
  }

  private buildFooterButtons(): void {
    const btnY = 362;
    const btnH = 30;
    this.createActionButton(24, btnY, 96, btnH, "ASSORTED", 0x1d3b2c, 0x2a5740, "#9fe08a", () => {
      network.sortInventory();
      this.selectedSlot = null;
      this.onMessage?.("INVENTORY DISUSUN (KONSUMSI PRIORITAS).", "#9fe08a");
    });
    this.createActionButton(126, btnY, 94, btnH, "USE / EQUIP", 0x203546, 0x2e4e68, "#78e8ff", () => {
      if (this.selectedSlot === null) {
        this.onMessage?.("Pilih item terlebih dahulu.", "#f4c95d");
        return;
      }
      this.activateSlot(this.selectedSlot);
    });
    this.createActionButton(226, btnY, 78, btnH, "THROW", 0x451b1b, 0x692828, "#ff9a8a", () => {
      if (this.selectedSlot === null) {
        this.onMessage?.("Pilih item yang ingin dibuang.", "#ff9a8a");
        return;
      }
      this.promptThrow(this.selectedSlot);
    });
  }

  private createActionButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    fill: number,
    hoverFill: number,
    textColor: string,
    onClick: () => void,
  ): void {
    const bg = this.scene.add.graphics();
    const draw = (hovered: boolean) => {
      bg.clear();
      bg.fillStyle(hovered ? hoverFill : fill, 1);
      bg.fillRoundedRect(x, y, w, h, 5);
      bg.lineStyle(1.5, hovered ? 0xf4c95d : 0x3b5a47, 1);
      bg.strokeRoundedRect(x, y, w, h, 5);
    };
    draw(false);
    this.container.add(bg);

    const text = this.scene.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: UI_FONT,
        fontSize: "14px",
        color: textColor,
      })
      .setOrigin(0.5);
    this.container.add(text);

    const hit = this.scene.add
      .rectangle(x, y, w, h, 0x000000, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onClick();
    });
    this.container.add(hit);
  }

  private promptThrow(slot: number): void {
    const player = network.players.get(network.sessionId);
    const stack = player?.inventory?.get(String(slot));
    if (!stack?.itemId) {
      this.onMessage?.("Slot kosong.", "#ff9a8a");
      return;
    }
    const def = itemCatalog.get(stack.itemId);
    const itemName = def?.name ?? stack.itemId;
    this.closeConfirm();

    const modal = this.scene.add.container(0, 0).setDepth(300);
    const backdrop = this.scene.add
      .rectangle(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 0x050a08, 0.78)
      .setOrigin(0)
      .setInteractive();
    backdrop.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
    });
    modal.add(backdrop);

    const isStacked = stack.qty > 1;
    const boxW = 276;
    const boxH = isStacked ? 186 : 148;
    const bx = (PANEL_WIDTH - boxW) / 2;
    const by = (PANEL_HEIGHT - boxH) / 2;

    const box = this.scene.add.graphics();
    box.fillStyle(0x13221b, 1);
    box.fillRoundedRect(bx, by, boxW, boxH, 8);
    box.lineStyle(2, 0xf4c95d, 1);
    box.strokeRoundedRect(bx, by, boxW, boxH, 8);
    modal.add(box);

    const title = this.scene.add
      .text(PANEL_WIDTH / 2, by + 22, "Yakin akan dibuang?", {
        fontFamily: TITLE_FONT,
        fontSize: "14px",
        color: "#f4c95d",
      })
      .setOrigin(0.5);
    modal.add(title);

    const detail = this.scene.add
      .text(PANEL_WIDTH / 2, by + 52, `${itemName} (stok: ${stack.qty})`, {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#e8f1d8",
        wordWrap: { width: boxW - 24 },
        align: "center",
      })
      .setOrigin(0.5);
    modal.add(detail);

    let qtyStr = String(stack.qty);
    const getQty = (): number => Math.max(1, Math.min(stack.qty, Number.parseInt(qtyStr, 10) || 1));

    if (isStacked) {
      const rowY = by + 92;
      const qtyBoxBg = this.scene.add.graphics();
      qtyBoxBg.fillStyle(0x0c1611, 1);
      qtyBoxBg.fillRoundedRect(PANEL_WIDTH / 2 - 36, rowY - 14, 72, 28, 4);
      qtyBoxBg.lineStyle(1.5, 0x78e8ff, 0.9);
      qtyBoxBg.strokeRoundedRect(PANEL_WIDTH / 2 - 36, rowY - 14, 72, 28, 4);
      modal.add(qtyBoxBg);

      const qtyText = this.scene.add
        .text(PANEL_WIDTH / 2, rowY, qtyStr, {
          fontFamily: UI_FONT,
          fontSize: "18px",
          color: "#78e8ff",
        })
        .setOrigin(0.5);
      modal.add(qtyText);

      const syncQtyText = () => {
        qtyText.setText(qtyStr.length > 0 ? qtyStr : "1");
      };

      const makeMiniBtn = (cx: number, w: number, text: string, cb: () => void) => {
        const bg = this.scene.add.graphics();
        bg.fillStyle(0x1f382c, 1);
        bg.fillRoundedRect(cx - w / 2, rowY - 14, w, 28, 4);
        bg.lineStyle(1, 0x4b6e57, 1);
        bg.strokeRoundedRect(cx - w / 2, rowY - 14, w, 28, 4);
        modal.add(bg);
        const lbl = this.scene.add
          .text(cx, rowY, text, { fontFamily: UI_FONT, fontSize: "15px", color: "#e8f1d8" })
          .setOrigin(0.5);
        modal.add(lbl);
        const h = this.scene.add
          .rectangle(cx - w / 2, rowY - 14, w, 28, 0x000000, 0)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true });
        h.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation();
          cb();
        });
        modal.add(h);
      };

      makeMiniBtn(PANEL_WIDTH / 2 - 58, 28, "-", () => {
        qtyStr = String(Math.max(1, getQty() - 1));
        syncQtyText();
      });
      makeMiniBtn(PANEL_WIDTH / 2 + 58, 28, "+", () => {
        qtyStr = String(Math.min(stack.qty, getQty() + 1));
        syncQtyText();
      });
      makeMiniBtn(PANEL_WIDTH / 2 + 98, 40, "MAX", () => {
        qtyStr = String(stack.qty);
        syncQtyText();
      });

      this.confirmKeyHandler = (ev: KeyboardEvent) => {
        if (!this.confirmContainer) return;
        if (ev.key >= "0" && ev.key <= "9") {
          ev.preventDefault();
          const next = (qtyStr === String(stack.qty) && qtyStr.length > 0 ? ev.key : qtyStr + ev.key);
          const clamped = Math.min(stack.qty, Math.max(1, Number.parseInt(next, 10) || 1));
          qtyStr = String(clamped);
          syncQtyText();
        } else if (ev.key === "Backspace") {
          ev.preventDefault();
          qtyStr = qtyStr.length > 1 ? qtyStr.slice(0, -1) : "1";
          syncQtyText();
        }
      };
      this.scene.input.keyboard?.on("keydown", this.confirmKeyHandler);
    }

    const btnY = isStacked ? by + 136 : by + 98;
    const makeModalBtn = (cx: number, label: string, bgCol: number, col: string, cb: () => void) => {
      const bw = 92;
      const bh = 30;
      const btnBg = this.scene.add.graphics();
      btnBg.fillStyle(bgCol, 1);
      btnBg.fillRoundedRect(cx - bw / 2, btnY, bw, bh, 5);
      btnBg.lineStyle(1.5, 0x4b6e57, 1);
      btnBg.strokeRoundedRect(cx - bw / 2, btnY, bw, bh, 5);
      modal.add(btnBg);

      const lbl = this.scene.add
        .text(cx, btnY + bh / 2, label, {
          fontFamily: UI_FONT,
          fontSize: "15px",
          color: col,
        })
        .setOrigin(0.5);
      modal.add(lbl);

      const btnHit = this.scene.add
        .rectangle(cx - bw / 2, btnY, bw, bh, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      btnHit.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        cb();
      });
      modal.add(btnHit);
    };

    makeModalBtn(PANEL_WIDTH / 2 - 54, "YA", 0x692222, "#ff9a8a", () => {
      network.throwItem(slot, isStacked ? getQty() : 1);
      if (this.selectedSlot === slot && (!isStacked || getQty() >= stack.qty)) {
        this.selectedSlot = null;
      }
      this.closeConfirm();
    });
    makeModalBtn(PANEL_WIDTH / 2 + 54, "BATAL", 0x1d3b2c, "#9fe08a", () => {
      this.closeConfirm();
    });

    this.container.add(modal);
    this.confirmContainer = modal;
  }

  private closeConfirm(): void {
    if (this.confirmKeyHandler) {
      this.scene.input.keyboard?.off("keydown", this.confirmKeyHandler);
      this.confirmKeyHandler = undefined;
    }
    this.confirmContainer?.destroy(true);
    this.confirmContainer = undefined;
  }

  private createSlotView(
    x: number,
    y: number,
    hotkey: string,
    label?: string,
  ): SlotView {
    const bg = this.scene.add.graphics();
    bg.setPosition(x, y);
    this.container.add(bg);

    const icon = this.scene.add
      .image(x + SLOT_SIZE / 2, y + SLOT_SIZE / 2 - 2, "item-unknown")
      .setScale(1.8)
      .setVisible(false);
    this.container.add(icon);

    const qty = this.scene.add
      .text(x + SLOT_SIZE - 7, y + SLOT_SIZE - 6, "", {
        fontFamily: UI_FONT,
        fontSize: "18px",
        color: "#f1ecd8",
        stroke: "#0b1512",
        strokeThickness: 3,
      })
      .setOrigin(1, 1);
    this.container.add(qty);

    if (hotkey.length > 0) {
      const key = this.scene.add.text(x + 6, y + 4, hotkey, {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#56705d",
      });
      this.container.add(key);
    }

    if (label) {
      const caption = this.scene.add
        .text(x + SLOT_SIZE / 2, y - 22, label, {
          fontFamily: UI_FONT,
          fontSize: "16px",
          color: "#7f9a84",
        })
        .setOrigin(0.5, 0);
      this.container.add(caption);
    }

    this.drawSlotBox(bg, false, false, "#304b3c");

    return { bg, icon, qty };
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private renderSlot(
    view: SlotView,
    itemId: string,
    qty: number,
    hovered: boolean,
    selected = false,
  ): void {
    const hasItem = itemId.length > 0;
    const accent = hasItem ? itemColor(itemId) : "#304b3c";

    this.drawSlotBox(view.bg, hasItem, hovered || selected, accent, selected);

    if (hasItem) {
      view.icon.setTexture(itemTexture(itemId)).setVisible(true);
      view.qty.setText(qty > 1 ? `x${qty}` : "").setVisible(qty > 1);
    } else {
      view.icon.setVisible(false);
      view.qty.setText("").setVisible(false);
    }
  }

  private drawSlotBox(
    graphics: Phaser.GameObjects.Graphics,
    filled: boolean,
    hovered: boolean,
    accent: string,
    selected = false,
  ): void {
    graphics.clear();
    graphics.fillStyle(selected ? 0x243f33 : filled ? 0x1a2c24 : 0x15231d, 1);
    graphics.fillRoundedRect(0, 0, SLOT_SIZE, SLOT_SIZE, 4);

    const border = selected ? 0x78e8ff : hovered ? 0xf4c95d : colorValue(accent, 0x304b3c);
    graphics.lineStyle(selected || hovered ? 2 : 1, border, selected || hovered ? 1 : 0.9);
    graphics.strokeRoundedRect(1, 1, SLOT_SIZE - 2, SLOT_SIZE - 2, 4);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  private activateSlot(slot: number): void {
    const player = network.players.get(network.sessionId);
    const stack = player?.inventory?.get(String(slot));
    if (!stack?.itemId) return;

    const def = itemCatalog.get(stack.itemId);
    if (!def) return;

    if (def.kind === ItemKind.Consumable) {
      network.useItem(slot);
      return;
    }

    if (
      def.kind === ItemKind.Weapon ||
      def.kind === ItemKind.Armor ||
      def.kind === ItemKind.Wing ||
      def.kind === ItemKind.Garment
    ) {
      network.equipItem(slot);
      return;
    }

    this.onMessage?.(`${def.name.toUpperCase()} ADALAH MATERIAL.`, "#b9d3b0");
  }

  private isHoveredInventory(slot: number): boolean {
    return this.hovered?.kind === "inventory" && this.hovered.slot === slot;
  }
}
