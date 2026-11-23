import Phaser from "phaser";
import { REMOTE_INTERPOLATION_MS, SNAP_DISTANCE, UI_FONT } from "../config/gameConfig";
import type { PlayerState } from "../types";
import { Entity } from "./Entity";

const DIR_KEYS = ["down", "left", "right", "up"] as const;

interface DirectionConfig {
  walkAtlas: string;
  walkAnim: string;
  idleAtlas: string;
  idleAnim: string;
  idleFrame: string;
  hurtAnim: string;
  deathAnim: string;
  attackAnim: string;
}

const JOB_DIRECTIONS: Record<string, Record<string, DirectionConfig>> = {
  novice: {
    down: {
      walkAtlas: "novice-walk-front",
      walkAnim: "novice-walk-down",
      idleAtlas: "novice-idle-front",
      idleAnim: "novice-idle-down",
      idleFrame: "Novice_Idle_front 0.aseprite",
      hurtAnim: "novice-hurt-down",
      deathAnim: "novice-death-down",
      attackAnim: "novice-attack-down",
    },
    left: {
      walkAtlas: "novice-walk-side-left",
      walkAnim: "novice-walk-left",
      idleAtlas: "novice-idle-side-left",
      idleAnim: "novice-idle-left",
      idleFrame: "Novice_Idle_side_left 0.aseprite",
      hurtAnim: "novice-hurt-left",
      deathAnim: "novice-death-left",
      attackAnim: "novice-attack-left",
    },
    right: {
      walkAtlas: "novice-walk-side-right",
      walkAnim: "novice-walk-right",
      idleAtlas: "novice-idle-side-right",
      idleAnim: "novice-idle-right",
      idleFrame: "Novice_Idle_side_right 0.aseprite",
      hurtAnim: "novice-hurt-right",
      deathAnim: "novice-death-right",
      attackAnim: "novice-attack-right",
    },
    up: {
      walkAtlas: "novice-walk-back",
      walkAnim: "novice-walk-up",
      idleAtlas: "novice-idle-back",
      idleAnim: "novice-idle-up",
      idleFrame: "Novice_Idle_back 0.aseprite",
      hurtAnim: "novice-hurt-up",
      deathAnim: "novice-death-up",
      attackAnim: "novice-attack-up",
    },
  },
  swordsman: {
    down: {
      walkAtlas: "swordsman-walk-front",
      walkAnim: "swordsman-walk-down",
      idleAtlas: "swordsman-idle-front",
      idleAnim: "swordsman-idle-down",
      idleFrame: "Swordsman_lvl3_Idle_front 0.aseprite",
      hurtAnim: "swordsman-hurt-down",
      deathAnim: "swordsman-death-down",
      attackAnim: "swordsman-attack-down",
    },
    left: {
      walkAtlas: "swordsman-walk-side-left",
      walkAnim: "swordsman-walk-left",
      idleAtlas: "swordsman-idle-side-left",
      idleAnim: "swordsman-idle-left",
      idleFrame: "Swordsman_lvl3_Idle_side_left 0.aseprite",
      hurtAnim: "swordsman-hurt-left",
      deathAnim: "swordsman-death-left",
      attackAnim: "swordsman-attack-side-left",
    },
    right: {
      walkAtlas: "swordsman-walk-side-right",
      walkAnim: "swordsman-walk-right",
      idleAtlas: "swordsman-idle-side-right",
      idleAnim: "swordsman-idle-right",
      idleFrame: "Swordsman_lvl3_Idle_side_right 0.aseprite",
      hurtAnim: "swordsman-hurt-right",
      deathAnim: "swordsman-death-right",
      attackAnim: "swordsman-attack-side-left",
    },
    up: {
      walkAtlas: "swordsman-walk-back",
      walkAnim: "swordsman-walk-up",
      idleAtlas: "swordsman-idle-back",
      idleAnim: "swordsman-idle-up",
      idleFrame: "Swordsman_lvl3_Idle_back 0.aseprite",
      hurtAnim: "swordsman-hurt-up",
      deathAnim: "swordsman-death-up",
      attackAnim: "swordsman-attack-back",
    },
  },
};

function getJobKey(jobId?: string): "novice" | "swordsman" {
  if (jobId === "swordsman" || jobId === "knight") return "swordsman";
  return "novice";
}

function heroTexture(outfit: number, dir: number): string {
  const variant = ((outfit % 3) + 3) % 3;
  return `hero-${variant}-${DIR_KEYS[dir] ?? "down"}`;
}

