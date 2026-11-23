import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { attachDraggable } from "./draggable";
import { network } from "../network/NetworkClient";
import type { PartyData, PartyMemberData, ExpShareMode, ItemShareMode } from "../types";
import { JOBS } from "../config/jobs";

const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 512;

export class PartyPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly tabContainer: Phaser.GameObjects.Container;
  private readonly contentContainer: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly onToast?: (text: string, color?: string) => void;

  private activeTab: "party" | "friends" = "party";
  private isOpen = false;

  constructor(scene: Phaser.Scene, onToast?: (text: string, color?: string) => void) {
    this.scene = scene;
    this.onToast = onToast;

    const x = Math.floor((scene.scale.width - PANEL_WIDTH) / 2);
    const y = Math.floor((scene.scale.height - PANEL_HEIGHT) / 2) - 10;

    this.container = scene.add
      .container(x, y)
      .setDepth(60)
      .setScrollFactor(0)
      .setVisible(false);

    // Draggable handle
    attachDraggable(scene, this.container, {
      panelWidth: PANEL_WIDTH,
      panelHeight: PANEL_HEIGHT,
      handleHeight: 46,
    });

    // Outer and inner frame
    const bg = scene.add.graphics();
    // Dark outline
    bg.fillStyle(0x1a0e09, 0.98);
    bg.fillRoundedRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 8);
    // Wood body
    bg.fillStyle(0x4a2a18, 0.96);
    bg.fillRoundedRect(3, 3, PANEL_WIDTH - 6, PANEL_HEIGHT - 6, 7);
    // Inner bevel & header accent
    bg.fillStyle(0x6e4024, 1);
    bg.fillRoundedRect(4, 4, PANEL_WIDTH - 8, 40, 6);
    bg.lineStyle(2, 0xd4a359, 0.9);
    bg.strokeRoundedRect(2, 2, PANEL_WIDTH - 4, PANEL_HEIGHT - 4, 8);
    this.container.add(bg);

    // Title text
    this.titleText = scene.add.text(18, 14, "PARTY SYSTEM", {
      fontFamily: TITLE_FONT,
      fontSize: "20px",
      color: "#f4c95d",
    });

    // Close button [X]
    const closeBtn = scene.add
      .text(PANEL_WIDTH - 30, 12, "X", {
        fontFamily: UI_FONT,
        fontSize: "22px",
        color: "#e08a7a",
      })
      .setInteractive({ useHandCursor: true });

    closeBtn.on("pointerdown", () => this.toggle());
    this.container.add([this.titleText, closeBtn]);

    // Tab bar + Dynamic content area
    this.tabContainer = scene.add.container(0, 48);
    this.container.add(this.tabContainer);

    this.contentContainer = scene.add.container(0, 82);
    this.container.add(this.contentContainer);

    this.refresh();
  }

  get visible(): boolean {
    return this.isOpen;
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.container.setVisible(this.isOpen);
    if (this.isOpen) {
      network.requestFriendList();
      this.refresh();
    }
  }

  open(): void {
    this.isOpen = true;
    this.container.setVisible(true);
    network.requestFriendList();
    this.refresh();
  }

  close(): void {
    this.isOpen = false;
    this.container.setVisible(false);
  }

  refresh(): void {
    if (!this.isOpen) return;

    this.renderTabs();
    this.contentContainer.removeAll(true);

    if (this.activeTab === "friends") {
      this.renderFriendsView();
      return;
    }

    const party = network.party;

    if (!party || !party.members || party.members.length === 0) {
      this.renderNoPartyView();
    } else {
      this.renderPartyView(party);
    }
  }

  private renderTabs(): void {
    this.tabContainer.removeAll(true);
    const tabs: Array<{ id: "party" | "friends"; label: string }> = [
      { id: "party", label: "PARTY" },
      { id: "friends", label: `TEMAN (${network.friends.length})` },
    ];
    let tx = 20;
    for (const tab of tabs) {
      const active = this.activeTab === tab.id;
      const bw = 136;
      const bh = 28;
      const g = this.scene.add.graphics();
      g.fillStyle(active ? 0x6e4024 : 0x2b170d, 1);
      g.fillRoundedRect(tx, 2, bw, bh, 5);
      g.lineStyle(1.5, active ? 0xf4c95d : 0x7b4c2d, 1);
      g.strokeRoundedRect(tx, 2, bw, bh, 5);
      this.tabContainer.add(g);

      const lbl = this.scene.add
        .text(tx + bw / 2, 2 + bh / 2, tab.label, {
          fontFamily: UI_FONT,
          fontSize: "14px",
          color: active ? "#f4c95d" : "#cbb493",
        })
        .setOrigin(0.5);
      this.tabContainer.add(lbl);

      const hit = this.scene.add
        .rectangle(tx, 2, bw, bh, 0, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        if (tab.id === "friends") network.requestFriendList();
        this.refresh();
      });
      this.tabContainer.add(hit);
      tx += bw + 10;
    }
  }

  private renderFriendsView(): void {
    this.titleText.setText("MANAJEMEN PARTY - TEMAN");
    const w = PANEL_WIDTH;
    const friends = network.friends;

    if (friends.length === 0) {
      const empty = this.scene.add
        .text(
          w / 2,
          140,
          "Belum ada teman terdaftar.\nKlik kanan pada player lain lalu pilih 'Add Friend'.",
          {
            fontFamily: UI_FONT,
            fontSize: "16px",
            color: "#cbb493",
            align: "center",
          },
        )
        .setOrigin(0.5);
      this.contentContainer.add(empty);
      return;
    }

    let y = 10;
    const rowH = 36;
    for (const f of friends.slice(0, 10)) {
      const rowBg = this.scene.add.graphics();
      rowBg.fillStyle(0x23140c, 0.88);
      rowBg.fillRoundedRect(20, y, w - 40, rowH - 4, 5);
      rowBg.lineStyle(1, f.online ? 0x55ff88 : 0x555555, 0.7);
      rowBg.strokeRoundedRect(20, y, w - 40, rowH - 4, 5);
      this.contentContainer.add(rowBg);

      const nameColor = f.online ? "#55ff88" : "#888888";
      const statusText = f.online ? `ONLINE (${f.mapId ?? "Realm"})` : "OFFLINE";
      const lbl = this.scene.add
        .text(34, y + (rowH - 4) / 2, `● ${f.name}`, {
          fontFamily: UI_FONT,
          fontSize: "16px",
          color: nameColor,
        })
        .setOrigin(0, 0.5);
      this.contentContainer.add(lbl);

      const st = this.scene.add
        .text(w - 130, y + (rowH - 4) / 2, statusText, {
          fontFamily: UI_FONT,
          fontSize: "14px",
          color: nameColor,
        })
        .setOrigin(1, 0.5);
      this.contentContainer.add(st);

      const delBtn = this.scene.add
        .text(w - 36, y + (rowH - 4) / 2, "[ HAPUS ]", {
          fontFamily: UI_FONT,
          fontSize: "13px",
          color: "#e08a7a",
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true });
      delBtn.on("pointerdown", () => {
        network.removeFriend(f.name);
      });
      this.contentContainer.add(delBtn);

      y += rowH;
    }
  }

  private renderNoPartyView(): void {
    this.titleText.setText("MANAJEMEN PARTY");

    const w = PANEL_WIDTH;
    const descBox = this.scene.add.graphics();
    descBox.fillStyle(0x23140c, 0.85);
    descBox.fillRoundedRect(20, 20, w - 40, 160, 6);
    descBox.lineStyle(1.5, 0x8e5c3a, 0.8);
    descBox.strokeRoundedRect(20, 20, w - 40, 160, 6);
    this.contentContainer.add(descBox);

    const infoTitle = this.scene.add.text(32, 28, "FITUR PARTY ALA RAGNAROK ONLINE", {
      fontFamily: TITLE_FONT,
      fontSize: "15px",
      color: "#f4c95d",
    });

    const infoDesc = this.scene.add.text(
      32,
      56,
      "• Even Share: EXP monster dibagi rata ke anggota yang berada dalam jarak 450px.\n" +
      "• Party Bonus EXP: Tambahan +10% EXP per anggota aktif di area yang sama (maksimal +50%).\n" +
      "• Syarat Level Gap: Selisih Base Level maksimal 15 level agar Even Share aktif.\n" +
      "• Item Share: Opsi Each Take (masing-masing) atau Party Share (drop bergiliran).\n" +
      "• Party Chat: Gunakan awalan % saat chat (misal: %Halo tim) untuk bicara ke party.",
      {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: "#e8ded1",
        lineSpacing: 5,
      }
    );

    this.contentContainer.add([infoTitle, infoDesc]);

    // Create party section
    const createBox = this.scene.add.graphics();
    createBox.fillStyle(0x2d1a10, 0.9);
    createBox.fillRoundedRect(20, 200, w - 40, 120, 6);
    createBox.lineStyle(1.5, 0x8e5c3a, 0.8);
    createBox.strokeRoundedRect(20, 200, w - 40, 120, 6);
    this.contentContainer.add(createBox);

    const promptText = this.scene.add.text(
      w / 2,
      220,
      "Kamu belum memiliki party. Buat party untuk berpetualang bersama!",
      {
        fontFamily: UI_FONT,
        fontSize: "15px",
        color: "#f1ecd8",
        align: "center",
      }
    ).setOrigin(0.5, 0);

    const btnW = 200;
    const btnH = 38;
    const btnX = Math.floor((w - btnW) / 2);
    const btnY = 260;

    const btnBg = this.scene.add.graphics();
    const drawBtn = (hover: boolean) => {
      btnBg.clear();
      btnBg.fillStyle(hover ? 0x6e9e4e : 0x487333, 1);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 5);
      btnBg.lineStyle(1.5, hover ? 0xffea78 : 0x9fe08a, 1);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 5);
    };
    drawBtn(false);

    const btnLabel = this.scene.add
      .text(btnX + btnW / 2, btnY + btnH / 2, "BUAT PARTY BARU", {
        fontFamily: TITLE_FONT,
        fontSize: "15px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const hit = this.scene.add
      .rectangle(btnX, btnY, btnW, btnH)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    hit.on("pointerover", () => drawBtn(true));
    hit.on("pointerout", () => drawBtn(false));
    hit.on("pointerdown", () => {
      const defaultName = `${network.players.get(network.sessionId)?.name ?? "Player"}'s Party`;
      network.createParty(defaultName);
      this.onToast?.("MEMBUAT PARTY...", "#9fe08a");
    });

    this.contentContainer.add([createBox, promptText, btnBg, btnLabel, hit]);

    // Hint text
    const hint = this.scene.add
      .text(
        w / 2,
        340,
        "Tip: Klik kanan pada pemain lain di map untuk mengundang mereka langsung ke party!",
        {
          fontFamily: UI_FONT,
          fontSize: "13px",
          color: "#9fe08a",
        }
      )
      .setOrigin(0.5);
    this.contentContainer.add(hint);
  }

  private renderPartyView(party: PartyData): void {
    const w = PANEL_WIDTH;
    const mySessionId = network.sessionId;
    const myPlayer = network.players.get(mySessionId);
    const myCharId = party.members.find((m) => m.sessionId === mySessionId)?.characterId;
    const isLeader = party.leaderId === myCharId || party.members.some((m) => m.sessionId === mySessionId && m.isLeader);

    this.titleText.setText(`PARTY: ${party.name.toUpperCase()} (${party.members.length}/12)`);

    // -------------------------------------------------------------------------
    // Rule Settings Bar (EXP & Item Rules)
    // -------------------------------------------------------------------------
    const settingsBox = this.scene.add.graphics();
    settingsBox.fillStyle(0x24150e, 0.95);
    settingsBox.fillRoundedRect(16, 8, w - 32, 68, 6);
    settingsBox.lineStyle(1.5, 0x8e5c3a, 0.9);
    settingsBox.strokeRoundedRect(16, 8, w - 32, 68, 6);
    this.contentContainer.add(settingsBox);

    // EXP Rule Button
    const expLabel = this.scene.add.text(28, 16, "ATURAN EXP:", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#f4c95d",
    });

    const expBtnW = 140;
    const expBtnH = 26;
    const expBtnX = 120;
    const expBtnY = 13;
    const isEven = party.expShare === "even";

    const expBtnBg = this.scene.add.graphics();
    const drawExpBtn = (hover: boolean) => {
      expBtnBg.clear();
      expBtnBg.fillStyle(isEven ? (hover ? 0x3d7034 : 0x2e5426) : (hover ? 0x5a3224 : 0x402319), 1);
      expBtnBg.fillRoundedRect(expBtnX, expBtnY, expBtnW, expBtnH, 4);
      expBtnBg.lineStyle(1.5, isEven ? 0x9fe08a : 0xd4a359, 1);
      expBtnBg.strokeRoundedRect(expBtnX, expBtnY, expBtnW, expBtnH, 4);
    };
    drawExpBtn(false);

    const expBtnText = this.scene.add
      .text(expBtnX + expBtnW / 2, expBtnY + expBtnH / 2, isEven ? "EVEN SHARE" : "EACH TAKE", {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: isEven ? "#9fe08a" : "#f1ecd8",
      })
      .setOrigin(0.5);

    if (isLeader) {
      const expHit = this.scene.add
        .rectangle(expBtnX, expBtnY, expBtnW, expBtnH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      expHit.on("pointerover", () => drawExpBtn(true));
      expHit.on("pointerout", () => drawExpBtn(false));
      expHit.on("pointerdown", () => {
        const next: ExpShareMode = isEven ? "individual" : "even";
        network.updatePartySettings({ expShare: next });
      });
      this.contentContainer.add(expHit);
    }

    this.contentContainer.add([expLabel, expBtnBg, expBtnText]);

    // Item Rule Button
    const itemLabel = this.scene.add.text(280, 16, "ATURAN ITEM:", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#f4c95d",
    });

    const itemBtnW = 150;
    const itemBtnH = 26;
    const itemBtnX = 380;
    const itemBtnY = 13;
    const isPartyItem = party.itemShare === "party_share";

    const itemBtnBg = this.scene.add.graphics();
    const drawItemBtn = (hover: boolean) => {
      itemBtnBg.clear();
      itemBtnBg.fillStyle(isPartyItem ? (hover ? 0x2e5466 : 0x1f3c4a) : (hover ? 0x5a3224 : 0x402319), 1);
      itemBtnBg.fillRoundedRect(itemBtnX, itemBtnY, itemBtnW, itemBtnH, 4);
      itemBtnBg.lineStyle(1.5, isPartyItem ? 0x78e8ff : 0xd4a359, 1);
      itemBtnBg.strokeRoundedRect(itemBtnX, itemBtnY, itemBtnW, itemBtnH, 4);
    };
    drawItemBtn(false);

    const itemBtnText = this.scene.add
      .text(itemBtnX + itemBtnW / 2, itemBtnY + itemBtnH / 2, isPartyItem ? "PARTY SHARE" : "EACH TAKE", {
        fontFamily: TITLE_FONT,
        fontSize: "13px",
        color: isPartyItem ? "#78e8ff" : "#f1ecd8",
      })
      .setOrigin(0.5);

    if (isLeader) {
      const itemHit = this.scene.add
        .rectangle(itemBtnX, itemBtnY, itemBtnW, itemBtnH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      itemHit.on("pointerover", () => drawItemBtn(true));
      itemHit.on("pointerout", () => drawItemBtn(false));
      itemHit.on("pointerdown", () => {
        const next: ItemShareMode = isPartyItem ? "each_take" : "party_share";
        network.updatePartySettings({ itemShare: next });
      });
      this.contentContainer.add(itemHit);
    }

    this.contentContainer.add([itemLabel, itemBtnBg, itemBtnText]);

    // Level Gap and Info indicator
    const onlineLevels = party.members.filter((m) => m.online).map((m) => m.level);
    const gap = onlineLevels.length > 1 ? Math.max(...onlineLevels) - Math.min(...onlineLevels) : 0;
    const gapExceeded = gap > 15;

    let gapStr = `Level Gap: ${gap} / 15`;
    let gapColor = "#9fe08a";
    if (gapExceeded) {
      gapStr = `⚠ Level Gap: ${gap} / 15 (Melebihi batas! Even Share otomatis nonaktif)`;
      gapColor = "#ff6b6b";
    } else if (isEven) {
      gapStr += ` (Even Share Aktif +${Math.min((party.members.length - 1) * 10, 50)}% EXP Bonus!)`;
    }

    const gapText = this.scene.add.text(28, 48, gapStr, {
      fontFamily: UI_FONT,
      fontSize: "12px",
      color: gapColor,
    });
    this.contentContainer.add(gapText);

    // -------------------------------------------------------------------------
    // Member Table Header
    // -------------------------------------------------------------------------
    const tableHeaderY = 86;
    const thG = this.scene.add.graphics();
    thG.fillStyle(0x351d13, 0.95);
    thG.fillRoundedRect(16, tableHeaderY, w - 32, 26, 4);
    this.contentContainer.add(thG);

    const headers = [
      { text: "LEADER", x: 26 },
      { text: "NAMA", x: 74 },
      { text: "JOB / LV", x: 195 },
      { text: "HP / SP", x: 295 },
      { text: "LOKASI MAP", x: 405 },
      { text: "AKSI", x: 535 },
    ];

    for (const h of headers) {
      this.contentContainer.add(
        this.scene.add.text(h.x, tableHeaderY + 6, h.text, {
          fontFamily: TITLE_FONT,
          fontSize: "12px",
          color: "#f4c95d",
        })
      );
    }

    // -------------------------------------------------------------------------
    // Members Table Rows (up to 12)
    // -------------------------------------------------------------------------
    let rowY = tableHeaderY + 28;
    for (let i = 0; i < party.members.length; i++) {
      const member = party.members[i];
      const isMe = member.sessionId === mySessionId;
      const isOnline = member.online;
      const isSameMap = member.mapId === network.currentMapId;

      const rBg = this.scene.add.graphics();
      rBg.fillStyle(i % 2 === 0 ? 0x22130d : 0x1b0e09, 0.9);
      rBg.fillRoundedRect(16, rowY, w - 32, 24, 3);
      if (isMe) {
        rBg.lineStyle(1, 0xd4a359, 0.6);
        rBg.strokeRoundedRect(16, rowY, w - 32, 24, 3);
      }
      this.contentContainer.add(rBg);

      // Crown / Role
      const crownText = this.scene.add.text(28, rowY + 3, member.isLeader ? "👑" : "•", {
        fontFamily: UI_FONT,
        fontSize: "14px",
        color: member.isLeader ? "#ffd32a" : "#888888",
      });

      // Name
      const nameColor = !isOnline ? "#777777" : isMe ? "#ffd32a" : "#f1ecd8";
      const nameText = this.scene.add.text(74, rowY + 4, member.name.slice(0, 13), {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: nameColor,
      });

      // Job + Level
      const jobKey = member.jobId ?? "novice";
      const jobName = (JOBS[jobKey]?.name ?? jobKey).slice(0, 4).toUpperCase();
      const jobText = this.scene.add.text(195, rowY + 4, `${jobName} [Lv.${member.level}]`, {
        fontFamily: UI_FONT,
        fontSize: "12px",
        color: !isOnline ? "#666666" : "#b0bec5",
      });

      // HP / SP
      const hpText = this.scene.add.text(
        295,
        rowY + 4,
        isOnline ? `${member.hp}/${member.maxHp} HP` : "OFFLINE",
        {
          fontFamily: UI_FONT,
          fontSize: "12px",
          color: isOnline ? (member.hp > member.maxHp * 0.3 ? "#9fe08a" : "#ff6b6b") : "#777777",
        }
      );

      // Map Location
      const mapLabel = member.mapId.replace(/_/g, " ").toUpperCase();
      const mapText = this.scene.add.text(405, rowY + 4, mapLabel.slice(0, 15), {
        fontFamily: UI_FONT,
        fontSize: "11px",
        color: !isOnline ? "#666666" : isSameMap ? "#9fe08a" : "#ffd32a",
      });

      this.contentContainer.add([crownText, nameText, jobText, hpText, mapText]);

      // Kick Button (Leader can kick other members)
      if (isLeader && !member.isLeader) {
        const kickBtn = this.scene.add
          .text(535, rowY + 3, "[KICK]", {
            fontFamily: UI_FONT,
            fontSize: "12px",
            color: "#e08a7a",
          })
          .setInteractive({ useHandCursor: true });

        kickBtn.on("pointerover", () => kickBtn.setColor("#ff4d4d"));
        kickBtn.on("pointerout", () => kickBtn.setColor("#e08a7a"));
        kickBtn.on("pointerdown", () => {
          network.kickPartyMember(member.characterId);
          this.onToast?.(`MENENDANG ${member.name.toUpperCase()}...`, "#e08a7a");
        });
        this.contentContainer.add(kickBtn);
      }

      rowY += 26;
    }

    // -------------------------------------------------------------------------
    // Footer Action Buttons
    // -------------------------------------------------------------------------
    const footerY = 380;

    // Leave Party button
    const leaveBtnW = 160;
    const leaveBtnH = 34;
    const leaveBtnX = 20;

    const leaveBg = this.scene.add.graphics();
    const drawLeave = (hover: boolean) => {
      leaveBg.clear();
      leaveBg.fillStyle(hover ? 0x8a2f24 : 0x5a1f18, 1);
      leaveBg.fillRoundedRect(leaveBtnX, footerY, leaveBtnW, leaveBtnH, 4);
      leaveBg.lineStyle(1.5, hover ? 0xff7b6b : 0xd4594a, 1);
      leaveBg.strokeRoundedRect(leaveBtnX, footerY, leaveBtnW, leaveBtnH, 4);
    };
    drawLeave(false);

    const leaveText = this.scene.add
      .text(
        leaveBtnX + leaveBtnW / 2,
        footerY + leaveBtnH / 2,
        isLeader && party.members.length === 1 ? "BUBARKAN PARTY" : "TINGGALKAN PARTY",
        {
          fontFamily: TITLE_FONT,
          fontSize: "13px",
          color: "#ffffff",
        }
      )
      .setOrigin(0.5);

    const leaveHit = this.scene.add
      .rectangle(leaveBtnX, footerY, leaveBtnW, leaveBtnH)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    leaveHit.on("pointerover", () => drawLeave(true));
    leaveHit.on("pointerout", () => drawLeave(false));
    leaveHit.on("pointerdown", () => {
      network.leaveParty();
      this.onToast?.("MENINGGALKAN PARTY...", "#e08a7a");
      this.close();
    });

    this.contentContainer.add([leaveBg, leaveText, leaveHit]);

    // Invite instruction info
    const inviteHint = this.scene.add
      .text(
        w - 24,
        footerY + 10,
        "Undang pemain: Klik kanan pada karakter pemain lain di layar",
        {
          fontFamily: UI_FONT,
          fontSize: "12px",
          color: "#d4a359",
        }
      )
      .setOrigin(1, 0.5);
    this.contentContainer.add(inviteHint);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
