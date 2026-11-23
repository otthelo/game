import Phaser from "phaser";
import { COLORS, TITLE_FONT, UI_FONT } from "../config/gameConfig";
import { JOBS, availableJobAdvancements, canChangeJob, type JobDefinition } from "../config/jobs";
import { network } from "../network/NetworkClient";
import type { PlayerState } from "../types";
import { attachDraggable } from "./draggable";
import { HealthBar } from "./HealthBar";

const PANEL_WIDTH = 620;
const PANEL_HEIGHT = 440;

export interface JobPanelOptions {
  onFocus?: () => void;
  onClose?: () => void;
}

export class JobPanel {
  readonly container: Phaser.GameObjects.Container;
  private open = false;
  private readonly scene: Phaser.Scene;
  private readonly onFocus?: () => void;
  private readonly onClose?: () => void;

  // Left card elements (Current Job)
  private currentJobTitleText!: Phaser.GameObjects.Text;
  private currentJobTierText!: Phaser.GameObjects.Text;
  private currentJobDescText!: Phaser.GameObjects.Text;
  private jobLevelBadgeText!: Phaser.GameObjects.Text;
  private jobXpBar!: HealthBar;
  private jobXpText!: Phaser.GameObjects.Text;
  private statsBonusText!: Phaser.GameObjects.Text;
  private skillsText!: Phaser.GameObjects.Text;

