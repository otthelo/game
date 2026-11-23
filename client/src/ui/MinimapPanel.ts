import Phaser from "phaser";
import { COLORS, UI_FONT } from "../config/gameConfig";
import { network } from "../network/NetworkClient";

const BOX_SIZE = 148;
const PAD = 4;
const VIEW_SIZE = BOX_SIZE - PAD * 2; // 140
const BTN_Y = BOX_SIZE + 6;
const BTN_H = 24;
const ZOOM_STEPS = [1, 1.5, 2, 2.5, 3];
const TERRAIN_TEX_KEY = "minimap-terrain-tex";

export class MinimapPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly onToast?: (text: string, color?: string) => void;
  private readonly viewportContainer: Phaser.GameObjects.Container;
  private readonly terrainImage: Phaser.GameObjects.Image;
  private readonly markersGraphics: Phaser.GameObjects.Graphics;
  private readonly maskGraphics: Phaser.GameObjects.Graphics;
  private readonly npcPopup: Phaser.GameObjects.Container;

  private zoomIndex = 0;
  private builtMapSignature = "";
  private highlightedNpcId: string | null = null;
  private popupOpen = false;
  private worldW = 1280;
  private worldH = 960;
  private isDungeonFog = false;
  private mapCols = 0;
  private mapRows = 0;
  private cachedRows: string[] = [];
  private exploredTiles = new Uint8Array(0);

  constructor(
    scene: Phaser.Scene,
    onToast?: (text: string, color?: string) => void,
  ) {
    this.scene = scene;
    this.onToast = onToast;

    const x = scene.scale.width - BOX_SIZE - 16;
    const y = 66;
    this.container = scene.add.container(x, y).setDepth(40).setScrollFactor(0);

    // Frame background
    const frame = scene.add.graphics();
    frame.fillStyle(COLORS.ink, 0.88);
    frame.fillRoundedRect(0, 0, BOX_SIZE, BOX_SIZE, 6);
    frame.lineStyle(2, 0x3b5a47, 1);
    frame.strokeRoundedRect(1, 1, BOX_SIZE - 2, BOX_SIZE - 2, 6);
    this.container.add(frame);

    // Clipped viewport inside frame
    this.maskGraphics = scene.make.graphics({ x: 0, y: 0 }, false);
    this.updateMaskGeometry();
    const mask = this.maskGraphics.createGeometryMask();

    this.viewportContainer = scene.add.container(PAD, PAD);
    this.viewportContainer.setMask(mask);
    this.container.add(this.viewportContainer);

    this.terrainImage = scene.add.image(0, 0, "__DEFAULT").setOrigin(0, 0).setVisible(false);
    this.markersGraphics = scene.add.graphics();
    this.viewportContainer.add([this.terrainImage, this.markersGraphics]);

    // Controls row below minimap: [ + ] [ - ] [ FIND NPC ]
    this.buildButton(0, BTN_Y, 28, BTN_H, "+", () => this.zoomIn());
    this.buildButton(32, BTN_Y, 28, BTN_H, "-", () => this.zoomOut());
    this.buildButton(64, BTN_Y, BOX_SIZE - 64, BTN_H, "FIND NPC", () => this.toggleNpcPopup());

    // NPC finder popup
    this.npcPopup = scene.add.container(0, BTN_Y + BTN_H + 6).setVisible(false);
    this.container.add(this.npcPopup);

    this.rebuildTerrainIfNeeded();
    this.refresh();
  }

  closePopup(): void {
    this.popupOpen = false;
    this.npcPopup.setVisible(false);
  }

  reposition(width: number): void {
    this.container.setPosition(width - BOX_SIZE - 16, 66);
    this.updateMaskGeometry();
  }

  refresh(): void {
    this.rebuildTerrainIfNeeded();

    const state = network.state;
    const world = state?.world;
    if (!world || world.width <= 0 || world.height <= 0) return;

    this.worldW = world.width;
    this.worldH = world.height;

    const zoom = ZOOM_STEPS[this.zoomIndex] ?? 1;
    const baseScale = Math.min(VIEW_SIZE / this.worldW, VIEW_SIZE / this.worldH);
    const drawScale = baseScale * zoom;
    const mapDrawW = this.worldW * drawScale;
    const mapDrawH = this.worldH * drawScale;

    const local = network.players.get(network.sessionId);
    const tileSize = world.tileSize || 32;
    if (local && this.isDungeonFog) {
      this.revealAroundPlayer(local.x, local.y, tileSize);
    }
    let offsetX = (VIEW_SIZE - mapDrawW) / 2;
    let offsetY = (VIEW_SIZE - mapDrawH) / 2;

    if (zoom > 1 && local) {
      const px = local.x * drawScale;
      const py = local.y * drawScale;
      offsetX = VIEW_SIZE / 2 - px;
      offsetY = VIEW_SIZE / 2 - py;
      if (mapDrawW > VIEW_SIZE) {
        offsetX = Phaser.Math.Clamp(offsetX, VIEW_SIZE - mapDrawW, 0);
      } else {
        offsetX = (VIEW_SIZE - mapDrawW) / 2;
      }
      if (mapDrawH > VIEW_SIZE) {
        offsetY = Phaser.Math.Clamp(offsetY, VIEW_SIZE - mapDrawH, 0);
      } else {
        offsetY = (VIEW_SIZE - mapDrawH) / 2;
      }
    }

    if (this.terrainImage.visible) {
      this.terrainImage.setPosition(offsetX, offsetY);
      this.terrainImage.setDisplaySize(mapDrawW, mapDrawH);
    }

    const g = this.markersGraphics;
    g.clear();

    // Portals (pulsing cyan)
    const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 220);
    for (const portal of network.portals) {
      if (portal.active === false) continue;
      if (this.isDungeonFog && !this.isWorldPointExplored(portal.x, portal.y, tileSize)) continue;
      const mx = offsetX + portal.x * drawScale;
      const my = offsetY + portal.y * drawScale;
      g.lineStyle(1.5, 0x48d8ff, pulse);
      g.strokeCircle(mx, my, 4);
      g.fillStyle(0x78e8ff, 0.9);
      g.fillCircle(mx, my, 2);
    }

    // Living monsters (red dots)
    g.fillStyle(0xe05555, 0.85);
    for (const monster of network.monsters.values()) {
      if (monster.hp <= 0) continue;
      if (this.isDungeonFog && !this.isWorldPointExplored(monster.x, monster.y, tileSize)) continue;
      const mx = offsetX + monster.x * drawScale;
      const my = offsetY + monster.y * drawScale;
      g.fillCircle(mx, my, 1.8);
    }

    // NPCs (bright green dots + highlight ring if selected)
    for (const [id, npc] of network.npcs.entries()) {
      const mx = offsetX + npc.x * drawScale;
      const my = offsetY + npc.y * drawScale;
      g.fillStyle(0x55ff88, 1);
      g.fillCircle(mx, my, 2.8);
      g.lineStyle(1, 0x0b1512, 1);
      g.strokeCircle(mx, my, 2.8);

      if (this.highlightedNpcId === id) {
        const ringR = 5 + 3 * pulse;
        g.lineStyle(2, 0xf4c95d, 0.95);
        g.strokeCircle(mx, my, ringR);
      }
    }

    // Other players (light blue dots, or bright green with golden ring if in party)
    const partyMembers = network.party?.members;
    for (const [id, player] of network.players.entries()) {
      if (id === network.sessionId) continue;
      const mx = offsetX + player.x * drawScale;
      const my = offsetY + player.y * drawScale;

      const isPartyMember = partyMembers?.some((m) => m.name === player.name || m.sessionId === id);
      if (isPartyMember) {
        // Party member: green circle with golden highlight ring
        g.fillStyle(0x55ff88, 1);
        g.fillCircle(mx, my, 3.2);
        g.lineStyle(1.5, 0xf4c95d, 0.95);
        g.strokeCircle(mx, my, 4.2);
      } else {
        g.fillStyle(0x78d6ff, 1);
        g.fillCircle(mx, my, 2.5);
      }
    }

    // Local player (gold dot with dark border)
    if (local) {
      const mx = offsetX + local.x * drawScale;
      const my = offsetY + local.y * drawScale;
      g.fillStyle(0xf4c95d, 1);
      g.fillCircle(mx, my, 3.2);
      g.lineStyle(1.2, 0x0b1512, 1);
      g.strokeCircle(mx, my, 3.2);
    }
  }

  private zoomIn(): void {
    if (this.zoomIndex < ZOOM_STEPS.length - 1) {
      this.zoomIndex += 1;
      this.refresh();
    }
  }

  private zoomOut(): void {
    if (this.zoomIndex > 0) {
      this.zoomIndex -= 1;
      this.refresh();
    }
  }

  private toggleNpcPopup(): void {
    this.popupOpen = !this.popupOpen;
    if (this.popupOpen) {
      this.rebuildNpcPopup();
    }
    this.npcPopup.setVisible(this.popupOpen);
  }

  private rebuildNpcPopup(): void {
    this.npcPopup.removeAll(true);

    const npcs = Array.from(network.npcs.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    );

    const rowH = 22;
    const hasClear = this.highlightedNpcId !== null;
    const rowsCount = Math.max(1, npcs.length) + (hasClear ? 1 : 0);
    const popW = BOX_SIZE;
    const popH = rowsCount * rowH + 10;

    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.ink, 0.94);
    bg.fillRoundedRect(0, 0, popW, popH, 6);
    bg.lineStyle(1.5, 0x3b5a47, 1);
    bg.strokeRoundedRect(0, 0, popW, popH, 6);
    this.npcPopup.add(bg);

    if (npcs.length === 0) {
      const empty = this.scene.add
        .text(popW / 2, popH / 2, "TIDAK ADA NPC", {
          fontFamily: UI_FONT,
          fontSize: "15px",
          color: "#86a58a",
        })
        .setOrigin(0.5);
      this.npcPopup.add(empty);
      return;
    }

    let y = 5;
    for (const [id, npc] of npcs) {
      const active = this.highlightedNpcId === id;
      const rowBg = this.scene.add.graphics();
      const drawRow = (hovered: boolean) => {
        rowBg.clear();
        if (hovered || active) {
          rowBg.fillStyle(active ? 0x2a4835 : 0x1e3328, 0.9);
          rowBg.fillRoundedRect(4, y, popW - 8, rowH - 2, 4);
        }
      };
      drawRow(false);
      this.npcPopup.add(rowBg);

      const label = this.scene.add
        .text(10, y + (rowH - 2) / 2, `${active ? "▶ " : "• "}${npc.name}`, {
          fontFamily: UI_FONT,
          fontSize: "16px",
          color: active ? "#f4c95d" : "#cfe8c8",
        })
        .setOrigin(0, 0.5);
      this.npcPopup.add(label);

      const hit = this.scene.add
        .rectangle(4, y, popW - 8, rowH - 2)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => drawRow(true));
      hit.on("pointerout", () => drawRow(false));
      hit.on("pointerdown", () => {
        this.highlightedNpcId = id;
        this.closePopup();
        this.refresh();
        this.onToast?.(`NPC: ${npc.name.toUpperCase()}`, "#55ff88");
      });
      this.npcPopup.add(hit);

      y += rowH;
    }

    if (hasClear) {
      const clearText = this.scene.add
        .text(popW / 2, y + (rowH - 2) / 2, "[ HAPUS TANDA ]", {
          fontFamily: UI_FONT,
          fontSize: "15px",
          color: "#e08a7a",
        })
        .setOrigin(0.5);
      this.npcPopup.add(clearText);

      const hit = this.scene.add
        .rectangle(4, y, popW - 8, rowH - 2)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        this.highlightedNpcId = null;
        this.closePopup();
        this.refresh();
      });
      this.npcPopup.add(hit);
    }
  }

  private buildButton(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    onClick: () => void,
  ): void {
    const bg = this.scene.add.graphics();
    const draw = (hovered: boolean) => {
      bg.clear();
      bg.fillStyle(hovered ? 0x223b2d : COLORS.ink, 0.9);
      bg.fillRoundedRect(x, y, w, h, 4);
      bg.lineStyle(1.5, hovered ? 0xf4c95d : 0x3b5a47, 1);
      bg.strokeRoundedRect(x, y, w, h, 4);
    };
    draw(false);
    this.container.add(bg);

    const label = this.scene.add
      .text(x + w / 2, y + h / 2, text, {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#f4c95d",
      })
      .setOrigin(0.5);
    this.container.add(label);

    const hit = this.scene.add
      .rectangle(x, y, w, h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerdown", onClick);
    this.container.add(hit);
  }

  private rebuildTerrainIfNeeded(): void {
    const world = network.state?.world;
    if (!world?.rows?.length) return;

    const rows = Array.from(world.rows as unknown as string[]);
    const signature = `${world.name}:${rows.length}x${rows[0]?.length ?? 0}`;
    if (signature === this.builtMapSignature) return;
    this.builtMapSignature = signature;
    this.highlightedNpcId = null;
    this.closePopup();

    const cols = rows[0]?.length ?? 1;
    const rowCount = rows.length;
    this.isDungeonFog = world.name === "Orc Castle";
    this.mapCols = cols;
    this.mapRows = rowCount;
    this.cachedRows = rows;
    this.exploredTiles = new Uint8Array(cols * rowCount);

    if (this.scene.textures.exists(TERRAIN_TEX_KEY)) {
      this.scene.textures.remove(TERRAIN_TEX_KEY);
    }
    const canvasTex = this.scene.textures.createCanvas(TERRAIN_TEX_KEY, cols, rowCount);
    if (!canvasTex) return;

    const ctx = canvasTex.getContext();
    if (this.isDungeonFog) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, cols, rowCount);
    } else {
      for (let ty = 0; ty < rowCount; ty++) {
        const row = rows[ty];
        for (let tx = 0; tx < cols; tx++) {
          ctx.fillStyle = this.tileColor(row[tx] ?? "#");
          ctx.fillRect(tx, ty, 1, 1);
        }
      }
    }
    canvasTex.refresh();

    this.terrainImage.setTexture(TERRAIN_TEX_KEY);
    this.terrainImage.setVisible(true);
  }

  private tileColor(ch: string): string {
    if (this.isDungeonFog) {
      return ch === "#" ? "#252a36" : "#5a6578";
    }
    if (ch === "#") return "#1b3621";
    if (ch === "~") return "#2b6684";
    if (ch === "R") return "#525b61";
    if (ch === "=") return "#8c6d46";
    if (ch === ",") return "#5b9848";
    return "#3f7333";
  }

  private isWorldPointExplored(wx: number, wy: number, tileSize: number): boolean {
    const tx = Math.floor(wx / tileSize);
    const ty = Math.floor(wy / tileSize);
    if (tx < 0 || ty < 0 || tx >= this.mapCols || ty >= this.mapRows) return false;
    return this.exploredTiles[ty * this.mapCols + tx] === 1;
  }

  private revealAroundPlayer(px: number, py: number, tileSize: number): void {
    const tex = this.scene.textures.get(TERRAIN_TEX_KEY) as Phaser.Textures.CanvasTexture | undefined;
    if (!tex?.getContext) return;
    const ctx = tex.getContext();
    const ptx = Math.floor(px / tileSize);
    const pty = Math.floor(py / tileSize);
    const radius = 6;
    let dirty = false;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const tx = ptx + dx;
        const ty = pty + dy;
        if (tx < 0 || ty < 0 || tx >= this.mapCols || ty >= this.mapRows) continue;
        const idx = ty * this.mapCols + tx;
        if (this.exploredTiles[idx] === 1) continue;
        this.exploredTiles[idx] = 1;
        const ch = this.cachedRows[ty]?.[tx] ?? "#";
        ctx.fillStyle = this.tileColor(ch);
        ctx.fillRect(tx, ty, 1, 1);
        dirty = true;
      }
    }

    if (dirty) {
      tex.refresh();
    }
  }

  private updateMaskGeometry(): void {
    this.maskGraphics.clear();
    this.maskGraphics.fillStyle(0xffffff);
    this.maskGraphics.fillRect(
      this.container.x + PAD,
      this.container.y + PAD,
      VIEW_SIZE,
      VIEW_SIZE,
    );
  }

  destroy(): void {
    this.maskGraphics.destroy();
    this.container.destroy(true);
  }
}
