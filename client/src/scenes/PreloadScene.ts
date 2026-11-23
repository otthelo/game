import Phaser from "phaser";
import { SCENE_KEYS, TITLE_FONT, UI_FONT } from "../config/gameConfig";

type Outfit = {
  shirt: number;
  shirtDark: number;
  pants: number;
  hair: number;
};

const OUTFITS: Outfit[] = [
  { shirt: 0x4d7ecb, shirtDark: 0x355a96, pants: 0x2d3d5c, hair: 0x4a2f1d },
  { shirt: 0xc0564f, shirtDark: 0x8f3a36, pants: 0x3f3030, hair: 0x2d2119 },
  { shirt: 0x5a9e62, shirtDark: 0x3e7447, pants: 0x3a352c, hair: 0x7a512c },
];

const SKIN = 0xf0c090;
const SKIN_SHADOW = 0xcf9a6c;
const OUTLINE = 0x1a2220;
const BOOT = 0x2a211c;

/** Deterministic pseudo-random so regenerated textures look identical. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * All art in this starter is generated at runtime, so the project runs with
 * zero downloads. Drop real spritesheets into public/assets/sprites later and
 * replace the generated keys in PreloadScene/Player/Monster.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.Preload);
  }

  preload(): void {
    this.load.image("tileset-overworld", "assets/tilesets/overworld.png");
    this.load.tilemapTiledJSON("map-hollowed-forest", "assets/maps/hollowed_forest.json");
    this.load.image("tileset-gentle-forest", "assets/tilesets/gentle_forest_v01.png");
    this.load.image("tileset-gentle-tree-wall", "assets/tilesets/gentle_tree_wall.png");
    this.load.image("tileset-adventurers-guild", "assets/tilesets/adventurers_guild.png");
    this.load.image("tileset-orc-castle-building", "assets/tilesets/orc_castle.png");
    this.load.tilemapTiledJSON("map-adventure-guild-forest", "assets/maps/adventure_guild_forest.json");
    this.load.image("tileset-atlas-16x", "assets/tilesets/atlas_16x.png");
    this.load.tilemapTiledJSON("map-adventure-guild", "assets/maps/adventure_guild.json");
    this.load.tilemapTiledJSON("map-orc-castle", "assets/maps/orc_castle.json");
    this.load.image("tileset-orc-coasts", "assets/tilesets/orc_castle/decorative_cracks_coasts_animation.png");
    this.load.image("tileset-orc-floor", "assets/tilesets/orc_castle/decorative_cracks_floor.png");
    this.load.image("tileset-orc-walls", "assets/tilesets/orc_castle/decorative_cracks_walls.png");
    this.load.image("tileset-orc-doors", "assets/tilesets/orc_castle/doors_lever_chest_animation.png");
    this.load.image("tileset-orc-objects", "assets/tilesets/orc_castle/Objects.png");
    this.load.image("tileset-orc-fire", "assets/tilesets/orc_castle/fire_animation.png");
    this.load.image("tileset-orc-walls-floor", "assets/tilesets/orc_castle/walls_floor.png");
    this.load.atlas("portal", "assets/sprites/portal.png", "assets/sprites/portal.json");

    // Mad Bunny spritesheets (169x201 per frame)
    this.load.spritesheet("mad-bunny-idle-front", "assets/sprites/mad-bunny/idle-front.png", {
      frameWidth: 169,
      frameHeight: 201,
    });
    this.load.spritesheet("mad-bunny-idle-back", "assets/sprites/mad-bunny/idle-back.png", {
      frameWidth: 169,
      frameHeight: 201,
    });
    this.load.spritesheet("mad-bunny-walk-front", "assets/sprites/mad-bunny/walk-front.png", {
      frameWidth: 169,
      frameHeight: 201,
    });
    this.load.spritesheet("mad-bunny-walk-back", "assets/sprites/mad-bunny/walk-back.png", {
      frameWidth: 169,
      frameHeight: 201,
    });
    this.load.spritesheet("mad-bunny-attack-front", "assets/sprites/mad-bunny/attack-front.png", {
      frameWidth: 169,
      frameHeight: 201,
    });
    this.load.spritesheet("mad-bunny-attack-back", "assets/sprites/mad-bunny/attack-back.png", {
      frameWidth: 169,
      frameHeight: 201,
    });
    // White Snake Lady spritesheets
    this.load.spritesheet("white-snake-walk-front", "assets/sprites/white-snake-lady/walk-front.png", {
      frameWidth: 89,
      frameHeight: 122,
    });
    this.load.spritesheet("white-snake-walk-back", "assets/sprites/white-snake-lady/walk-back.png", {
      frameWidth: 73,
      frameHeight: 119,
    });
    this.load.spritesheet("white-snake-attack-front", "assets/sprites/white-snake-lady/attack-front.png", {
      frameWidth: 193,
      frameHeight: 196,
    });
    this.load.spritesheet("white-snake-attack-back", "assets/sprites/white-snake-lady/attack-back.png", {
      frameWidth: 225,
      frameHeight: 123,
    });
    this.load.spritesheet("white-snake-died", "assets/sprites/white-snake-lady/died.png", {
      frameWidth: 129,
      frameHeight: 174,
    });
    this.load.spritesheet("fx-magnum-break", "assets/sprites/effects/magnum-break.png", {
      frameWidth: 128,
      frameHeight: 96,
    });
    this.load.image("login-bg", "assets/ui/login-bg-1920.png");
    this.load.image("login-button-blank", "assets/ui/login-button-blank.png");
    this.load.image("menu-status", "assets/ui/menu-status.png");
    this.load.image("menu-equipment", "assets/ui/menu-equipment.png");
    this.load.image("menu-skill", "assets/ui/menu-skill.png");
    this.load.image("menu-inventory", "assets/ui/menu-inventory.png");
    this.load.image("menu-setting", "assets/ui/menu-setting.png");
    this.load.image("menu-job", "assets/ui/menu-job.png");
    this.load.image("menu-party", "assets/ui/menu-party.png");
    this.load.image("menu-quest", "assets/ui/menu-quest.png");
    this.load.image("skill-magnum-break", "assets/ui/skill-magnum-break.png");
    this.load.image("skill-rebahan", "assets/ui/skill-rebahan.png");
    this.load.image("skill-baledog", "assets/ui/skill-baledog.png");
    this.load.image("item-potion-red", "assets/ui/item-health-potion.png");
    this.load.image("item-potion-blue", "assets/ui/item-greater-potion.png");

    this.load.spritesheet("ashura-walk-down", "assets/sprites/ashura-walk-down.png", {
      frameWidth: 68,
      frameHeight: 68,
    });
    this.load.spritesheet("ashura-walk-up", "assets/sprites/ashura-walk-up.png", {
      frameWidth: 68,
      frameHeight: 68,
    });
    this.load.spritesheet("ashura-walk-left", "assets/sprites/ashura-walk-left.png", {
      frameWidth: 68,
      frameHeight: 68,
    });
    this.load.spritesheet("ashura-walk-right", "assets/sprites/ashura-walk-right.png", {
      frameWidth: 68,
      frameHeight: 68,
    });

    this.load.spritesheet("ashura-attack-down", "assets/sprites/ashura-attack-South.png", {
      frameWidth: 80,
      frameHeight: 80,
    });
    this.load.spritesheet("ashura-attack-up", "assets/sprites/ashura-attack-North.png", {
      frameWidth: 80,
      frameHeight: 80,
    });
    this.load.spritesheet("ashura-attack-left", "assets/sprites/ashura-attack-West.png", {
      frameWidth: 80,
      frameHeight: 80,
    });
    this.load.spritesheet("ashura-attack-right", "assets/sprites/ashura-attack-East.png", {
      frameWidth: 80,
      frameHeight: 80,
    });

    this.load.spritesheet("wing-front", "assets/sprites/wing-front.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("wing-side", "assets/sprites/wing-side.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("wing-back", "assets/sprites/wing-back.png", {
      frameWidth: 64,
      frameHeight: 64,
    });

    // Black Ashura Skill Effects
    this.load.spritesheet("ashura-skill-hit", "assets/sprites/ashura_skill_hit.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("ashura-skill-aoe", "assets/sprites/ashura_skill_aoe.png", {
      frameWidth: 80,
      frameHeight: 80,
    });

    // ==========================================
    // Monster Atlases (Magmaring, Marin, Poporing)
    // ==========================================
    const slimeMonsters = [
      { name: "magmaring", filePrefix: "Magmaring" },
      { name: "marin", filePrefix: "Marin" },
      { name: "poporing", filePrefix: "Poporing" },
    ];
    const monsterActions = ["Attack", "Death", "Hurt", "Idle", "Walk"];
    const monsterDirs = ["back", "front", "left", "right"];

    for (const monster of slimeMonsters) {
      for (const action of monsterActions) {
        for (const dir of monsterDirs) {
          const key = `${monster.name}-${action.toLowerCase()}-${dir}`;
          this.load.atlas(
            key,
            `assets/sprites/monster/${monster.filePrefix}_${action}_${dir}.png`,
            `assets/sprites/monster/${monster.filePrefix}_${action}_${dir}.json`,
          );
        }
      }
    }

    const fourDirMonsters = [
      { name: "huskar", folder: "Huskar", filePrefix: "Huskar" },
      { name: "highorc", folder: "High_Orc", filePrefix: "High_Orc" },
      { name: "orc", folder: "Orc", filePrefix: "orc" },
    ];
    for (const monster of fourDirMonsters) {
      for (const action of monsterActions) {
        for (const dir of monsterDirs) {
          const key = `${monster.name}-${action.toLowerCase()}-${dir}`;
          this.load.atlas(
            key,
            `assets/sprites/monster/${monster.folder}/${monster.filePrefix}_${dir}_${action.toLowerCase()}.png`,
            `assets/sprites/monster/${monster.folder}/${monster.filePrefix}_${dir}_${action.toLowerCase()}.json`,
          );
        }
      }
    }

    for (const dir of ["back", "front", "left", "right"]) {
      this.load.atlas(
        `pochi-idle-${dir}`,
        `assets/sprites/monster/Pochi/Pochi_iddle_${dir}.png`,
        `assets/sprites/monster/Pochi/Pochi_iddle_${dir}.json`,
      );
      this.load.atlas(
        `pochi-walk-${dir}`,
        `assets/sprites/monster/Pochi/pochi_walk_${dir}.png`,
        `assets/sprites/monster/Pochi/pochi_walk_${dir}.json`,
      );
    }
    this.load.atlas(
      "pochi-attack-back",
      "assets/sprites/monster/Pochi/pochi_attack_back.png",
      "assets/sprites/monster/Pochi/pochi_attack_back.json",
    );
    this.load.atlas(
      "pochi-attack-right",
      "assets/sprites/monster/Pochi/Pochi_attack_right.png",
      "assets/sprites/monster/Pochi/Pochi_attack_right.json",
    );
    this.load.atlas(
      "pochi-attack-left",
      "assets/sprites/monster/Pochi/Pochi_attack_left.png",
      "assets/sprites/monster/Pochi/Pochi_attack_left.json",
    );
    this.load.atlas(
      "pochi-attack-front",
      "assets/sprites/monster/Pochi/pochi_attack_back.png",
      "assets/sprites/monster/Pochi/pochi_attack_back.json",
    );
    for (const dir of ["back", "front"]) {
      this.load.atlas(
        `pochi-hurt-${dir}`,
        `assets/sprites/monster/Pochi/Pochi_hurt_${dir}.png`,
        `assets/sprites/monster/Pochi/Pochi_hurt_${dir}.json`,
      );
      this.load.atlas(
        `pochi-death-${dir}`,
        `assets/sprites/monster/Pochi/Pochi_death_${dir}.png`,
        `assets/sprites/monster/Pochi/Pochi_death_${dir}.json`,
      );
    }
    for (const dir of ["left", "right"]) {
      this.load.atlas(
        `pochi-hurt-${dir}`,
        `assets/sprites/monster/Pochi/Pochi_hurt_front.png`,
        `assets/sprites/monster/Pochi/Pochi_hurt_front.json`,
      );
      this.load.atlas(
        `pochi-death-${dir}`,
        `assets/sprites/monster/Pochi/Pochi_death_front.png`,
        `assets/sprites/monster/Pochi/Pochi_death_front.json`,
      );
    }

    // ==========================================
    // Novice Atlases
    // ==========================================
    this.load.atlas(
      "novice-walk-front",
      "assets/sprites/Novice_Walk_front.png",
      "assets/sprites/Novice_Walk_front.json",
    );
    this.load.atlas(
      "novice-walk-back",
      "assets/sprites/Novice_Walk_back.png",
      "assets/sprites/Novice_Walk_back.json",
    );
    this.load.atlas(
      "novice-walk-side-left",
      "assets/sprites/Novice_Walk_side_left.png",
      "assets/sprites/Novice_Walk_side_left.json",
    );
    this.load.atlas(
      "novice-walk-side-right",
      "assets/sprites/Novice_Walk_side_right.png",
      "assets/sprites/Novice_Walk_side_right.json",
    );

    this.load.atlas(
      "novice-attack-front",
      "assets/sprites/Novice_attack_front.png",
      "assets/sprites/Novice_attack_front.json",
    );
    this.load.atlas(
      "novice-attack-back",
      "assets/sprites/Novice_attack_back.png",
      "assets/sprites/Novice_attack_back.json",
    );
    this.load.atlas(
      "novice-attack-side-left",
      "assets/sprites/Novice_attack_side_left.png",
      "assets/sprites/Novice_attack_side_left.json",
    );
    this.load.atlas(
      "novice-attack-side-right",
      "assets/sprites/Novice_attack_side_right.png",
      "assets/sprites/Novice_attack_side_right.json",
    );

    this.load.atlas(
      "novice-idle-front",
      "assets/sprites/Novice_Idle_front.png",
      "assets/sprites/Novice_Idle_front.json",
    );
    this.load.atlas(
      "novice-idle-back",
      "assets/sprites/Novice_Idle_back.png",
      "assets/sprites/Novice_Idle_back.json",
    );
    this.load.atlas(
      "novice-idle-side-left",
      "assets/sprites/Novice_Idle_side_left.png",
      "assets/sprites/Novice_Idle_side_left.json",
    );
    this.load.atlas(
      "novice-idle-side-right",
      "assets/sprites/Novice_Idle_side_right.png",
      "assets/sprites/Novice_Idle_side_right.json",
    );

    this.load.atlas(
      "novice-hurt-front",
      "assets/sprites/Novice_Hurt_front.png",
      "assets/sprites/Novice_Hurt_front.json",
    );
    this.load.atlas(
      "novice-hurt-back",
      "assets/sprites/Novice_Hurt_back.png",
      "assets/sprites/Novice_Hurt_back.json",
    );
    this.load.atlas(
      "novice-hurt-side-left",
      "assets/sprites/Novice_Hurt_side_left.png",
      "assets/sprites/Novice_Hurt_side_left.json",
    );
    this.load.atlas(
      "novice-hurt-side-right",
      "assets/sprites/Novice_Hurt_side_right.png",
      "assets/sprites/Novice_Hurt_side_right.json",
    );

    this.load.atlas(
      "novice-death-front",
      "assets/sprites/Novice_Death_front.png",
      "assets/sprites/Novice_Death_front.json",
    );
    this.load.atlas(
      "novice-death-back",
      "assets/sprites/Novice_Death_back.png",
      "assets/sprites/Novice_Death_back.json",
    );
    this.load.atlas(
      "novice-death-side-left",
      "assets/sprites/Novice_Death_side_left.png",
      "assets/sprites/Novice_Death_side_left.json",
    );
    this.load.atlas(
      "novice-death-side-right",
      "assets/sprites/Novice_Death_side_right.png",
      "assets/sprites/Novice_Death_side_right.json",
    );

    // ==========================================
    // Swordsman Atlases
    // ==========================================
    this.load.atlas(
      "swordsman-walk-front",
      "assets/sprites/Swordsman_Walk_front.png",
      "assets/sprites/Swordsman_Walk_front.json",
    );
    this.load.atlas(
      "swordsman-walk-back",
      "assets/sprites/Swordsman_Walk_back.png",
      "assets/sprites/Swordsman_Walk_back.json",
    );
    this.load.atlas(
      "swordsman-walk-side-left",
      "assets/sprites/Swordsman_Walk_side_left.png",
      "assets/sprites/Swordsman_Walk_side_left.json",
    );
    this.load.atlas(
      "swordsman-walk-side-right",
      "assets/sprites/Swordsman_Walk_side_right.png",
      "assets/sprites/Swordsman_Walk_side_right.json",
    );

    this.load.atlas(
      "swordsman-attack-front",
      "assets/sprites/Swordsman_attack_front.png",
      "assets/sprites/Swordsman_attack_front.json",
    );
    this.load.atlas(
      "swordsman-attack-back",
      "assets/sprites/Swordsman_attack_back.png",
      "assets/sprites/Swordsman_attack_back.json",
    );
    this.load.atlas(
      "swordsman-attack-side-left",
      "assets/sprites/Swordsman_attack_side_left.png",
      "assets/sprites/Swordsman_attack_side_left.json",
    );

    // Idle
    this.load.atlas(
      "swordsman-idle-front",
      "assets/sprites/Swordsman_Idle_front.png",
      "assets/sprites/Swordsman_Idle_front.json",
    );
    this.load.atlas(
      "swordsman-idle-back",
      "assets/sprites/Swordsman_Idle_back.png",
      "assets/sprites/Swordsman_Idle_back.json",
    );
    this.load.atlas(
      "swordsman-idle-side-left",
      "assets/sprites/Swordsman_Idle_side_left.png",
      "assets/sprites/Swordsman_Idle_side_left.json",
    );
    this.load.atlas(
      "swordsman-idle-side-right",
      "assets/sprites/Swordsman_Idle_side_right.png",
      "assets/sprites/Swordsman_Idle_side_right.json",
    );

    // Hurt
    this.load.atlas(
      "swordsman-hurt-front",
      "assets/sprites/Swordsman_Hurt_front.png",
      "assets/sprites/Swordsman_Hurt_front.json",
    );
    this.load.atlas(
      "swordsman-hurt-back",
      "assets/sprites/Swordsman_Hurt_back.png",
      "assets/sprites/Swordsman_Hurt_back.json",
    );
    this.load.atlas(
      "swordsman-hurt-side-left",
      "assets/sprites/Swordsman_Hurt_side_left.png",
      "assets/sprites/Swordsman_Hurt_side_left.json",
    );
    this.load.atlas(
      "swordsman-hurt-side-right",
      "assets/sprites/Swordsman_Hurt_side_right.png",
      "assets/sprites/Swordsman_Hurt_side_right.json",
    );

    // Death
    this.load.atlas(
      "swordsman-death-front",
      "assets/sprites/Swordsman_Death_front.png",
      "assets/sprites/Swordsman_Death_front.json",
    );
    this.load.atlas(
      "swordsman-death-back",
      "assets/sprites/Swordsman_Death_back.png",
      "assets/sprites/Swordsman_Death_back.json",
    );
    this.load.atlas(
      "swordsman-death-side-left",
      "assets/sprites/Swordsman_Death_side_left.png",
      "assets/sprites/Swordsman_Death_side_left.json",
    );
    this.load.atlas(
      "swordsman-death-side-right",
      "assets/sprites/Swordsman_Death_side_right.png",
      "assets/sprites/Swordsman_Death_side_right.json",
    );

    // ==========================================
    // Cloak (Garment) Atlases
    // ==========================================
    const cloakDirs = ["back", "front", "left", "right"];
    const cloakActions = ["attack", "death", "idle", "walk"];
    for (const d of cloakDirs) {
      for (const a of cloakActions) {
        this.load.atlas(
          `cloak-${d}-${a}`,
          `assets/sprites/Item/Cloak_${d}_${a}.png`,
          `assets/sprites/Item/Cloak_${d}_${a}.json`,
        );
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#081010");
    const label = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "FORGING THE WORLD...", {
        fontFamily: TITLE_FONT,
        fontSize: "16px",
        color: "#f4c95d",
      })
      .setOrigin(0.5);

    // Let the browser paint the loading text before the synchronous texture work.
    this.time.delayedCall(30, () => {
      this.generateGroundTextures();
      this.generatePropTextures();
      this.generateCharacterTextures();
      this.generateMonsterTextures();
      this.generateEffects();
      this.generateItemIcons();
      this.createPlayerAnimations();
      this.createBossAnimations();
      this.createWingAnimations();
      this.createCloakAnimations();
      this.createMonsterAnimations();
      if (this.textures.exists("portal") && !this.anims.exists("portal-spin")) {
        this.anims.create({
          key: "portal-spin",
          frames: this.anims.generateFrameNames("portal", {
            prefix: "1 ",
            suffix: ".gif",
            start: 0,
            end: 8,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }

      label.destroy();
      this.scene.start(SCENE_KEYS.MainMenu);
    });
  }

  private graphics(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 });
  }

  private createBossAnimations(): void {
    const walkKeys = [
      "ashura-walk-down",
      "ashura-walk-left",
      "ashura-walk-right",
      "ashura-walk-up",
    ];
    for (const key of walkKeys) {
      if (this.anims.exists(key) || !this.textures.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    const attackKeys = [
      "ashura-attack-down",
      "ashura-attack-left",
      "ashura-attack-right",
      "ashura-attack-up",
    ];
    for (const key of attackKeys) {
      if (this.anims.exists(key) || !this.textures.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: 6 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    if (!this.anims.exists("ashura-skill-aoe-anim") && this.textures.exists("ashura-skill-aoe")) {
      this.anims.create({
        key: "ashura-skill-aoe-anim",
        frames: this.anims.generateFrameNumbers("ashura-skill-aoe", { start: 0, end: 4 }),
        frameRate: 10,
        repeat: 0,
      });
    }

    if (!this.anims.exists("ashura-skill-hit-anim") && this.textures.exists("ashura-skill-hit")) {
      this.anims.create({
        key: "ashura-skill-hit-anim",
        frames: this.anims.generateFrameNumbers("ashura-skill-hit", { start: 0, end: 9 }),
        frameRate: 14,
        repeat: 0,
      });
    }
  }

  private createWingAnimations(): void {
    const configs = [
      { key: "wing-front", end: 3, fps: 8 },
      { key: "wing-back", end: 3, fps: 8 },
      { key: "wing-side", end: 4, fps: 10 },
    ];
    for (const { key, end, fps } of configs) {
      if (this.anims.exists(key) || !this.textures.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end }),
        frameRate: fps,
        repeat: -1,
      });
    }
  }

  private createCloakAnimations(): void {
    // Walk animations (6 frames: 0..5, 10 fps)
    const cloakWalk = [
      { key: "down", atlas: "cloak-front-walk", prefix: "orc3_front_walk " },
      { key: "up", atlas: "cloak-back-walk", prefix: "orc3_back_walk " },
      { key: "left", atlas: "cloak-left-walk", prefix: "orc3_left_walk " },
      { key: "right", atlas: "cloak-right-walk", prefix: "orc3_right_walk " },
    ];
    for (const { key, atlas, prefix } of cloakWalk) {
      if (this.textures.exists(atlas) && !this.anims.exists(`cloak-walk-${key}`)) {
        this.anims.create({
          key: `cloak-walk-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 5,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }
    }

    // Idle animations (4 frames: 0..3, 6 fps)
    const cloakIdle = [
      { key: "down", atlas: "cloak-front-idle", prefix: "orc3_front_idle " },
      { key: "up", atlas: "cloak-back-idle", prefix: "orc3_back_idle " },
      { key: "left", atlas: "cloak-left-idle", prefix: "orc3_left_idle " },
      { key: "right", atlas: "cloak-right-idle", prefix: "orc3_right_idle " },
    ];
    for (const { key, atlas, prefix } of cloakIdle) {
      if (this.textures.exists(atlas) && !this.anims.exists(`cloak-idle-${key}`)) {
        this.anims.create({
          key: `cloak-idle-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 3,
          }),
          frameRate: 6,
          repeat: -1,
        });
      }
    }

    // Attack animations (8 frames: 0..7, 18 fps)
    const cloakAttack = [
      { key: "down", atlas: "cloak-front-attack", prefix: "orc3_front_attack " },
      { key: "up", atlas: "cloak-back-attack", prefix: "orc3_back_attack " },
      { key: "left", atlas: "cloak-left-attack", prefix: "orc3_left_attack " },
      { key: "right", atlas: "cloak-right-attack", prefix: "orc3_right_attack " },
    ];
    for (const { key, atlas, prefix } of cloakAttack) {
      if (this.textures.exists(atlas) && !this.anims.exists(`cloak-attack-${key}`)) {
        this.anims.create({
          key: `cloak-attack-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 7,
          }),
          frameRate: 18,
          repeat: 0,
        });
      }
    }

    // Death animations (8 frames: 0..7, 10 fps)
    const cloakDeath = [
      { key: "down", atlas: "cloak-front-death", prefix: "orc3_front_death " },
      { key: "up", atlas: "cloak-back-death", prefix: "orc3_back_death " },
      { key: "left", atlas: "cloak-left-death", prefix: "orc3_left_death " },
      { key: "right", atlas: "cloak-right-death", prefix: "orc3_right_death " },
    ];
    for (const { key, atlas, prefix } of cloakDeath) {
      if (this.textures.exists(atlas) && !this.anims.exists(`cloak-death-${key}`)) {
        this.anims.create({
          key: `cloak-death-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 7,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }
    }
  }

  private createMonsterAnimations(): void {
    const slimeMonsters = [
      { name: "magmaring", animPrefix: "Slime3", attackFrames: 9 },
      { name: "marin", animPrefix: "Slime2", attackFrames: 11 },
      { name: "poporing", animPrefix: "Slime1", attackFrames: 10 },
    ];

    const dirs = ["back", "front", "left", "right"];

    for (const m of slimeMonsters) {
      for (const dir of dirs) {
        // Idle (6 frames: 0..5, 8 fps, repeat -1)
        const idleKey = `${m.name}-idle-${dir}`;
        if (this.textures.exists(idleKey) && !this.anims.exists(idleKey)) {
          this.anims.create({
            key: idleKey,
            frames: this.anims.generateFrameNames(idleKey, {
              prefix: `${m.animPrefix}_Idle_${dir} `,
              suffix: ".aseprite",
              start: 0,
              end: 5,
            }),
            frameRate: 8,
            repeat: -1,
          });
        }

        // Walk (8 frames: 0..7, 10 fps, repeat -1)
        const walkKey = `${m.name}-walk-${dir}`;
        if (this.textures.exists(walkKey) && !this.anims.exists(walkKey)) {
          this.anims.create({
            key: walkKey,
            frames: this.anims.generateFrameNames(walkKey, {
              prefix: `${m.animPrefix}_Walk_${dir} `,
              suffix: ".aseprite",
              start: 0,
              end: 7,
            }),
            frameRate: 10,
            repeat: -1,
          });
        }

        // Attack (0..attackFrames - 1, 12 fps, repeat 0)
        const attackKey = `${m.name}-attack-${dir}`;
        if (this.textures.exists(attackKey) && !this.anims.exists(attackKey)) {
          this.anims.create({
            key: attackKey,
            frames: this.anims.generateFrameNames(attackKey, {
              prefix: `${m.animPrefix}_Attack_${dir} `,
              suffix: ".aseprite",
              start: 0,
              end: m.attackFrames - 1,
            }),
            frameRate: 12,
            repeat: 0,
          });
        }

        // Hurt (5 frames: 0..4, 10 fps, repeat 0)
        const hurtKey = `${m.name}-hurt-${dir}`;
        if (this.textures.exists(hurtKey) && !this.anims.exists(hurtKey)) {
          this.anims.create({
            key: hurtKey,
            frames: this.anims.generateFrameNames(hurtKey, {
              prefix: `${m.animPrefix}_Hurt_${dir} `,
              suffix: ".aseprite",
              start: 0,
              end: 4,
            }),
            frameRate: 10,
            repeat: 0,
          });
        }

        // Death (10 frames: 0..9, 10 fps, repeat 0)
        const deathKey = `${m.name}-death-${dir}`;
        if (this.textures.exists(deathKey) && !this.anims.exists(deathKey)) {
          this.anims.create({
            key: deathKey,
            frames: this.anims.generateFrameNames(deathKey, {
              prefix: `${m.animPrefix}_Death_${dir} `,
              suffix: ".aseprite",
              start: 0,
              end: 9,
            }),
            frameRate: 10,
            repeat: 0,
          });
        }
      }
    }

    const fourDirMonsters = [
      { name: "huskar", animPrefix: "Huskar" },
      { name: "highorc", animPrefix: "High_Orc" },
      { name: "orc", animPrefix: "orc1" },
    ];
    for (const m of fourDirMonsters) {
      for (const dir of dirs) {
        for (const action of [
          { name: "idle", frameRate: 8, repeat: -1 },
          { name: "walk", frameRate: 10, repeat: -1 },
          { name: "attack", frameRate: 12, repeat: 0 },
          { name: "hurt", frameRate: 10, repeat: 0 },
          { name: "death", frameRate: 10, repeat: 0 },
        ]) {
          const animKey = `${m.name}-${action.name}-${dir}`;
          if (this.textures.exists(animKey) && !this.anims.exists(animKey)) {
            const frameNames = this.textures
              .get(animKey)
              .getFrameNames()
              .filter((frameName) => frameName !== "__BASE")
              .sort((a, b) => {
                const aIndex = Number(a.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
                const bIndex = Number(b.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
                return aIndex - bIndex;
              });
            if (frameNames.length > 0) {
              this.anims.create({
                key: animKey,
                frames: frameNames.map((frame) => ({ key: animKey, frame })),
                frameRate: action.frameRate,
                repeat: action.repeat,
              });
            }
          }
        }
      }
    }

    // Pochi Idle & Walk (4 directions)
    for (const dir of dirs) {
      const idleKey = `pochi-idle-${dir}`;
      if (this.textures.exists(idleKey) && !this.anims.exists(idleKey)) {
        const frameNames = this.textures
          .get(idleKey)
          .getFrameNames()
          .filter((frameName) => frameName !== "__BASE")
          .sort((a, b) => {
            const aIndex = Number(a.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            const bIndex = Number(b.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            return aIndex - bIndex;
          });
        if (frameNames.length > 0) {
          this.anims.create({
            key: idleKey,
            frames: frameNames.map((frame) => ({ key: idleKey, frame })),
            frameRate: 6,
            repeat: -1,
          });
        }
      }

      const walkKey = `pochi-walk-${dir}`;
      if (this.textures.exists(walkKey)) {
        const frameNames = this.textures
          .get(walkKey)
          .getFrameNames()
          .filter((frameName) => frameName !== "__BASE")
          .sort((a, b) => {
            const aIndex = Number(a.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            const bIndex = Number(b.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            return aIndex - bIndex;
          });
        if (!this.anims.exists(walkKey) && frameNames.length > 0) {
          this.anims.create({
            key: walkKey,
            frames: frameNames.map((frame) => ({ key: walkKey, frame })),
            frameRate: 10,
            repeat: -1,
          });
        }
        if (!this.anims.exists(idleKey) && frameNames.length > 0) {
          this.anims.create({
            key: idleKey,
            frames: [{ key: walkKey, frame: frameNames[0] }],
            frameRate: 6,
            repeat: -1,
          });
        }
      }
    }

    // Pochi Attack (4 directions)
    for (const dir of dirs) {
      const attackKey = `pochi-attack-${dir}`;
      if (this.textures.exists(attackKey) && !this.anims.exists(attackKey)) {
        const frameNames = this.textures
          .get(attackKey)
          .getFrameNames()
          .filter((frameName) => frameName !== "__BASE")
          .sort((a, b) => {
            const aIndex = Number(a.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            const bIndex = Number(b.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            return aIndex - bIndex;
          });
        if (frameNames.length > 0) {
          this.anims.create({
            key: attackKey,
            frames: frameNames.map((frame) => ({ key: attackKey, frame })),
            frameRate: 12,
            repeat: 0,
          });
        }
      }
    }

    // Pochi Hurt & Death (4 directions)
    for (const dir of dirs) {
      const hurtKey = `pochi-hurt-${dir}`;
      if (this.textures.exists(hurtKey) && !this.anims.exists(hurtKey)) {
        const frameNames = this.textures
          .get(hurtKey)
          .getFrameNames()
          .filter((frameName) => frameName !== "__BASE")
          .sort((a, b) => {
            const aIndex = Number(a.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            const bIndex = Number(b.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            return aIndex - bIndex;
          });
        if (frameNames.length > 0) {
          this.anims.create({
            key: hurtKey,
            frames: frameNames.map((frame) => ({ key: hurtKey, frame })),
            frameRate: 10,
            repeat: 0,
          });
        }
      }
      const deathKey = `pochi-death-${dir}`;
      if (this.textures.exists(deathKey) && !this.anims.exists(deathKey)) {
        const frameNames = this.textures
          .get(deathKey)
          .getFrameNames()
          .filter((frameName) => frameName !== "__BASE")
          .sort((a, b) => {
            const aIndex = Number(a.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            const bIndex = Number(b.match(/(\d+)(?:\.aseprite)?$/i)?.[1] ?? -1);
            return aIndex - bIndex;
          });
        if (frameNames.length > 0) {
          this.anims.create({
            key: deathKey,
            frames: frameNames.map((frame) => ({ key: deathKey, frame })),
            frameRate: 10,
            repeat: 0,
          });
        }
      }
    }

    // Mad Bunny animations (Idle 6f, Walk 6f, Attack Front 4f, Attack Back 5f)
    const bunnyAnims = [
      { key: "mad-bunny-idle-front", end: 5, frameRate: 7, repeat: -1 },
      { key: "mad-bunny-idle-back", end: 5, frameRate: 7, repeat: -1 },
      { key: "mad-bunny-walk-front", end: 5, frameRate: 10, repeat: -1 },
      { key: "mad-bunny-walk-back", end: 5, frameRate: 10, repeat: -1 },
      { key: "mad-bunny-attack-front", end: 3, frameRate: 12, repeat: 0 },
      { key: "mad-bunny-attack-back", end: 4, frameRate: 12, repeat: 0 },
      { key: "white-snake-walk-front", end: 5, frameRate: 10, repeat: -1 },
      { key: "white-snake-walk-back", end: 5, frameRate: 10, repeat: -1 },
      { key: "white-snake-attack-front", end: 11, frameRate: 14, repeat: 0 },
      { key: "white-snake-attack-back", end: 11, frameRate: 14, repeat: 0 },
      { key: "white-snake-died", end: 23, frameRate: 14, repeat: 0 },
    ];
    for (const anim of bunnyAnims) {
      if (this.textures.exists(anim.key) && !this.anims.exists(anim.key)) {
        this.anims.create({
          key: anim.key,
          frames: this.anims.generateFrameNumbers(anim.key, { start: 0, end: anim.end }),
          frameRate: anim.frameRate,
          repeat: anim.repeat,
        });
      }
    }

    if (this.textures.exists("fx-magnum-break") && !this.anims.exists("fx-magnum-break")) {
      this.anims.create({
        key: "fx-magnum-break",
        frames: this.anims.generateFrameNumbers("fx-magnum-break", { start: 0, end: 13 }),
        frameRate: 24,
        repeat: 0,
      });
    }
  }

  private generateGroundTextures(): void {
    const variants = [
      { base: 0x4f8a3d, dark: 0x447a35, light: 0x5b9848 },
      { base: 0x4b843a, dark: 0x407233, light: 0x579144 },
      { base: 0x538f40, dark: 0x477b36, light: 0x60a04b },
    ];

    variants.forEach((palette, variant) => {
      const g = this.graphics();
      g.fillStyle(palette.base, 1);
      g.fillRect(0, 0, 32, 32);

      for (let i = 0; i < 22; i++) {
        const x = Math.floor(rand(variant * 40 + i) * 32);
        const y = Math.floor(rand(variant * 80 + i * 3) * 32);
        g.fillStyle(i % 3 === 0 ? palette.light : palette.dark, 0.9);
        g.fillRect(x, y, 2, 2);
      }

      g.generateTexture(`grass-${variant}`, 32, 32);
      g.destroy();
    });

    const path = this.graphics();
    path.fillStyle(0x9a7b4f, 1);
    path.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(rand(i + 7) * 30);
      const y = Math.floor(rand(i * 5 + 3) * 30);
      path.fillStyle(i % 4 === 0 ? 0x8a6a42 : 0xb08c5b, 1);
      path.fillRect(x, y, 3, 2);
    }
    path.generateTexture("path", 32, 32);
    path.destroy();

    const water = this.graphics();
    water.fillStyle(0x2e6f8e, 1);
    water.fillRect(0, 0, 32, 32);
    water.fillStyle(0x3d8aa8, 1);
    water.fillRect(2, 7, 9, 2);
    water.fillRect(18, 13, 10, 2);
    water.fillRect(6, 23, 13, 2);
    water.fillStyle(0x5aa8c2, 0.85);
    water.fillRect(5, 8, 4, 1);
    water.fillRect(21, 14, 4, 1);
    water.generateTexture("water", 32, 32);
    water.destroy();

    const flower = this.graphics();
    flower.fillStyle(0x315f2a, 1);
    flower.fillRect(3, 5, 1, 4);
    flower.fillStyle(0xf4c95d, 1);
    flower.fillRect(2, 1, 3, 3);
    flower.fillStyle(0xf1ecd8, 0.9);
    flower.fillRect(3, 2, 1, 1);
    flower.generateTexture("flower", 8, 8);
    flower.destroy();
  }

  private generatePropTextures(): void {
    const tree = this.graphics();
    // Trunk
    tree.fillStyle(0x4a3120, 1);
    tree.fillRect(12, 30, 8, 20);
    tree.fillStyle(0x66452b, 1);
    tree.fillRect(14, 32, 2, 18);
    // Canopy clusters (chunky pixel foliage)
    tree.fillStyle(0x2c5a2b, 1);
    tree.fillRect(4, 10, 24, 22);
    tree.fillRect(8, 4, 16, 30);
    tree.fillRect(0, 16, 32, 12);
    tree.fillStyle(0x3f7a38, 1);
    tree.fillRect(6, 8, 20, 20);
    tree.fillRect(9, 3, 14, 26);
    tree.fillRect(2, 15, 28, 10);
    tree.fillStyle(0x57a046, 1);
    tree.fillRect(8, 7, 8, 5);
    tree.fillRect(5, 16, 6, 4);
    tree.fillRect(19, 12, 6, 5);
    tree.fillStyle(0x75c45d, 1);
    tree.fillRect(10, 8, 4, 2);
    tree.fillRect(21, 17, 3, 2);
    tree.fillStyle(0x1f3f20, 1);
    tree.fillRect(4, 30, 24, 2);
    tree.generateTexture("tree", 32, 52);
    tree.destroy();

    const rock = this.graphics();
    rock.fillStyle(0x3b4145, 1);
    rock.fillRect(4, 10, 24, 12);
    rock.fillRect(8, 5, 16, 16);
    rock.fillStyle(0x565e63, 1);
    rock.fillRect(7, 8, 13, 10);
    rock.fillRect(10, 4, 9, 6);
    rock.fillStyle(0x7a8489, 1);
    rock.fillRect(9, 6, 5, 4);
    rock.fillStyle(0x2b3033, 1);
    rock.fillRect(5, 20, 22, 3);
    rock.generateTexture("rock", 32, 24);
    rock.destroy();

    const shadow = this.graphics();
    shadow.fillStyle(0x000000, 1);
    shadow.fillEllipse(16, 6, 30, 10);
    shadow.generateTexture("shadow", 32, 12);
    shadow.destroy();

    const spark = this.graphics();
    spark.fillStyle(0xffffff, 1);
    spark.fillRect(0, 0, 4, 4);
    spark.generateTexture("spark", 4, 4);
    spark.destroy();

    // A selection / quest marker for NPCs.
    const marker = this.graphics();
    marker.fillStyle(0x1a2220, 0.9);
    marker.fillRect(0, 0, 12, 14);
    marker.fillStyle(0xf4c95d, 1);
    marker.fillRect(1, 1, 10, 12);
    marker.fillStyle(0x1a2220, 1);
    marker.fillRect(3, 3, 6, 8);
    marker.fillRect(4, 11, 4, 3);
    marker.generateTexture("marker", 12, 16);
    marker.destroy();
  }

  private generateCharacterTextures(): void {
    OUTFITS.forEach((outfit, index) => {
      for (const dir of ["down", "left", "right", "up"] as const) {
        this.drawHero(outfit, dir, `hero-${index}-${dir}`);
      }
    });

    this.drawNpc(0x6d5a9e, 0x4b3d73, 0xf0c090, "npc-0"); // elder
    this.drawNpc(0xb8783e, 0x84552b, 0xf0c090, "npc-1"); // merchant
    this.drawNpc(0x6a7f8c, 0x4b5c66, 0xe0b080, "npc-2"); // guard
  }

  private drawHero(outfit: Outfit, dir: "down" | "left" | "right" | "up", key: string): void {
    const g = this.graphics();

    // Body outline + legs
    g.fillStyle(OUTLINE, 1);
    g.fillRect(3, 10, 10, 10);
    g.fillRect(4, 18, 3, 6);
    g.fillRect(9, 18, 3, 6);

    // Torso
    g.fillStyle(outfit.shirt, 1);
    g.fillRect(4, 11, 8, 7);
    g.fillStyle(outfit.shirtDark, 1);
    g.fillRect(4, 16, 8, 2);
    // Arms (swing differently by facing)
    g.fillStyle(outfit.shirtDark, 1);
    if (dir === "left") {
      g.fillRect(2, 12, 2, 6);
    } else if (dir === "right") {
      g.fillRect(12, 12, 2, 6);
    } else {
      g.fillRect(2, 12, 2, 6);
      g.fillRect(12, 12, 2, 6);
    }

    // Pants + boots
    g.fillStyle(outfit.pants, 1);
    g.fillRect(4, 18, 3, 4);
    g.fillRect(9, 18, 3, 4);
    g.fillStyle(BOOT, 1);
    g.fillRect(4, 22, 3, 2);
    g.fillRect(9, 22, 3, 2);

    // Head outline + face
    g.fillStyle(OUTLINE, 1);
    g.fillRect(4, 1, 8, 9);
    g.fillStyle(SKIN, 1);
    g.fillRect(5, 2, 6, 7);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillRect(5, 8, 6, 1);

    // Hair
    g.fillStyle(outfit.hair, 1);
    g.fillRect(5, 1, 6, 3);
    if (dir === "up") {
      g.fillRect(5, 3, 6, 4);
    } else {
      g.fillRect(5, 3, 1, 2);
      g.fillRect(10, 3, 1, 2);
    }

    // Eyes
    if (dir === "down") {
      g.fillStyle(OUTLINE, 1);
      g.fillRect(6, 6, 1, 1);
      g.fillRect(9, 6, 1, 1);
    } else if (dir === "left") {
      g.fillStyle(OUTLINE, 1);
      g.fillRect(6, 6, 1, 1);
    } else if (dir === "right") {
      g.fillStyle(OUTLINE, 1);
      g.fillRect(9, 6, 1, 1);
    }

    // Tiny highlight so the outline reads on dark ground.
    g.fillStyle(0xffffff, 0.12);
    g.fillRect(5, 2, 2, 1);

    g.generateTexture(key, 16, 24);
    g.destroy();
  }

  private drawNpc(robe: number, robeDark: number, skin: number, key: string): void {
    const g = this.graphics();
    g.fillStyle(OUTLINE, 1);
    g.fillRect(3, 9, 10, 13);
    g.fillRect(4, 20, 3, 4);
    g.fillRect(9, 20, 3, 4);
    g.fillStyle(robe, 1);
    g.fillRect(4, 10, 8, 10);
    g.fillStyle(robeDark, 1);
    g.fillRect(4, 17, 8, 3);
    g.fillRect(2, 12, 2, 6);
    g.fillRect(12, 12, 2, 6);
    g.fillStyle(skin, 1);
    g.fillRect(5, 2, 6, 8);
    g.fillStyle(OUTLINE, 1);
    g.fillRect(5, 1, 6, 3);
    g.fillRect(6, 6, 1, 1);
    g.fillRect(9, 6, 1, 1);
    g.fillStyle(0xffffff, 0.85);
    g.fillRect(5, 2, 1, 4);
    g.fillRect(10, 2, 1, 4);
    g.generateTexture(key, 16, 24);
    g.destroy();
  }

  private generateMonsterTextures(): void {
    const slime = this.graphics();
    slime.fillStyle(OUTLINE, 1);
    slime.fillEllipse(10, 10, 20, 13);
    slime.fillStyle(0x5cb85c, 1);
    slime.fillEllipse(10, 10, 17, 10);
    slime.fillStyle(0x7fdb72, 1);
    slime.fillRect(5, 5, 5, 3);
    slime.fillStyle(OUTLINE, 1);
    slime.fillRect(6, 8, 2, 2);
    slime.fillRect(12, 8, 2, 2);
    slime.fillStyle(0x2c5a2b, 1);
    slime.fillRect(9, 12, 3, 1);
    slime.generateTexture("monster-slime", 20, 16);
    slime.destroy();

    const bat = this.graphics();
    bat.fillStyle(OUTLINE, 1);
    bat.fillTriangle(0, 3, 9, 8, 4, 15);
    bat.fillTriangle(24, 3, 15, 8, 20, 15);
    bat.fillEllipse(12, 9, 9, 11);
    bat.fillStyle(0x5b4472, 1);
    bat.fillTriangle(1, 4, 8, 8, 4, 13);
    bat.fillTriangle(23, 4, 16, 8, 20, 13);
    bat.fillStyle(0x7b5e97, 1);
    bat.fillEllipse(12, 9, 7, 9);
    bat.fillStyle(OUTLINE, 1);
    bat.fillTriangle(9, 4, 10, 0, 12, 4);
    bat.fillTriangle(15, 4, 14, 0, 12, 4);
    bat.fillStyle(0xf4c95d, 1);
    bat.fillRect(10, 7, 2, 2);
    bat.fillRect(13, 7, 2, 2);
    bat.generateTexture("monster-bat", 24, 18);
    bat.destroy();
  }

  private generateEffects(): void {
    const slash = this.graphics();
    slash.lineStyle(3, 0xffffff, 0.95);
    slash.beginPath();
    slash.arc(16, 16, 11, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70), false);
    slash.strokePath();
    slash.lineStyle(1, 0xf4c95d, 0.9);
    slash.beginPath();
    slash.arc(16, 16, 8, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(60), false);
    slash.strokePath();
    slash.generateTexture("slash", 32, 32);
    slash.destroy();

    const ring = this.graphics();
    ring.lineStyle(2, 0xf4c95d, 0.8);
    ring.strokeEllipse(16, 8, 28, 10);
    ring.generateTexture("target-ring", 32, 16);
    ring.destroy();

    // Classic pixel "!" used above NPC heads.
    const bang = this.graphics();
    bang.fillStyle(0x1a2220, 1);
    bang.fillRect(0, 0, 10, 16);
    bang.fillStyle(0xf4c95d, 1);
    bang.fillRect(1, 1, 8, 14);
    bang.fillStyle(0x1a2220, 1);
    bang.fillRect(3, 3, 4, 7);
    bang.fillRect(3, 12, 4, 2);
    bang.generateTexture("npc-bang", 10, 16);
    bang.destroy();

    // Utility textures for UI masks / flashes.
    const white = this.graphics();
    white.fillStyle(0xffffff, 1);
    white.fillRect(0, 0, 2, 2);
    white.generateTexture("pixel", 2, 2);
    white.destroy();
  }

  // ---------------------------------------------------------------------------
  // Item icons
  // ---------------------------------------------------------------------------

  /**
   * Item icons are keyed by the `icon` slug sent in the item catalog
   * (`item-<slug>`). Unknown slugs fall back to `item-unknown`.
   */
  private generateItemIcons(): void {
    const jelly = this.graphics();
    jelly.fillStyle(0x1a2220, 1);
    jelly.fillEllipse(10, 13, 17, 10);
    jelly.fillStyle(0x5cb85c, 1);
    jelly.fillEllipse(10, 13, 14, 8);
    jelly.fillStyle(0x7fdb72, 1);
    jelly.fillRect(6, 9, 4, 3);
    jelly.fillStyle(0x1a2220, 1);
    jelly.fillRect(7, 12, 2, 2);
    jelly.fillRect(11, 12, 2, 2);
    jelly.generateTexture("item-jelly", 20, 20);
    jelly.destroy();

    const wing = this.graphics();
    wing.fillStyle(0x1a2220, 1);
    wing.fillTriangle(1, 5, 10, 10, 4, 18);
    wing.fillTriangle(19, 5, 10, 10, 16, 18);
    wing.fillStyle(0x7b5e97, 1);
    wing.fillTriangle(2, 6, 10, 10, 4, 16);
    wing.fillTriangle(18, 6, 10, 10, 16, 16);
    wing.fillStyle(0xb39ad8, 1);
    wing.fillRect(4, 8, 4, 2);
    wing.fillRect(12, 8, 4, 2);
    wing.fillStyle(0x4b3d73, 1);
    wing.fillRect(9, 7, 2, 6);
    wing.generateTexture("item-wing", 20, 20);
    wing.destroy();

    const monarch = this.graphics();
    monarch.fillStyle(0x13224a, 1);
    monarch.fillRect(2, 3, 6, 7);
    monarch.fillRect(12, 3, 6, 7);
    monarch.fillRect(3, 11, 5, 6);
    monarch.fillRect(12, 11, 5, 6);
    monarch.fillStyle(0xf59e42, 1);
    monarch.fillRect(4, 5, 4, 4);
    monarch.fillRect(12, 5, 4, 4);
    monarch.fillRect(4, 12, 3, 4);
    monarch.fillRect(13, 12, 3, 4);
    monarch.fillStyle(0x62c4ff, 1);
    monarch.fillRect(5, 6, 2, 2);
    monarch.fillRect(13, 6, 2, 2);
    monarch.generateTexture("item-wing-monarch", 20, 20);
    monarch.destroy();

    this.drawSword(0xc0c8d0, 0x8a949c, "sword-rusty");
    this.drawSword(0xe0a15c, 0xb8763e, "sword-bronze");
    this.drawSword(0xd8f0cf, 0x8fbf8a, "sword-hunter");

    this.drawVest(0xb9a06a, 0x8a7448, "vest-cloth");
    this.drawVest(0xa06a3e, 0x744a28, "vest-leather");
    this.drawVest(0xaeb8c2, 0x76828e, "vest-iron");

    this.drawCloak(0xa87850, 0x6e4b2d, "cloak");

    const coin = this.graphics();
    coin.fillStyle(0x7a5a20, 1);
    coin.fillCircle(10, 10, 8);
    coin.fillStyle(0xf4c95d, 1);
    coin.fillCircle(10, 10, 6);
    coin.fillStyle(0xc89a32, 1);
    coin.fillRect(8, 6, 4, 8);
    coin.fillStyle(0xffe9a3, 1);
    coin.fillRect(6, 6, 2, 2);
    coin.generateTexture("item-coin", 20, 20);
    coin.destroy();

    const drawKey = (mainColor: number, highlightColor: number, outlineColor: number, texKey: string) => {
      const k = this.graphics();
      k.fillStyle(outlineColor, 1);
      k.fillCircle(6, 7, 4);
      k.fillRect(9, 6, 9, 3);
      k.fillRect(14, 9, 2, 4);
      k.fillRect(17, 9, 2, 3);
      k.fillStyle(mainColor, 1);
      k.fillCircle(6, 7, 3);
      k.fillRect(9, 7, 8, 2);
      k.fillRect(14, 9, 1, 3);
      k.fillRect(17, 9, 1, 2);
      k.fillStyle(0x111827, 1);
      k.fillCircle(6, 7, 1);
      k.fillStyle(highlightColor, 1);
      k.fillRect(5, 5, 2, 1);
      k.fillRect(10, 7, 5, 1);
      k.generateTexture(texKey, 20, 20);
      k.destroy();
    };
    drawKey(0xcbd5e1, 0xf8fafc, 0x475569, "item-key-silver");
    drawKey(0xfbbf24, 0xfef08a, 0x78350f, "item-key-gold");

    // Toa (Megaphone) icon
    const toa = this.graphics();
    toa.fillStyle(0x78350f, 1);
    toa.fillRect(3, 8, 4, 5);
    toa.fillRect(6, 12, 3, 5);
    toa.fillStyle(0xfacc15, 1);
    toa.fillTriangle(6, 8, 16, 3, 16, 16);
    toa.fillStyle(0xfef08a, 1);
    toa.fillRect(15, 4, 2, 11);
    toa.fillStyle(0xef4444, 1);
    toa.fillRect(4, 9, 3, 3);
    toa.generateTexture("item-toa", 20, 20);
    toa.destroy();

    const unknown = this.graphics();
    unknown.fillStyle(0x304b3c, 1);
    unknown.fillRoundedRect(2, 2, 16, 16, 3);
    unknown.fillStyle(0x8fa895, 1);
    unknown.fillRect(8, 5, 4, 2);
    unknown.fillRect(7, 7, 2, 3);
    unknown.fillRect(10, 9, 3, 2);
    unknown.fillRect(10, 12, 2, 2);
    unknown.fillRect(9, 15, 2, 2);
    unknown.generateTexture("item-unknown", 20, 20);
    unknown.destroy();
  }

  private drawPotion(liquid: number, key: string): void {
    const g = this.graphics();

    g.fillStyle(0x1a2220, 1);
    g.fillRect(8, 1, 4, 3);
    g.fillRect(6, 4, 8, 2);
    g.fillEllipse(10, 13, 17, 11);
    g.fillStyle(0x8a5a34, 1);
    g.fillRect(8, 1, 4, 2);
    g.fillStyle(0xd8d0b8, 1);
    g.fillRect(9, 4, 2, 2);
    g.fillStyle(liquid, 1);
    g.fillEllipse(10, 13, 13, 7);
    g.fillRect(6, 10, 8, 3);
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(7, 9, 2, 4);
    g.generateTexture(`item-${key}`, 20, 20);
    g.destroy();
  }

  private drawSword(blade: number, edge: number, key: string): void {
    const g = this.graphics();

    g.fillStyle(0x1a2220, 1);
    g.fillRect(8, 1, 4, 12);
    g.fillRect(4, 11, 12, 3);
    g.fillRect(8, 14, 4, 5);
    g.fillStyle(edge, 1);
    g.fillRect(9, 2, 2, 9);
    g.fillStyle(blade, 1);
    g.fillRect(10, 3, 2, 8);
    g.fillStyle(0xf4c95d, 1);
    g.fillRect(5, 12, 10, 2);
    g.fillStyle(0x6a4a2a, 1);
    g.fillRect(9, 14, 2, 4);
    g.fillStyle(0xf4c95d, 1);
    g.fillRect(8, 18, 4, 1);
    g.generateTexture(`item-${key}`, 20, 20);
    g.destroy();
  }

  private drawVest(main: number, dark: number, key: string): void {
    const g = this.graphics();

    g.fillStyle(0x1a2220, 1);
    g.fillRect(4, 4, 12, 14);
    g.fillRect(3, 7, 2, 7);
    g.fillRect(15, 7, 2, 7);
    g.fillStyle(main, 1);
    g.fillRect(5, 5, 10, 12);
    g.fillRect(4, 8, 2, 5);
    g.fillRect(14, 8, 2, 5);
    g.fillStyle(dark, 1);
    g.fillRect(5, 5, 10, 2);
    g.fillRect(9, 7, 2, 3);
    g.fillRect(5, 13, 10, 2);
    g.fillStyle(0xf4c95d, 1);
    g.fillRect(9, 13, 2, 2);
    g.generateTexture(`item-${key}`, 20, 20);
    g.destroy();
  }

  private drawCloak(main: number, dark: number, key: string): void {
    const g = this.graphics();
    g.fillStyle(0x1a2220, 1);
    g.fillRect(5, 3, 10, 15);
    g.fillRect(4, 5, 12, 12);
    g.fillStyle(main, 1);
    g.fillRect(5, 5, 10, 12);
    g.fillRect(6, 4, 8, 2);
    g.fillStyle(dark, 1);
    g.fillRect(5, 5, 2, 12);
    g.fillRect(13, 5, 2, 12);
    g.fillStyle(0xf4c95d, 1);
    g.fillRect(9, 4, 2, 2);
    g.generateTexture(`item-${key}`, 20, 20);
    g.destroy();
  }

  private createPlayerAnimations(): void {
    // ==========================================
    // Novice Animations
    // ==========================================
    // Walk (6 frames: 0..5, 10 fps)
    const noviceWalk = [
      { key: "down", atlas: "novice-walk-front", prefix: "Novice_Walk_front " },
      { key: "left", atlas: "novice-walk-side-left", prefix: "Novice_Walk_side_left " },
      { key: "right", atlas: "novice-walk-side-right", prefix: "Novice_Walk_side_right " },
      { key: "up", atlas: "novice-walk-back", prefix: "Novice_Walk_back " },
    ];
    for (const { key, atlas, prefix } of noviceWalk) {
      if (this.textures.exists(atlas) && !this.anims.exists(`novice-walk-${key}`)) {
        this.anims.create({
          key: `novice-walk-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 5,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }
    }

    // Attack (8 frames: 0..7, 18 fps)
    const noviceAttack = [
      { key: "down", atlas: "novice-attack-front", prefix: "Novice_attack_front " },
      { key: "up", atlas: "novice-attack-back", prefix: "Novice_attack_back " },
      { key: "left", atlas: "novice-attack-side-left", prefix: "Novice_attack_side_left " },
      { key: "right", atlas: "novice-attack-side-right", prefix: "Novice_attack_side_right " },
    ];
    for (const { key, atlas, prefix } of noviceAttack) {
      if (this.textures.exists(atlas) && !this.anims.exists(`novice-attack-${key}`)) {
        this.anims.create({
          key: `novice-attack-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 7,
          }),
          frameRate: 18,
          repeat: 0,
        });
      }
    }

    // Idle
    const noviceIdle = [
      { key: "down", atlas: "novice-idle-front", prefix: "Novice_Idle_front ", end: 11, fps: 8 },
      { key: "up", atlas: "novice-idle-back", prefix: "Novice_Idle_back ", end: 3, fps: 6 },
      { key: "left", atlas: "novice-idle-side-left", prefix: "Novice_Idle_side_left ", end: 11, fps: 8 },
      { key: "right", atlas: "novice-idle-side-right", prefix: "Novice_Idle_side_right ", end: 11, fps: 8 },
    ];
    for (const { key, atlas, prefix, end, fps } of noviceIdle) {
      if (this.textures.exists(atlas) && !this.anims.exists(`novice-idle-${key}`)) {
        this.anims.create({
          key: `novice-idle-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end,
          }),
          frameRate: fps,
          repeat: -1,
        });
      }
    }

    // Hurt
    const noviceHurt = [
      { key: "down", atlas: "novice-hurt-front", prefix: "Novice_Hurt_front " },
      { key: "up", atlas: "novice-hurt-back", prefix: "Novice_Hurt_back " },
      { key: "left", atlas: "novice-hurt-side-left", prefix: "Novice_Hurt_side_left " },
      { key: "right", atlas: "novice-hurt-side-right", prefix: "Novice_Hurt_side_right " },
    ];
    for (const { key, atlas, prefix } of noviceHurt) {
      if (this.textures.exists(atlas) && !this.anims.exists(`novice-hurt-${key}`)) {
        this.anims.create({
          key: `novice-hurt-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 4,
          }),
          frameRate: 14,
          repeat: 0,
        });
      }
    }

    // Death
    const noviceDeath = [
      { key: "down", atlas: "novice-death-front", prefix: "Novice_Death_front " },
      { key: "up", atlas: "novice-death-back", prefix: "Novice_Death_back " },
      { key: "left", atlas: "novice-death-side-left", prefix: "Novice_Death_side_left " },
      { key: "right", atlas: "novice-death-side-right", prefix: "Novice_Death_side_right " },
    ];
    for (const { key, atlas, prefix } of noviceDeath) {
      if (this.textures.exists(atlas) && !this.anims.exists(`novice-death-${key}`)) {
        this.anims.create({
          key: `novice-death-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 6,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }
    }

    // ==========================================
    // Swordsman Animations
    // ==========================================
    const configs = [
      { key: "down", atlas: "swordsman-walk-front", prefix: "Swordsman_lvl3_Walk_front " },
      { key: "left", atlas: "swordsman-walk-side-left", prefix: "Swordsman_lvl3_Walk_side_left " },
      { key: "right", atlas: "swordsman-walk-side-right", prefix: "Swordsman_lvl3_Walk_side_right " },
      { key: "up", atlas: "swordsman-walk-back", prefix: "Swordsman_lvl3_Walk_back " },
    ];

    for (const { key, atlas, prefix } of configs) {
      if (this.textures.exists(atlas) && !this.anims.exists(`swordsman-walk-${key}`)) {
        this.anims.create({
          key: `swordsman-walk-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 5,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }
    }

    const attackConfigs = [
      { key: "down", atlas: "swordsman-attack-front", prefix: "Swordsman_lvl3_attack_front " },
      { key: "up", atlas: "swordsman-attack-back", prefix: "Swordsman_lvl3_attack_back " },
      { key: "left", atlas: "swordsman-attack-side-left", prefix: "Swordsman_lvl3_attack_side_left " },
    ];

    for (const { key, atlas, prefix } of attackConfigs) {
      if (this.textures.exists(atlas) && !this.anims.exists(`swordsman-attack-${key}`)) {
        this.anims.create({
          key: `swordsman-attack-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 7,
          }),
          frameRate: 18,
          repeat: 0,
        });
      }
    }

    // Idle animations
    const idleConfigs = [
      { key: "down", atlas: "swordsman-idle-front", prefix: "Swordsman_lvl3_Idle_front ", end: 11, fps: 8 },
      { key: "up", atlas: "swordsman-idle-back", prefix: "Swordsman_lvl3_Idle_back ", end: 3, fps: 6 },
      { key: "left", atlas: "swordsman-idle-side-left", prefix: "Swordsman_lvl3_Idle_side_left ", end: 11, fps: 8 },
      { key: "right", atlas: "swordsman-idle-side-right", prefix: "Swordsman_lvl3_Idle_side_right ", end: 11, fps: 8 },
    ];

    for (const { key, atlas, prefix, end, fps } of idleConfigs) {
      if (this.textures.exists(atlas) && !this.anims.exists(`swordsman-idle-${key}`)) {
        this.anims.create({
          key: `swordsman-idle-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end,
          }),
          frameRate: fps,
          repeat: -1,
        });
      }
    }

    // Hurt animations
    const hurtConfigs = [
      { key: "down", atlas: "swordsman-hurt-front", prefix: "Swordsman_lvl3_Hurt_front " },
      { key: "up", atlas: "swordsman-hurt-back", prefix: "Swordsman_lvl3_Hurt_back " },
      { key: "left", atlas: "swordsman-hurt-side-left", prefix: "Swordsman_lvl3_Hurt_side_left " },
      { key: "right", atlas: "swordsman-hurt-side-right", prefix: "Swordsman_lvl3_Hurt_side_right " },
    ];

    for (const { key, atlas, prefix } of hurtConfigs) {
      if (this.textures.exists(atlas) && !this.anims.exists(`swordsman-hurt-${key}`)) {
        this.anims.create({
          key: `swordsman-hurt-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 4,
          }),
          frameRate: 14,
          repeat: 0,
        });
      }
    }

    // Death animations
    const deathConfigs = [
      { key: "down", atlas: "swordsman-death-front", prefix: "Swordsman_lvl3_Death_front " },
      { key: "up", atlas: "swordsman-death-back", prefix: "Swordsman_lvl3_Death_back " },
      { key: "left", atlas: "swordsman-death-side-left", prefix: "Swordsman_lvl3_Death_side_left " },
      { key: "right", atlas: "swordsman-death-side-right", prefix: "Swordsman_lvl3_Death_side_right " },
    ];

    for (const { key, atlas, prefix } of deathConfigs) {
      if (this.textures.exists(atlas) && !this.anims.exists(`swordsman-death-${key}`)) {
        this.anims.create({
          key: `swordsman-death-${key}`,
          frames: this.anims.generateFrameNames(atlas, {
            prefix,
            suffix: ".aseprite",
            start: 0,
            end: 6,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }
    }
  }
}