  // Right card container (Advancement Tree)
  private advancementContainer!: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, x: number, y: number, options: JobPanelOptions = {}) {
    this.scene = scene;
    this.onFocus = options.onFocus;
    this.onClose = options.onClose;

    this.container = scene.add.container(x, y).setDepth(20).setVisible(false);

    this.buildShell();
    this.buildCurrentJobCard();
    this.buildAdvancementCard();
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.container.setVisible(this.open);
    if (this.open) {
      this.refresh();
      this.onFocus?.();
    }
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.container.setVisible(false);
    this.onClose?.();
  }

  private buildShell(): void {
    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.ink, 0.95);
    bg.fillRoundedRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 10);
    bg.lineStyle(2, 0x3b5a47, 1);
    bg.strokeRoundedRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 10);
    this.container.add(bg);

    // Draggable Handle
    attachDraggable(this.scene, this.container, {
      panelWidth: PANEL_WIDTH,
      panelHeight: PANEL_HEIGHT,
      handleHeight: 46,
      onFocus: () => this.onFocus?.(),
    });

    // Panel Title
    const title = this.scene.add.text(20, 14, "JOB & CLASS SYSTEM", {
      fontFamily: TITLE_FONT,
      fontSize: "13px",
      color: "#f4c95d",
    });
    this.container.add(title);

    // Close button
    const closeBtn = this.scene.add
      .text(PANEL_WIDTH - 20, 14, "[X]", {
        fontFamily: TITLE_FONT,
        fontSize: "12px",
        color: "#9db7a2",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    closeBtn.on("pointerover", () => closeBtn.setColor("#e08a7a"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#9db7a2"));
    closeBtn.on("pointerdown", (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.close();
    });
    this.container.add(closeBtn);

    // Header divider line
    const line = this.scene.add.graphics();
    line.lineStyle(1, 0x274332, 1);
    line.lineBetween(14, 44, PANEL_WIDTH - 14, 44);
    this.container.add(line);
  }

  private buildCurrentJobCard(): void {
    const cardX = 16;
    const cardY = 56;
    const cardW = 270;
    const cardH = 368;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0a1410, 0.9);
    bg.fillRoundedRect(cardX, cardY, cardW, cardH, 6);
    bg.lineStyle(1.5, 0x274332, 1);
    bg.strokeRoundedRect(cardX, cardY, cardW, cardH, 6);
    this.container.add(bg);

    const sectionTitle = this.scene.add.text(cardX + 14, cardY + 12, "JOB SAAT INI", {
      fontFamily: TITLE_FONT,
      fontSize: "10px",
      color: "#9fe08a",
    });
    this.container.add(sectionTitle);

    this.currentJobTitleText = this.scene.add.text(cardX + 14, cardY + 34, "NOVICE", {
      fontFamily: TITLE_FONT,
      fontSize: "16px",
      color: "#f4c95d",
    });
    this.container.add(this.currentJobTitleText);

    this.currentJobTierText = this.scene.add.text(cardX + 14, cardY + 58, "Tier 0 (Starter Class)", {
      fontFamily: UI_FONT,
      fontSize: "14px",
      color: "#9db7a2",
    });
    this.container.add(this.currentJobTierText);

    // Job Level Badge
    this.jobLevelBadgeText = this.scene.add.text(cardX + 14, cardY + 84, "JOB LEVEL: 1 / 10", {
      fontFamily: UI_FONT,
      fontSize: "17px",
      color: "#f4c95d",
    });
    this.container.add(this.jobLevelBadgeText);

    // Job XP bar
    this.jobXpBar = new HealthBar(this.scene, cardX + 14, cardY + 110, {
      width: cardW - 28,
      height: 10,
      color: 0xa855f7,
      backgroundColor: 0x2d143d,
      borderColor: 0x14061a,
    });
    this.container.add(this.jobXpBar);

    this.jobXpText = this.scene.add.text(cardX + 14, cardY + 124, "JOB EXP: 0 / 20 (0%)", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#d8b4e2",
    });
    this.container.add(this.jobXpText);

    // Job Description
    this.currentJobDescText = this.scene.add.text(
      cardX + 14,
      cardY + 148,
      "Petualang pemula yang sedang mempelajari dasar-dasar bertahan hidup.",
      {
        fontFamily: UI_FONT,
        fontSize: "14px",
        color: "#9db7a2",
        wordWrap: { width: cardW - 28 },
      },
    );
    this.container.add(this.currentJobDescText);

    // Base stats bonus divider
    const statsDivider = this.scene.add.graphics();
    statsDivider.lineStyle(1, 0x1e3328, 1);
    statsDivider.lineBetween(cardX + 14, cardY + 230, cardX + cardW - 14, cardY + 230);
    this.container.add(statsDivider);

    const bonusHeader = this.scene.add.text(cardX + 14, cardY + 238, "BONUS STATS JOB:", {
      fontFamily: TITLE_FONT,
      fontSize: "9px",
      color: "#9fe08a",
    });
    this.container.add(bonusHeader);

    this.statsBonusText = this.scene.add.text(cardX + 14, cardY + 258, "HP +100  SP +20  STR +1  AGI +1\nVIT +1  INT +1  DEX +1  LUK +1", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#c6d9cc",
      lineSpacing: 4,
    });
    this.container.add(this.statsBonusText);

    // Skills header
    const skillsHeader = this.scene.add.text(cardX + 14, cardY + 306, "SKILL TERBUKA:", {
      fontFamily: TITLE_FONT,
      fontSize: "9px",
      color: "#9fe08a",
    });
    this.container.add(skillsHeader);

    this.skillsText = this.scene.add.text(cardX + 14, cardY + 326, "• Basic Attack\n• First Aid", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#f4c95d",
      lineSpacing: 3,
    });
    this.container.add(this.skillsText);
  }

  private buildAdvancementCard(): void {
    const cardX = 300;
    const cardY = 56;
    const cardW = 304;
    const cardH = 368;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0a1410, 0.9);
    bg.fillRoundedRect(cardX, cardY, cardW, cardH, 6);
    bg.lineStyle(1.5, 0x274332, 1);
    bg.strokeRoundedRect(cardX, cardY, cardW, cardH, 6);
    this.container.add(bg);

    const sectionTitle = this.scene.add.text(cardX + 14, cardY + 12, "EVOLUSI & PERGANTIAN JOB", {
      fontFamily: TITLE_FONT,
      fontSize: "10px",
      color: "#f4c95d",
    });
    this.container.add(sectionTitle);

    this.advancementContainer = this.scene.add.container(cardX + 10, cardY + 36);
    this.container.add(this.advancementContainer);
  }

  refresh(): void {
    if (!this.open) return;
    const local = network.players.get(network.sessionId);
    if (!local) return;

    const jobId = local.jobId ?? "novice";
    const jobLevel = local.jobLevel ?? 1;
    const jobXp = local.jobXp ?? 0;
    const jobXpToNext = local.jobXpToNext ?? 20;

    const currentJob = JOBS[jobId] ?? JOBS.novice;

    // Refresh Current Job Details
    this.currentJobTitleText.setText(currentJob.name.toUpperCase());
    const tierStr = currentJob.tier === 0 ? "Tier 0 (Novice)" : currentJob.tier === 1 ? "Tier 1 (First Job)" : "Tier 2 (Second Job)";
    this.currentJobTierText.setText(tierStr);

    this.jobLevelBadgeText.setText(`JOB LEVEL: ${jobLevel} / ${currentJob.maxJobLevel}`);

    this.jobXpBar.setValue(jobXp, jobXpToNext);
    const xpPercent = jobXpToNext > 0 ? Math.floor((jobXp / jobXpToNext) * 100) : 100;
    this.jobXpText.setText(`JOB EXP: ${jobXp.toLocaleString()} / ${jobXpToNext.toLocaleString()} (${xpPercent}%)`);

    this.currentJobDescText.setText(currentJob.description);

    const bs = currentJob.baseStats;
    this.statsBonusText.setText(
      `HP +${bs.maxHp}  SP +${bs.maxSp}\nSTR +${bs.str}  AGI +${bs.agi}  VIT +${bs.vit}\nINT +${bs.int}  DEX +${bs.dex}  LUK +${bs.luk}`,
    );

    const skills = currentJob.unlockedSkills.map((s: string) => `• ${s}`).join("\n");
    this.skillsText.setText(skills || "Belum ada skill unik");

    // Refresh Advancements List
    this.renderAdvancements(local, currentJob);
  }

  private renderAdvancements(local: PlayerState, currentJob: JobDefinition): void {
    this.advancementContainer.removeAll(true);

    const advancements = availableJobAdvancements(currentJob.id);

    if (advancements.length === 0) {
      const reachedMax = this.scene.add.text(
        14,
        60,
        "Selamat!\nJob Anda saat ini telah mencapai\ntingkat tertinggi dalam fase ini.\nNantikan perkembangan 3rd Job\npada pembaruan berikutnya!",
        {
          fontFamily: UI_FONT,
          fontSize: "15px",
          color: "#9fe08a",
          align: "center",
          lineSpacing: 6,
        },
      );
      this.advancementContainer.add(reachedMax);
      return;
    }

    const cardW = 284;
    const cardH = 96;
    const gap = 8;

    advancements.forEach((target, idx) => {
      const cy = idx * (cardH + gap);

      const check = canChangeJob(currentJob.id, local.level, local.jobLevel ?? 1, target.id);
      const isEligible = check.ok;

      const cardBg = this.scene.add.graphics();
      cardBg.fillStyle(isEligible ? 0x14281c : 0x121614, 0.95);
      cardBg.fillRoundedRect(0, cy, cardW, cardH, 6);
      cardBg.lineStyle(1.5, isEligible ? 0x9fe08a : 0x274332, 1);
      cardBg.strokeRoundedRect(0, cy, cardW, cardH, 6);
      this.advancementContainer.add(cardBg);

      // Target Job Name & Tier
      const name = this.scene.add.text(10, cy + 8, target.name.toUpperCase(), {
        fontFamily: TITLE_FONT,
        fontSize: "12px",
        color: isEligible ? "#f4c95d" : "#9db7a2",
      });
      this.advancementContainer.add(name);

      const tierBadge = this.scene.add.text(cardW - 10, cy + 8, `Tier ${target.tier}`, {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: "#9db7a2",
      }).setOrigin(1, 0);
      this.advancementContainer.add(tierBadge);

      // Requirements
      const baseReqMet = local.level >= target.requiredBaseLevel;
      const jobReqMet = (local.jobLevel ?? 1) >= target.requiredJobLevel;

      const baseReqColor = baseReqMet ? "#9fe08a" : "#e08a7a";
      const jobReqColor = jobReqMet ? "#9fe08a" : "#e08a7a";

      const reqText = this.scene.add.text(
        10,
        cy + 28,
        `Syarat: Base Lv.${target.requiredBaseLevel} (${baseReqMet ? "✓" : "✗"})  •  Job Lv.${target.requiredJobLevel} (${jobReqMet ? "✓" : "✗"})`,
        {
          fontFamily: UI_FONT,
          fontSize: "13px",
          color: isEligible ? "#9fe08a" : "#c6d9cc",
        },
      );
      this.advancementContainer.add(reqText);

      // Short description
      const desc = this.scene.add.text(10, cy + 46, target.description, {
        fontFamily: UI_FONT,
        fontSize: "12px",
        color: "#7e9683",
        wordWrap: { width: cardW - 20 },
        maxLines: 2,
      });
      this.advancementContainer.add(desc);

      // Change Job button
      const btnW = 90;
      const btnH = 22;
      const btnX = cardW - btnW - 8;
      const btnY = cy + cardH - btnH - 6;

      const btnBg = this.scene.add.graphics();
      const drawBtn = (hover: boolean) => {
        btnBg.clear();
        if (isEligible) {
          btnBg.fillStyle(hover ? 0x2e663e : 0x1d472b, 1);
          btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
          btnBg.lineStyle(1, 0x9fe08a, 1);
          btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
        } else {
          btnBg.fillStyle(0x1a211c, 0.8);
          btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
          btnBg.lineStyle(1, 0x2e3831, 1);
          btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
        }
      };
      drawBtn(false);
      this.advancementContainer.add(btnBg);

      const btnLabel = this.scene.add
        .text(btnX + btnW / 2, btnY + btnH / 2, isEligible ? "GANTI JOB" : "TERKUNCI", {
          fontFamily: TITLE_FONT,
          fontSize: "9px",
          color: isEligible ? "#f4c95d" : "#5d6d60",
        })
        .setOrigin(0.5);
      this.advancementContainer.add(btnLabel);

      if (isEligible) {
        const hit = this.scene.add
          .rectangle(btnX, btnY, btnW, btnH)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true });
        hit.on("pointerover", () => drawBtn(true));
        hit.on("pointerout", () => drawBtn(false));
        hit.on("pointerdown", () => {
          network.changeJob(target.id);
        });
        this.advancementContainer.add(hit);
      }
    });
  }
}
