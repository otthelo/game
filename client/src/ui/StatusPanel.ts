import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { attachDraggable } from "./draggable";
import { itemCatalog } from "../items/catalog";
import { network } from "../network/NetworkClient";
import type { PlayerState, StatKey } from "../types";

const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 456;

const LEFT_X = 24;
const ROW_START_Y = 76;
const ROW_HEIGHT = 38;
const ROW_WIDTH = 266;

const RIGHT_X = 316;

export interface StatusPanelOptions {
  onFocus?: () => void;
  onClose?: () => void;
}

interface StatDefinition {
  key: StatKey;
  label: string;
  fullName: string;
  description: string;
}

const STAT_DEFINITIONS: readonly StatDefinition[] = [
  {
    key: "str",
    label: "STR",
    fullName: "STRENGTH (STR)",
    description:
      "Meningkatkan Melee ATK dan batas berat barang bawaan (Weight Limit). Penting untuk Knight, Blacksmith, atau Assassin.",
  },
  {
    key: "agi",
    label: "AGI",
    fullName: "AGILITY (AGI)",
    description:
      "Meningkatkan kecepatan pukulan (ASPD) dan hindaran serangan fisik (FLEE). Cocok untuk Hunter atau Assassin.",
  },
  {
    key: "vit",
    label: "VIT",
    fullName: "VITALITY (VIT)",
    description:
      "Meningkatkan Max HP, pemulihan HP, Soft DEF, serta resistensi Stun dan Poison. Esensial untuk tanker seperti Crusader.",
  },
  {
    key: "int",
    label: "INT",
    fullName: "INTELLIGENCE (INT)",
    description:
      "Meningkatkan MATK, Max SP, pemulihan SP, Soft MDEF, dan sedikit mengurangi cast time. Wajib bagi Wizard atau Priest.",
  },
  {
    key: "dex",
    label: "DEX",
    fullName: "DEXTERITY (DEX)",
    description:
      "Meningkatkan akurasi (HIT), ATK senjata jarak jauh, dan memangkas waktu casting skill (Variable Cast Time).",
  },
  {
    key: "luk",
    label: "LUK",
    fullName: "LUCK (LUK)",
    description:
      "Meningkatkan peluang CRIT (pasti kena), Perfect Dodge, bonus kecil ATK/MATK, serta resistensi Curse/Stone Curse.",
  },
];

interface StatRowView {
  def: StatDefinition;
  bg: Phaser.GameObjects.Graphics;
  valueText: Phaser.GameObjects.Text;
  bonusText: Phaser.GameObjects.Text;
  minusBg: Phaser.GameObjects.Graphics;
  minusText: Phaser.GameObjects.Text;
  plusBg: Phaser.GameObjects.Graphics;
  plusText: Phaser.GameObjects.Text;
}

interface DerivedValues {
  hpStr: string;
  maxHp: number;
  spStr: string;
  maxSp: number;
  attack: number;
  rangedAtk: number;
  matk: number;
  softDef: number;
  softMdef: number;
  weightLimit: number;
  hit: number;
  flee: number;
  aspd: number;
  critPct: string;
  critVal: number;
  pDodge: string;
  pDodgeVal: number;
  castRed: string;
  castRedVal: number;
  stunRes: string;
  stunResVal: number;
  curseRes: string;
  curseResVal: number;
}

/**
 * Interactive character Status Window toggled with [C].
 *
 * Displays core attributes (STR, AGI, VIT, INT, DEX, LUK), remaining stat points,
 * and derived combat values.
 *
 * Supports draft / preview allocation: point distribution only becomes permanent
 * once the player confirms with YES, and affected derived stats are highlighted in green.
 */
