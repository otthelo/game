import Phaser from "phaser";
import { COLORS, UI_FONT } from "../config/gameConfig";
import { itemName, itemTexture } from "../items/catalog";
import { network } from "../network/NetworkClient";

const SLOT_COUNT = 9;
const SLOT_SIZE = 38;
const SLOT_GAP = 4;
export const SHORTCUT_BAR_WIDTH = SLOT_COUNT * SLOT_SIZE + (SLOT_COUNT - 1) * SLOT_GAP; // 374

const KEYS_STORAGE_KEY = "pixel-realms:shortcut-keys";
const SLOTS_STORAGE_KEY = "pixel-realms:shortcut-slots";
const DEFAULT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export type ShortcutPayload =
  | { type: "item"; itemId: string }
  | { type: "skill"; skillId: "magnum-break" | "rebahan" | "baledog"; name: string };

interface SlotView {
  bg: Phaser.GameObjects.Graphics;
  keyText: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image;
  qtyText: Phaser.GameObjects.Text;
  x: number;
  y: number;
}

function loadKeys(): string[] {
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_KEYS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === SLOT_COUNT) {
      return parsed.map((k, idx) =>
        typeof k === "string" && k.trim().length > 0 ? k.trim().toUpperCase().slice(0, 4) : DEFAULT_KEYS[idx],
      );
    }
  } catch {
    // ignore
  }
  return [...DEFAULT_KEYS];
}

function saveKeys(keys: string[]): void {
  try {
    window.localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

function loadSlots(): Array<ShortcutPayload | null> {
  try {
    const raw = window.localStorage.getItem(SLOTS_STORAGE_KEY);
    if (!raw) return Array<ShortcutPayload | null>(SLOT_COUNT).fill(null);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === SLOT_COUNT) {
      return parsed.map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        if (entry.type === "item" && typeof entry.itemId === "string") {
          return { type: "item", itemId: entry.itemId };
        }
        if (
          entry.type === "skill" &&
          (entry.skillId === "magnum-break" || entry.skillId === "rebahan" || entry.skillId === "baledog")
        ) {
          return { type: "skill", skillId: entry.skillId, name: String(entry.name || entry.skillId) };
        }
        return null;
      });
    }
  } catch {
    // ignore
  }
  return Array<ShortcutPayload | null>(SLOT_COUNT).fill(null);
}

function saveSlots(slots: Array<ShortcutPayload | null>): void {
  try {
    window.localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // ignore
  }
}

export class ShortcutBar {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly onMessage?: (text: string, color?: string) => void;
  private readonly slots: SlotView[] = [];
  private keys: string[] = loadKeys();
  private assignments: Array<ShortcutPayload | null> = loadSlots();
  private hoveredIndex = -1;

  private draggingPayload: ShortcutPayload | null = null;
  private dragGhost?: Phaser.GameObjects.Image;
  private readonly onPointerMoveHandler: (pointer: Phaser.Input.Pointer) => void;
  private readonly onPointerUpHandler: (pointer: Phaser.Input.Pointer) => void;

