import Phaser from "phaser";
import { REMOTE_INTERPOLATION_MS, SNAP_DISTANCE, UI_FONT } from "../config/gameConfig";
import { Direction, MonsterKind, MonsterStatus, type MonsterState } from "../types";
import { Entity } from "./Entity";

function monsterTexture(kind: number): string {
  if (kind === MonsterKind.BlackAshura || kind === MonsterKind.ShadowAshura) return "ashura-walk-down";
  if (kind === MonsterKind.MadBunny) return "mad-bunny-idle-front";
  if (kind === MonsterKind.Marin) return "marin-idle-front";
  if (kind === MonsterKind.Magmaring) return "magmaring-idle-front";
  if (kind === MonsterKind.Poporing || kind === MonsterKind.VenomPoring) return "poporing-idle-front";
  if (kind === MonsterKind.Huskar) return "huskar-idle-front";
  if (kind === MonsterKind.HighOrc) return "highorc-idle-front";
  if (kind === MonsterKind.Orc) return "orc-idle-front";
  if (kind === MonsterKind.Pochi) return "pochi-idle-front";
  if (kind === MonsterKind.WhiteSnakeLady) return "white-snake-walk-front";
  return kind === MonsterKind.Bat || kind === MonsterKind.ForestStalker ? "monster-bat" : "monster-slime";
}

function monsterInitialFrame(kind: number): string | undefined {
  if (kind === MonsterKind.Huskar) return "Huskar_front_idle 0.aseprite";
  if (kind === MonsterKind.HighOrc) return "High_Orc_front_idle 0.aseprite";
  if (kind === MonsterKind.Orc) return "orc1_front_idle 0.aseprite";
  if (kind === MonsterKind.Pochi) return "Pochi_iddle_front.aseprite";
  if (kind === MonsterKind.Marin) return "Slime2_Idle_front 0.aseprite";
  if (kind === MonsterKind.Magmaring) return "Slime3_Idle_front 0.aseprite";
  if (kind === MonsterKind.Poporing || kind === MonsterKind.VenomPoring) return "Slime1_Idle_front 0.aseprite";
  return undefined;
}

const DIR_KEYS = ["front", "left", "right", "back"] as const;

const ASHURA_DIR_ANIMS = [
  "ashura-walk-down",
  "ashura-walk-left",
  "ashura-walk-right",
  "ashura-walk-up",
] as const;

const ASHURA_ATTACK_ANIMS = [
  "ashura-attack-down",
  "ashura-attack-left",
  "ashura-attack-right",
  "ashura-attack-up",
] as const;

export class Monster extends Entity {
  readonly monsterId: string;
  /** Live view of the synchronized schema; the server owns every value. */
  readonly snapshot: MonsterState;
  private wasAlive = false;
  private playingDeath = false;