export class StatusPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly rows: StatRowView[] = [];
  private readonly pointsText: Phaser.GameObjects.Text;

  private readonly derivedLeftLines: Phaser.GameObjects.Text[] = [];
  private readonly derivedRightLines: Phaser.GameObjects.Text[] = [];

  private detailContainer!: Phaser.GameObjects.Container;
  private detailTitle!: Phaser.GameObjects.Text;
  private detailBody!: Phaser.GameObjects.Text;

  private confirmContainer!: Phaser.GameObjects.Container;
  private confirmSummary!: Phaser.GameObjects.Text;

  private readonly pending: Record<StatKey, number> = {
    str: 0,
    agi: 0,
    vit: 0,
    int: 0,
    dex: 0,
    luk: 0,
  };

  private hoveredStat: StatKey | null = null;
  private open = false;
  hasUserMoved = false;

  private readonly onFocus?: () => void;
  private readonly onClose?: () => void;

  constructor(scene: Phaser.Scene, options: StatusPanelOptions = {}) {
    this.scene = scene;
    this.onFocus = options.onFocus;
    this.onClose = options.onClose;

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
      handleHeight: 46,
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

    const title = scene.add.text(20, 14, "STATUS", {
      fontFamily: TITLE_FONT,
      fontSize: "15px",
      color: "#f4c95d",
    });
    this.container.add(title);

    const close = scene.add
      .text(PANEL_WIDTH - 20, 12, "[ C / ESC ]", {
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

    this.pointsText = scene.add.text(24, 42, "STAT POINTS: 0", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: "#f4c95d",
    });
    this.container.add(this.pointsText);

    this.buildAttributeRows();
    this.buildDerivedStatsCard();
    this.buildBottomCards();
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
      this.hoveredStat = null;
      this.resetPending();
    }
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.hoveredStat = null;
    this.resetPending();
    this.container.setVisible(false);
  }

  private totalPending(): number {
    return (
      this.pending.str +
      this.pending.agi +
      this.pending.vit +
      this.pending.int +
      this.pending.dex +
      this.pending.luk
    );
  }

  private resetPending(): void {
    this.pending.str = 0;
    this.pending.agi = 0;
    this.pending.vit = 0;
    this.pending.int = 0;
    this.pending.dex = 0;
    this.pending.luk = 0;
  }

  refresh(): void {
    if (!this.open) return;
    const local = network.players.get(network.sessionId);
    if (!local) return;

    const basePoints = local.statPoints ?? 0;
    const pendingTotal = this.totalPending();

    // Clamp pending if points were somehow reduced
    if (pendingTotal > basePoints) {
      this.resetPending();
    }

    const remainingPoints = Math.max(0, basePoints - this.totalPending());
    const hasPending = this.totalPending() > 0;

    if (hasPending) {
      this.pointsText.setText(`STAT POINTS: ${remainingPoints}  (DRAFT: +${this.totalPending()})`);
      this.pointsText.setColor("#9fe08a");
    } else {
      this.pointsText.setText(`STAT POINTS: ${remainingPoints}`);
      this.pointsText.setColor(remainingPoints > 0 ? "#9fe08a" : "#f4c95d");
    }

    // Refresh 6 Attribute Rows
    for (const row of this.rows) {
      const key = row.def.key;
      const baseValue = local[key] ?? 1;
      const add = this.pending[key];
      const isHovered = this.hoveredStat === key;

      row.bg.clear();
      row.bg.fillStyle(0x13261e, 1);
      row.bg.fillRoundedRect(LEFT_X, this.rowY(key), ROW_WIDTH, ROW_HEIGHT - 4, 5);
      row.bg.lineStyle(1, isHovered ? 0xf4c95d : 0x2f4a3b, 1);
      row.bg.strokeRoundedRect(LEFT_X, this.rowY(key), ROW_WIDTH, ROW_HEIGHT - 4, 5);

      row.valueText.setText(String(baseValue));

      if (add > 0) {
        row.bonusText.setText(`+${add}`).setVisible(true);
      } else {
        row.bonusText.setVisible(false);
      }

      // Minus button
      const canMinus = add > 0;
      row.minusBg.clear();
      row.minusBg.fillStyle(canMinus ? 0x3d2020 : 0x141e19, 1);
      row.minusBg.fillRoundedRect(LEFT_X + ROW_WIDTH - 64, this.rowY(key) + 5, 26, 24, 4);
      row.minusBg.lineStyle(1, canMinus ? 0xe08a7a : 0x24362c, 1);
      row.minusBg.strokeRoundedRect(LEFT_X + ROW_WIDTH - 64, this.rowY(key) + 5, 26, 24, 4);
      row.minusText.setColor(canMinus ? "#e08a7a" : "#3b4f44");

      // Plus button
      const canPlus = remainingPoints > 0;
      row.plusBg.clear();
      row.plusBg.fillStyle(canPlus ? 0x244a32 : 0x16241d, 1);
      row.plusBg.fillRoundedRect(LEFT_X + ROW_WIDTH - 32, this.rowY(key) + 5, 26, 24, 4);
      row.plusBg.lineStyle(1, canPlus ? 0x6fcf7c : 0x283e32, 1);
      row.plusBg.strokeRoundedRect(LEFT_X + ROW_WIDTH - 32, this.rowY(key) + 5, 26, 24, 4);
      row.plusText.setColor(canPlus ? "#9fe08a" : "#4b6356");
    }

    this.refreshDerived(local);
    this.refreshBottomCards(hasPending);
  }

  private rowY(key: StatKey): number {
    const idx = STAT_DEFINITIONS.findIndex((d) => d.key === key);
    return ROW_START_Y + idx * ROW_HEIGHT;
  }

  private buildAttributeRows(): void {
    STAT_DEFINITIONS.forEach((def, idx) => {
      const y = ROW_START_Y + idx * ROW_HEIGHT;

      const bg = this.scene.add.graphics();
      this.container.add(bg);

      const label = this.scene.add.text(LEFT_X + 12, y + 7, def.label, {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: "#f4c95d",
      });
      this.container.add(label);

      const valueText = this.scene.add.text(LEFT_X + 68, y + 5, "1", {
        fontFamily: UI_FONT,
        fontSize: "21px",
        color: "#f1ecd8",
      });
      this.container.add(valueText);

      const bonusText = this.scene.add
        .text(LEFT_X + 104, y + 6, "", {
          fontFamily: UI_FONT,
          fontSize: "20px",
          color: "#9fe08a",
        })
        .setVisible(false);
      this.container.add(bonusText);

      // Minus button
      const minusBg = this.scene.add.graphics();
      this.container.add(minusBg);

      const minusText = this.scene.add
        .text(LEFT_X + ROW_WIDTH - 51, y + 17, "-", {
          fontFamily: TITLE_FONT,
          fontSize: "15px",
          color: "#e08a7a",
        })
        .setOrigin(0.5);
      this.container.add(minusText);

      const minusHit = this.scene.add
        .rectangle(LEFT_X + ROW_WIDTH - 64, y + 5, 26, 24)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      minusHit.on("pointerdown", () => {
        if (this.pending[def.key] > 0) {
          this.pending[def.key] -= 1;
          this.refresh();
        }
      });
      this.container.add(minusHit);

      // Plus button
      const plusBg = this.scene.add.graphics();
      this.container.add(plusBg);

      const plusText = this.scene.add
        .text(LEFT_X + ROW_WIDTH - 19, y + 17, "+", {
          fontFamily: TITLE_FONT,
          fontSize: "15px",
          color: "#9fe08a",
        })
        .setOrigin(0.5);
      this.container.add(plusText);

      const plusHit = this.scene.add
        .rectangle(LEFT_X + ROW_WIDTH - 32, y + 5, 26, 24)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      plusHit.on("pointerdown", () => {
        const local = network.players.get(network.sessionId);
        if (!local) return;
        const remaining = (local.statPoints ?? 0) - this.totalPending();
        if (remaining > 0) {
          this.pending[def.key] += 1;
          this.refresh();
        }
      });
      this.container.add(plusHit);

      // Hover zone for the whole row to inspect description
      const rowHit = this.scene.add
        .rectangle(LEFT_X, y, ROW_WIDTH - 68, ROW_HEIGHT - 4)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

      rowHit.on("pointerover", () => {
        this.hoveredStat = def.key;
        this.refresh();
      });
      rowHit.on("pointerout", () => {
        if (this.hoveredStat === def.key) {
          this.hoveredStat = null;
          this.refresh();
        }
      });
      this.container.add(rowHit);

      this.rows.push({ def, bg, valueText, bonusText, minusBg, minusText, plusBg, plusText });
    });
  }

  private buildDerivedStatsCard(): void {
    const statsBox = this.scene.add.graphics();
    statsBox.fillStyle(0x102019, 0.95);
    statsBox.fillRoundedRect(RIGHT_X, ROW_START_Y, 300, 224, 6);
    statsBox.lineStyle(1, 0x2f4a3b, 1);
    statsBox.strokeRoundedRect(RIGHT_X, ROW_START_Y, 300, 224, 6);
    this.container.add(statsBox);

    const statsHeader = this.scene.add.text(RIGHT_X + 12, ROW_START_Y + 7, "COMBAT & DERIVED", {
      fontFamily: TITLE_FONT,
      fontSize: "10px",
      color: "#8fa895",
    });
    this.container.add(statsHeader);

    // Create 8 individual text lines for left column & 8 for right column
    for (let i = 0; i < 8; i++) {
      const lineY = ROW_START_Y + 28 + i * 24;

      const leftText = this.scene.add.text(RIGHT_X + 12, lineY, "", {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#cfe8c8",
      });
      this.container.add(leftText);
      this.derivedLeftLines.push(leftText);

      const rightText = this.scene.add.text(RIGHT_X + 154, lineY, "", {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#cfe8c8",
      });
      this.container.add(rightText);
      this.derivedRightLines.push(rightText);
    }
  }

  private buildBottomCards(): void {
    const detailY = ROW_START_Y + 6 * ROW_HEIGHT + 12; // 316
    const cardW = PANEL_WIDTH - LEFT_X * 2;
    const cardH = 114;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x102019, 0.95);
    bg.fillRoundedRect(LEFT_X, detailY, cardW, cardH, 6);
    bg.lineStyle(1, 0x2f4a3b, 1);
    bg.strokeRoundedRect(LEFT_X, detailY, cardW, cardH, 6);
    this.container.add(bg);

    // 1. Regular Detail Container
    this.detailContainer = this.scene.add.container(LEFT_X, detailY);
    this.container.add(this.detailContainer);

    this.detailTitle = this.scene.add.text(12, 10, "ATRIBUT KARAKTER", {
      fontFamily: TITLE_FONT,
      fontSize: "12px",
      color: "#f4c95d",
    });
    this.detailContainer.add(this.detailTitle);

    this.detailBody = this.scene.add.text(
      12,
      34,
      "Arahkan kursor ke atribut (STR, AGI, VIT, INT, DEX, LUK) untuk melihat efeknya. Klik [+] untuk menyusun draft alokasi poin status.",
      {
        fontFamily: UI_FONT,
        fontSize: "17px",
        color: "#b8d0bb",
        wordWrap: { width: cardW - 24 },
        lineSpacing: 2,
      },
    );
    this.detailContainer.add(this.detailBody);

    // 2. Confirmation Container (Visible when there are pending draft points)
    this.confirmContainer = this.scene.add.container(LEFT_X, detailY).setVisible(false);
    this.container.add(this.confirmContainer);

    const confTitle = this.scene.add.text(14, 10, "KONFIRMASI ALOKASI STATUS", {
      fontFamily: TITLE_FONT,
      fontSize: "11px",
      color: "#f4c95d",
    });
    this.confirmContainer.add(confTitle);

    this.confirmSummary = this.scene.add.text(14, 30, "", {
      fontFamily: UI_FONT,
      fontSize: "16px",
      color: "#9fe08a",
      wordWrap: { width: cardW - 28 },
    });
    this.confirmContainer.add(this.confirmSummary);

    const confPrompt = this.scene.add.text(
      14,
      50,
      "Terapkan perubahan status ini secara permanen ke karakter Anda?",
      {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#cfe8c8",
      },
    );
    this.confirmContainer.add(confPrompt);

    // [ YES / TERAPKAN ] Button
    const yesBtn = this.scene.add.graphics();
    yesBtn.fillStyle(0x1e4a2d, 1);
    yesBtn.fillRoundedRect(14, 74, 150, 30, 4);
    yesBtn.lineStyle(1.5, 0x6fcf7c, 1);
    yesBtn.strokeRoundedRect(14, 74, 150, 30, 4);
    this.confirmContainer.add(yesBtn);

    const yesText = this.scene.add
      .text(89, 89, "YES (TERAPKAN)", {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#9fe08a",
      })
      .setOrigin(0.5);
    this.confirmContainer.add(yesText);

    const yesHit = this.scene.add
      .rectangle(14, 74, 150, 30)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    yesHit.on("pointerdown", () => this.applyPendingAllocation());
    this.confirmContainer.add(yesHit);

    // [ NO / BATAL ] Button
    const noBtn = this.scene.add.graphics();
    noBtn.fillStyle(0x421e1e, 1);
    noBtn.fillRoundedRect(174, 74, 130, 30, 4);
    noBtn.lineStyle(1.5, 0xe08a7a, 1);
    noBtn.strokeRoundedRect(174, 74, 130, 30, 4);
    this.confirmContainer.add(noBtn);

    const noText = this.scene.add
      .text(239, 89, "NO (BATAL)", {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#e08a7a",
      })
      .setOrigin(0.5);
    this.confirmContainer.add(noText);

    const noHit = this.scene.add
      .rectangle(174, 74, 130, 30)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    noHit.on("pointerdown", () => {
      this.resetPending();
      this.refresh();
    });
    this.confirmContainer.add(noHit);
  }

  private applyPendingAllocation(): void {
    if (this.totalPending() <= 0) return;

    for (const def of STAT_DEFINITIONS) {
      const amt = this.pending[def.key];
      if (amt <= 0) continue;

      let rem = amt;
      while (rem > 0) {
        const chunk = Math.min(10, rem);
        network.allocateStat(def.key, chunk);
        rem -= chunk;
      }
    }

    this.resetPending();
    this.refresh();
  }

  private calculateDerivedStats(
    level: number,
    str: number,
    agi: number,
    vit: number,
    intStat: number,
    dex: number,
    luk: number,
    currentHp: number,
    currentSp: number,
    gearAtk: number,
    gearHp: number,
    gearSp: number = 0,
  ): DerivedValues {
    const baseAtk = 10 + (level - 1) * 2 + gearAtk;
    const baseMaxHp = 100 + (level - 1) * 12 + gearHp;
    const baseMaxSp = 20 + (level - 1) * 3 + gearSp;

    const lukBonus = Math.floor((luk - 1) / 3);
    const attack = baseAtk + (str - 1) * 2 + lukBonus;
    const rangedAtk = baseAtk + (dex - 1) * 2 + lukBonus;
    const matk = 8 + (level - 1) * 2 + (intStat - 1) * 3 + lukBonus;
    const maxHp = baseMaxHp + (vit - 1) * 10;
    const maxSp = baseMaxSp + (intStat - 1) * 8;
    const softDef = vit - 1;
    const softMdef = intStat - 1;
    const hit = 100 + (level - 1) + (dex - 1) * 2;
    const flee = 100 + (level - 1) + (agi - 1) * 2;
    const aspd = Math.min(195, 150 + (agi - 1) * 2 + Math.floor((dex - 1) * 0.5));
    const critVal = Math.min(65, 12 + (luk - 1) * 1.5);
    const pDodgeVal = Math.min(25, 1 + Math.floor((luk - 1) * 0.5));
    const castRedVal = Math.min(80, Math.round(((dex - 1) * 2 + (intStat - 1) * 0.8) * 10) / 10);
    const weightLimit = 200 + (str - 1) * 30;
    const stunResVal = Math.min(80, (vit - 1) * 2);
    const curseResVal = Math.min(80, (luk - 1) * 2);

    return {
      hpStr: `${currentHp}/${maxHp}`,
      maxHp,
      spStr: `${currentSp}/${maxSp}`,
      maxSp,
      attack,
      rangedAtk,
      matk,
      softDef,
      softMdef,
      weightLimit,
      hit,
      flee,
      aspd,
      critPct: `${critVal.toFixed(1)}%`,
      critVal,
      pDodge: `${pDodgeVal}%`,
      pDodgeVal,
      castRed: `${castRedVal}%`,
      castRedVal,
      stunRes: `${stunResVal}%`,
      stunResVal,
      curseRes: `${curseResVal}%`,
      curseResVal,
    };
  }

  private refreshDerived(local: PlayerState): void {
    const level = local.level ?? 1;
    const str = local.str ?? 1;
    const agi = local.agi ?? 1;
    const vit = local.vit ?? 1;
    const intStat = local.int ?? 1;
    const dex = local.dex ?? 1;
    const luk = local.luk ?? 1;

    const weapon = local.weaponId ? itemCatalog.get(local.weaponId) : undefined;
    const armor = local.armorId ? itemCatalog.get(local.armorId) : undefined;
    const garment = local.garmentId ? itemCatalog.get(local.garmentId) : undefined;
    const gearAtk = (weapon?.attack ?? 0) + (garment?.attack ?? 0);
    const gearHp = (armor?.maxHp ?? 0) + (garment?.maxHp ?? 0);
    const gearSp = garment?.maxSp ?? 0;

    // Baseline stats (saved)
    const base = this.calculateDerivedStats(
      level,
      str,
      agi,
      vit,
      intStat,
      dex,
      luk,
      local.hp,
      local.sp ?? 20,
      gearAtk,
      gearHp,
      gearSp,
    );

    // Preview stats (with pending draft additions)
    const next = this.calculateDerivedStats(
      level,
      str + this.pending.str,
      agi + this.pending.agi,
      vit + this.pending.vit,
      intStat + this.pending.int,
      dex + this.pending.dex,
      luk + this.pending.luk,
      local.hp,
      local.sp ?? 20,
      gearAtk,
      gearHp,
      gearSp,
    );

    // Helper to format line and apply bright green highlight when increased
    const updateLine = (
      textObj: Phaser.GameObjects.Text,
      label: string,
      currentVal: string | number,
      nextVal: string | number,
      increased: boolean,
      diffText?: string,
    ) => {
      if (increased) {
        textObj.setText(`${label.padEnd(8, " ")}${nextVal}${diffText ? ` (+${diffText})` : ""}`);
        textObj.setColor("#9fe08a"); // Turn green as requested
      } else {
        textObj.setText(`${label.padEnd(8, " ")}${currentVal}`);
        textObj.setColor("#cfe8c8");
      }
    };

    // 8 Left Column lines
    updateLine(
      this.derivedLeftLines[0],
      "HP",
      base.hpStr,
      next.hpStr,
      next.maxHp > base.maxHp,
      String(next.maxHp - base.maxHp),
    );
    updateLine(
      this.derivedLeftLines[1],
      "SP",
      base.spStr,
      next.spStr,
      next.maxSp > base.maxSp,
      String(next.maxSp - base.maxSp),
    );
    updateLine(
      this.derivedLeftLines[2],
      "ATK",
      base.attack,
      next.attack,
      next.attack > base.attack,
      String(next.attack - base.attack),
    );
    updateLine(
      this.derivedLeftLines[3],
      "R.ATK",
      base.rangedAtk,
      next.rangedAtk,
      next.rangedAtk > base.rangedAtk,
      String(next.rangedAtk - base.rangedAtk),
    );
    updateLine(
      this.derivedLeftLines[4],
      "MATK",
      base.matk,
      next.matk,
      next.matk > base.matk,
      String(next.matk - base.matk),
    );
    updateLine(
      this.derivedLeftLines[5],
      "DEF",
      base.softDef,
      next.softDef,
      next.softDef > base.softDef,
      String(next.softDef - base.softDef),
    );
    updateLine(
      this.derivedLeftLines[6],
      "MDEF",
      base.softMdef,
      next.softMdef,
      next.softMdef > base.softMdef,
      String(next.softMdef - base.softMdef),
    );
    updateLine(
      this.derivedLeftLines[7],
      "WEIGHT",
      base.weightLimit,
      next.weightLimit,
      next.weightLimit > base.weightLimit,
      String(next.weightLimit - base.weightLimit),
    );

    // 8 Right Column lines
    updateLine(
      this.derivedRightLines[0],
      "HIT",
      base.hit,
      next.hit,
      next.hit > base.hit,
      String(next.hit - base.hit),
    );
    updateLine(
      this.derivedRightLines[1],
      "FLEE",
      base.flee,
      next.flee,
      next.flee > base.flee,
      String(next.flee - base.flee),
    );
    updateLine(
      this.derivedRightLines[2],
      "ASPD",
      base.aspd,
      next.aspd,
      next.aspd > base.aspd,
      String(next.aspd - base.aspd),
    );
    updateLine(
      this.derivedRightLines[3],
      "CRIT",
      base.critPct,
      next.critPct,
      next.critVal > base.critVal,
      `${(next.critVal - base.critVal).toFixed(1)}%`,
    );
    updateLine(
      this.derivedRightLines[4],
      "P.DODGE",
      base.pDodge,
      next.pDodge,
      next.pDodgeVal > base.pDodgeVal,
      `${next.pDodgeVal - base.pDodgeVal}%`,
    );
    updateLine(
      this.derivedRightLines[5],
      "CAST -",
      base.castRed,
      next.castRed,
      next.castRedVal > base.castRedVal,
      `${(next.castRedVal - base.castRedVal).toFixed(1)}%`,
    );
    updateLine(
      this.derivedRightLines[6],
      "STUN R.",
      base.stunRes,
      next.stunRes,
      next.stunResVal > base.stunResVal,
      `${next.stunResVal - base.stunResVal}%`,
    );
    updateLine(
      this.derivedRightLines[7],
      "CURSE R.",
      base.curseRes,
      next.curseRes,
      next.curseResVal > base.curseResVal,
      `${next.curseResVal - base.curseResVal}%`,
    );
  }

  private refreshBottomCards(hasPending: boolean): void {
    if (hasPending) {
      this.detailContainer.setVisible(false);
      this.confirmContainer.setVisible(true);

      const items: string[] = [];
      for (const def of STAT_DEFINITIONS) {
        if (this.pending[def.key] > 0) {
          items.push(`${def.label} +${this.pending[def.key]}`);
        }
      }
      this.confirmSummary.setText(`Draf Alokasi: ${items.join(", ") || "-"}`);
    } else {
      this.confirmContainer.setVisible(false);
      this.detailContainer.setVisible(true);

      if (!this.hoveredStat) {
        this.detailTitle.setText("ATRIBUT KARAKTER");
        this.detailBody.setText(
          "Arahkan kursor ke atribut (STR, AGI, VIT, INT, DEX, LUK) untuk melihat efeknya. Klik [+] untuk menyusun draft alokasi poin status.",
        );
      } else {
        const def = STAT_DEFINITIONS.find((d) => d.key === this.hoveredStat);
        if (def) {
          this.detailTitle.setText(def.fullName);
          this.detailBody.setText(def.description);
        }
      }
    }
  }
}
