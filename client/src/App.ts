import Phaser from "phaser";
import { createGameConfig } from "./config/gameConfig";
import { BootScene } from "./scenes/BootScene";
import { CharacterSelectScene } from "./scenes/CharacterSelectScene";
import { GameScene } from "./scenes/GameScene";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { UIScene } from "./scenes/UIScene";

/** Application entry point: owns the Phaser instance and scene registry. */
export class App {
  private game?: Phaser.Game;

  start(parent = "game-root"): Phaser.Game {
    if (this.game) return this.game;

    const config = createGameConfig(parent);
    config.scene = [
      BootScene,
      PreloadScene,
      MainMenuScene,
      CharacterSelectScene,
      GameScene,
      UIScene,
    ];

    this.game = new Phaser.Game(config);

    if (import.meta.env.DEV) {
      // Handy for poking at scenes/state from the browser console while
      // iterating. Stripped from production builds by Vite.
      (window as unknown as { __PIXEL_REALMS__?: Phaser.Game }).__PIXEL_REALMS__ = this.game;
    }

    return this.game;
  }

  destroy(): void {
    this.game?.destroy(true);
    this.game = undefined;
  }
}
