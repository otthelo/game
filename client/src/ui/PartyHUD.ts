import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { network } from "../network/NetworkClient";
import type { PartyData, PartyMemberData } from "../types";
import { JOBS } from "../config/jobs";

const HUD_WIDTH = 220;
const MEMBER_ROW_HEIGHT = 44;
const HEADER_HEIGHT = 26;

export class PartyHUD {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly headerText: Phaser.GameObjects.Text;
  private readonly shareBadge: Phaser.GameObjects.Text;
  private readonly toggleBtn: Phaser.GameObjects.Text;
  private readonly rowsContainer: Phaser.GameObjects.Container;

  private isCollapsed = false;
  private rows: Phaser.GameObjects.Container[] = [];
  private onMemberClick?: (name: string) => void;

  constructor(scene: Phaser.Scene, onMemberClick?: (name: string) => void) {
    this.scene = scene;
    this.onMemberClick = onMemberClick;

    // Positioned on the left side below local player HUD
    this.container = scene.add
      .container(12, 120)
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.bg = scene.add.graphics();
    this.container.add(this.bg);

    // Header container
    this.headerText = scene.add.text(8, 6, "PARTY", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#f4c95d",
    });

    this.shareBadge = scene.add
      .text(HUD_WIDTH - 22, 7, "", {
        fontFamily: UI_FONT,
        fontSize: "10px",
        color: "#9fe08a",
      })
      .setOrigin(1, 0);

    this.toggleBtn = scene.add
      .text(HUD_WIDTH - 8, 4, "-", {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#f1ecd8",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    this.toggleBtn.on("pointerdown", () => {
      this.isCollapsed = !this.isCollapsed;
      this.toggleBtn.setText(this.isCollapsed ? "+" : "-");
      this.refresh();
    });

    this.container.add([this.headerText, this.shareBadge, this.toggleBtn]);

    this.rowsContainer = scene.add.container(0, HEADER_HEIGHT);
    this.container.add(this.rowsContainer);

