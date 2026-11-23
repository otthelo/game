import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { attachDraggable } from "./draggable";
import { colorValue, itemColor, itemName, itemTexture } from "../items/catalog";
import { network } from "../network/NetworkClient";
import type { TradeInviteEvent, TradeStateEvent } from "../types";

const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 486;

const OFFER_SLOT_SIZE = 54;
const INV_SLOT_SIZE = 44;

interface OfferSlotView {
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  qty: Phaser.GameObjects.Text;
}

/**
 * Player-to-player Trade Window + incoming Trade Invite prompt.
 *
 * Both players must check their Confirmation Checkbox before the server
 * executes the atomic swap. Modifying items or gold resets both checkboxes.
 */
export class TradePanel {
  readonly container: Phaser.GameObjects.Container;
  readonly inviteContainer: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly mySlots: OfferSlotView[] = [];
  private readonly partnerSlots: OfferSlotView[] = [];
  private readonly invSlots: OfferSlotView[] = [];

  private readonly partnerTitle: Phaser.GameObjects.Text;
  private readonly myGoldText: Phaser.GameObjects.Text;
  private readonly partnerGoldText: Phaser.GameObjects.Text;
  private readonly myCheckBox: Phaser.GameObjects.Graphics;
  private readonly myCheckMark: Phaser.GameObjects.Text;
  private readonly myCheckLabel: Phaser.GameObjects.Text;
  private readonly partnerCheckText: Phaser.GameObjects.Text;
  private readonly infoText: Phaser.GameObjects.Text;

  private readonly inviteText: Phaser.GameObjects.Text;
  private pendingRequesterId = "";

  private tradeState: TradeStateEvent | null = null;
  private open = false;
  private dragState: { startX: number; startY: number; slot: number; itemId: string; started: boolean } | null = null;
  private dragGhost?: Phaser.GameObjects.Image;
  private qtyModal?: Phaser.GameObjects.Container;
  private qtyKeyHandler?: (event: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // -----------------------------------------------------------------------
    // 1. Incoming Trade Invite Banner (top center)
    // -----------------------------------------------------------------------
    const invW = 400;
    const invH = 104;
    this.inviteContainer = scene.add
      .container((scene.scale.width - invW) / 2, 108)
      .setDepth(75)
      .setScrollFactor(0)
      .setVisible(false);

    const invBg = scene.add.graphics();
    invBg.fillStyle(COLORS.ink, 0.96);
    invBg.fillRoundedRect(0, 0, invW, invH, 8);
    invBg.lineStyle(2, 0xf4c95d, 1);
    invBg.strokeRoundedRect(1, 1, invW - 2, invH - 2, 8);
    this.inviteContainer.add(invBg);

    this.inviteText = scene.add
      .text(invW / 2, 14, "", {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#f4c95d",
        align: "center",
      })
      .setOrigin(0.5, 0);
    this.inviteContainer.add(this.inviteText);

    this.createSmallBtn(this.inviteContainer, 74, 60, 114, 30, "YES", 0x1e422b, 0x6fcf7c, () => {
      if (!this.pendingRequesterId) return;
      network.respondTrade(this.pendingRequesterId, true);
      this.hideInvite();
    });

    this.createSmallBtn(this.inviteContainer, 212, 60, 114, 30, "NO", 0x421e1e, 0xe08a7a, () => {
      if (!this.pendingRequesterId) return;
      network.respondTrade(this.pendingRequesterId, false);
      this.hideInvite();
    });

    // -----------------------------------------------------------------------
    // 2. Main Trade Window
    // -----------------------------------------------------------------------
    const x = (scene.scale.width - PANEL_WIDTH) / 2;
    const y = (scene.scale.height - PANEL_HEIGHT) / 2;

    this.container = scene.add
      .container(x, y)
      .setDepth(65)
      .setScrollFactor(0)
      .setVisible(false);

    attachDraggable(scene, this.container, {
      panelWidth: PANEL_WIDTH,
      panelHeight: PANEL_HEIGHT,
      handleHeight: 46,
    });

    const board = scene.add.graphics();
    board.fillStyle(COLORS.ink, 0.97);
    board.fillRoundedRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 8);
    board.lineStyle(2, 0x3b5a47, 1);
    board.strokeRoundedRect(1, 1, PANEL_WIDTH - 2, PANEL_HEIGHT - 2, 8);
    board.lineStyle(1, 0x2f4a3b, 1);
    board.lineBetween(PANEL_WIDTH / 2, 46, PANEL_WIDTH / 2, 294);
    board.lineBetween(20, 302, PANEL_WIDTH - 20, 302);
    this.container.add(board);

