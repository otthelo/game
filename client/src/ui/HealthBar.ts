import Phaser from "phaser";
import { UI_FONT } from "../config/gameConfig";

export interface HealthBarOptions {
  width?: number;
  height?: number;
  color?: number;
  backgroundColor?: number;
  borderColor?: number;
  showText?: boolean;
  textSize?: number;
  prefix?: string;
}

/**
 * A small reusable bar for HP / XP. It can be added to entity containers or
 * placed directly on the UI scene.
 */
export class HealthBar extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly inner: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly label?: Phaser.GameObjects.Text;
  private barWidth: number;
  private readonly barHeight: number;
  private readonly color: number;
  private readonly prefix: string;
  private ratio = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, options: HealthBarOptions = {}) {
    super(scene, x, y);

    this.barWidth = options.width ?? 120;
    this.barHeight = options.height ?? 8;
    this.color = options.color ?? 0x4ec26a;
    this.prefix = options.prefix ?? "";

    this.background = scene.add
      .rectangle(0, 0, this.barWidth + 2, this.barHeight + 2, options.borderColor ?? 0x0b1512)
      .setOrigin(0, 0.5);
    this.inner = scene.add
      .rectangle(1, 0, this.barWidth, this.barHeight, options.backgroundColor ?? 0x1f3326)
      .setOrigin(0, 0.5);
    this.fill = scene.add.rectangle(1, 0, this.barWidth, this.barHeight, this.color).setOrigin(0, 0.5);

    this.add([this.background, this.inner, this.fill]);

    if (options.showText) {
      this.label = scene.add
        .text(this.barWidth / 2, 0, "", {
          fontFamily: UI_FONT,
          fontSize: `${options.textSize ?? 16}px`,
          color: "#ffffff",
          stroke: "#1a0e09",
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      this.add(this.label);
    }

    scene.add.existing(this);
  }

  setValue(current: number, max: number): this {
    this.ratio = max <= 0 ? 0 : Phaser.Math.Clamp(current / max, 0, 1);
    this.fill.displayWidth = Math.max(0, this.barWidth * this.ratio);
    this.fill.setVisible(this.ratio > 0);
    this.label?.setText(`${this.prefix}${Math.max(0, Math.ceil(current))}/${Math.ceil(max)}`);
    return this;
  }

  setBarWidth(width: number): this {
    this.barWidth = Math.max(10, width);
    this.background.setSize(this.barWidth + 2, this.barHeight + 2);
    this.inner.setSize(this.barWidth, this.barHeight);
    this.fill.displayWidth = Math.max(0, this.barWidth * this.ratio);
    this.fill.setVisible(this.ratio > 0);
    this.label?.setX(this.barWidth / 2);
    return this;
  }

  setColor(color: number): this {
    this.fill.setFillStyle(color);
    return this;
  }

  setBarVisible(visible: boolean): this {
    this.setVisible(visible);
    return this;
  }
}
