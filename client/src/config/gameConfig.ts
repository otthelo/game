import Phaser from "phaser";

/** Networking and gameplay constants shared by all client code. */
const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();

/**
 * Dev uses the Colyseus port directly. Production builds default to the page
 * origin so the client works unchanged behind a reverse proxy, LAN address or
 * public tunnel.
 */
export const SERVER_URL =
  configuredServerUrl ||
  (import.meta.env.DEV ? "http://localhost:2567" : window.location.origin);
export const ROOM_NAME = "game_room";

/** Must match the server simulation tick rate. */
export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

export const PLAYER_SPEED = 140;
export const PLAYER_RADIUS = 9;

/** Time constant used to smooth reconciliation / remote interpolation. */
export const CORRECTION_MS = 80;
export const REMOTE_INTERPOLATION_MS = 90;
export const SNAP_DISTANCE = 96;

export const CAMERA_ZOOM = 2;
export const CAMERA_LERP = 0.25;

export const ATTACK_COOLDOWN_MS = 450;
export const ATTACK_ANIMATION_MS = 160;

export const CHAT_MAX_LENGTH = 120;
export const NAME_MAX_LENGTH = 16;

export const SCENE_KEYS = {
  Boot: "BootScene",
  Preload: "PreloadScene",
  MainMenu: "MainMenuScene",
  CharacterSelect: "CharacterSelectScene",
  Game: "GameScene",
  UI: "UIScene",
} as const;

export const BLOCKED_TILES = new Set(["#", "~", "R"]);

export const COLORS = {
  ink: 0x0c1414,
  paper: 0xf1ecd8,
  grass: 0x4f8a3d,
  grassDark: 0x3e7032,
  path: 0x9a7b4f,
  water: 0x2e6f8e,
  waterLight: 0x3d8aa8,
  gold: 0xf4c95d,
  hp: 0x4ec26a,
  hpDark: 0x1f6b35,
  xp: 0x62a8ff,
  danger: 0xd9534f,
  panel: 0x0b1512,
  white: 0xffffff,
} as const;

export const UI_FONT = '"VT323", "Courier New", monospace';
export const TITLE_FONT = '"Press Start 2P", "Courier New", monospace';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth || 1280,
    height: window.innerHeight || 720,
    backgroundColor: "#081010",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    powerPreference: "high-performance",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      keyboard: true,
      mouse: true,
      touch: true,
      activePointers: 3,
    },
    // Scenes are registered here; gameplay code lives in ./scenes.
    scene: [],
  };
}