    const title = scene.add.text(20, 14, "TRADE", {
      fontFamily: TITLE_FONT,
      fontSize: "15px",
      color: "#f4c95d",
    });
    this.container.add(title);

    const closeHint = scene.add
      .text(PANEL_WIDTH - 20, 12, "[ ESC BATAL ]", {
        fontFamily: UI_FONT,
        fontSize: "18px",
        color: "#8fa895",
      })
      .setOrigin(1, 0);
    this.container.add(closeHint);

    // Left header
    const myTitle = scene.add.text(24, 52, "PENAWARAN ANDA", {
      fontFamily: UI_FONT,
      fontSize: "19px",
      color: "#9fe08a",
    });
    this.container.add(myTitle);

    // Right header
    this.partnerTitle = scene.add.text(PANEL_WIDTH / 2 + 20, 52, "PARTNER", {
      fontFamily: UI_FONT,
      fontSize: "19px",
      color: "#78d6ff",
    });
    this.container.add(this.partnerTitle);

    // Build 6 offer slots on left and 6 on right
    for (let i = 0; i < 6; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const sx = 24 + col * (OFFER_SLOT_SIZE + 8);
      const sy = 80 + row * (OFFER_SLOT_SIZE + 8);
      const view = this.createSlot(sx, sy, OFFER_SLOT_SIZE);
      this.mySlots.push(view);

      const hit = scene.add
        .rectangle(sx, sy, OFFER_SLOT_SIZE, OFFER_SLOT_SIZE, 0, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.removeMyOfferSlot(i));
      hit.on("pointerover", () => {
        const item = this.tradeState?.me.items[i];
        if (item) this.infoText.setText(`${itemName(item.itemId)} x${item.qty} (Klik untuk hapus)`).setColor("#f4c95d");
      });
      this.container.add(hit);
    }