  constructor(scene: Phaser.Scene, monsterId: string, snapshot: MonsterState) {
    const isBoss = snapshot.kind === MonsterKind.BlackAshura;
    const isShadow = snapshot.kind === MonsterKind.ShadowAshura;
    const isBunny = snapshot.kind === MonsterKind.MadBunny;
    const isWhiteSnake = snapshot.kind === MonsterKind.WhiteSnakeLady;
    const isFourDirAnim =
      snapshot.kind === MonsterKind.Huskar ||
      snapshot.kind === MonsterKind.HighOrc ||
      snapshot.kind === MonsterKind.Orc;
    const isPochi = snapshot.kind === MonsterKind.Pochi;
    const isSlimeAnim =
      snapshot.kind === MonsterKind.Marin ||
      snapshot.kind === MonsterKind.Magmaring ||
      snapshot.kind === MonsterKind.Poporing ||
      snapshot.kind === MonsterKind.VenomPoring;
    const isNoShadow = isSlimeAnim || isFourDirAnim || isPochi;

    super(scene, snapshot.x, snapshot.y, {
      texture: monsterTexture(snapshot.kind),
      frame: monsterInitialFrame(snapshot.kind),
      name: snapshot.name,
      nameColor: isBoss
        ? "#ff6b6b"
        : isWhiteSnake
          ? "#e2e8f0"
          : isBunny
            ? "#ffb7b2"
          : isShadow
            ? "#c084fc"
            : snapshot.kind === MonsterKind.VenomPoring
              ? "#ce93d8"
              : snapshot.kind === MonsterKind.ForestStalker
                ? "#81c784"
                : snapshot.kind === MonsterKind.Magmaring
                  ? "#ff7043"
                  : snapshot.kind === MonsterKind.Marin
                    ? "#42a5f5"
                    : snapshot.kind === MonsterKind.Poporing
                      ? "#aed581"
                      : snapshot.kind === MonsterKind.Bat
                        ? "#d8b4e2"
                        : "#c4e8a8",
      shadowWidth: isBoss ? 42 : isShadow || isWhiteSnake ? 34 : isBunny ? 28 : isSlimeAnim ? 24 : snapshot.kind === MonsterKind.Bat || snapshot.kind === MonsterKind.ForestStalker ? 18 : 20,
      shadowHeight: isBoss ? 12 : isShadow || isWhiteSnake ? 10 : isBunny ? 8 : isSlimeAnim ? 8 : 6,
      barWidth: isBoss ? 56 : isShadow || isWhiteSnake ? 44 : isBunny ? 36 : isFourDirAnim ? 36 : isPochi ? 34 : isSlimeAnim ? 32 : 28,
      barHeight: isBoss ? 6 : 4,
      barY: isBoss ? -72 : isWhiteSnake ? -86 : isShadow ? -58 : isBunny ? -50 : isPochi ? -58 : isFourDirAnim ? -48 : isSlimeAnim ? -26 : snapshot.kind === MonsterKind.Bat || snapshot.kind === MonsterKind.ForestStalker ? -26 : -20,
      nameY: isBoss ? -80 : isWhiteSnake ? -94 : isShadow ? -66 : isBunny ? -58 : isPochi ? -66 : isFourDirAnim ? -56 : isSlimeAnim ? -34 : snapshot.kind === MonsterKind.Bat || snapshot.kind === MonsterKind.ForestStalker ? -32 : -26,
    });

    this.monsterId = monsterId;
    this.snapshot = snapshot;
    this.wasAlive = snapshot.hp > 0 && snapshot.state !== MonsterStatus.Dead;
    this.sprite.setOrigin(0.5, 1);
    if (isNoShadow) {
      this.shadow.setVisible(false);
    }
    if (snapshot.kind === MonsterKind.ForestStalker) this.sprite.setTint(0x81c784);
    else if (snapshot.kind === MonsterKind.VenomPoring) this.sprite.setTint(0xce93d8);
    else if (snapshot.kind === MonsterKind.ShadowAshura) this.sprite.setTint(0x9575cd);
    this.setDepth(snapshot.y);
  }