    this.refresh();
  }

  refresh(): void {
    const party = network.party;
    if (!party || !party.members || party.members.length === 0) {
      this.container.setVisible(false);
      return;
    }

    this.container.setVisible(true);

    const memberCount = party.members.length;
    const rawPartyName = party.name.toUpperCase();
    const shortPartyName = rawPartyName.length > 14 ? `${rawPartyName.slice(0, 13)}…` : rawPartyName;
    this.headerText.setText(`${shortPartyName} (${memberCount}/12)`);
    this.shareBadge.setText(party.expShare === "even" ? "EVEN EXP" : "EACH EXP");
    this.shareBadge.setColor(party.expShare === "even" ? "#9fe08a" : "#e08a7a");

    // Clean previous rows
    for (const row of this.rows) {
      row.destroy(true);
    }
    this.rows = [];

    if (this.isCollapsed) {
      this.rowsContainer.setVisible(false);
      this.bg.clear();
      this.bg.fillStyle(0x1a0e09, 0.92);
      this.bg.fillRoundedRect(0, 0, HUD_WIDTH, HEADER_HEIGHT, 5);
      this.bg.lineStyle(1.5, 0x8e5c3a, 0.9);
      this.bg.strokeRoundedRect(0, 0, HUD_WIDTH, HEADER_HEIGHT, 5);
      return;
    }

    this.rowsContainer.setVisible(true);

    let yOffset = 0;
    for (let i = 0; i < party.members.length; i++) {
      const member = party.members[i];
      const row = this.createMemberRow(member, yOffset);
      this.rowsContainer.add(row);
      this.rows.push(row);
      yOffset += MEMBER_ROW_HEIGHT;
    }

    const totalH = HEADER_HEIGHT + yOffset + 4;
    this.bg.clear();
    // Warm wood / dark RPG border
    this.bg.fillStyle(0x1a0e09, 0.92);
    this.bg.fillRoundedRect(0, 0, HUD_WIDTH, totalH, 6);
    this.bg.fillStyle(0x3a2114, 0.7);
    this.bg.fillRoundedRect(2, 2, HUD_WIDTH - 4, totalH - 4, 5);
    this.bg.lineStyle(1.5, 0x8e5c3a, 0.95);
    this.bg.strokeRoundedRect(1, 1, HUD_WIDTH - 2, totalH - 2, 6);
  }

  private createMemberRow(member: PartyMemberData, y: number): Phaser.GameObjects.Container {
    const row = this.scene.add.container(4, y);
    const rowW = HUD_WIDTH - 8;
    const isLocal = member.sessionId === network.sessionId;
    const isSameMap = member.mapId === network.currentMapId;
    const isOnline = member.online;

    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(isLocal ? 0x2b1c14 : 0x1f140e, 0.85);
    rowBg.fillRoundedRect(0, 2, rowW, MEMBER_ROW_HEIGHT - 4, 4);
    rowBg.lineStyle(1, isLocal ? 0xf4c95d : 0x5a3721, isLocal ? 0.8 : 0.4);
    rowBg.strokeRoundedRect(0, 2, rowW, MEMBER_ROW_HEIGHT - 4, 4);
    row.add(rowBg);

    // Leader Crown
    const crown = member.isLeader ? "👑 " : "";
    const jobKey = member.jobId ?? "novice";
    const jobName = (JOBS[jobKey]?.name ?? jobKey).slice(0, 3).toUpperCase();

    // Name + Level text
    const nameColor = !isOnline ? "#888888" : !isSameMap ? "#e0b07a" : isLocal ? "#f4c95d" : "#f1ecd8";
    const nameStr = `${crown}${member.name}`.slice(0, 16);
    const nameText = this.scene.add.text(6, 5, nameStr, {
      fontFamily: UI_FONT,
      fontSize: "12px",
      color: nameColor,
    });

    const levelText = this.scene.add
      .text(rowW - 6, 5, `${jobName} Lv.${member.level}`, {
        fontFamily: UI_FONT,
        fontSize: "11px",
        color: !isOnline ? "#666666" : "#b0bec5",
      })
      .setOrigin(1, 0);

    row.add([nameText, levelText]);

    // HP Bar
    const barW = rowW - 12;
    const hpBarH = 7;
    const spBarH = 5;
    const hpRatio = member.maxHp > 0 ? Math.max(0, Math.min(1, member.hp / member.maxHp)) : 0;
    const spRatio = member.maxSp > 0 ? Math.max(0, Math.min(1, member.sp / member.maxSp)) : 0;

    const barsG = this.scene.add.graphics();
    // HP Track
    barsG.fillStyle(0x221111, 0.9);
    barsG.fillRect(6, 22, barW, hpBarH);
    // HP Fill
    const hpColor = hpRatio > 0.5 ? 0x44bd32 : hpRatio > 0.25 ? 0xfbc531 : 0xe84118;
    barsG.fillStyle(isOnline ? hpColor : 0x555555, 1);
    barsG.fillRect(6, 22, Math.round(barW * hpRatio), hpBarH);

    // SP Track
    barsG.fillStyle(0x111b22, 0.9);
    barsG.fillRect(6, 31, barW, spBarH);
    // SP Fill
    barsG.fillStyle(isOnline ? 0x3498db : 0x444444, 1);
    barsG.fillRect(6, 31, Math.round(barW * spRatio), spBarH);

    row.add(barsG);

    // If on different map or offline, show badge over bars
    if (!isOnline) {
      const offText = this.scene.add
        .text(6 + barW / 2, 25, "OFFLINE", {
          fontFamily: UI_FONT,
          fontSize: "10px",
          color: "#ff6b6b",
        })
        .setOrigin(0.5, 0.5);
      row.add(offText);
    } else if (!isSameMap) {
      const mapLabel = member.mapId.replace(/_/g, " ").toUpperCase();
      const mapText = this.scene.add
        .text(6 + barW / 2, 25, `MAP: ${mapLabel}`, {
          fontFamily: UI_FONT,
          fontSize: "10px",
          color: "#ffd32a",
        })
        .setOrigin(0.5, 0.5);
      row.add(mapText);
    }

    // Interactive row for whisper / click
    const hitArea = this.scene.add
      .rectangle(0, 2, rowW, MEMBER_ROW_HEIGHT - 4)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on("pointerdown", () => {
      if (!isLocal && this.onMemberClick) {
        this.onMemberClick(member.name);
      }
    });

    row.add(hitArea);
    return row;
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