    for (let i = 0; i < 6; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const sx = PANEL_WIDTH / 2 + 20 + col * (OFFER_SLOT_SIZE + 8);
      const sy = 80 + row * (OFFER_SLOT_SIZE + 8);
      const view = this.createSlot(sx, sy, OFFER_SLOT_SIZE);
      this.partnerSlots.push(view);

      const hit = scene.add
        .rectangle(sx, sy, OFFER_SLOT_SIZE, OFFER_SLOT_SIZE, 0, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: false });
      hit.on("pointerover", () => {
        const item = this.tradeState?.partner.items[i];
        if (item) this.infoText.setText(`Partner: ${itemName(item.itemId)} x${item.qty}`).setColor("#78d6ff");
      });
      this.container.add(hit);
    }

    // Gold offer row (Left)
    this.myGoldText = scene.add.text(24, 206, "GP: 0", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: "#f4c95d",
    });
    this.container.add(this.myGoldText);

    this.createSmallBtn(this.container, 134, 206, 40, 22, "+10", 0x183024, 0x4f785c, () => this.adjustGold(10));
    this.createSmallBtn(this.container, 178, 206, 46, 22, "+100", 0x183024, 0x4f785c, () => this.adjustGold(100));
    this.createSmallBtn(this.container, 228, 206, 42, 22, "+1K", 0x183024, 0x4f785c, () => this.adjustGold(1000));
    this.createSmallBtn(this.container, 274, 206, 32, 22, "0", 0x351b1b, 0x8a4a4a, () => this.adjustGold(-999999999));

    // Partner Gold (Right)
    this.partnerGoldText = scene.add.text(PANEL_WIDTH / 2 + 20, 206, "GP: 0", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: "#f4c95d",
    });
    this.container.add(this.partnerGoldText);

    // Confirmation Checkbox (Left - Interactive)
    this.myCheckBox = scene.add.graphics();
    this.container.add(this.myCheckBox);
    this.myCheckMark = scene.add
      .text(35, 257, "", {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: "#9fe08a",
      })
      .setOrigin(0.5);
    this.container.add(this.myCheckMark);

    this.myCheckLabel = scene.add.text(54, 247, "Konfirmasi Trade", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: "#cfe8c8",
    });
    this.container.add(this.myCheckLabel);

    const checkHit = scene.add
      .rectangle(24, 244, 220, 28, 0, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    checkHit.on("pointerdown", () => {
      if (!this.tradeState) return;
      network.confirmTrade(!this.tradeState.me.confirmed);
    });
    this.container.add(checkHit);

    // Partner Confirmation Status (Right)
    this.partnerCheckText = scene.add.text(PANEL_WIDTH / 2 + 20, 247, "[ ] Belum Konfirmasi", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: "#8fa895",
    });
    this.container.add(this.partnerCheckText);

    // Inventory Picker (Bottom 8x2)
    const invLabel = scene.add.text(24, 310, "TAS ANDA (Geser atau klik item ke panel transaksi):", {
      fontFamily: UI_FONT,
      fontSize: "17px",
      color: "#8fa895",
    });
    this.container.add(invLabel);

    for (let i = 0; i < 16; i++) {
      const col = i % 8;
      const row = Math.floor(i / 8);
      const sx = 24 + col * (INV_SLOT_SIZE + 6);
      const sy = 336 + row * (INV_SLOT_SIZE + 6);
      const view = this.createSlot(sx, sy, INV_SLOT_SIZE);
      this.invSlots.push(view);

      const hit = scene.add
        .rectangle(sx, sy, INV_SLOT_SIZE, INV_SLOT_SIZE, 0, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!this.tradeState) return;
        const player = network.players.get(network.sessionId);
        const stack = player?.inventory?.get(String(i));
        const offered = this.tradeState.me.items.find((o) => o.slot === i)?.qty ?? 0;
        const available = Math.max(0, (stack?.qty ?? 0) - offered);
        if (!stack?.itemId || available <= 0) return;
        this.dragState = {
          startX: pointer.x,
          startY: pointer.y,
          slot: i,
          itemId: stack.itemId,
          started: false,
        };
      });
      hit.on("pointerover", () => {
        const player = network.players.get(network.sessionId);
        const stack = player?.inventory?.get(String(i));
        if (stack?.itemId) {
          this.infoText.setText(`${itemName(stack.itemId)} (Geser ke panel trade atau klik)`).setColor("#cfe8c8");
        }
      });
      this.container.add(hit);
    }

    scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragState || !pointer.isDown || !this.open) return;
      if (!this.dragState.started) {
        if (Phaser.Math.Distance.Between(this.dragState.startX, this.dragState.startY, pointer.x, pointer.y) > 6) {
          this.dragState.started = true;
          this.dragGhost = scene.add
            .image(pointer.x, pointer.y, itemTexture(this.dragState.itemId))
            .setDepth(250)
            .setScrollFactor(0)
            .setScale(1.4)
            .setAlpha(0.9);
        }
      } else if (this.dragGhost) {
        this.dragGhost.setPosition(pointer.x, pointer.y);
      }
    });

    scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const active = this.dragState;
      this.dragState = null;
      this.dragGhost?.destroy();
      this.dragGhost = undefined;
      if (!active || !this.open) return;

      const lx = pointer.x - this.container.x;
      const ly = pointer.y - this.container.y;
      if (active.started) {
        if (lx >= 18 && lx <= 306 && ly >= 68 && ly <= 205) {
          this.promptOrAddInventorySlot(active.slot);
        }
      } else {
        this.promptOrAddInventorySlot(active.slot);
      }
    });

    // Bottom info & Cancel button
    this.infoText = scene.add.text(24, PANEL_HEIGHT - 36, "Centang Konfirmasi setelah penawaran sesuai.", {
      fontFamily: UI_FONT,
      fontSize: "17px",
      color: "#9fb8a0",
    });
    this.container.add(this.infoText);

    this.createSmallBtn(this.container, PANEL_WIDTH - 124, PANEL_HEIGHT - 42, 100, 28, "BATALKAN", 0x421e1e, 0xe08a7a, () => {
      network.cancelTrade();
      this.close();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  showInvite(event: TradeInviteEvent): void {
    this.pendingRequesterId = event.requesterId;
    this.inviteText.setText(`${event.requesterName} ingin mengajak anda transaksi !\nTerima ? YES / NO`);
    this.inviteContainer.setVisible(true);
  }

  hideInvite(): void {
    this.pendingRequesterId = "";
    this.inviteContainer.setVisible(false);
  }

  applyTradeState(state: TradeStateEvent): void {
    this.hideInvite();
    this.tradeState = state;
    this.open = true;
    this.container.setVisible(true);
    this.refresh();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.tradeState = null;
    this.dragState = null;
    this.dragGhost?.destroy();
    this.dragGhost = undefined;
    this.closeQtyModal();
    this.container.setVisible(false);
  }

  refresh(): void {
    if (!this.open || !this.tradeState) return;
    const state = this.tradeState;
    const player = network.players.get(network.sessionId);

    this.partnerTitle.setText(`PENAWARAN ${state.partner.name.toUpperCase()}`);
    this.myGoldText.setText(`GP: ${state.me.gold.toLocaleString()}`);
    this.partnerGoldText.setText(`GP: ${state.partner.gold.toLocaleString()}`);

    for (let i = 0; i < 6; i++) {
      const myItem = state.me.items[i];
      this.renderSlot(this.mySlots[i], OFFER_SLOT_SIZE, myItem?.itemId ?? "", myItem?.qty ?? 0);

      const pItem = state.partner.items[i];
      this.renderSlot(this.partnerSlots[i], OFFER_SLOT_SIZE, pItem?.itemId ?? "", pItem?.qty ?? 0);
    }

    // Checkbox graphics
    this.myCheckBox.clear();
    this.myCheckBox.fillStyle(state.me.confirmed ? 0x1e422b : 0x13201a, 1);
    this.myCheckBox.fillRoundedRect(24, 246, 22, 22, 4);
    this.myCheckBox.lineStyle(1.5, state.me.confirmed ? 0x9fe08a : 0x4f785c, 1);
    this.myCheckBox.strokeRoundedRect(24, 246, 22, 22, 4);
    this.myCheckMark.setText(state.me.confirmed ? "v" : "");
    this.myCheckLabel.setColor(state.me.confirmed ? "#9fe08a" : "#cfe8c8");

    this.partnerCheckText
      .setText(state.partner.confirmed ? "[v] Sudah Konfirmasi" : "[ ] Belum Konfirmasi")
      .setColor(state.partner.confirmed ? "#9fe08a" : "#8fa895");

    // Render inventory minus offered qty
    for (let i = 0; i < 16; i++) {
      const stack = player?.inventory?.get(String(i));
      const offered = state.me.items.find((o) => o.slot === i)?.qty ?? 0;
      const available = Math.max(0, (stack?.qty ?? 0) - offered);
      this.renderSlot(
        this.invSlots[i],
        INV_SLOT_SIZE,
        available > 0 && stack?.itemId ? stack.itemId : "",
        available,
      );
    }
  }

  private promptOrAddInventorySlot(slotIndex: number): void {
    if (!this.tradeState) return;
    const player = network.players.get(network.sessionId);
    const stack = player?.inventory?.get(String(slotIndex));
    if (!stack?.itemId || stack.qty <= 0) return;

    const offered = this.tradeState.me.items.find((o) => o.slot === slotIndex)?.qty ?? 0;
    const available = Math.max(0, stack.qty - offered);
    if (available <= 0) return;

    if (available === 1) {
      this.commitOfferSlot(slotIndex, 1);
      return;
    }

    this.openQtyModal(slotIndex, stack.itemId, available);
  }

  private commitOfferSlot(slotIndex: number, addQty: number): void {
    if (!this.tradeState) return;
    const player = network.players.get(network.sessionId);
    const stack = player?.inventory?.get(String(slotIndex));
    if (!stack?.itemId || stack.qty <= 0) return;

    const current = this.tradeState.me.items.map((x) => ({ slot: x.slot, qty: x.qty }));
    const existing = current.find((x) => x.slot === slotIndex);
    if (existing) {
      const nextQty = Math.min(stack.qty, existing.qty + addQty);
      if (nextQty === existing.qty) return;
      existing.qty = nextQty;
    } else {
      if (current.length >= 6) {
        this.infoText.setText("Maksimal 6 slot item per trade.").setColor("#e08a7a");
        return;
      }
      current.push({ slot: slotIndex, qty: Math.min(stack.qty, addQty) });
    }
    network.updateTrade(current, this.tradeState.me.gold);
  }

  private openQtyModal(slotIndex: number, itemId: string, maxQty: number): void {
    this.closeQtyModal();
    const modal = this.scene.add.container(0, 0).setDepth(300);
    const shade = this.scene.add
      .rectangle(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 0x050a08, 0.72)
      .setOrigin(0)
      .setInteractive();
    shade.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
    });
    modal.add(shade);

    const boxW = 280;
    const boxH = 164;
    const bx = (PANEL_WIDTH - boxW) / 2;
    const by = (PANEL_HEIGHT - boxH) / 2;

    const box = this.scene.add.graphics();
    box.fillStyle(0x13221b, 1);
    box.fillRoundedRect(bx, by, boxW, boxH, 8);
    box.lineStyle(2, 0xf4c95d, 1);
    box.strokeRoundedRect(bx, by, boxW, boxH, 8);
    modal.add(box);

    modal.add(
      this.scene.add
        .text(PANEL_WIDTH / 2, by + 22, "JUMLAH TRANSAKSI", {
          fontFamily: TITLE_FONT,
          fontSize: "13px",
          color: "#f4c95d",
        })
        .setOrigin(0.5),
    );
    modal.add(
      this.scene.add
        .text(PANEL_WIDTH / 2, by + 48, `${itemName(itemId)} (maks: ${maxQty})`, {
          fontFamily: UI_FONT,
          fontSize: "16px",
          color: "#e8f1d8",
        })
        .setOrigin(0.5),
    );

    let qtyStr = String(maxQty);
    const getQty = (): number => Math.max(1, Math.min(maxQty, Number.parseInt(qtyStr, 10) || 1));

    const rowY = by + 84;
    const qBg = this.scene.add.graphics();
    qBg.fillStyle(0x0c1611, 1);
    qBg.fillRoundedRect(PANEL_WIDTH / 2 - 36, rowY - 14, 72, 28, 4);
    qBg.lineStyle(1.5, 0x78e8ff, 0.9);
    qBg.strokeRoundedRect(PANEL_WIDTH / 2 - 36, rowY - 14, 72, 28, 4);
    modal.add(qBg);

    const qText = this.scene.add
      .text(PANEL_WIDTH / 2, rowY, qtyStr, { fontFamily: UI_FONT, fontSize: "18px", color: "#78e8ff" })
      .setOrigin(0.5);
    modal.add(qText);

    const syncText = () => qText.setText(qtyStr.length > 0 ? qtyStr : "1");
    this.createSmallBtn(modal, PANEL_WIDTH / 2 - 72, rowY - 14, 28, 28, "-", 0x1f382c, 0x4b6e57, () => {
      qtyStr = String(Math.max(1, getQty() - 1));
      syncText();
    });
    this.createSmallBtn(modal, PANEL_WIDTH / 2 + 44, rowY - 14, 28, 28, "+", 0x1f382c, 0x4b6e57, () => {
      qtyStr = String(Math.min(maxQty, getQty() + 1));
      syncText();
    });
    this.createSmallBtn(modal, PANEL_WIDTH / 2 + 78, rowY - 14, 42, 28, "MAX", 0x1f382c, 0x4b6e57, () => {
      qtyStr = String(maxQty);
      syncText();
    });

    this.qtyKeyHandler = (ev: KeyboardEvent) => {
      if (!this.qtyModal) return;
      if (ev.key >= "0" && ev.key <= "9") {
        ev.preventDefault();
        const next = qtyStr === String(maxQty) ? ev.key : qtyStr + ev.key;
        qtyStr = String(Math.min(maxQty, Math.max(1, Number.parseInt(next, 10) || 1)));
        syncText();
      } else if (ev.key === "Backspace") {
        ev.preventDefault();
        qtyStr = qtyStr.length > 1 ? qtyStr.slice(0, -1) : "1";
        syncText();
      }
    };
    this.scene.input.keyboard?.on("keydown", this.qtyKeyHandler);

    this.createSmallBtn(modal, PANEL_WIDTH / 2 - 96, by + 120, 88, 30, "OK", 0x1e422b, 0x6fcf7c, () => {
      this.commitOfferSlot(slotIndex, getQty());
      this.closeQtyModal();
    });
    this.createSmallBtn(modal, PANEL_WIDTH / 2 + 8, by + 120, 88, 30, "BATAL", 0x421e1e, 0xe08a7a, () => {
      this.closeQtyModal();
    });

    this.container.add(modal);
    this.qtyModal = modal;
  }

  private closeQtyModal(): void {
    if (this.qtyKeyHandler) {
      this.scene.input.keyboard?.off("keydown", this.qtyKeyHandler);
      this.qtyKeyHandler = undefined;
    }
    this.qtyModal?.destroy(true);
    this.qtyModal = undefined;
  }

  private removeMyOfferSlot(offerIndex: number): void {
    if (!this.tradeState) return;
    const target = this.tradeState.me.items[offerIndex];
    if (!target) return;
    const next = this.tradeState.me.items
      .filter((_, idx) => idx !== offerIndex)
      .map((x) => ({ slot: x.slot, qty: x.qty }));
    network.updateTrade(next, this.tradeState.me.gold);
  }

  private adjustGold(delta: number): void {
    if (!this.tradeState) return;
    const player = network.players.get(network.sessionId);
    const maxGold = player?.gold ?? 0;
    const nextGold = Math.max(0, Math.min(maxGold, this.tradeState.me.gold + delta));
    const items = this.tradeState.me.items.map((x) => ({ slot: x.slot, qty: x.qty }));
    network.updateTrade(items, nextGold);
  }

  private createSlot(x: number, y: number, size: number): OfferSlotView {
    const bg = this.scene.add.graphics().setPosition(x, y);
    this.container.add(bg);
    const icon = this.scene.add
      .image(x + size / 2, y + size / 2 - 2, "item-unknown")
      .setScale(size >= 50 ? 1.5 : 1.25)
      .setVisible(false);
    this.container.add(icon);
    const qty = this.scene.add
      .text(x + size - 4, y + size - 3, "", {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#f1ecd8",
        stroke: "#0b1512",
        strokeThickness: 3,
      })
      .setOrigin(1, 1);
    this.container.add(qty);
    return { bg, icon, qty };
  }

  private renderSlot(view: OfferSlotView, size: number, itemId: string, qty: number): void {
    const hasItem = itemId.length > 0 && qty > 0;
    view.bg.clear();
    view.bg.fillStyle(hasItem ? 0x1a2c24 : 0x13201a, 1);
    view.bg.fillRoundedRect(0, 0, size, size, 4);
    const border = hasItem ? colorValue(itemColor(itemId), 0x3b5a47) : 0x2f4a3b;
    view.bg.lineStyle(1, border, 0.9);
    view.bg.strokeRoundedRect(1, 1, size - 2, size - 2, 4);

    if (hasItem) {
      view.icon.setTexture(itemTexture(itemId)).setVisible(true);
      view.qty.setText(qty > 1 ? `x${qty}` : "").setVisible(qty > 1);
    } else {
      view.icon.setVisible(false);
      view.qty.setText("").setVisible(false);
    }
  }

  private createSmallBtn(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    fill: number,
    border: number,
    onClick: () => void,
  ): void {
    const bg = this.scene.add.graphics();
    bg.fillStyle(fill, 1);
    bg.fillRoundedRect(x, y, w, h, 4);
    bg.lineStyle(1, border, 1);
    bg.strokeRoundedRect(x, y, w, h, 4);
    parent.add(bg);

    const txt = this.scene.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#f1ecd8",
      })
      .setOrigin(0.5);
    parent.add(txt);

    const hit = this.scene.add
      .rectangle(x, y, w, h, 0, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerdown", onClick);
    parent.add(hit);
  }
}