  update(dt: number, time: number): void {
    const alive = this.snapshot.hp > 0 && this.snapshot.state !== MonsterStatus.Dead;
    const isFourDirAnim =
      this.snapshot.kind === MonsterKind.Huskar ||
      this.snapshot.kind === MonsterKind.HighOrc ||
      this.snapshot.kind === MonsterKind.Orc;
    const isPochi = this.snapshot.kind === MonsterKind.Pochi;
    const isWhiteSnake = this.snapshot.kind === MonsterKind.WhiteSnakeLady;

    if (!alive) {
      if (isWhiteSnake && this.wasAlive && !this.playingDeath && this.scene.anims.exists("white-snake-died")) {
        this.wasAlive = false;
        this.playingDeath = true;
        this.setVisible(true);
        this.hpBar?.setVisible(false);
        this.shadow.setVisible(false);
        this.sprite.setScale(0.65);
        this.sprite.setFlipX(false);
        this.sprite.play("white-snake-died");
        this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.playingDeath = false;
          this.setVisible(false);
        });
        return;
      }
      if (this.playingDeath) {
        return;
      }
      this.wasAlive = false;
      this.setVisible(false);
      return;
    }

    if (!this.wasAlive) {
      this.wasAlive = true;
      this.playingDeath = false;
      if (isWhiteSnake) {
        this.shadow.setVisible(true);
      }
    }
    this.setVisible(true);

    const distance = Phaser.Math.Distance.Between(this.x, this.y, this.snapshot.x, this.snapshot.y);
    if (distance > SNAP_DISTANCE) {
      this.setPosition(this.snapshot.x, this.snapshot.y);
    } else {
      const t = 1 - Math.exp(-dt / (REMOTE_INTERPOLATION_MS / 1000));
      this.x = Phaser.Math.Linear(this.x, this.snapshot.x, t);
      this.y = Phaser.Math.Linear(this.y, this.snapshot.y, t);
    }

    if (this.snapshot.kind === MonsterKind.BlackAshura || this.snapshot.kind === MonsterKind.ShadowAshura) {
      const baseScale = this.snapshot.kind === MonsterKind.BlackAshura ? 1.35 : 1.05;
      if (this.snapshot.state === MonsterStatus.Cast) {
        this.sprite.setScale(baseScale + 0.05);
        this.sprite.y = 25;
        const attackKey = ASHURA_ATTACK_ANIMS[this.snapshot.dir] ?? "ashura-attack-down";
        if (this.sprite.anims.currentAnim?.key !== attackKey || !this.sprite.anims.isPlaying) {
          this.sprite.play(attackKey);
        }
        const pulse = Math.floor(time * 0.012) % 2 === 0 ? 0xff7755 : 0xffcc44;
        this.sprite.setTint(pulse);
      } else if (this.snapshot.state === MonsterStatus.Attack) {
        if (this.snapshot.kind === MonsterKind.ShadowAshura) this.sprite.setTint(0x9575cd);
        else this.sprite.clearTint();
        this.sprite.setScale(baseScale);
        this.sprite.y = 25;
        const attackKey = ASHURA_ATTACK_ANIMS[this.snapshot.dir] ?? "ashura-attack-down";
        if (this.sprite.anims.currentAnim?.key !== attackKey || !this.sprite.anims.isPlaying) {
          this.sprite.play(attackKey);
        }
      } else {
        if (this.snapshot.kind === MonsterKind.ShadowAshura) this.sprite.setTint(0x9575cd);
        else this.sprite.clearTint();
        this.sprite.setScale(baseScale);
        this.sprite.y = 14;
        const animKey = ASHURA_DIR_ANIMS[this.snapshot.dir] ?? "ashura-walk-down";
        const isMoving =
          this.snapshot.state === MonsterStatus.Chase || distance > 1.5;
        if (isMoving) {
          if (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying) {
            this.sprite.play(animKey);
          }
        } else {
          this.sprite.anims.stop();
          this.setTextureSafe(animKey);
          this.sprite.setFrame(0);
        }
      }
    } else if (
      this.snapshot.kind === MonsterKind.Marin ||
      this.snapshot.kind === MonsterKind.Magmaring ||
      this.snapshot.kind === MonsterKind.Poporing ||
      this.snapshot.kind === MonsterKind.VenomPoring
    ) {
      const prefix =
        this.snapshot.kind === MonsterKind.Marin
          ? "marin"
          : this.snapshot.kind === MonsterKind.Magmaring
            ? "magmaring"
            : "poporing";
      const dirKey = DIR_KEYS[this.snapshot.dir] ?? "front";

      this.sprite.setScale(this.snapshot.kind === MonsterKind.VenomPoring ? 1.15 : 1);
      this.sprite.y = 22;

      let animKey = `${prefix}-idle-${dirKey}`;
      if (this.snapshot.state === MonsterStatus.Attack) {
        animKey = `${prefix}-attack-${dirKey}`;
      } else if (this.snapshot.state === MonsterStatus.Chase || distance > 1.5) {
        animKey = `${prefix}-walk-${dirKey}`;
      }

      if (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying) {
        this.sprite.play(animKey);
      }
    } else if (isFourDirAnim) {
      const prefix =
        this.snapshot.kind === MonsterKind.Huskar
          ? "huskar"
          : this.snapshot.kind === MonsterKind.HighOrc
            ? "highorc"
            : "orc";
      const dirKey = DIR_KEYS[this.snapshot.dir] ?? "front";
      this.sprite.setScale(1);
      this.sprite.y = 19;
      this.sprite.setFlipX(false);
      let animKey = `${prefix}-idle-${dirKey}`;
      if (this.snapshot.state === MonsterStatus.Attack) {
        animKey = `${prefix}-attack-${dirKey}`;
        if (this.scene.anims.exists(animKey) && (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying)) {
          this.sprite.play(animKey);
        }
      } else {
        if (this.snapshot.state === MonsterStatus.Chase || distance > 1.5) {
          animKey = `${prefix}-walk-${dirKey}`;
        }
        if (this.scene.anims.exists(animKey)) {
          if (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying) {
            this.sprite.play(animKey);
          }
        } else {
          this.setTextureSafe(monsterTexture(this.snapshot.kind), monsterInitialFrame(this.snapshot.kind));
        }
      }
    } else if (isPochi) {
      const dirKey = DIR_KEYS[this.snapshot.dir] ?? "front";
      this.sprite.y = 10;
      this.sprite.setFlipX(false);
      let animKey = `pochi-idle-${dirKey}`;
      if (this.snapshot.state === MonsterStatus.Attack) {
        this.sprite.setScale(1);
        if (dirKey === "left") {
          animKey = "pochi-attack-left";
        } else if (dirKey === "right") {
          animKey = "pochi-attack-right";
        } else if (dirKey === "back") {
          animKey = "pochi-attack-back";
        } else {
          animKey = "pochi-attack-front";
        }
        if (this.scene.anims.exists(animKey) && (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying)) {
          this.sprite.play(animKey);
        }
      } else {
        if (this.snapshot.state === MonsterStatus.Chase || distance > 1.5) {
          animKey = `pochi-walk-${dirKey}`;
          this.sprite.setScale(1);
        } else {
          const bob = Math.sin(time * 0.006) * 0.03;
          this.sprite.setScale(1 + bob, 1 - bob);
        }
        if (this.scene.anims.exists(animKey)) {
          if (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying) {
            this.sprite.play(animKey);
          }
        } else {
          this.setTextureSafe(monsterTexture(this.snapshot.kind), monsterInitialFrame(this.snapshot.kind));
        }
      }
    } else if (this.snapshot.kind === MonsterKind.MadBunny) {
      this.sprite.setScale(0.28);
      this.sprite.y = 4;
      const isBack = this.snapshot.dir === Direction.Up;
      this.sprite.setFlipX(this.snapshot.dir === Direction.Right);
      const facing = isBack ? "back" : "front";
      const action =
        this.snapshot.state === MonsterStatus.Attack
          ? "attack"
          : this.snapshot.state === MonsterStatus.Chase || distance > 1.5
            ? "walk"
            : "idle";
      const animKey = `mad-bunny-${action}-${facing}`;
      if (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying) {
        this.sprite.play(animKey);
      }
    } else if (isWhiteSnake) {
      this.sprite.setScale(0.65);
      this.sprite.y = 4;
      const isBack = this.snapshot.dir === Direction.Up;
      const facing = isBack ? "back" : "front";
      this.sprite.setFlipX(isBack ? this.snapshot.dir === Direction.Left : this.snapshot.dir === Direction.Right);
      const action = this.snapshot.state === MonsterStatus.Attack ? "attack" : "walk";
      const animKey = `white-snake-${action}-${facing}`;
      if (this.scene.anims.exists(animKey) && (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying)) {
        this.sprite.play(animKey);
      }
    } else if (this.snapshot.kind === MonsterKind.Bat || this.snapshot.kind === MonsterKind.ForestStalker) {
      this.setTextureSafe(monsterTexture(this.snapshot.kind));
      this.sprite.y = -4 + Math.sin(time * 0.006) * 3;
      this.shadow.setAlpha(0.18 + Math.abs(Math.sin(time * 0.006)) * 0.1);
    } else {
      this.setTextureSafe(monsterTexture(this.snapshot.kind));
      const squash = this.snapshot.state === MonsterStatus.Chase ? Math.sin(time * 0.012) * 0.08 : 0;
      this.sprite.setScale(1 + squash, 1 - squash);
    }

    this.setDisplayName(this.snapshot.name);
    this.updateHealth(this.snapshot.hp, this.snapshot.maxHp);
    this.hpBar?.setVisible(
      this.snapshot.state === MonsterStatus.Chase || this.snapshot.hp < this.snapshot.maxHp,
    );
    this.updateDepth();
  }

  private bubble?: Phaser.GameObjects.Container;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private bubbleTween?: Phaser.Tweens.Tween;

  showChatBubble(text: string, durationMs = 3800): void {
    this.bubbleTimer?.remove(false);
    this.bubbleTween?.remove();
    this.bubble?.destroy();

    const isBoss = this.snapshot.kind === MonsterKind.BlackAshura;

    const label = this.scene.add
      .text(0, 0, text, {
        fontFamily: UI_FONT,
        fontSize: isBoss ? "15px" : "13px",
        color: isBoss ? "#2a0a00" : "#1a0e09",
        align: "center",
        wordWrap: { width: isBoss ? 210 : 140, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setResolution(2);

    const bounds = label.getBounds();
    const padX = 10;
    const padY = 6;
    const boxW = Math.max(30, Math.ceil(bounds.width) + padX * 2);
    const boxH = Math.max(22, Math.ceil(bounds.height) + padY * 2);

    const bg = this.scene.add.graphics();
    if (isBoss) {
      bg.fillStyle(0xfff6ea, 0.98);
      bg.fillRoundedRect(-boxW / 2, -boxH, boxW, boxH, 6);
      bg.lineStyle(2, 0xd9381e, 1);
      bg.strokeRoundedRect(-boxW / 2, -boxH, boxW, boxH, 6);

      // Tail
      bg.fillStyle(0xfff6ea, 0.98);
      bg.fillTriangle(-5, -1, 5, -1, 0, 7);
      bg.lineStyle(2, 0xd9381e, 1);
      bg.lineBetween(-5, 0, 0, 7);
      bg.lineBetween(5, 0, 0, 7);
    } else {
      bg.fillStyle(0xfaf6e8, 0.97);
      bg.fillRoundedRect(-boxW / 2, -boxH, boxW, boxH, 5);
      bg.lineStyle(1.5, 0x1a0e09, 1);
      bg.strokeRoundedRect(-boxW / 2, -boxH, boxW, boxH, 5);

      bg.fillStyle(0xfaf6e8, 0.97);
      bg.fillTriangle(-4, -1, 4, -1, 0, 5);
      bg.lineStyle(1.5, 0x1a0e09, 1);
      bg.lineBetween(-4, 0, 0, 5);
      bg.lineBetween(4, 0, 0, 5);
    }

    label.setPosition(0, -boxH / 2);

    const isPochi = this.snapshot.kind === MonsterKind.Pochi;
    const isFourDirAnim =
      this.snapshot.kind === MonsterKind.Huskar ||
      this.snapshot.kind === MonsterKind.HighOrc ||
      this.snapshot.kind === MonsterKind.Orc;
    const bubbleY = isBoss ? -96 : isPochi ? -72 : isFourDirAnim ? -62 : -45;
    const bubble = this.scene.add.container(0, bubbleY, [bg, label]);
    bubble.setAlpha(0);
    this.add(bubble);
    this.bubble = bubble;

    this.scene.tweens.add({
      targets: bubble,
      alpha: 1,
      y: bubbleY - 6,
      duration: 150,
      ease: "Quad.easeOut",
    });

    this.bubbleTimer = this.scene.time.delayedCall(durationMs, () => {
      this.bubbleTween = this.scene.tweens.add({
        targets: bubble,
        alpha: 0,
        y: bubbleY - 14,
        duration: 300,
        ease: "Quad.easeIn",
        onComplete: () => {
          bubble.destroy();
          if (this.bubble === bubble) this.bubble = undefined;
        },
      });
    });
  }

  override destroy(fromScene?: boolean): void {
    this.bubbleTimer?.remove(false);
    this.bubbleTween?.remove();
    this.bubble?.destroy();
    super.destroy(fromScene);
  }
}
