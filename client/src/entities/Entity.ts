import Phaser from "phaser";
import { COLORS, UI_FONT } from "../config/gameConfig";
import { HealthBar } from "../ui/HealthBar";

export interface EntityOptions {
  texture: string;
  frame?: string | number;
  originX?: number;
  originY?: number;
  shadowWidth?: number;
  shadowHeight?: number;
  showShadow?: boolean;
  name?: string;
  nameColor?: string;
  barWidth?: number;
  barHeight?: number;
  barY?: number;
  nameY?: number;
  showName?: boolean;
  showHealth?: boolean;
}

/**
 * Shared visual shell for players, monsters and NPCs: shadow, sprite, optional
 * nameplate and a compact health bar. Gameplay state lives in Colyseus schemas;
 * these classes only render it.
 */
export abstract class Entity extends Phaser.GameObjects.Container {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  protected readonly nameText?: Phaser.GameObjects.Text;
  protected readonly hpBar?: HealthBar;
  private readonly nameOffsetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, options: EntityOptions) {
    super(scene, x, y);
    this.nameOffsetY = options.nameY ?? -42;

    this.shadow = scene.add
      .image(0, -2, "shadow")
      .setDisplaySize(options.shadowWidth ?? 22, options.shadowHeight ?? 8)
      .setAlpha(0.32)
      .setVisible(options.showShadow !== false);
    this.sprite = scene.add
      .sprite(0, 0, options.texture, options.frame)
      .setOrigin(options.originX ?? 0.5, options.originY ?? 1);

    this.add([this.shadow, this.sprite]);

    if (options.showName !== false) {
      this.nameText = scene.add
        .text(x, y + this.nameOffsetY, options.name ?? "", {
          fontFamily: UI_FONT,
          fontSize: "11px",
          color: options.nameColor ?? "#f1ecd8",
          stroke: "#0b1512",
          strokeThickness: 2.5,
        })
        .setOrigin(0.5, 1)
        .setResolution(2)
        .setDepth(6000);
    }

    if (options.showHealth !== false) {
      this.hpBar = new HealthBar(scene, -(options.barWidth ?? 34) / 2, options.barY ?? -28, {
        width: options.barWidth ?? 34,
        height: options.barHeight ?? 4,
        color: COLORS.hp,
        backgroundColor: 0x1b2b22,
        borderColor: 0x0a110e,
      });
      this.add(this.hpBar);
    }

    scene.add.existing(this);
    this.setDepth(y);
  }

  setTextureSafe(key: string, frame?: string | number): void {
    if (this.scene.textures.exists(key)) {
      if (
        this.sprite.texture.key !== key ||
        (frame !== undefined && this.sprite.frame.name !== String(frame))
      ) {
        this.sprite.setTexture(key, frame);
      }
    }
  }

  setDisplayName(name: string): void {
    this.nameText?.setText(name);
  }

  flash(): void {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (this.active) this.sprite.clearTint();
    });
  }

  protected updateHealth(current: number, max: number): void {
    const alive = current > 0;
    this.hpBar?.setVisible(alive).setValue(current, max);
    if (!alive) this.sprite.setAlpha(0.35);
    else this.sprite.setAlpha(1);
  }

  override setVisible(value: boolean): this {
    super.setVisible(value);
    this.nameText?.setVisible(value);
    return this;
  }

  override destroy(fromScene?: boolean): void {
    this.nameText?.destroy();
    super.destroy(fromScene);
  }

  updateDepth(): void {
    this.setDepth(this.y + 0.1);
    this.nameText?.setPosition(this.x, this.y + this.nameOffsetY);
  }
}