/**
 * Renders one player. Remote players are interpolated toward their latest
 * server snapshot; the local player's position is driven by client-side
 * prediction in GameScene and then gently corrected after reconciliation.
 */
export class Player extends Entity {
  readonly sessionId: string;
  readonly isLocal: boolean;
  /** Live view of the synchronized schema; the server owns every value. */
  readonly snapshot: PlayerState;
  private wasFrozen = false;

  private localMoving = false;
  private localDir = 0;
  private isAttacking = false;
  private isHurting = false;
  private isDead = false;
  private attackTimer?: Phaser.Time.TimerEvent;
  private hurtTimer?: Phaser.Time.TimerEvent;
  private bubble?: Phaser.GameObjects.Container;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private bubbleTween?: Phaser.Tweens.Tween;
  private readonly wingSprite: Phaser.GameObjects.Sprite;
  private readonly cloakSprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, sessionId: string, state: PlayerState, isLocal: boolean) {
    const jobKey = getJobKey(state.jobId);
    const dirKey = DIR_KEYS[state.dir] ?? "down";
    const dirCfg = (JOB_DIRECTIONS[jobKey] ?? JOB_DIRECTIONS.novice)[dirKey];
    const hasJobAtlas = scene.textures.exists(dirCfg.walkAtlas);

    super(scene, state.x, state.y, {
      texture: hasJobAtlas ? dirCfg.walkAtlas : heroTexture(state.outfit, state.dir),
      frame: hasJobAtlas ? dirCfg.idleFrame : undefined,
      originX: 0.5,
      originY: hasJobAtlas ? 46 / 64 : 1,
      showShadow: !hasJobAtlas,
      name: state.name,
      nameColor: isLocal ? "#f4c95d" : "#e8f1d8",
      barWidth: 38,
      barHeight: 5,
      barY: -32,
      nameY: -38,
    });

    this.sessionId = sessionId;
    this.snapshot = state;
    this.isLocal = isLocal;
    this.localDir = state.dir;
    this.setDepth(state.y);

    this.wingSprite = scene.add
      .sprite(0, -16, "wing-front")
      .setOrigin(0.5, 0.5)
      .setScale(0.55)
      .setVisible(false);
    this.add(this.wingSprite);
    this.moveBelow(this.wingSprite, this.sprite);

    this.cloakSprite = scene.add
      .sprite(0, 0, "cloak-front-idle", "orc3_front_idle 0.aseprite")
      .setOrigin(0.5, hasJobAtlas ? 46 / 64 : 1)
      .setVisible(false);
    this.add(this.cloakSprite);
    this.moveBelow(this.cloakSprite, this.sprite);
  }

  update(dt: number, time: number): void {
    if (!this.isLocal) {
      const distance = Phaser.Math.Distance.Between(this.x, this.y, this.snapshot.x, this.snapshot.y);
      if (distance > SNAP_DISTANCE) {
        this.setPosition(this.snapshot.x, this.snapshot.y);
      } else {
        // Exponential smoothing keeps remote movement fluid even with 20 Hz patches.
        const t = 1 - Math.exp(-dt / (REMOTE_INTERPOLATION_MS / 1000));
        this.x = Phaser.Math.Linear(this.x, this.snapshot.x, t);
        this.y = Phaser.Math.Linear(this.y, this.snapshot.y, t);
      }
    }

    const dir = this.isLocal ? this.localDir : this.snapshot.dir;
    const isFrozen = Boolean(this.snapshot.frozen) && !this.isDead;
    const isResting = Boolean(this.snapshot.resting) && !this.isDead && !isFrozen;
    const moving = isFrozen || isResting ? false : (this.isLocal ? this.localMoving : this.snapshot.moving);
    const dirKey = DIR_KEYS[dir] ?? "down";
    const jobKey = getJobKey(this.snapshot.jobId);
    const dirCfg = (JOB_DIRECTIONS[jobKey] ?? JOB_DIRECTIONS.novice)[dirKey];
    const hasJobAtlas = this.scene.textures.exists(dirCfg.walkAtlas);

    if (hasJobAtlas) {
      if (this.isDead) {
        this.sprite.y = 0;
      } else if (isResting) {
        const deathAnim = this.scene.anims.get(dirCfg.deathAnim);
        const lastFrame = deathAnim?.frames[deathAnim.frames.length - 1];
        if (lastFrame) {
          this.sprite.anims.stop();
          this.sprite.setTexture(lastFrame.textureKey, lastFrame.textureFrame);
        }
        this.sprite.y = 0;
      } else if (this.isAttacking || this.isHurting) {
        this.sprite.y = 0;
      } else {
        this.sprite.setFlipX(false);
        if (moving) {
          if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim?.key !== dirCfg.walkAnim) {
            this.sprite.play(dirCfg.walkAnim, true);
          }
        } else {
          if (this.scene.anims.exists(dirCfg.idleAnim)) {
            if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim?.key !== dirCfg.idleAnim) {
              this.sprite.play(dirCfg.idleAnim, true);
            }
          } else {
            if (this.sprite.anims.isPlaying) {
              this.sprite.stop();
            }
            this.setTextureSafe(dirCfg.idleAtlas, dirCfg.idleFrame);
          }
        }
        this.sprite.y = 0;
      }
    } else {
      this.setTextureSafe(heroTexture(this.snapshot.outfit, dir));
      this.sprite.y = moving ? -1 + Math.sin(time * 0.015) * 1.1 : 0;
    }

    const gmLevel = this.snapshot.gmLevel ?? 0;
    const prefix = gmLevel === 2 ? "[Admin] " : gmLevel === 1 ? "[GM] " : "";
    this.setDisplayName(`${prefix}${this.snapshot.name}`);
    if (this.nameText) {
      if (gmLevel === 2) {
        this.nameText.setColor("#ffd700");
      } else if (gmLevel === 1) {
        this.nameText.setColor("#55ff88");
      } else {
        this.nameText.setColor(this.isLocal ? "#f4c95d" : "#e8f1d8");
      }
    }
    this.updateHealth(this.snapshot.hp, this.snapshot.maxHp);
    this.updateWing(dirKey);

    if (isFrozen) {
      if (!this.wasFrozen) {
        this.wasFrozen = true;
      }
      this.sprite.setTint(0x66ccff);
      this.wingSprite.setTint(0x66ccff);
      this.cloakSprite.setTint(0x66ccff);
      if (this.sprite.anims.isPlaying) {
        this.sprite.anims.pause();
      }
    } else if (this.wasFrozen) {
      this.wasFrozen = false;
      this.sprite.clearTint();
      this.wingSprite.clearTint();
      this.cloakSprite.clearTint();
      if (this.sprite.anims.isPaused) {
        this.sprite.anims.resume();
      }
    }
    this.updateGarment(dirKey);
    this.updateDepth();
  }

  private updateGarment(dirKey: (typeof DIR_KEYS)[number]): void {
    const hasGarment = Boolean(this.snapshot.garmentId);
    if (!hasGarment || !this.scene.textures.exists("cloak-front-idle")) {
      this.cloakSprite.setVisible(false);
      return;
    }

    this.cloakSprite.setVisible(true);

    const moving = this.isLocal ? this.localMoving : this.snapshot.moving;
    const jobKey = getJobKey(this.snapshot.jobId);
    const dirCfg = (JOB_DIRECTIONS[jobKey] ?? JOB_DIRECTIONS.novice)[dirKey];
    const hasJobAtlas = this.scene.textures.exists(dirCfg.walkAtlas);

    this.cloakSprite.setOrigin(0.5, hasJobAtlas ? 46 / 64 : 1);
    this.cloakSprite.setPosition(0, this.sprite.y);

    if (dirKey === "up") {
      this.moveAbove(this.cloakSprite, this.sprite);
      if (this.wingSprite.visible) {
        this.moveAbove(this.wingSprite, this.cloakSprite);
      }
    } else {
      this.moveBelow(this.cloakSprite, this.sprite);
      if (this.wingSprite.visible) {
        this.moveBelow(this.wingSprite, this.cloakSprite);
      }
    }

    if (this.isDead) {
      const animKey = `cloak-death-${dirKey}`;
      if (this.scene.anims.exists(animKey)) {
        if (!this.cloakSprite.anims.isPlaying || this.cloakSprite.anims.currentAnim?.key !== animKey) {
          this.cloakSprite.play(animKey, true);
        }
      }
    } else if (this.isAttacking) {
      const animKey = `cloak-attack-${dirKey}`;
      if (this.scene.anims.exists(animKey)) {
        if (!this.cloakSprite.anims.isPlaying || this.cloakSprite.anims.currentAnim?.key !== animKey) {
          this.cloakSprite.play(animKey, true);
        }
      }
    } else if (moving) {
      const animKey = `cloak-walk-${dirKey}`;
      if (this.scene.anims.exists(animKey)) {
        if (!this.cloakSprite.anims.isPlaying || this.cloakSprite.anims.currentAnim?.key !== animKey) {
          this.cloakSprite.play(animKey, true);
        }
      }
    } else {
      const animKey = `cloak-idle-${dirKey}`;
      if (this.scene.anims.exists(animKey)) {
        if (!this.cloakSprite.anims.isPlaying || this.cloakSprite.anims.currentAnim?.key !== animKey) {
          this.cloakSprite.play(animKey, true);
        }
      }
    }
  }

  private updateWing(dirKey: (typeof DIR_KEYS)[number]): void {
    const hasWing = Boolean(this.snapshot.wingId) && !this.isDead;
    if (!hasWing || !this.scene.textures.exists("wing-front")) {
      this.wingSprite.setVisible(false);
      return;
    }

    this.wingSprite.setVisible(true);

    if (dirKey === "down") {
      // Facing front: front wing renders BEHIND the player
      if (!this.wingSprite.anims.isPlaying || this.wingSprite.anims.currentAnim?.key !== "wing-front") {
        this.wingSprite.play("wing-front", true);
      }
      this.wingSprite.setFlipX(false).setPosition(0, -16);
      this.moveBelow(this.wingSprite, this.sprite);
    } else if (dirKey === "up") {
      // Facing back: back wing renders IN FRONT of the player's back
      if (!this.wingSprite.anims.isPlaying || this.wingSprite.anims.currentAnim?.key !== "wing-back") {
        this.wingSprite.play("wing-back", true);
      }
      this.wingSprite.setFlipX(false).setPosition(0, -16);
      this.moveAbove(this.wingSprite, this.sprite);
    } else if (dirKey === "left") {
      // Facing left: left side wing
      if (!this.wingSprite.anims.isPlaying || this.wingSprite.anims.currentAnim?.key !== "wing-side") {
        this.wingSprite.play("wing-side", true);
      }
      this.wingSprite.setFlipX(false).setPosition(6, -16);
      this.moveBelow(this.wingSprite, this.sprite);
    } else {
      // Facing right: flipped animation of left side wing
      if (!this.wingSprite.anims.isPlaying || this.wingSprite.anims.currentAnim?.key !== "wing-side") {
        this.wingSprite.play("wing-side", true);
      }
      this.wingSprite.setFlipX(true).setPosition(-6, -16);
      this.moveBelow(this.wingSprite, this.sprite);
    }
  }

  playHurt(): void {
    if (this.isDead) return;
    const jobKey = getJobKey(this.snapshot.jobId);
    const dir = this.isLocal ? this.localDir : this.snapshot.dir;
    const dirKey = DIR_KEYS[dir] ?? "down";
    const dirCfg = (JOB_DIRECTIONS[jobKey] ?? JOB_DIRECTIONS.novice)[dirKey];
    if (!this.scene.anims.exists(dirCfg.hurtAnim)) return;

    this.hurtTimer?.remove(false);
    this.isHurting = true;
    this.sprite.setFlipX(false);
    this.sprite.play(dirCfg.hurtAnim, true);

    const onDone = () => {
      this.isHurting = false;
    };
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone);
    this.hurtTimer = this.scene.time.delayedCall(350, onDone);
  }

  playDeath(): void {
    this.isDead = true;
    this.isAttacking = false;
    this.isHurting = false;
    this.attackTimer?.remove(false);
    this.hurtTimer?.remove(false);

    const jobKey = getJobKey(this.snapshot.jobId);
    const dir = this.isLocal ? this.localDir : this.snapshot.dir;
    const dirKey = DIR_KEYS[dir] ?? "down";
    const dirCfg = (JOB_DIRECTIONS[jobKey] ?? JOB_DIRECTIONS.novice)[dirKey];

    if (this.scene.anims.exists(dirCfg.deathAnim)) {
      this.sprite.setFlipX(false);
      this.sprite.play(dirCfg.deathAnim, true);
    }

    const cloakDeathAnim = `cloak-death-${dirKey}`;
    if (this.cloakSprite.visible && this.scene.anims.exists(cloakDeathAnim)) {
      this.cloakSprite.play(cloakDeathAnim, true);
    }
  }

  onRespawn(): void {
    this.isDead = false;
    this.isAttacking = false;
    this.isHurting = false;
    this.attackTimer?.remove(false);
    this.hurtTimer?.remove(false);
    this.sprite.clearTint();
  }

  protected override updateHealth(current: number, max: number): void {
    super.updateHealth(current, max);
    if (current <= 0 && !this.isDead) {
      this.playDeath();
    } else if (current > 0 && this.isDead) {
      this.onRespawn();
    }
  }

  playAttack(): void {
    const jobKey = getJobKey(this.snapshot.jobId);
    const dir = this.isLocal ? this.localDir : this.snapshot.dir;
    const dirKey = DIR_KEYS[dir] ?? "down";
    const dirCfg = (JOB_DIRECTIONS[jobKey] ?? JOB_DIRECTIONS.novice)[dirKey];

    let animKey = dirCfg.attackAnim;
    let flipX = false;

    if (jobKey === "swordsman" && dirKey === "right") {
      animKey = "swordsman-attack-left";
      flipX = true;
    }

    if (!this.scene.anims.exists(animKey)) return;

    this.attackTimer?.remove(false);
    this.isAttacking = true;
    this.sprite.setFlipX(flipX);
    this.sprite.play(animKey, true);

    const onDone = () => {
      this.isAttacking = false;
      this.sprite.setFlipX(false);
    };

    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone);
    this.attackTimer = this.scene.time.delayedCall(450, onDone);

    const cloakAttackAnim = `cloak-attack-${dirKey}`;
    if (this.cloakSprite.visible && this.scene.anims.exists(cloakAttackAnim)) {
      this.cloakSprite.play(cloakAttackAnim, true);
    }
  }

  public playJobAnimation(action: "idle" | "walk" | "attack" | "hurt" | "death", dirKey: string, jobId?: string): boolean {
    const job = jobId ?? this.snapshot.jobId ?? "novice";
    const animKey = `${job}-${action}-${dirKey}`;
    const fallbackNovice = `novice-${action}-${dirKey}`;

    if (this.scene.anims.exists(animKey)) {
      if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim?.key !== animKey) {
        this.sprite.play(animKey, true);
      }
      return true;
    }
    if (this.scene.anims.exists(fallbackNovice)) {
      if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim?.key !== fallbackNovice) {
        this.sprite.play(fallbackNovice, true);
      }
      return true;
    }
    return false;
  }

  setLocalPose(x: number, y: number, moving: boolean, dir: number): void {
    this.setPosition(x, y);
    this.localMoving = moving;
    this.localDir = dir;
    this.updateDepth();
  }

  /** Displays a comic-style speech bubble above the player's head. */
  showChatBubble(text: string): void {
    this.bubbleTimer?.remove(false);
    this.bubbleTween?.remove();
    this.bubble?.destroy();

    const label = this.scene.add
      .text(0, 0, text, {
        fontFamily: UI_FONT,
        fontSize: "14px",
        color: "#1a0e09",
        align: "center",
        wordWrap: { width: 130, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setResolution(2);

    const bounds = label.getBounds();
    const padX = 8;
    const padY = 5;
    const boxW = Math.max(26, Math.ceil(bounds.width) + padX * 2);
    const boxH = Math.max(20, Math.ceil(bounds.height) + padY * 2);

    const bg = this.scene.add.graphics();
    // Comic bubble body
    bg.fillStyle(0xfaf6e8, 0.97);
    bg.fillRoundedRect(-boxW / 2, -boxH, boxW, boxH, 5);
    bg.lineStyle(1.5, 0x1a0e09, 1);
    bg.strokeRoundedRect(-boxW / 2, -boxH, boxW, boxH, 5);

    // Comic pointer tail pointing down toward the player's head
    bg.fillStyle(0xfaf6e8, 0.97);
    bg.fillTriangle(-4, -1, 4, -1, 0, 5);
    bg.lineStyle(1.5, 0x1a0e09, 1);
    bg.lineBetween(-4, 0, 0, 5);
    bg.lineBetween(4, 0, 0, 5);

    label.setPosition(0, -boxH / 2);

    const bubbleY = this.scene.textures.exists("swordsman-walk-front") ? -50 : -56;
    const bubble = this.scene.add.container(0, bubbleY, [bg, label]);
    bubble.setAlpha(0);
    this.add(bubble);
    this.bubble = bubble;

    this.scene.tweens.add({
      targets: bubble,
      alpha: 1,
      duration: 120,
      ease: "Quad.easeOut",
    });

    this.bubbleTimer = this.scene.time.delayedCall(4200, () => {
      if (!this.active || this.bubble !== bubble) return;
      this.bubbleTween = this.scene.tweens.add({
        targets: bubble,
        alpha: 0,
        duration: 280,
        ease: "Quad.easeIn",
        onComplete: () => {
          if (this.bubble === bubble) this.bubble = undefined;
          bubble.destroy();
        },
      });
    });
  }
}