  constructor(scene: Phaser.Scene, onMessage?: (text: string, color?: string) => void) {
    this.scene = scene;
    this.onMessage = onMessage;

    const x = Math.floor((scene.scale.width - SHORTCUT_BAR_WIDTH) / 2);
    const y = 12;
    this.container = scene.add.container(x, y).setDepth(45).setScrollFactor(0);

    const frame = scene.add.graphics();
    frame.fillStyle(COLORS.ink, 0.85);
    frame.fillRoundedRect(-6, -4, SHORTCUT_BAR_WIDTH + 12, SLOT_SIZE + 8, 6);
    frame.lineStyle(1.5, 0x3b5a47, 1);
    frame.strokeRoundedRect(-6, -4, SHORTCUT_BAR_WIDTH + 12, SLOT_SIZE + 8, 6);
    this.container.add(frame);

    for (let i = 0; i < SLOT_COUNT; i++) {
      const sx = i * (SLOT_SIZE + SLOT_GAP);
      const sy = 0;

      const bg = scene.add.graphics();
      this.container.add(bg);

      const icon = scene.add
        .image(sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2 + 1, "item-unknown")
        .setVisible(false);
      this.container.add(icon);

      const keyText = scene.add.text(sx + 3, sy + 1, this.keys[i], {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: "#f4c95d",
        stroke: "#0b1512",
        strokeThickness: 2,
      });
      this.container.add(keyText);

      const qtyText = scene.add
        .text(sx + SLOT_SIZE - 3, sy + SLOT_SIZE - 2, "", {
          fontFamily: UI_FONT,
          fontSize: "14px",
          color: "#ffffff",
          stroke: "#0b1512",
          strokeThickness: 3,
        })
        .setOrigin(1, 1);
      this.container.add(qtyText);

      const hit = scene.add
        .rectangle(sx, sy, SLOT_SIZE, SLOT_SIZE, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

      hit.on("pointerover", () => {
        this.hoveredIndex = i;
        this.refresh();
      });
      hit.on("pointerout", () => {
        if (this.hoveredIndex === i) {
          this.hoveredIndex = -1;
          this.refresh();
        }
      });
      hit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          this.clearSlot(i);
          return;
        }
        this.activateSlot(i);
      });

