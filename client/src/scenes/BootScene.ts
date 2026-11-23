import Phaser from "phaser";
import { SCENE_KEYS } from "../config/gameConfig";

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.Boot);
  }

  create(): void {
    this.scene.start(SCENE_KEYS.Preload);
  }
}