      this.container.add(hit);
      this.slots.push({ bg, keyText, icon, qtyText, x: sx, y: sy });
    }

    this.onPointerMoveHandler = (pointer) => {
      if (!this.draggingPayload || !this.dragGhost) return;
      this.dragGhost.setPosition(pointer.x, pointer.y);
    };
    this.onPointerUpHandler = (pointer) => {
      if (!this.draggingPayload) return;
      const payload = this.draggingPayload;
      this.cancelDrag();
      const targetSlot = this.findSlotAt(pointer.x, pointer.y);
      if (targetSlot !== -1) {
        this.assignSlot(targetSlot, payload);
      }
    };

    scene.input.on("pointermove", this.onPointerMoveHandler);
    scene.input.on("pointerup", this.onPointerUpHandler);

    this.refresh();
  }

  getKeys(): string[] {
    return [...this.keys];
  }

  setKey(index: number, rawKey: string): void {
    if (index < 0 || index >= SLOT_COUNT) return;
    const normalized = rawKey.trim().toUpperCase().slice(0, 4);
    if (!normalized) return;
    this.keys[index] = normalized;
    saveKeys(this.keys);
    this.refresh();
  }

  resetKeys(): void {
    this.keys = [...DEFAULT_KEYS];
    saveKeys(this.keys);
    this.refresh();
  }

  assignSlot(index: number, payload: ShortcutPayload): void {
    if (index < 0 || index >= SLOT_COUNT) return;
    this.assignments[index] = payload;
    saveSlots(this.assignments);
    this.refresh();
    const label = payload.type === "item" ? itemName(payload.itemId) : payload.name;
    this.onMessage?.(`SHORTCUT [${this.keys[index]}]: ${label.toUpperCase()}`, "#9fe08a");
  }

  clearSlot(index: number): void {
    if (index < 0 || index >= SLOT_COUNT || !this.assignments[index]) return;
    this.assignments[index] = null;
    saveSlots(this.assignments);
    this.refresh();
  }

  startDrag(payload: ShortcutPayload, textureKey: string, tint?: number): void {
    this.cancelDrag();
    this.draggingPayload = payload;
    const ptr = this.scene.input.activePointer;
    this.dragGhost = this.scene.add
      .image(ptr.x, ptr.y, textureKey)
      .setDepth(250)
      .setScrollFactor(0)
      .setAlpha(0.88);
    if (payload.type === "skill") {
      this.dragGhost.setDisplaySize(28, 28);
      if (tint !== undefined) this.dragGhost.setTint(tint);
    } else {
      this.dragGhost.setScale(1.6);
    }
  }

  private cancelDrag(): void {
    this.draggingPayload = null;
    this.dragGhost?.destroy();
    this.dragGhost = undefined;
  }

  isOverSlot(screenX: number, screenY: number): boolean {
    return this.findSlotAt(screenX, screenY) !== -1;
  }

  private findSlotAt(screenX: number, screenY: number): number {
    const lx = screenX - this.container.x;
    const ly = screenY - this.container.y;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (lx >= s.x && lx <= s.x + SLOT_SIZE && ly >= s.y && ly <= s.y + SLOT_SIZE) {
        return i;
      }
    }
    return -1;
  }

  handleKey(rawKey: string): boolean {
    const keyUpper = rawKey.trim().toUpperCase();
    const idx = this.keys.findIndex((k) => k.toUpperCase() === keyUpper);
    if (idx === -1) return false;
    return this.activateSlot(idx);
  }

  activateSlot(index: number): boolean {
    const entry = this.assignments[index];
    if (!entry) return false;

    if (entry.type === "skill") {
      if (entry.skillId === "magnum-break") {
        const local = network.players.get(network.sessionId);
        if (local?.jobId !== "swordsman") {
          this.onMessage?.("Magnum Break hanya tersedia untuk Swordsman.", "#ff9a8a");
          return true;
        }
      }
      network.useSkill(entry.skillId);
      return true;
    }

    const player = network.players.get(network.sessionId);
    if (!player?.inventory) return true;

    for (let i = 0; i < 16; i++) {
      const stack = player.inventory.get(String(i));
      if (stack?.itemId === entry.itemId && stack.qty > 0) {
        network.useItem(i);
        return true;
      }
    }
    this.onMessage?.(`${itemName(entry.itemId).toUpperCase()} HABIS.`, "#e08a7a");
    return true;
  }

  refresh(): void {
    const player = network.players.get(network.sessionId);
    const counts = new Map<string, number>();
    if (player?.inventory) {
      for (let i = 0; i < 16; i++) {
        const stack = player.inventory.get(String(i));
        if (stack?.itemId && stack.qty > 0) {
          counts.set(stack.itemId, (counts.get(stack.itemId) ?? 0) + stack.qty);
        }
      }
    }

    for (let i = 0; i < SLOT_COUNT; i++) {
      const view = this.slots[i];
      const entry = this.assignments[i];
      const hovered = this.hoveredIndex === i;

      view.bg.clear();
      view.bg.fillStyle(hovered ? 0x1e3328 : 0x0b1512, 0.92);
      view.bg.fillRoundedRect(view.x, view.y, SLOT_SIZE, SLOT_SIZE, 5);
      view.bg.lineStyle(1.5, hovered ? 0xf4c95d : 0x2f4a3b, 1);
      view.bg.strokeRoundedRect(view.x, view.y, SLOT_SIZE, SLOT_SIZE, 5);

      view.keyText.setText(this.keys[i]);

      if (!entry) {
        view.icon.setVisible(false);
        view.qtyText.setText("");
        continue;
      }

      if (entry.type === "item") {
        const qty = counts.get(entry.itemId) ?? 0;
        view.icon
          .setTexture(itemTexture(entry.itemId))
          .clearTint()
          .setScale(1.45)
          .setAlpha(qty > 0 ? 1 : 0.35)
          .setVisible(true);
        view.qtyText.setText(qty > 0 ? String(qty) : "0");
        view.qtyText.setColor(qty > 0 ? "#ffffff" : "#e08a7a");
      } else {
        const texKey =
          entry.skillId === "rebahan"
            ? "skill-rebahan"
            : entry.skillId === "baledog"
              ? "skill-baledog"
              : "skill-magnum-break";
        view.icon
          .setTexture(texKey)
          .clearTint()
          .setDisplaySize(28, 28)
          .setAlpha(1)
          .setVisible(true);
        view.qtyText.setText("SKL");
        view.qtyText.setColor("#ffb45c");
      }
    }
  }

  reposition(width: number): void {
    this.container.setPosition(Math.floor((width - SHORTCUT_BAR_WIDTH) / 2), 12);
  }

  destroy(): void {
    this.cancelDrag();
    this.scene.input.off("pointermove", this.onPointerMoveHandler);
    this.scene.input.off("pointerup", this.onPointerUpHandler);
    this.container.destroy(true);
  }
}
